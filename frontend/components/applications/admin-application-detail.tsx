"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Mail, MapPin, Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ApplicationStatus, formatMoney } from "@rms/shared";
import { api, documentUrl, ApiError } from "@/lib/api";
import { humanize, timeAgo, type AllowedTransition, type ApplicationDetail } from "@/lib/applications";
import { formatDateTime } from "@/lib/audit";
import { EntityActivity } from "@/components/data/entity-activity";
import { Timeline } from "@/components/data/timeline";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SpecView } from "@/components/jobs/spec-view";
import { ScreeningPanel } from "@/components/screening/screening-panel";
import { ApplicationInterviews } from "@/components/interviews/application-interviews";
import { ContractPanel } from "@/components/contracts/contract-panel";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";

const ACTION_LABEL: Record<string, string> = {
  ADMIN_REVIEW: "Start review", ADMIN_INTERVIEW: "Move to our interview", ADMIN_SHORTLISTED: "Shortlist", SENT_TO_RECRUITER: "Send to recruiter", RECRUITER_REVIEW: "Mark under recruiter review",
  RECRUITER_APPROVED: "Mark recruiter-approved", INTERVIEW: "Move to interview", SELECTED: "Mark selected", CONTRACT: "Start contract", PLACED: "Mark placed", REJECTED: "Reject", WITHDRAWN: "Withdraw",
};

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]"><dt className="text-sm text-muted">{label}</dt><dd className="whitespace-pre-line text-sm">{children}</dd></div>;
}

export function AdminApplicationDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<AllowedTransition | null>(null);
  const [override, setOverride] = useState(false);
  const [target, setTarget] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`) });

  const move = useMutation({
    mutationFn: (b: { status: string; reason?: string; notes?: string; override?: boolean }) => api(`/applications/${id}/status`, { method: "PATCH", body: JSON.stringify(b) }),
    onSuccess: (_r, b) => {
      toast.success(`Moved to ${humanize(b.status)}`);
      for (const k of ["application", "applications", "overview", "audit", "approvals"]) qc.invalidateQueries({ queryKey: [k] });
      setOverride(false); setTarget(""); setOverrideReason("");
    },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Could not update"); qc.invalidateQueries({ queryKey: ["application", id] }); },
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const a = q.data, c = a.candidate!, p = a.candidateProfile;
  const live = !["REJECTED", "WITHDRAWN", "PLACED"].includes(a.status);
  const forward = a.transitions.filter((t) => t.kind === "normal");
  const reject = a.transitions.find((t) => t.kind === "reject");
  const overrideTargets = Object.values(ApplicationStatus).filter((s) => s !== a.status);

  const apply = (t: AllowedTransition) => (t.reasonRequired ? setDialog(t) : move.mutate({ status: t.to }));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/admin/applications"><ArrowLeft />All applications</Link></Button>
      <PageHeader title={c.name} description={`${a.applicationNumber} · applied for ${a.job.title} at ${a.company.name} ${timeAgo(a.createdAt).toLowerCase()}`} actions={<StatusBadge status={a.status} />} />
      <ContractPanel application={a} role="admin" />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Candidate" />
            <CardBody>
              <div className="mb-4 flex items-center gap-4">
                <Avatar name={c.name} size={52} />
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-foreground-2">{p?.headline}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1"><Mail className="size-3.5" />{c.email}</span>
                    {c.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" />{c.phone}</span>}
                    {p?.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{p.location}</span>}
                  </div>
                </div>
                {a.resumeDocumentId && <Button asChild variant="secondary" size="sm" className="ml-auto"><a href={documentUrl(a.resumeDocumentId, true)} target="_blank" rel="noreferrer"><FileText />View resume</a></Button>}
              </div>
              <dl className="divide-y divide-divider">
                <Row label="Experience">{p?.experienceYears != null ? `${p.experienceYears} years` : undefined}</Row>
                <Row label="Skills">{p?.skills?.length ? <span className="flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="rounded-md bg-background-2 px-2 py-0.5 text-xs">{s}</span>)}</span> : undefined}</Row>
                <Row label="Expected salary">{a.expectedSalary && `${formatMoney(a.expectedSalary).replace(/\.00$/, "")} / year`}</Row>
                <Row label="Notice period">{a.noticePeriodDays != null ? `${a.noticePeriodDays} days` : undefined}</Row>
                <Row label="About">{p?.about}</Row>
                <Row label="Cover letter">{a.coverLetter}</Row>
                <Row label="Additional info">{a.relevantInfo}</Row>
                <Row label="Documents">{a.documents.length ? <span className="flex flex-col gap-1">{a.documents.map((d) => <a key={d.documentId} className="inline-flex items-center gap-1.5 text-primary hover:underline" href={documentUrl(d.documentId)} target="_blank" rel="noreferrer"><FileText className="size-4" />{d.label}</a>)}</span> : undefined}</Row>
              </dl>
              {p?.experience?.length ? (<><h3 className="mt-5 mb-2 text-sm font-semibold">Work history</h3><ul className="space-y-3">{p.experience.map((e, i) => <li key={i} className="text-sm"><p className="font-medium">{e.title} · {e.company}</p><p className="text-xs text-muted">{e.startDate ?? "—"} – {e.current ? "Present" : e.endDate ?? "—"}</p>{e.description && <p className="mt-1 text-foreground-2">{e.description}</p>}</li>)}</ul></>) : null}
              {p?.education?.length ? (<><h3 className="mt-5 mb-2 text-sm font-semibold">Education</h3><ul className="space-y-2">{p.education.map((e, i) => <li key={i} className="text-sm"><p className="font-medium">{e.degree}{e.field ? `, ${e.field}` : ""}</p><p className="text-xs text-muted">{e.institution}{e.endYear ? ` · ${e.endYear}` : ""}</p></li>)}</ul></>) : null}
            </CardBody>
          </Card>

          <details className="group rounded-[16px] border border-border bg-card shadow-card">
            <summary className="cursor-pointer list-none p-5 font-semibold tracking-tight">Job requirements <span className="text-sm font-normal text-muted">— {a.job.title}</span></summary>
            <div className="p-5 pt-0">{a.jobSpec && <SpecView spec={a.jobSpec} />}</div>
          </details>
        </div>

        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          {(["APPLIED", "ADMIN_REVIEW", "ADMIN_INTERVIEW", "ADMIN_SHORTLISTED", "SENT_TO_RECRUITER", "RECRUITER_REVIEW", "RECRUITER_APPROVED", "INTERVIEW", "SELECTED"].includes(a.status)) && <ApplicationInterviews applicationId={a.id} candidateName={c.name} canSchedule={["APPLIED", "ADMIN_REVIEW", "ADMIN_INTERVIEW"].includes(a.status)} />}
          <ScreeningPanel applicationId={a.id} adminScore={a.adminScore} resumeScore={a.resumeScore} adminNotes={a.adminNotes} tags={a.tags} closed={!live} />
          {a.recruiterDecision?.pending && (
            <Card className="border-warning/40 bg-warning/10"><CardBody className="pt-5 text-sm"><p className="font-semibold">Returned by {a.recruiterDecision.byName ?? "the recruiter"}</p><p className="mt-1 text-foreground-2">{a.recruiterDecision.reason}</p><p className="mt-2 text-xs text-muted">Decide the next step below, or from the Approval Center.</p></CardBody></Card>
          )}
          <Card>
            <CardHeader title="Next step" description={live ? "Only valid moves are shown." : "This application is closed."} />
            <CardBody className="space-y-2">
              {forward.map((t) => <Button key={t.to} className="w-full" loading={move.isPending && move.variables?.status === t.to} onClick={() => apply(t)}>{ACTION_LABEL[t.to] ?? humanize(t.to)}</Button>)}
              {reject && <Button className="w-full" variant="outlineDanger" onClick={() => apply(reject)}>Reject application</Button>}
              {!live && <p className="text-sm text-foreground-2">No further actions.</p>}
              {live && forward.length === 0 && !reject && <p className="text-sm text-foreground-2">Waiting on someone else.</p>}

              {live && (
                <div className="pt-3">
                  <button onClick={() => setOverride((o) => !o)} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"><ShieldAlert className="size-3.5" />Override workflow</button>
                  {override && (
                    <div className="mt-3 space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
                      <p className="text-xs text-foreground-2">Skips the normal order. A reason is required and the override is recorded in the audit log.</p>
                      <Select aria-label="Move to" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Move to…</option>{overrideTargets.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
                      <Textarea aria-label="Reason" rows={2} placeholder="Reason for override" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                      <Button size="sm" variant="danger" className="w-full" disabled={!target || overrideReason.trim().length < 3} loading={move.isPending && move.variables?.override}
                        onClick={() => move.mutate({ status: target, reason: overrideReason.trim(), override: true })}>Override and move</Button>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status history" />
            <CardBody>
              <Timeline items={[...a.statusHistory].reverse().map((h, i) => ({
                title: humanize(h.status) + (h.override ? " (override)" : ""),
                description: [h.changedByName ? `by ${h.changedByName}` : null, h.reason, h.notes].filter(Boolean).join(" — ") || undefined,
                time: formatDateTime(h.at), state: i === 0 ? "current" as const : "done" as const,
              }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Audit trail" />
            <CardBody><EntityActivity entityType="Application" entityId={a.id} /></CardBody>
          </Card>
        </div>
      </div>

      <ReasonDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} destructive={dialog?.kind === "reject"}
        title={dialog?.kind === "reject" ? "Reject this application?" : `${ACTION_LABEL[dialog?.to ?? ""] ?? "Continue"}`}
        description={dialog?.kind === "reject" ? "The candidate is told their application isn't moving forward. Your reason is internal." : "A reason is required for this step."}
        confirmLabel={dialog?.kind === "reject" ? "Reject" : "Confirm"}
        onSubmit={(reason) => move.mutateAsync({ status: dialog!.to, reason })} />
    </>
  );
}
