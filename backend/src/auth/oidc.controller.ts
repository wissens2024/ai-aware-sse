import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';

@ApiTags('Auth')
@Controller('auth/sso')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidcService: OidcService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Get SSO configuration (enabled/disabled)' })
  getConfig() {
    return this.oidcService.getConfig();
  }

  @Public()
  @Get('authorize')
  @ApiOperation({ summary: 'Redirect to SSO login page' })
  authorize(
    @Query('redirect_after') redirectAfter: string,
    @Res() res: Response,
  ) {
    const url = this.oidcService.buildAuthorizeUrl(redirectAfter || '/');
    res.redirect(302, url);
  }

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'OIDC callback — exchange code for JWT' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    // Handle SSO error response
    if (error) {
      this.logger.warn(`SSO error: ${error} — ${errorDescription}`);
      res.redirect(302, `/login?sso_error=${encodeURIComponent(errorDescription || error)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(302, '/login?sso_error=missing_params');
      return;
    }

    try {
      // 1. Exchange authorization code for SSO tokens
      const { tokens, redirectAfter } =
        await this.oidcService.exchangeCode(code, state);

      // 2. Get user info from SSO
      const userinfo = await this.oidcService.getUserinfo(tokens.access_token);

      // 3. Find or create local user (JIT provisioning) and issue our JWT
      const authResult = await this.authService.loginFromOidc({
        sub: userinfo.sub,
        email: userinfo.email,
        name: userinfo.name,
        given_name: userinfo.given_name,
        family_name: userinfo.family_name,
      });

      // 4. Redirect to frontend with tokens in hash fragment
      //    (hash fragment is not sent to server, safer than query params)
      const params = new URLSearchParams({
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        redirect_after: redirectAfter,
      });

      res.redirect(302, `/login/sso-callback#${params.toString()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SSO login failed';
      this.logger.error(`SSO callback error: ${msg}`);
      res.redirect(302, `/login?sso_error=${encodeURIComponent(msg)}`);
    }
  }
}
