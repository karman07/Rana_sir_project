import { formatMoney } from "@rms/shared";

export type PayPeriod = "HOUR" | "MONTH" | "YEAR";
export const PERIOD_LABEL: Record<PayPeriod, string> = { HOUR: "Per hour", MONTH: "Per month", YEAR: "Per year" };
export const PERIOD_SUFFIX: Record<PayPeriod, string> = { HOUR: "/ hr", MONTH: "/ month", YEAR: "/ year" };

export interface ContractTerms {
  title: string; employmentType: string;
  salary: { amount: number; currency: string; period: PayPeriod; hoursPerWeek?: number };
  commission?: { type: "PERCENT"; basisPoints: number } | { type: "FIXED"; amount: number };
  startDate: string; endDate?: string; probationMonths?: number; workingHours?: string; noticePeriodDays?: number; renewalTerms?: string; notes?: string;
}

interface Split { grossAmount: number; commission: number; candidateAmount: number; platformAmount: number }
export interface ContractFinancials { currency: string; monthly: Split; annual: Split }

export interface ContractChange { field: string; label: string; from: unknown; to: unknown }
export interface ContractVersionView {
  version: number; kind: "INITIAL" | "CHANGE"; status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "SUPERSEDED"; createdAt: string; current: boolean;
  reason?: string; changedBy?: { name?: string; role?: string }; decidedByName?: string; decidedAt?: string; decisionNote?: string;
  terms: ContractTerms; financials?: ContractFinancials; changes: ContractChange[];
}

export interface ContractListItem {
  id: string; contractNumber: string; status: string; currentVersion: number; startDate: string; endDate?: string; daysLeft: number | null; createdAt: string; applicationId: string;
  job: { id: string; title?: string; company?: string };
  candidate: { id: string; name?: string; email?: string };
  recruiter?: { id: string; name?: string };
  terms?: ContractTerms; financials?: ContractFinancials; changePending?: boolean;
}

export interface ContractDetail extends ContractListItem {
  statusHistory: { status: string; at: string; byName?: string; note?: string }[];
  lastDecline?: { byName?: string; role?: string; reason?: string; at?: string };
  terminationReason?: string;
  versions: ContractVersionView[];
  pendingChange: ContractVersionView | null;
  awaiting: "ADMIN" | "RECRUITER" | "CANDIDATE" | null;
  actions: string[];
  documents?: import("./documents").DocumentItem[];
}

export interface ContractCounts { [status: string]: number; pendingTotal: number; expiringSoon: number; pendingChanges: number }

/** "$35 / hr · 20 h/week", "₹40,000 / month". Amounts arrive in minor units. */
export function payText(s: ContractTerms["salary"] | undefined, locale?: string) {
  if (!s) return "—";
  const amount = formatMoney({ amount: s.amount, currency: s.currency }, locale).replace(/\.00$/, "");
  return `${amount} ${PERIOD_SUFFIX[s.period]}${s.period === "HOUR" && s.hoursPerWeek ? ` · ${s.hoursPerWeek} h/week` : ""}`;
}

export const commissionText = (c: ContractTerms["commission"], currency: string) =>
  !c ? "—" : c.type === "PERCENT" ? `${(c.basisPoints / 100).toFixed(c.basisPoints % 100 ? 2 : 0)}%` : formatMoney({ amount: c.amount, currency });

/** Renders a changed value from a version diff in a readable way. */
export function changeValue(field: string, v: unknown, currency?: string): string {
  if (v === undefined || v === null || v === "") return "—";
  if (field === "salary.amount" && currency) return formatMoney({ amount: Number(v), currency }).replace(/\.00$/, "");
  if (field === "salary.period") return PERIOD_LABEL[v as PayPeriod] ?? String(v);
  if (field === "commission" && typeof v === "object") return commissionText(v as ContractTerms["commission"], currency ?? "USD");
  return String(v);
}

/** Candidate-facing wording for each stage. */
export const CANDIDATE_CONTRACT_STATUS: Record<string, string> = {
  PENDING_CANDIDATE_APPROVAL: "Waiting for your answer", ACTIVE: "Active", EXPIRING: "Ending soon", EXPIRED: "Ended", TERMINATED: "Ended early",
};

export const STAGES = ["DRAFT", "PENDING_ADMIN_APPROVAL", "PENDING_RECRUITER_APPROVAL", "PENDING_CANDIDATE_APPROVAL", "ACTIVE"] as const;
export const humanStatus = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "2026-11-15" -> "15 Nov 2026" (dates on contracts are plain calendar days, never shifted by time zone). */
export const formatDate = (ymd?: string) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
