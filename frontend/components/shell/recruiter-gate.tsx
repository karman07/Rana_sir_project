import { Clock, MessageSquareWarning, ShieldX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

const VIEW: Record<string, { icon: typeof Clock; title: string; description: string }> = {
  PENDING_REVIEW: {
    icon: Clock,
    title: "Your account is awaiting approval",
    description: "Our team reviews every new recruiter before they can post openings. You'll get an email as soon as it's done — usually within one business day.",
  },
  CHANGES_REQUESTED: {
    icon: MessageSquareWarning,
    title: "We need a few changes to your account",
    description: "Please review the note from our team below and contact us once updated.",
  },
  REJECTED: {
    icon: ShieldX,
    title: "Your recruiter account wasn't approved",
    description: "If you think this is a mistake, please contact our support team.",
  },
};

/** Shown instead of recruiter pages until Admin approves the account. The API enforces this too. */
export function RecruiterGate({ status, note }: { status: string; note?: string }) {
  const v = VIEW[status] ?? VIEW.PENDING_REVIEW;
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState icon={v.icon} title={v.title} description={v.description} />
      {note && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Note from our team</p>
          {note}
        </div>
      )}
    </div>
  );
}
