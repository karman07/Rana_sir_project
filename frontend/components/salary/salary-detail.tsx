"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, FileText, Megaphone, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { formatDate } from "@/lib/contracts";
import { money, periodLabel } from "@/lib/payments";
import { SALARY_LABEL, candidateSalaryLabel, type SalaryItem } from "@/lib/salary";
import { EntityActivity } from "@/components/data/entity-activity";
import { Timeline } from "@/components/data/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { ActionDialog } from "@/components/payments/action-dialog";

type Role = "admin" | "recruiter" | "candidate";
type Dlg = null | "report" | "announce" | "reject" | "publish" | "hours";

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]"><dt className="text-sm text-muted">{label}</dt><dd className="text-sm">{children}</dd></div>;
}

const tomorrow = () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

export function SalaryDetailView({ id, role }: { id: string; role: Role }) {
  const qc = useQueryClient();
  const [dlg, setDlg] = useState<Dlg>(null);
  const admin = role === "admin", candidate = role === "candidate";
  const q = useQuery({ queryKey: ["salary", id], queryFn: () => api<SalaryItem>(`/salaries/${id}`) });
  const refresh = () => { for (const k of ["salary", "salaries", "approvals", "audit", "notifications", "overview", "payments", "payment"]) qc.invalidateQueries({ queryKey: [k] }); };
  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; ok: string }) => apiPost(`/salaries/${id}/${path}`, body),
    onSuccess: (_r, v) => { toast.success(v.ok); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Could not complete that"); refresh(); throw e; },
  });
  const act = (path: string, ok: string, body?: unknown) => run.mutateAsync({ path, ok, body });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;

  const s = q.data, cur = s.currency;
  const can = (a: string) => s.actions.includes(a);
  const amount = role === "recruiter" ? s.grossAmount : s.amount;
  const d = s.delay;
  const pending = d?.status === "REPORTED";
  const published = candidate ? !!d : d?.status === "PUBLISHED" || d?.status === "RESOLVED";

  return (
    <>
      <Link href={`/${role}/salary`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Salary</Link>
      <PageHeader
        title={`${s.salaryNumber} · ${periodLabel(s.period)}`}
        description={[s.job.company, candidate ? s.job.title : s.candidate?.name, s.contractNumber].filter(Boolean).join(" · ")}
        actions={
          <>
            {can("submit-hours") && <Button variant="secondary" onClick={() => setDlg("hours")}><Clock />{s.hoursWorked !== undefined ? "Update hours" : "Submit hours"}</Button>}
            {can("report-delay") && <Button variant="secondary" onClick={() => setDlg("report")}><TriangleAlert />Report a delay</Button>}
            {can("announce-delay") && <Button variant="secondary" onClick={() => setDlg("announce")}><Megaphone />Announce a delay</Button>}
            {can("publish-delay") && <Button onClick={() => setDlg("publish")}><Check />Publish delay</Button>}
            {can("reject-delay") && <Button variant="secondary" onClick={() => setDlg("reject")}><X />Decline</Button>}
            {candidate && s.payslipId && <Button asChild variant="secondary"><Link href={`/candidate/payslips/${s.payslipId}`}><FileText />View payslip</Link></Button>}
            {can("confirm-payment") && s.paymentId && <Button asChild><Link href={`/candidate/payments/${s.paymentId}`}><Check />Confirm I received it</Link></Button>}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={s.status} label={candidate ? candidateSalaryLabel(s) : SALARY_LABEL[s.status]} />
        {pending && !candidate && <StatusBadge status="PENDING" label="Delay reported" className="!bg-gold-soft !text-gold" />}
        <span className="text-sm text-foreground-2">Expected {formatDate(s.payDate)}</span>
        {s.payDate !== s.originalPayDate && <span className="text-sm text-gold">was {formatDate(s.originalPayDate)}</span>}
      </div>

      {published && d && (
        <Card className="mb-5 border-gold/40 bg-gold-soft/40">
          <CardBody>
            <p className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4 text-gold" />{d.resolved || d.status === "RESOLVED" ? "This pay was delayed, and is now sorted" : "This pay is delayed"}</p>
            <p className="mt-1.5 text-sm text-foreground-2">{d.reason}</p>
            <p className="mt-1 text-sm">New expected date: <span className="font-medium">{formatDate(d.newPayDate)}</span></p>
            {candidate && !d.resolved && <p className="mt-2 text-xs text-muted">We&apos;re sorry for the wait. You&apos;ll be told the moment it is sent.</p>}
          </CardBody>
        </Card>
      )}
      {pending && !candidate && d && (
        <Card className="mb-5 border-gold/40">
          <CardBody>
            <p className="font-medium">Delay waiting for Admin</p>
            <p className="mt-1 text-sm text-foreground-2">{d.reportedBy?.name} reported: “{d.reason}” — new date {formatDate(d.newPayDate)}</p>
            {!admin && <p className="mt-1 text-xs text-muted">The candidate is told once Admin approves it.</p>}
          </CardBody>
        </Card>
      )}
      {d?.status === "REJECTED" && !candidate && (
        <Card className="mb-5">
          <CardBody><p className="font-medium">Last delay report was not published</p><p className="mt-1 text-sm text-foreground-2">{d.decidedByName ? `${d.decidedByName}: ` : ""}{d.decisionNote}</p></CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-divider">
                <Row label="Period">{periodLabel(s.period)}</Row>
                <Row label={candidate ? "Your pay" : role === "recruiter" ? "Amount" : "Candidate pay"}>{money(amount, cur)}</Row>
                {admin && <Row label="Company pays">{money(s.grossAmount, cur)}</Row>}
                {s.hourly && <Row label="Hours">{s.hoursWorked !== undefined ? `${s.hoursWorked} hours${s.hoursSubmittedBy?.name ? ` · submitted by ${s.hoursSubmittedBy.name}` : ""}` : "Not submitted yet"}</Row>}
                <Row label="Expected on">{formatDate(s.payDate)}</Row>
                <Row label="Contract">{candidate ? s.contractNumber : <Link className="text-primary hover:underline" href={`/${role}/contracts/${s.contractId}`}>{s.contractNumber}</Link>}</Row>
                {admin && s.payment && <Row label="Payment"><Link className="text-primary hover:underline" href={`/admin/payments/${s.payment.id}`}>{s.payment.number}</Link> · <StatusBadge status={s.payment.status} /></Row>}
                {candidate && s.paidOn && <Row label="Sent">{formatDateTime(s.paidOn)}{s.method ? ` · ${s.method}` : ""}{s.reference ? ` · ${s.reference}` : ""}</Row>}
              </dl>
              {s.hourly && !s.hasPayment && !candidate && <p className="mt-3 text-xs text-muted">Hours you submit are used to bill this month.</p>}
            </CardBody>
          </Card>

          {!candidate && s.delayLog && s.delayLog.length > 0 && (
            <Card>
              <CardHeader title="Delay history" description="Every report and what was decided." />
              <CardBody>
                <Timeline items={[...s.delayLog].reverse().map((l, i) => ({
                  title: l.status === "REPORTED" ? "Delay reported" : l.status === "PUBLISHED" ? "Delay published" : "Delay not published",
                  description: [l.byName ? `by ${l.byName}` : null, l.reason, l.newPayDate ? `new date ${formatDate(l.newPayDate)}` : null, l.note].filter(Boolean).join(" — "), time: formatDateTime(l.at), state: i === 0 ? "current" as const : "done" as const,
                }))} />
              </CardBody>
            </Card>
          )}
          {admin && s.history && <Card><CardHeader title="Status history" /><CardBody><Timeline items={[...s.history].reverse().map((h, i) => ({ title: SALARY_LABEL[h.status] ?? h.status, description: h.note, time: formatDateTime(h.at), state: i === 0 ? "current" as const : "done" as const }))} /></CardBody></Card>}
          {admin && <Card><CardHeader title="Audit trail" /><CardBody><EntityActivity entityType="Salary" entityId={s.id} /></CardBody></Card>}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title={candidate ? "Your pay" : "Amount"} />
            <CardBody>
              <p className="text-3xl font-semibold tabular-nums">{money(amount, cur)}</p>
              <p className="mt-1 text-sm text-foreground-2">{periodLabel(s.period)}{s.hoursWorked !== undefined ? ` · ${s.hoursWorked} hours` : ""}</p>
              <p className="mt-3 text-xs text-muted">{candidate ? "This is what you receive for the period." : role === "recruiter" ? "The company's amount for this period." : "Calculated from the contract in force when this was billed."}</p>
            </CardBody>
          </Card>
          {candidate && s.paymentId && !can("confirm-payment") && <Card><CardBody><Button asChild variant="secondary" className="w-full"><Link href={`/candidate/payments/${s.paymentId}`}>View payment details</Link></Button></CardBody></Card>}
        </aside>
      </div>

      <ActionDialog open={dlg === "hours"} onOpenChange={(o) => !o && setDlg(null)} title="Hours worked" description={`Hours for ${periodLabel(s.period)}. Billing uses these.`} submitLabel="Submit hours"
        fields={[{ name: "hours", label: "Hours worked", kind: "number", initial: s.hoursWorked !== undefined ? String(s.hoursWorked) : "" }]} onSubmit={(v) => act("hours", "Hours submitted", { hoursWorked: Number(v.hours) })} />
      <ActionDialog open={dlg === "report" || dlg === "announce"} onOpenChange={(o) => !o && setDlg(null)} title={dlg === "announce" ? "Announce a delay" : "Report a delay"}
        description={dlg === "announce" ? "The candidate is told straight away, with the reason and the new date." : "Admin reviews this. The candidate is told once it is approved."} submitLabel={dlg === "announce" ? "Announce" : "Send report"}
        fields={[{ name: "reason", label: "Why is it late?", kind: "textarea", placeholder: "A short, clear reason the candidate will understand" }, { name: "date", label: "New expected date", initial: tomorrow(), hint: "YYYY-MM-DD" }]}
        onSubmit={(v) => act("delay", dlg === "announce" ? "Delay announced" : "Sent to Admin", { reason: v.reason, newPayDate: v.date })} />
      <ActionDialog open={dlg === "publish"} onOpenChange={(o) => !o && setDlg(null)} title="Publish this delay" description="The candidate will see the reason and new date. You can adjust either first." submitLabel="Publish"
        fields={[{ name: "reason", label: "Reason shown to the candidate", kind: "textarea", initial: d?.reason ?? "" }, { name: "date", label: "New expected date", initial: d?.newPayDate ?? "" }, { name: "note", label: "Note (private)", optional: true }]}
        onSubmit={(v) => act("delay/publish", "Delay published", { reason: v.reason, newPayDate: v.date, note: v.note || undefined })} />
      <ReasonDialog open={dlg === "reject"} onOpenChange={(o) => !o && setDlg(null)} title="Decline this delay" description="The recruiter sees your note. The candidate is not told anything." confirmLabel="Decline" destructive onSubmit={(note) => act("delay/reject", "Declined", { note })} />
    </>
  );
}
