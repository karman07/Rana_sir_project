import { formatMoney } from "@rms/shared";

export type PaymentStage = "AWAITING_CLIENT" | "CLIENT_PAID" | "RECEIVED" | "PAYOUT_SENT" | "COMPLETED" | "DISPUTED" | "CANCELLED";

export interface Leg { status: string; amountSent?: number; sentAt?: string; method?: string; reference?: string; note?: string; proofDocumentId?: string; disputeNote?: string; amountReceived?: number; confirmedAt?: string }
export interface LedgerLine { id: string; paymentNumber: string; transactionId: string; contractNumber: string; type: "CLIENT_RECEIPT" | "COMMISSION" | "CANDIDATE_PAYOUT" | "REVERSAL"; amount: number; currency: string; period: string; reference?: string; memo?: string; createdAt: string }

/** One shape for all three roles; the server fills in only what that role may see. */
export interface PaymentItem {
  id: string; paymentNumber: string; transactionId: string; contractId: string; contractNumber: string; period: string; dueDate: string; currency: string; createdAt: string;
  status: string; overdue?: boolean; job: { title?: string; company?: string };
  // Admin
  gross?: number; commission?: number; candidateAmount?: number; hoursWorked?: number; contractVersion?: number; rule?: { type: string; basisPoints?: number; amount?: number };
  candidate?: { id?: string; name?: string; email?: string }; recruiter?: { id?: string; name?: string };
  client?: Leg; payout?: Leg; history?: { status: string; at: string; byName?: string; byRole?: string; note?: string }[]; cancelledReason?: string; ledger?: LedgerLine[];
  // Recruiter: what the company owes. Candidate: their own pay.
  amountDue?: number; amount?: number;
  /** Set when the candidate asked for this pay from their own portal. */
  candidateRequest?: { at: string; note?: string };
  actions: string[];
}

export interface PaymentCounts { [status: string]: number; overdue: number; payoutsDue: number; needsAction: number }
export interface PaymentSummary {
  totals: { currency: string; awaitingFromCompanies: number; toConfirm: number; commissionEarned: number; commissionPending: number; payoutsDue: number; paidOut: number; disputed: number }[];
  commissionByPeriod: { period: string; currency: string; commission: number }[];
}

export const STAGE_LABEL: Record<string, string> = {
  AWAITING_CLIENT: "Awaiting payment", CLIENT_PAID: "Payment released", RECEIVED: "Received", PAYOUT_SENT: "Payout sent", COMPLETED: "Completed", DISPUTED: "Disputed", CANCELLED: "Cancelled",
  PROCESSING: "Being prepared", SENT: "Sent — please confirm",
};

/** Words each role sees for the same stage. */
export const roleStage = (role: "admin" | "recruiter" | "candidate", status: string) => {
  if (role === "recruiter") return ({ AWAITING_CLIENT: "To pay", CLIENT_PAID: "Released, awaiting confirmation", RECEIVED: "Paid", COMPLETED: "Paid", DISPUTED: "Needs attention", CANCELLED: "Cancelled" } as Record<string, string>)[status] ?? STAGE_LABEL[status] ?? status;
  return STAGE_LABEL[status] ?? status;
};

export const money = (n: number | undefined, currency: string, locale?: string) => (n === undefined ? "—" : formatMoney({ amount: n, currency }, locale).replace(/\.00$/, ""));

/** "2026-11" -> "Nov 2026". */
/** A pay period key is a month ("2026-10"), an ISO week ("2026-W41") or a day ("2026-10-09"). */
export const periodLabel = (p: string) => {
  const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: "UTC" });
  if (p.includes("W")) {
    const [y, w] = p.split("-W").map(Number);
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000 + (w - 1) * 7 * 86_400_000);
    return `Week of ${fmt(monday.toISOString().slice(0, 10), { day: "numeric", month: "short" })}`;
  }
  return p.length === 10 ? fmt(p, { day: "numeric", month: "short", year: "numeric" }) : fmt(`${p}-01`, { month: "short", year: "numeric" });
};

export const METHODS = ["Bank transfer", "UPI", "Wire transfer", "PayPal", "Cheque", "Cash", "Other"];

export const LEDGER_LABEL: Record<LedgerLine["type"], string> = { CLIENT_RECEIPT: "Received from company", COMMISSION: "Commission earned", CANDIDATE_PAYOUT: "Paid to candidate", REVERSAL: "Reversal" };
