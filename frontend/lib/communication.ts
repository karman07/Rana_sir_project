export interface EmailTemplateRow {
  id: string; key: string; name: string; description?: string; subject: string; heading: string; body: string; ctaLabel?: string;
  variables: string[]; enabled: boolean; sensitive?: boolean; customised?: boolean; updatedAt?: string;
}

export interface NotificationSettingRow { event: string; label: string; group: string; description: string; locked?: boolean; inApp: boolean; email: boolean }

export interface EmailStatus { provider: "resend" | "console"; live: boolean; from: string; fromAddress: string; worker: "on" | "off"; webhookSigned: boolean; webOrigin: string }

/** The editor groups the many templates by what they are about. */
export const TEMPLATE_GROUPS: [string, RegExp][] = [
  ["Accounts", /^(welcome|account-|password-|recruiter-(invite|registered|account))/],
  ["Companies & jobs", /^(company-|job-)/],
  ["Applications", /^(application-|candidate-|recruiter-(approved|rejected)|more-candidates)/],
  ["Interviews", /^interview-/],
  ["Contracts", /^contract-/],
  ["Payments & pay", /^(payment-|payout-|salary-|payslip-)/],
  ["General", /.*/],
];
export const groupOfTemplate = (key: string) => TEMPLATE_GROUPS.find(([, re]) => re.test(key))![0];
