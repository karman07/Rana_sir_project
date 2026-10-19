"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, List, Video } from "lucide-react";
import { apiList } from "@/lib/api";
import { TYPE_LABEL, type InterviewItem } from "@/lib/interviews";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { InterviewDetail } from "./interview-detail";

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const TONE: Record<string, string> = {
  SCHEDULED: "border-secondary-green/40 bg-secondary-green/10", COMPLETED: "border-success/40 bg-success/10", CANCELLED: "border-border bg-background-2 opacity-60 line-through",
  RESCHEDULED: "border-border bg-background-2 opacity-60", NO_SHOW: "border-danger/40 bg-danger/10",
};

/** Month calendar and agenda list of interviews, for Admin and recruiters. */
export function InterviewCalendar() {
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [open, setOpen] = useState<string | null>(null);

  // The grid shows leading/trailing days of neighbouring months, so fetch a little beyond the month.
  const from = new Date(cursor.getFullYear(), cursor.getMonth(), -6);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 8);
  const month = useQuery({
    queryKey: ["interviews", "month", cursor.toISOString()], enabled: view === "month",
    queryFn: () => apiList<InterviewItem>(`/interviews?limit=100&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
  });
  const list = useQuery({ queryKey: ["interviews", "upcoming"], enabled: view === "list", queryFn: () => apiList<InterviewItem>("/interviews?limit=100&upcoming=true") });

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first); gridStart.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start on Monday
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  }, [cursor]);
  const byDay = useMemo(() => {
    const m = new Map<string, InterviewItem[]>();
    for (const i of month.data?.items ?? []) { const k = new Date(i.startsAt).toDateString(); m.set(k, [...(m.get(k) ?? []), i]); }
    return m;
  }, [month.data]);
  const today = new Date();
  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <>
      <PageHeader title="Interviews" description="Everything scheduled, in your local time."
        actions={
          <div className="flex rounded-lg bg-background-2 p-1 text-sm" role="tablist">
            {([["month", CalendarDays, "Calendar"], ["list", List, "Upcoming"]] as const).map(([k, Icon, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors", view === k ? "bg-card shadow-card" : "text-foreground-2")}><Icon className="size-4" />{label}</button>
            ))}
          </div>
        } />

      {view === "month" ? (
        <div className="rounded-[16px] border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-divider p-4">
            <h2 className="text-lg font-semibold tracking-tight">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
              <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></Button>
              <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></Button>
            </div>
          </div>
          {month.isError ? <div className="p-4"><ErrorState compact variant="server" onRetry={() => month.refetch()} /></div> : (
            <>
              <div className="grid grid-cols-7 border-b border-divider text-center text-xs font-medium uppercase tracking-wide text-muted">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d, idx) => {
                  const items = byDay.get(d.toDateString()) ?? [];
                  const other = d.getMonth() !== cursor.getMonth();
                  return (
                    <div key={idx} className={cn("min-h-24 border-b border-r border-divider p-1.5 sm:min-h-28", other && "bg-background-2/50", idx % 7 === 6 && "border-r-0")}>
                      <span className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs", sameDay(d, today) ? "bg-primary font-semibold text-primary-foreground" : other ? "text-muted" : "text-foreground-2")}>{d.getDate()}</span>
                      <ul className="space-y-1">
                        {items.slice(0, 3).map((i) => (
                          <li key={i.id}><button onClick={() => setOpen(i.id)} title={`${i.candidate.name} · ${i.job.title}`} className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight hover:brightness-95", TONE[i.status])}>
                            <span className="font-medium">{timeOf(i.startsAt)}</span> {i.candidate.name?.split(" ")[0]}
                          </button></li>
                        ))}
                        {items.length > 3 && <li className="px-1 text-[11px] text-muted">+{items.length - 3} more</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {month.isPending && <div className="p-4"><Skeleton className="h-6 w-40" /></div>}
        </div>
      ) : list.isPending ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-[16px]" />)}</div>
      ) : list.isError ? (
        <ErrorState compact variant="server" onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No upcoming interviews" description="Once a candidate is approved, schedule an interview from their page and it will appear here." />
      ) : (
        <ul className="space-y-3">
          {list.data.items.map((i) => {
            const d = new Date(i.startsAt);
            return (
              <li key={i.id}>
                <button onClick={() => setOpen(i.id)} className="flex w-full items-center gap-4 rounded-[16px] border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-secondary-green/40">
                  <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-background-2 py-2"><span className="text-xs uppercase text-muted">{d.toLocaleDateString(undefined, { month: "short" })}</span><span className="text-xl font-semibold leading-none">{d.getDate()}</span></div>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{i.candidate.name}</p><p className="truncate text-sm text-foreground-2">{i.job.title} · {i.job.company}</p><p className="text-xs text-muted">{i.stage === "ADMIN" ? "Our interview · " : ""}{timeOf(i.startsAt)} · {i.durationMinutes} min · {TYPE_LABEL[i.type]} · Round {i.round}</p></div>
                  {i.type === "VIDEO" && <Video className="hidden size-4 text-muted sm:block" />}
                  <StatusBadge status={i.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <InterviewDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
