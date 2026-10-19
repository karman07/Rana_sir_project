import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { CurrentUser, Public, type AuthUser } from './decorators';
import {
  EmailOnlyDto, GoogleLoginDto, LoginDto, RegisterCandidateDto, RegisterRecruiterDto, ResetPasswordDto, TokenDto,
} from './dto/auth.dto';
import { GoogleService } from './google.service';
import { ACCESS_COOKIE } from './guards/jwt-auth.guard';
import type { IssuedTokens } from './token.service';

export const REFRESH_COOKIE = 'refresh_token';
// Per-IP, per-route. Overridable (e.g. e2e tests) without touching code.
const AUTH_LIMIT = { default: { limit: () => Number(process.env.AUTH_RATE_LIMIT ?? 10), ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN') || undefined,
    };
  }

  private setCookies(res: Response, t: IssuedTokens) {
    res.cookie(ACCESS_COOKIE, t.accessToken, { ...this.cookieBase(), path: '/', maxAge: t.accessMaxAgeMs });
    // Refresh token is only ever sent to the auth endpoints.
    res.cookie(REFRESH_COOKIE, t.refreshToken, { ...this.cookieBase(), path: '/api/auth', maxAge: t.refreshMaxAgeMs });
  }

  private clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(), path: '/api/auth' });
  }

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent']?.slice(0, 200), ip: req.ip };
  }

  private finish(res: Response, r: { user: unknown; tokens: IssuedTokens | null; verificationRequired?: boolean }) {
    if (!r.tokens) return { user: null, verificationRequired: true, email: (r.user as { email: string }).email };
    this.setCookies(res, r.tokens);
    return { user: r.user };
  }

  @Public() @Get('providers')
  providers() {
    return { google: { enabled: this.google.enabled, clientId: this.google.clientId ?? null } };
  }

  @Public() @Throttle(AUTH_LIMIT) @Post('register/candidate')
  async registerCandidate(@Body() dto: RegisterCandidateDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.finish(res, await this.auth.registerCandidate(dto, this.meta(req)));
  }

  @Public() @Throttle(AUTH_LIMIT) @Post('register/recruiter')
  async registerRecruiter(@Body() dto: RegisterRecruiterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.finish(res, await this.auth.registerRecruiter(dto, this.meta(req)));
  }

  @Public() @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.finish(res, await this.auth.login(dto.email, dto.password, this.meta(req)));
  }

  @Public() @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('google')
  async googleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.finish(res, await this.auth.loginWithGoogle(dto.credential, dto.intent, this.meta(req)));
  }

  @Public() @HttpCode(200) @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      this.clearCookies(res);
      throw new UnauthorizedException({ message: 'Authentication required', code: 'UNAUTHORIZED' });
    }
    try {
      return this.finish(res, await this.auth.refresh(token, this.meta(req)));
    } catch (e) {
      this.clearCookies(res);
      throw e;
    }
  }

  @Public() @HttpCode(200) @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearCookies(res);
    return { loggedOut: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id).then((u) => ({ user: u }));
  }

  @Public() @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('forgot-password')
  async forgot(@Body() dto: EmailOnlyDto) {
    await this.auth.forgotPassword(dto.email);
    return { sent: true };
  }

  @Public() @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('reset-password')
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { reset: true };
  }

  @Public() @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('verify-email')
  async verify(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
    return { verified: true };
  }

  @Public() @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('resend-verification-email')
  async resendByEmail(@Body() dto: EmailOnlyDto) {
    await this.auth.resendVerificationByEmail(dto.email);
    return { sent: true };
  }

  @Throttle(AUTH_LIMIT) @HttpCode(200) @Post('resend-verification')
  async resend(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user.id);
    return { sent: true };
  }
}
