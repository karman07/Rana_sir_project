import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@rms/shared';
import type { Permission } from '../permissions';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...p: Permission[]) => SetMetadata(PERMISSIONS_KEY, p);

/** Recruiter must have an Admin-approved account (pending recruiters can sign in but not act). */
export const REQUIRE_APPROVED = 'requireApprovedRecruiter';
export const RequireApprovedRecruiter = () => SetMetadata(REQUIRE_APPROVED, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
