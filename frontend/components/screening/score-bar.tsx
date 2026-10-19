import { cn } from "@/lib/utils";

/** A small labelled percentage bar. */
export function ScoreBar({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-muted">—</span>;
  const tone = value >= 75 ? "bg-success" : value >= 50 ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("flex items-center gap-2", className)} title={`${value}%`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-background-2"><div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} /></div>
      <span className="w-8 text-xs tabular-nums text-foreground-2">{value}%</span>
    </div>
  );
}

export function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  const tone = value >= 75 ? "bg-success/12 text-success" : value >= 50 ? "bg-warning/14 text-warning" : "bg-danger/12 text-danger";
  return <span className={cn("inline-flex min-w-9 justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums", tone)}>{value}</span>;
}
