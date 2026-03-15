import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class ExtensionAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: 'Missing or invalid Authorization header',
        },
      });
    }

    const token = authHeader.slice(7).trim();

    // 1) Try JWT first
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
        algorithms: ['HS256'],
      });
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      // Not a valid JWT — fall through to legacy token check
    }

    // 2) Fallback: legacy static token (EXT_DEVICE_TOKEN)
    const expected = this.config.get<string>('EXT_DEVICE_TOKEN');
    if (expected && token === expected) {
      return true;
    }

    throw new UnauthorizedException({
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token',
      },
    });
  }
}
