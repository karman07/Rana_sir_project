"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, ExternalLink, MapPin, Phone, Video } from "lucide-react";
import { apiList } from "@/lib/api";
import { TYPE_LABEL, stageLabel, type InterviewItem } from "@/lib/interviews";
import { buildIcs, downloadIcs, formatWhen } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";

function countdown(iso: string) {
  const ms = +new Date(iso) - Date.now();
  if (ms <= 0) return "Now";
  const mins = Math.floor(ms / 60_000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  return days >= 2 ? `In ${days} days` : days === 1 ? "Tomorrow" : hrs >= 1 ? `In ${hrs}h` : `In ${mins} min`;
}

export function InterviewCard({ i, highlight }: { i: InterviewItem; highlight?: boolean }) {
  const w = formatWhen(i.startsAt);
  const live = i.status === "SCHEDULED";
  const where = i.type === "VIDEO" ? i.meetingLink : i.type === "IN_PERSON" ? i.location : undefined;
  return (
    <Card className={highlight ? "border-gold/50 p-5 sm:p-6" : "p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{stageLabel(i, true)} · {TYPE_LABEL[i.type]}</p>
          <h3 className="truncate text-lg font-semibold tracking-tight">{i.job.title}</h3>
          <p className="text-sm text-foreground-2">{i.job.company}</p>
        </div>
        <div className="flex flex-col items-end gap-1"><StatusBadge status={i.status} />{live && <span className="text-xs font-medium text-gold">{countdown(i.startsAt)}</span>}</div>
      </div>
      <div className="mt-4 grid gap-3 rounded-xl bg-background-2 p-4 text-sm sm:grid-cols-2">
        <div><p className="text-xs text-muted">When</p><p className="font-semibold">{w.date}</p><p className="text-foreground-2">{w.time} · {i.durationMinutes} min</p></div>
        <div className="min-w-0">
          <p className="text-xs text-muted">{i.type === "VIDEO" ? "Join" : i.type === "IN_PERSON" ? "Where" : "Phone"}</p>
          {i.type === "VIDEO" && (i.meetingLink ? <a href={i.meetingLink} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 truncate font-medium text-primary hover:underline"><Video className="size-4 shrink-0" />Open meeting link</a> : <p>Link coming soon</p>)}
          {i.type === "IN_PERSON" && <p className="flex items-start gap-1.5 font-medium"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" />{i.location}</p>}
          {i.type === "PHONE" && <p className="flex items-center gap-1.5 font-medium"><Phone className="size-4 text-muted" />{i.phoneNumber ?? "We'll call the number on your profile"}</p>}
          {i.interviewers.length > 0 && <p className="mt-1 text-xs text-foreground-2">With {i.interviewers.map((x) => x.name).join(", ")}</p>}
        </div>
      </div>
      {i.instructions && <p className="mt-3 whitespace-pre-line text-sm text-foreground-2"><span className="font-medium text-foreground">What to know: </span>{i.instructions}</p>}
      {live && (
        <div className="mt-4 flex flex-wrap gap-2">
          {i.type === "VIDEO" && i.meetingLink && <Button asChild size="sm"><a href={i.meetingLink} target="_blank" rel="noreferrer noopener"><ExternalLink />Join interview</a></Button>}
          <Button size="sm" variant="secondary" onClick={() => downloadIcs(`interview-${i.interviewNumber}`, buildIcs({ id: i.id, title: `Interview: ${i.job.title} at ${i.job.company}`, startsAt: i.startsAt, minutes: i.durationMinutes, description: i.instructions, location: where, url: i.type === "VIDEO" ? i.meetingLink : undefined }))}><CalendarPlus />Add to calendar</Button>
        </div>
      )}
    </Card>
  );
}

export function CandidateInterviews() {
  const q = useQuery({ queryKey: ["interviews", "candidate"], queryFn: () => apiList<InterviewItem>("/interviews?limit=100") });
  const items = q.data?.items ?? [];
  const upcoming = items.filter((i) => i.status === "SCHEDULED");
  const past = items.filter((i) => i.status !== "SCHEDULED").reverse();
  return (
    <>
      <PageHeader title="My interviews" description="Times are shown in your local time zone." />
      {q.isPending ? <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-52 rounded-[16px]" />)}</div> : q.isError ? <ErrorState compact variant="server" onRetry={() => q.refetch()} /> : items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No interviews yet" description="When the hiring company wants to meet you, the details appear here — and we'll email you." />
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && <section aria-label="Upcoming"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Upcoming</h2><div className="space-y-4">{upcoming.map((i, n) => <InterviewCard key={i.id} i={i} highlight={n === 0} />)}</div></section>}
          {past.length > 0 && <section aria-label="Past"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Past &amp; changed</h2><div className="space-y-4">{past.map((i) => <InterviewCard key={i.id} i={i} />)}</div></section>}
        </div>
      )}
    </>
  );
}
