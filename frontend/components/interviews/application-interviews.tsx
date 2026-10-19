"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { apiList } from "@/lib/api";
import { TYPE_LABEL, stageLabel, type InterviewItem } from "@/lib/interviews";
import { formatWhen } from "@/lib/time";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { InterviewDetail } from "./interview-detail";
import { ScheduleInterviewDialog } from "./schedule-dialog";

/** Interviews for one application, with the schedule button. Shown to Admin and the recruiter. */
export function ApplicationInterviews({ applicationId, candidateName, canSchedule }: { applicationId: string; candidateName?: string; canSchedule: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["interviews", "application", applicationId], queryFn: () => apiList<InterviewItem>(`/interviews?limit=50&applicationId=${applicationId}`) });
  const items = (q.data?.items ?? []).filter((i) => i.status !== "RESCHEDULED");
  return (
    <Card>
      <CardHeader title="Interviews" description={items.length ? `${items.length} round${items.length > 1 ? "s" : ""}` : "None scheduled yet"} action={canSchedule ? <ScheduleInterviewDialog mode={{ kind: "create", applicationId, candidateName }} /> : undefined} />
      <CardBody>
        {items.length === 0 ? <p className="flex items-center gap-2 text-sm text-foreground-2"><CalendarClock className="size-4 text-muted" />{canSchedule ? "Schedule the first interview to move this candidate forward." : "No interviews."}</p> : (
          <ul className="divide-y divide-divider">
            {items.map((i) => {
              const w = formatWhen(i.startsAt);
              return (
                <li key={i.id}><button onClick={() => setOpen(i.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-primary">
                  <span className="min-w-0"><span className="block text-sm font-medium">{stageLabel(i)} · {TYPE_LABEL[i.type]}</span><span className="block truncate text-xs text-muted">{w.date}, {w.time}</span></span>
                  <StatusBadge status={i.status} />
                </button></li>
              );
            })}
          </ul>
        )}
      </CardBody>
      {open && <InterviewDetail id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
