import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "gold";

const tones: Record<Tone, string> = {
  neutral: "bg-background-2 text-foreground-2",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-secondary-green/14 text-secondary-green",
  gold: "bg-gold-soft text-gold",
};

const STATUS_TONE: Record<string, Tone> = {
  PENDING_REVIEW: "warning", PENDING_ADMIN_REVIEW: "warning", PENDING_APPROVAL: "warning", PENDING: "warning",
  PENDING_ADMIN_APPROVAL: "warning", PENDING_RECRUITER_APPROVAL: "warning", PENDING_CANDIDATE_APPROVAL: "warning",
  APPROVED: "success", PUBLISHED: "success", ACTIVE: "success", PAID: "success", PLACED: "success", COMPLETED: "success", SELECTED: "success", RECRUITER_APPROVED: "success", ADMIN_SHORTLISTED: "info",
  CHANGES_REQUESTED: "gold", DELAYED: "gold", EXPIRING: "gold", MAYBE: "gold", DISPUTED: "danger",
  REJECTED: "danger", FAILED: "danger", TERMINATED: "danger", CANCELLED: "danger", NO_SHOW: "danger", EXPIRED: "danger",
  AWAITING_CLIENT: "warning", CLIENT_PAID: "info", RECEIVED: "success", PAYOUT_SENT: "info", SENT: "info",
  DRAFT: "neutral", CLOSED: "neutral", UPCOMING: "neutral", APPLIED: "neutral",
  SCHEDULED: "info", PROCESSING: "info", INTERVIEW: "info", SENT_TO_RECRUITER: "info", ADMIN_REVIEW: "info", ADMIN_INTERVIEW: "info", RECRUITER_REVIEW: "info", CONTRACT: "info", RESCHEDULED: "info",
};

const label = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function StatusBadge({ status, tone, label: text, className }: { status: string; tone?: Tone; label?: string; className?: string }) {
  const t = tone ?? STATUS_TONE[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[t], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {text ?? label(status)}
    </span>
  );
}
