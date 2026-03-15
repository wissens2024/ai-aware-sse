import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, RefreshTokenPayload } from './interfaces/jwt-payload.interface';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
  }

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const tenant = await this.prisma.tenants.findFirst({
      where: { name: 'PoC Tenant' },
    });
    if (!tenant) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
    }

    const user = await this.prisma.users.findUnique({
      where: { tenant_id_email: { tenant_id: tenant.tenant_id, email } },
      include: {
        user_groups: { include: { groups: true } },
      },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
    }

    // Update last_login_at
    await this.prisma.users.update({
      where: { user_id: user.user_id },
      data: { last_login_at: new Date() },
    });

    const groups = user.user_groups.map((ug) => ug.groups.name);
    return this.issueTokens(user, groups, 'local');
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwt.verify<RefreshTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException({
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Refresh token invalid or expired' },
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_TOKEN', message: 'Not a refresh token' },
      });
    }

    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.auth_sessions.findFirst({
      where: {
        refresh_token_hash: tokenHash,
        revoked: false,
        expires_at: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Session expired or revoked' },
      });
    }

    // Revoke old session (rotation)
    await this.prisma.auth_sessions.update({
      where: { session_id: session.session_id },
      data: { revoked: true },
    });

    const user = await this.prisma.users.findUnique({
      where: { user_id: payload.sub },
      include: { user_groups: { include: { groups: true } } },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_TOKEN', message: 'User not found' },
      });
    }

    const groups = user.user_groups.map((ug) => ug.groups.name);
    return this.issueTokens(user, groups, 'local');
  }

  async getMe(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      include: { user_groups: { include: { groups: true } } },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_TOKEN', message: 'User not found' },
      });
    }

    return {
      user_id: user.user_id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      groups: user.user_groups.map((ug) => ug.groups.name),
      tenant_id: user.tenant_id,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.auth_sessions.updateMany({
      where: { user_id: userId, revoked: false },
      data: { revoked: true },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Cannot change password' },
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Current password is incorrect' },
      });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.users.update({
      where: { user_id: userId },
      data: { password_hash: hash },
    });

    // Revoke all sessions (force re-login)
    await this.logout(userId);
  }

  /**
   * Find or create a user from SSO userinfo (JIT provisioning).
   * Returns the user with groups and issues tokens.
   */
  async loginFromOidc(userinfo: {
    sub: string;
    email: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  }): Promise<AuthResponseDto> {
    const tenant = await this.prisma.tenants.findFirst({
      where: { name: 'PoC Tenant' },
    });
    if (!tenant) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_SSO_ERROR', message: 'Tenant not found' },
      });
    }

    const displayName =
      userinfo.name ??
      ([userinfo.family_name, userinfo.given_name].filter(Boolean).join('') ||
      userinfo.email);

    // Upsert: find by external_id (SSO sub) or email
    let user = await this.prisma.users.findFirst({
      where: {
        tenant_id: tenant.tenant_id,
        OR: [
          { external_id: userinfo.sub },
          { email: userinfo.email },
        ],
      },
      include: { user_groups: { include: { groups: true } } },
    });

    if (!user) {
      // JIT provisioning: create new user
      user = await this.prisma.users.create({
        data: {
          tenant_id: tenant.tenant_id,
          external_id: userinfo.sub,
          email: userinfo.email,
          display_name: displayName,
          role: 'user',
        },
        include: { user_groups: { include: { groups: true } } },
      });
      this.logger.log(`JIT provisioned user: ${userinfo.email} (${userinfo.sub})`);
    } else {
      // Update external_id and display_name if changed
      await this.prisma.users.update({
        where: { user_id: user.user_id },
        data: {
          external_id: userinfo.sub,
          display_name: displayName,
          last_login_at: new Date(),
        },
      });
    }

    const groups = user.user_groups.map((ug) => ug.groups.name);
    return this.issueTokens(user, groups, 'oidc');
  }

  // --- internal helpers ---

  async issueTokens(
    user: { user_id: string; tenant_id: string; email: string | null; display_name: string | null; role: string },
    groups: string[],
    authMethod: string,
  ): Promise<AuthResponseDto> {
    const accessPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.user_id,
      email: user.email ?? '',
      display_name: user.display_name ?? '',
      groups,
      tenant_id: user.tenant_id,
      role: user.role,
      auth_method: authMethod,
    };

    const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
      sub: user.user_id,
      tenant_id: user.tenant_id,
      type: 'refresh',
    };

    const accessToken = this.jwt.sign(accessPayload);
    const refreshToken = this.jwt.sign(refreshPayload, {
      expiresIn: this.refreshExpiresIn as any,
    });

    // Store refresh token session
    const expiresMs = this.parseExpiry(this.refreshExpiresIn);
    await this.prisma.auth_sessions.create({
      data: {
        tenant_id: user.tenant_id,
        user_id: user.user_id,
        refresh_token_hash: this.hashToken(refreshToken),
        expires_at: new Date(Date.now() + expiresMs),
      },
    });

    const accessExpiresIn = this.parseExpiry(
      this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: Math.floor(accessExpiresIn / 1000),
      user: {
        user_id: user.user_id,
        email: user.email ?? '',
        display_name: user.display_name,
        role: user.role,
        groups,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(value: string): number {
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 15 * 60 * 1000; // default 15m
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return num * (multipliers[unit] ?? 60_000);
  }
}
