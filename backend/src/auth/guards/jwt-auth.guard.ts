import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@rms/shared';
import type { Env } from '../../config/env';
import { UsersService } from '../../users/users.service';
import { IS_PUBLIC, type AuthUser } from '../decorators';

export const ACCESS_COOKIE = 'access_token';

/** Global guard. Role and status are re-read from the DB so suspensions and role changes apply immediately. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = req.cookies?.[ACCESS_COOKIE] ?? bearer;
    if (!token) throw new UnauthorizedException({ message: 'Authentication required', code: 'UNAUTHORIZED' });

    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync(token, { secret: this.config.get('JWT_ACCESS_SECRET') }));
    } catch {
      throw new UnauthorizedException({ message: 'Session expired', code: 'TOKEN_EXPIRED' });
    }

    const user = await this.users.findById(sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({ message: 'Account unavailable', code: 'UNAUTHORIZED' });
    }
    req.user = { id: user.id, role: user.role, email: user.email, name: user.name } satisfies AuthUser;
    return true;
  }
}
