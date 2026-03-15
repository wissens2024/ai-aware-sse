import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';

interface OidcState {
  codeVerifier: string;
  redirectAfter: string;
  nonce: string;
  createdAt: number;
}

interface OidcTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
}

interface OidcUserinfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  roles?: string[];
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);

  // In-memory state store (PoC). Production should use Redis or DB.
  private readonly stateStore = new Map<string, OidcState>();
  private readonly STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  private readonly issuer: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes: string;

  constructor(private readonly config: ConfigService) {
    this.issuer = this.config.get<string>('OIDC_ISSUER', '');
    this.clientId = this.config.get<string>('OIDC_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET', '');
    this.redirectUri = this.config.get<string>('OIDC_REDIRECT_URI', '');
    this.scopes = this.config.get<string>('OIDC_SCOPES', 'openid,profile,email');

    // Periodic cleanup of expired states
    setInterval(() => this.cleanupStates(), 60_000);
  }

  /** Check if OIDC is configured */
  isEnabled(): boolean {
    const mode = this.config.get<string>('AUTH_MODE', 'local');
    return (
      (mode === 'oidc' || mode === 'both') &&
      !!this.issuer &&
      !!this.clientId
    );
  }

  /** Get SSO config for frontend */
  getConfig() {
    return {
      enabled: this.isEnabled(),
      auth_mode: this.config.get<string>('AUTH_MODE', 'local'),
    };
  }

  /** Validate that redirect path is safe (relative, no protocol) */
  private sanitizeRedirectAfter(value: string): string {
    if (!value) return '/';
    // Must start with '/' and must NOT start with '//' (protocol-relative URL)
    // Must not contain backslashes (Windows path traversal)
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
      return '/';
    }
    // Strip any embedded URLs (e.g., /foo?url=http://evil.com is OK, but the path itself is safe)
    return value;
  }

  /** Build the authorization URL and return it with the state key */
  buildAuthorizeUrl(redirectAfter: string): string {
    if (!this.isEnabled()) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_SSO_DISABLED', message: 'SSO is not configured' },
      });
    }

    // Generate PKCE
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Generate state and nonce
    const state = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');

    // Store state for callback verification
    this.stateStore.set(state, {
      codeVerifier,
      redirectAfter: this.sanitizeRedirectAfter(redirectAfter),
      nonce,
      createdAt: Date.now(),
    });

    const scopes = this.scopes.split(',').join(' ');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.issuer}/oauth2/authorize?${params.toString()}`;
  }

  /** Exchange authorization code for tokens */
  async exchangeCode(
    code: string,
    state: string,
  ): Promise<{ tokens: OidcTokenResponse; redirectAfter: string }> {
    // Validate state
    const stored = this.stateStore.get(state);
    if (!stored) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_SSO_INVALID_STATE', message: 'Invalid or expired state' },
      });
    }
    this.stateStore.delete(state);

    // Check TTL
    if (Date.now() - stored.createdAt > this.STATE_TTL_MS) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_SSO_EXPIRED', message: 'Authorization request expired' },
      });
    }

    // Exchange code for tokens
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code_verifier: stored.codeVerifier,
    });

    const res = await fetch(`${this.issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'unknown');
      this.logger.error(`Token exchange failed: ${res.status} ${errBody}`);
      throw new UnauthorizedException({
        error: { code: 'AUTH_SSO_TOKEN_ERROR', message: 'Token exchange failed' },
      });
    }

    const tokens: OidcTokenResponse = await res.json();

    // Verify nonce in id_token to prevent replay attacks
    if (tokens.id_token) {
      try {
        const parts = tokens.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64url').toString('utf-8'),
          );
          if (payload.nonce && payload.nonce !== stored.nonce) {
            throw new UnauthorizedException({
              error: {
                code: 'AUTH_SSO_NONCE_MISMATCH',
                message: 'ID token nonce mismatch — possible replay attack',
              },
            });
          }
        }
      } catch (e) {
        if (e instanceof UnauthorizedException) throw e;
        this.logger.warn('Failed to decode id_token for nonce verification');
      }
    }

    return { tokens, redirectAfter: stored.redirectAfter };
  }

  /** Fetch user info from the SSO server */
  async getUserinfo(accessToken: string): Promise<OidcUserinfo> {
    const res = await fetch(`${this.issuer}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'unknown');
      this.logger.error(`Userinfo fetch failed: ${res.status} ${errBody}`);
      throw new UnauthorizedException({
        error: { code: 'AUTH_SSO_USERINFO_ERROR', message: 'Failed to fetch user info' },
      });
    }

    return res.json();
  }

  private cleanupStates() {
    const now = Date.now();
    for (const [key, val] of this.stateStore) {
      if (now - val.createdAt > this.STATE_TTL_MS) {
        this.stateStore.delete(key);
      }
    }
  }
}
