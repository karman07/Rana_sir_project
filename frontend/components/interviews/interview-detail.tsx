"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarX2, Check, Link2, MapPin, Pencil, Phone, UserX, Video } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { api, apiPost, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { RECOMMENDATION_LABEL, RECOMMENDATION_TONE, TYPE_LABEL, hasStarted, isLive, type InterviewItem } from "@/lib/interviews";
import { formatWhen } from "@/lib/time";
import { Timeline } from "@/components/data/timeline";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { FeedbackForm } from "./feedback-form";
import { ScheduleInterviewDialog } from "./schedule-dialog";

function Stars({ value }: { value?: number }) {
  if (!value) return <span className="text-muted">—</span>;
  return <span className="text-gold" aria-label={`${value} out of 5`}>{"★".repeat(value)}<span className="text-border">{"★".repeat(5 - value)}</span></span>;
}

/** Side panel with everything about one interview, plus the actions staff can take. */
export function InterviewDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ["interview", id], queryFn: () => api<InterviewItem>(`/interviews/${id}`) });
  const refresh = () => { for (const k of ["interview", "interviews", "application", "overview", "notifications"]) qc.invalidateQueries({ queryKey: [k] }); };
  const act = useMutation({
    mutationFn: (a: { path: string; body?: unknown; ok: string }) => apiPost(`/interviews/${id}/${a.path}`, a.body ?? {}),
    onSuccess: (_r, a) => { toast.success(a.ok); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Action failed"); refresh(); },
  });

  const i = q.data;
  const when = i ? formatWhen(i.startsAt, i.timezone) : null;
  const started = i ? hasStarted(i) : false;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/50" />
        <DialogPrimitive.Content className="fixed right-0 top-0 z-50 flex h-full w-[min(96vw,40rem)] flex-col border-l border-border bg-card shadow-card">
          <div className="flex items-start justify-between gap-4 border-b border-divider p-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate font-semibold tracking-tight">{i ? `${i.candidate.name} · ${i.job.title}` : "Interview"}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-foreground-2">{i ? `${i.interviewNumber} · Round ${i.round}` : "Loading…"}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-background-2" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
            {q.isPending || !i ? <Skeleton className="h-64 w-full" /> : (
              <>
                <div className="space-y-3 rounded-xl bg-background-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={i.status} /><span className="text-xs text-muted">{TYPE_LABEL[i.type]} · {i.durationMinutes} min</span></div>
                  <p className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="size-4 text-secondary-green" />{when!.date}, {when!.time}</p>
                  {i.type === "VIDEO" && i.meetingLink && <a href={i.meetingLink} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 text-primary hover:underline"><Video className="size-4" /><span className="truncate">{i.meetingLink}</span></a>}
                  {i.type === "IN_PERSON" && i.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-muted" />{i.location}</p>}
                  {i.type === "PHONE" && <p className="flex items-center gap-2"><Phone className="size-4 text-muted" />{i.phoneNumber ?? "Candidate's number"}</p>}
                  {i.interviewers.length > 0 && <p className="text-foreground-2">With {i.interviewers.map((x) => x.name).join(", ")}</p>}
                  {i.instructions && <p className="whitespace-pre-line border-t border-divider pt-3 text-foreground-2"><span className="font-medium text-foreground">For the candidate: </span>{i.instructions}</p>}
                  {i.notes && <p className="whitespace-pre-line border-t border-divider pt-3 text-foreground-2"><span className="font-medium text-foreground">Internal: </span>{i.notes}</p>}
                  {i.cancelReason && <p className="border-t border-divider pt-3 text-danger">Cancelled: {i.cancelReason}</p>}
                </div>

                {isLive(i) && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil />Edit / reschedule</Button>
                    {started && <Button size="sm" loading={act.isPending && act.variables?.path === "complete"} onClick={() => act.mutate({ path: "complete", ok: "Marked as completed" })}><Check />Mark completed</Button>}
                    {started && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: "no-show", ok: "Marked as a no-show" })}><UserX />No-show</Button>}
                    <Button size="sm" variant="outlineDanger" onClick={() => setCancelling(true)}><CalendarX2 />Cancel</Button>
                  </div>
                )}

                {(started && i.status !== "CANCELLED" && i.status !== "RESCHEDULED") && (
                  <section>
                    <h3 className="mb-3 font-semibold tracking-tight">Feedback</h3>
                    {i.feedback?.length ? (
                      <ul className="mb-4 space-y-3">
                        {i.feedback.map((f) => (
                          <li key={f.id} className="rounded-xl border border-border p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{f.authorName} <span className="text-xs font-normal text-muted">· {f.authorRole.toLowerCase()}</span></span><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", RECOMMENDATION_TONE[f.recommendation])}>{RECOMMENDATION_LABEL[f.recommendation]}</span></div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground-2 sm:grid-cols-4"><div><dt>Overall</dt><dd><Stars value={f.overallRating} /></dd></div><div><dt>Technical</dt><dd><Stars value={f.technicalRating} /></dd></div><div><dt>Communication</dt><dd><Stars value={f.communicationRating} /></dd></div><div><dt>Culture fit</dt><dd><Stars value={f.cultureFit} /></dd></div></dl>
                            {f.strengths && <p className="mt-2"><span className="font-medium">Strengths: </span><span className="text-foreground-2">{f.strengths}</span></p>}
                            {f.weaknesses && <p className="mt-1"><span className="font-medium">Weaknesses: </span><span className="text-foreground-2">{f.weaknesses}</span></p>}
                            {f.notes && <p className="mt-1 text-foreground-2">{f.notes}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mb-3 text-foreground-2">No feedback yet.</p>}
                    <FeedbackForm interviewId={i.id} onSaved={refresh} />
                  </section>
                )}
                {!started && isLive(i) && <p className="flex items-center gap-2 text-xs text-muted"><Link2 className="size-3.5" />Feedback opens once the interview has started.</p>}

                {i.history && i.history.length > 0 && (
                  <section><h3 className="mb-3 font-semibold tracking-tight">History</h3>
                    <Timeline items={[...i.history].reverse().map((h) => ({ title: h.status.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), description: [h.byName ? `by ${h.byName}` : null, h.reason].filter(Boolean).join(" — ") || undefined, time: formatDateTime(h.at) }))} /></section>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <ReasonDialog open={cancelling} onOpenChange={setCancelling} destructive title="Cancel this interview?" description="The candidate and recruiter are notified, with your reason." confirmLabel="Cancel interview"
        onSubmit={(reason) => act.mutateAsync({ path: "cancel", body: { reason }, ok: "Interview cancelled" })} />
      {i && editing && <ScheduleInterviewDialog mode={{ kind: "edit", interview: i }} trigger={null} open={editing} onOpenChange={setEditing} />}
    </Dialog>
  );
}
