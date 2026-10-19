import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { ReviewStatus, Role } from '@rms/shared';
import type { Model } from 'mongoose';
import { RecruiterProfile } from '../../recruiters/schemas/recruiter-profile.schema';
import { PERMISSIONS_KEY, REQUIRE_APPROVED, ROLES_KEY } from '../decorators';
import { hasPermission, type Permission } from '../permissions';

/** Runs after JwtAuthGuard: enforces @Roles, @Permissions and @RequireApprovedRecruiter. */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(RecruiterProfile.name) private readonly recruiters: Model<RecruiterProfile>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const perms = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets);
    const needApproved = this.reflector.getAllAndOverride<boolean>(REQUIRE_APPROVED, targets);
    if (!roles && !perms && !needApproved) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) return true; // @Public route

    if (roles && !roles.includes(user.role)) throw new ForbiddenException('You do not have access to this resource');
    if (perms && !perms.every((p) => hasPermission(user.role, p))) throw new ForbiddenException('Missing permission');

    if (needApproved && user.role === Role.RECRUITER) {
      const profile = await this.recruiters.findOne({ userId: user.id }).lean();
      if (profile?.approvalStatus !== ReviewStatus.APPROVED) {
        throw new ForbiddenException({ message: 'Your recruiter account is awaiting Admin approval', code: 'RECRUITER_NOT_APPROVED' });
      }
    }
    return true;
  }
}
