import { formatDateTime } from "@/lib/audit";
import type { ReviewEvent } from "@/lib/jobs";
import { Timeline } from "@/components/data/timeline";

const TITLE: Record<string, string> = {
  SUBMITTED: "Submitted for review", RESUBMITTED: "Resubmitted after changes", APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested", REJECTED: "Rejected",
};

export function ReviewHistory({ reviews }: { reviews: ReviewEvent[] }) {
  return (
    <Timeline items={reviews.map((r) => ({
      title: TITLE[r.action] ?? r.action,
      description: [r.byName ? `by ${r.byName}` : null, r.note].filter(Boolean).join(" — ") || undefined,
      time: formatDateTime(r.at),
    }))} />
  );
}
