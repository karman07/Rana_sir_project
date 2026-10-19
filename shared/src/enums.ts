export const Role = { ADMIN: 'ADMIN', RECRUITER: 'RECRUITER', CANDIDATE: 'CANDIDATE' } as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Generic review lifecycle for anything Admin must approve (recruiters, companies, jobs, ...). */
export const ReviewStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const JobRequestStatus = {
  DRAFT: 'DRAFT',
  PENDING_ADMIN_REVIEW: 'PENDING_ADMIN_REVIEW',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
} as const;
export type JobRequestStatus = (typeof JobRequestStatus)[keyof typeof JobRequestStatus];

export const JobStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ApplicationStatus = {
  APPLIED: 'APPLIED',
  ADMIN_REVIEW: 'ADMIN_REVIEW',
  /** Round one: our team interviews the candidate before deciding whether to shortlist. */
  ADMIN_INTERVIEW: 'ADMIN_INTERVIEW',
  ADMIN_SHORTLISTED: 'ADMIN_SHORTLISTED',
  SENT_TO_RECRUITER: 'SENT_TO_RECRUITER',
  RECRUITER_REVIEW: 'RECRUITER_REVIEW',
  RECRUITER_APPROVED: 'RECRUITER_APPROVED',
  INTERVIEW: 'INTERVIEW',
  SELECTED: 'SELECTED',
  CONTRACT: 'CONTRACT',
  PLACED: 'PLACED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

/** Which of the two interviews this is: ours first, then the hiring recruiter's. */
export const InterviewStage = { ADMIN: 'ADMIN', RECRUITER: 'RECRUITER' } as const;
export type InterviewStage = (typeof InterviewStage)[keyof typeof InterviewStage];

export const InterviewStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  RESCHEDULED: 'RESCHEDULED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type InterviewStatus = (typeof InterviewStatus)[keyof typeof InterviewStatus];

export const InterviewRecommendation = {
  STRONG_HIRE: 'STRONG_HIRE',
  HIRE: 'HIRE',
  MAYBE: 'MAYBE',
  REJECT: 'REJECT',
} as const;
export type InterviewRecommendation =
  (typeof InterviewRecommendation)[keyof typeof InterviewRecommendation];

export const ContractStatus = {
  DRAFT: 'DRAFT',
  PENDING_ADMIN_APPROVAL: 'PENDING_ADMIN_APPROVAL',
  PENDING_RECRUITER_APPROVAL: 'PENDING_RECRUITER_APPROVAL',
  PENDING_CANDIDATE_APPROVAL: 'PENDING_CANDIDATE_APPROVAL',
  ACTIVE: 'ACTIVE',
  EXPIRING: 'EXPIRING',
  EXPIRED: 'EXPIRED',
  TERMINATED: 'TERMINATED',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const SalaryStatus = {
  UPCOMING: 'UPCOMING',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  DELAYED: 'DELAYED',
  DISPUTED: 'DISPUTED',
} as const;
export type SalaryStatus = (typeof SalaryStatus)[keyof typeof SalaryStatus];

export const NotificationType = {
  RECRUITMENT: 'RECRUITMENT',
  INTERVIEW: 'INTERVIEW',
  CONTRACT: 'CONTRACT',
  PAYMENT: 'PAYMENT',
  SALARY: 'SALARY',
  SYSTEM: 'SYSTEM',
  DOCUMENT: 'DOCUMENT',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const UserStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const WorkMode = { REMOTE: 'REMOTE', HYBRID: 'HYBRID', ONSITE: 'ONSITE' } as const;
export type WorkMode = (typeof WorkMode)[keyof typeof WorkMode];

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  TEMPORARY: 'TEMPORARY',
  INTERNSHIP: 'INTERNSHIP',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];
