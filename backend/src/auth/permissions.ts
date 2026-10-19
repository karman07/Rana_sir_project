import { Role } from '@rms/shared';

/** Permission strings are `<resource>:<action>`. ADMIN holds the wildcard. Extended per part. */
export const Permission = {
  USERS_MANAGE: 'users:manage',
  RECRUITERS_READ: 'recruiters:read',
  RECRUITERS_MANAGE: 'recruiters:manage',
  COMPANIES_REQUEST: 'companies:request',
  COMPANIES_MANAGE: 'companies:manage',
  JOBS_REQUEST: 'jobs:request',
  JOBS_MANAGE: 'jobs:manage',
  JOBS_APPLY: 'jobs:apply',
  PROFILE_OWN: 'profile:own',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Record<Role, readonly (Permission | '*')[]> = {
  ADMIN: ['*'],
  RECRUITER: [Permission.COMPANIES_REQUEST, Permission.JOBS_REQUEST, Permission.PROFILE_OWN],
  CANDIDATE: [Permission.JOBS_APPLY, Permission.PROFILE_OWN],
};

export const hasPermission = (role: Role, needed: Permission) =>
  ROLE_PERMISSIONS[role].some((p) => p === '*' || p === needed);
