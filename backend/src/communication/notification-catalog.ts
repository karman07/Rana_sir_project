import { RULES } from './notification-rules';

export interface CatalogEntry { event: string; label: string; group: string; description: string; locked?: boolean }

const GROUPS: [string, RegExp][] = [
  ['Accounts', /^(CANDIDATE_REGISTERED|RECRUITER_REGISTERED|RECRUITER_ACCOUNT_|PASSWORD_RESET)/],
  ['Companies', /^COMPANY_/],
  ['Jobs', /^JOB_/],
  ['Applications & candidates', /^(APPLICATION_|CANDIDATE_|CANDIDATES_|RECRUITER_(APPROVED|REJECTED|REQUESTED_CHANGES))/],
  ['Interviews', /^INTERVIEW_/],
  ['Contracts', /^CONTRACT_/],
  ['Payments', /^PAYMENT_/],
  ['Salary & payslips', /^(SALARY_|PAYSLIP_)/],
  ['Website', /^CONTACT_/],
];

/** Plain-language names for the events people will recognise; the rest are tidied from their code names. */
const LABELS: Record<string, [string, string]> = {
  CANDIDATE_REGISTERED: ['New candidate signs up', 'Welcome message to the candidate, and a note to Admin'],
  RECRUITER_REGISTERED: ['New recruiter signs up', 'Tells Admin there is a recruiter to review'],
  PASSWORD_RESET: ['Password changed', 'A security notice. It cannot be turned off.'],
  APPLICATION_CREATED: ['A candidate applies', 'Confirms to the candidate and alerts Admin'],
  APPLICATION_STATUS_CHANGED: ['Application moves to a new stage', 'Keeps the candidate up to date'],
  CANDIDATE_SENT_TO_RECRUITER: ['Candidate sent to a recruiter', 'Tells the recruiter there is someone to review'],
  INTERVIEW_SCHEDULED: ['Interview scheduled', 'Candidate and recruiter, with a calendar invite'],
  INTERVIEW_RESCHEDULED: ['Interview moved', 'Candidate and recruiter'],
  INTERVIEW_CANCELLED: ['Interview cancelled', 'Candidate and recruiter'],
  CONTRACT_SUBMITTED: ['Contract sent for approval', 'Whoever has to approve it next'],
  CONTRACT_APPROVED: ['Contract approved at a stage', 'The next person, or the candidate when it is their turn'],
  CONTRACT_ACTIVATED: ['Contract takes effect', 'Everyone involved'],
  CONTRACT_UPDATED: ['Contract changed', 'Candidate, recruiter and Admin'],
  PAYMENT_GENERATED: ['Monthly payment created', 'Tells the company what is due'],
  PAYMENT_OVERDUE: ['Payment is late', 'The company and Admin'],
  PAYMENT_CLIENT_PAID: ['Company says it paid', 'Admin, to confirm the money arrived'],
  PAYMENT_RECEIVED: ['Payment confirmed', 'The company, the candidate and Admin'],
  PAYMENT_PAYOUT_SENT: ['Candidate pay sent', 'The candidate, to confirm receipt'],
  SALARY_DELAYED: ['Salary delay published', 'The candidate sees the reason and new date'],
  SALARY_DELAY_REPORTED: ['Recruiter reports a salary delay', 'Admin decides whether to publish it'],
  PAYSLIP_GENERATED: ['Payslip ready', 'The candidate'],
  CONTACT_RECEIVED: ['Website contact form', 'Admin, when someone writes in'],
};

const tidy = (e: string) => e.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const LOCKED = new Set(['PASSWORD_RESET']);

/** Every event that can notify someone, grouped for the settings page. */
export const NOTIFICATION_CATALOG: CatalogEntry[] = Object.keys(RULES)
  .map((event) => {
    const [label, description] = LABELS[event] ?? [tidy(event), ''];
    return { event, label, description, group: GROUPS.find(([, re]) => re.test(event))?.[0] ?? 'Other', locked: LOCKED.has(event) || undefined };
  })
  .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

export const CATALOG_EVENTS = new Set(NOTIFICATION_CATALOG.map((c) => c.event));
