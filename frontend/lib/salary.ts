export type SalaryStatus = "UPCOMING" | "PENDING" | "PROCESSING" | "PAID" | "DELAYED" | "DISPUTED";
export type DelayState = "NONE" | "REPORTED" | "PUBLISHED" | "REJECTED" | "RESOLVED";

/** One shape for all roles; the server leaves out what a role may not see. */
export interface SalaryItem {
  id: string; salaryNumber: string; contractId: string; contractNumber: string; period: string; currency: string; payDate: string; originalPayDate: string;
  status: SalaryStatus; hoursWorked?: number; hourly?: boolean; contractVersion?: number; job: { title?: string; company?: string };
  // Admin and candidate: what the candidate receives. Recruiter and Admin: the company-side figure.
  amount?: number; grossAmount?: number;
  candidate?: { id?: string; name?: string; email?: string }; recruiter?: { id?: string; name?: string };
  paymentId?: string; payslipId?: string; payment?: { id: string; number: string; status: string }; hasPayment?: boolean;
  confirmed?: boolean; paidOn?: string; method?: string; reference?: string;
  delay?: {
    status?: DelayState; reason?: string; newPayDate?: string; reportedBy?: { name?: string; role?: string }; reportedAt?: string; decidedByName?: string; decidedAt?: string; decisionNote?: string;
    publishedAt?: string; resolved?: boolean;
  };
  delayLog?: { status: string; reason?: string; newPayDate?: string; byName?: string; byRole?: string; at: string; note?: string }[];
  history?: { status: string; at: string; note?: string }[];
  hoursSubmittedBy?: { name?: string; at?: string };
  actions: string[];
}

export interface SalaryCounts { [status: string]: number; delayReports: number }

export const SALARY_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming", PENDING: "Pending", PROCESSING: "Being processed", PAID: "Paid", DELAYED: "Delayed", DISPUTED: "Disputed",
};
export const candidateSalaryLabel = (s: SalaryItem) => (s.status === "PAID" ? (s.confirmed ? "Received" : "Sent — please confirm") : SALARY_LABEL[s.status] ?? s.status);
