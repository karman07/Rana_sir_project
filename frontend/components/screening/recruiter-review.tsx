"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, Mail, MapPin, MessageSquareWarning, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@rms/shared";
import { api, apiPost, documentUrl, ApiError } from "@/lib/api";
import { timeAgo, type ApplicationDetail } from "@/lib/applications";
import { formatDateTime } from "@/lib/audit";
import { Timeline } from "@/components/data/timeline";
import { SpecView } from "@/components/jobs/spec-view";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { ContractPanel } from "@/components/contracts/contract-panel";
import { PageHeader } from "@/components/shell/page-header";
import { RequestMoreDialog } from "./request-more-dialog";
import { ApplicationInterviews } from "@/components/interviews/application-interviews";
import { ScoreBadge } from "./score-bar";

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]"><dt className="text-sm text-muted">{label}</dt><dd className="whitespace-pre-line text-sm">{children}</dd></div>;
}

/** A recruiter reviews one candidate Admin sent them: approve, reject, request changes, or ask for more candidates. */
export function RecruiterReview({ id }: { id: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"reject" | "changes" | null>(null);
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`) });

  const refresh = () => { for (const k of ["application", "applications", "overview", "notifications"]) qc.invalidateQueries({ queryKey: [k] }); };
  const approve = useMutation({
    mutationFn: () => apiPost(`/applications/${id}/recruiter-approve`, { score: score !== "" ? Number(score) : undefined, notes: notes || undefined }),
    onSuccess: () => { toast.success("Candidate approved. Our team will arrange the interview."); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Could not approve"); refresh(); },
  });
  const sendBack = useMutation({
    mutationFn: ({ kind, reason }: { kind: "recruiter-reject" | "request-changes"; reason: string }) => apiPost(`/applications/${id}/${kind}`, { reason }),
    onSuccess: (_r, v) => { toast.success(v.kind === "recruiter-reject" ? "Candidate rejected. They have been told." : "Sent back to our team. They'll decide the next step."); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Action failed"); refresh(); },
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72 rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const a = q.data, c = a.candidate!, p = a.candidateProfile;
  const deciding = a.status === "SENT_TO_RECRUITER" || a.status === "RECRUITER_REVIEW";
  const badScore = score !== "" && !(/^\d{1,3}$/.test(score) && Number(score) <= 100);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/recruiter/candidates"><ArrowLeft />Candidates</Link></Button>
      <PageHeader title={c.name} description={`${a.job.title} · ${a.company.name} · sent ${timeAgo(a.updatedAt).toLowerCase()}`} actions={<StatusBadge status={a.status} />} />
      <ContractPanel application={a} role="recruiter" />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardBody className="pt-5">
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <Avatar name={c.name} size={56} />
                <div className="min-w-0 flex-1"><p className="text-lg font-semibold">{c.name}</p><p className="text-sm text-foreground-2">{p?.headline}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted"><span className="flex items-center gap-1"><Mail className="size-3.5" />{c.email}</span>{p?.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{p.location}</span>}</div></div>
                {a.resumeDocumentId && <Button asChild variant="secondary" size="sm"><a href={documentUrl(a.resumeDocumentId, true)} target="_blank" rel="noreferrer"><FileText />View resume</a></Button>}
              </div>
              <dl className="divide-y divide-divider">
                <Row label="Experience">{p?.experienceYears != null ? `${p.experienceYears} years` : undefined}</Row>
                <Row label="Skills">{p?.skills?.length ? <span className="flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="rounded-md bg-background-2 px-2 py-0.5 text-xs">{s}</span>)}</span> : undefined}</Row>
                <Row label="Expected salary">{a.expectedSalary && `${formatMoney(a.expectedSalary).replace(/\.00$/, "")} / year`}</Row>
                <Row label="Notice period">{a.noticePeriodDays != null ? `${a.noticePeriodDays} days` : undefined}</Row>
                <Row label="Cover letter">{a.coverLetter}</Row>
                <Row label="About">{p?.about}</Row>
              </dl>
              {p?.experience?.length ? <><h3 className="mt-5 mb-2 text-sm font-semibold">Work history</h3><ul className="space-y-2.5">{p.experience.map((e, i) => <li key={i} className="text-sm"><p className="font-medium">{e.title} · {e.company}</p><p className="text-xs text-muted">{e.startDate ?? "—"} – {e.current ? "Present" : e.endDate ?? "—"}</p></li>)}</ul></> : null}
              {p?.education?.length ? <><h3 className="mt-5 mb-2 text-sm font-semibold">Education</h3><ul className="space-y-1.5">{p.education.map((e, i) => <li key={i} className="text-sm">{e.degree}{e.field ? `, ${e.field}` : ""} — <span className="text-muted">{e.institution}</span></li>)}</ul></> : null}
            </CardBody>
          </Card>
          <details className="rounded-[16px] border border-border bg-card shadow-card"><summary className="cursor-pointer list-none p-5 font-semibold tracking-tight">The opening <span className="text-sm font-normal text-muted">— {a.job.title}</span></summary><div className="p-5 pt-0">{a.jobSpec && <SpecView spec={a.jobSpec} />}</div></details>
        </div>

        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          {(a.status === "RECRUITER_APPROVED" || a.status === "INTERVIEW" || a.status === "SELECTED") && <ApplicationInterviews applicationId={a.id} candidateName={c.name} canSchedule={a.status === "RECRUITER_APPROVED" || a.status === "INTERVIEW"} />}
          <Card>
            <CardHeader title="Our team's view" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-foreground-2">Screening score</span><ScoreBadge value={a.adminScore ?? null} /></div>
              {a.tags?.length ? <div className="flex flex-wrap gap-1">{a.tags.map((t) => <span key={t} className="rounded bg-gold-soft px-1.5 py-0.5 text-xs text-gold">{t}</span>)}</div> : null}
              <p className="whitespace-pre-line text-foreground-2">{a.adminNotes || "No notes."}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={deciding ? "Your decision" : "Decision"} description={deciding ? "Approve to move to interview. Rejecting is final and takes effect straight away." : "You've already responded to this candidate."} />
            <CardBody className="space-y-3">
              {deciding ? (
                <>
                  <div className="grid grid-cols-[6rem_1fr] gap-2"><Field label="Score" htmlFor="rs" error={badScore ? "0–100" : undefined}><Input id="rs" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} /></Field><Field label="Notes" htmlFor="rn"><Input id="rn" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field></div>
                  <Button className="w-full" disabled={badScore} loading={approve.isPending} onClick={() => approve.mutate()}><Check />Approve candidate</Button>
                  <Button className="w-full" variant="secondary" onClick={() => setDialog("changes")}><MessageSquareWarning />Request changes</Button>
                  <Button className="w-full" variant="outlineDanger" onClick={() => setDialog("reject")}><X />Reject</Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground-2">Current stage: {a.status.toLowerCase().replace(/_/g, " ")}.</p>
                  {(a.status === "RECRUITER_APPROVED" || a.status === "INTERVIEW") && <Button className="w-full" variant="outlineDanger" onClick={() => setDialog("reject")}><X />Reject</Button>}
                </>
              )}
              <div className="border-t border-divider pt-3"><RequestMoreDialog jobId={a.job.id} jobTitle={a.job.title} /></div>
            </CardBody>
          </Card>

          <Card><CardHeader title="Progress" /><CardBody><Timeline items={[...a.statusHistory].reverse().map((h, i) => ({ title: h.status.toLowerCase().replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()), time: formatDateTime(h.at), state: i === 0 ? "current" as const : "done" as const }))} /></CardBody></Card>
        </div>
      </div>

      <ReasonDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} destructive title="Reject this candidate?" description="This takes effect immediately and the candidate is told. Our team is informed of your reason."
        confirmLabel="Reject candidate" onSubmit={(reason) => sendBack.mutateAsync({ kind: "recruiter-reject", reason })} />
      <ReasonDialog open={dialog === "changes"} onOpenChange={(o) => !o && setDialog(null)} title="Request changes" description="Tell our team what's missing or needs updating. They'll decide the next step."
        confirmLabel="Send request" onSubmit={(reason) => sendBack.mutateAsync({ kind: "request-changes", reason })} />
    </>
  );
}
