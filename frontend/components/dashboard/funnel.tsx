import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  applications: "Applications", screening: "Admin screening", adminInterview: "Our interview", shortlisted: "Shortlisted", sentToRecruiter: "Sent to recruiter",
  recruiterApproved: "Recruiter approved", interview: "Interview", selected: "Selected", hired: "Hired",
};

/** Recruitment funnel: each bar is the share of all applications that ever reached that stage. */
export function Funnel({ stages }: { stages: { key: string; count: number }[] }) {
  const top = Math.max(stages[0]?.count ?? 0, 1);
  return (
    <ol className="space-y-2.5" aria-label="Recruitment funnel">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const conv = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.key} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-foreground-2">{LABELS[s.key] ?? s.key}</span>
            <div className="h-6 overflow-hidden rounded-md bg-background-2">
              <div className={cn("flex h-full items-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-[width]")} style={{ width: `${Math.max((s.count / top) * 100, s.count ? 6 : 0)}%`, opacity: 1 - i * 0.07 }}>{s.count > 0 && s.count}</div>
            </div>
            <span className="w-12 text-right text-xs tabular-nums text-muted">{conv !== null && prev ? `${conv}%` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
