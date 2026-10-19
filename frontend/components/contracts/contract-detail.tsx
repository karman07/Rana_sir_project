"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Check, FilePen, Send, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@rms/shared";
import { api, apiPost, ApiError } from "@/lib/api";
import { EMPLOYMENT_LABEL } from "@/lib/jobs";
import { CANDIDATE_CONTRACT_STATUS, STAGES, changeValue, commissionText, formatDate, humanStatus, payText, type ContractDetail, type ContractVersionView } from "@/lib/contracts";
import { formatDateTime } from "@/lib/audit";
import { Stepper } from "@/components/data/stepper";
import { EntityActivity } from "@/components/data/entity-activity";
import { Timeline } from "@/components/data/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { ContractFormDialog } from "./contract-form-dialog";
import { ContractPayments } from "./contract-payments";
import { Download, ExternalLink, FileText as FileIcon } from "lucide-react";
import { openDocument, type DocumentItem } from "@/lib/documents";

type Role = "admin" | "recruiter" | "candidate";

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return <div className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]"><dt className="text-sm text-muted">{label}</dt><dd className="whitespace-pre-line text-sm">{children}</dd></div>;
}

function ChangeList({ v, currency, admin }: { v: ContractVersionView; currency: string; admin: boolean }) {
  const rows = v.changes.filter((c) => admin || c.field !== "commission");
  if (!rows.length) return null;
  return (
    <ul className="mt-3 divide-y divide-divider rounded-lg border border-border text-sm">
      {rows.map((c) => (
        <li key={c.field} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="w-40 text-muted">{c.label}</span>
          <span className="text-foreground-2 line-through decoration-muted/60">{changeValue(c.field, c.from, currency)}</span>
          <span aria-hidden>→</span>
          <span className="font-medium">{changeValue(c.field, c.to, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ContractDetailView({ id, role }: { id: string; role: Role }) {
  const qc = useQueryClient();
  const router = useRouter();
  const admin = role === "admin", candidate = role === "candidate";
  const [dialog, setDialog] = useState<null | "reject" | "terminate" | "change-reject" | "change-send-back">(null);
  const [form, setForm] = useState<null | "edit" | "change">(null);
  const q = useQuery({ queryKey: ["contract", id], queryFn: () => api<ContractDetail>(`/contracts/${id}`) });

  const refresh = () => { for (const k of ["contract", "contracts", "application", "applications", "overview", "audit", "approvals", "notifications"]) qc.invalidateQueries({ queryKey: [k] }); };
  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; ok: string }) => apiPost(`/contracts/${id}/${path}`, body),
    onSuccess: (_r, v) => {
      toast.success(v.ok);
      refresh();
      if (candidate && v.path === "reject") router.replace(`/${role}/contracts`); // a declined draft is no longer visible to the candidate
    },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Could not complete that"); refresh(); },
  });
  const act = (path: string, ok: string, body?: unknown) => run.mutateAsync({ path, ok, body });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;

  const c = q.data, t = c.terms!, cur = t.salary.currency;
  const can = (a: string) => c.actions.includes(a);
  const stage = STAGES.indexOf(c.status as (typeof STAGES)[number]);
  const stepLabels = ["Draft", "Admin approval", "Recruiter approval", "Candidate approval", "Active"];
  const pc = c.pendingChange;
  const money = (n: number) => formatMoney({ amount: n, currency: cur }).replace(/\.00$/, "");
  const fin = c.financials;
  const statusLabel = candidate ? CANDIDATE_CONTRACT_STATUS[c.status] ?? humanStatus(c.status) : null;
  const back = `/${role}/contracts`;

  return (
    <>
      <Link href={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Contracts</Link>
      <PageHeader
        title={`${c.contractNumber} · ${t.title}`}
        description={[c.job.company, candidate ? null : c.candidate.name].filter(Boolean).join(" · ")}
        actions={
          <>
            {can("edit") && <Button variant="secondary" onClick={() => setForm("edit")}><FilePen />Edit draft</Button>}
            {can("submit") && <Button loading={run.isPending} onClick={() => act("submit", "Submitted for approval")}><Send />Submit</Button>}
            {can("approve") && <Button loading={run.isPending} onClick={() => act("approve", candidate ? "You accepted the contract" : "Approved", {})}><Check />{candidate ? "Accept contract" : "Approve"}</Button>}
            {can("reject") && <Button variant="secondary" onClick={() => setDialog("reject")}><X />{candidate ? "Decline" : "Send back"}</Button>}
            {can("change") && <Button variant="secondary" onClick={() => setForm("change")}><FilePen />Propose change</Button>}
            {can("terminate") && <Button variant="danger" onClick={() => setDialog("terminate")}><Ban />End contract</Button>}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {candidate ? <StatusBadge status={c.status} /> : <StatusBadge status={c.status} />}
        {statusLabel && <span className="text-sm text-foreground-2">{statusLabel}</span>}
        {c.awaiting && !candidate && <span className="text-sm text-foreground-2">Waiting for {c.awaiting.toLowerCase()}</span>}
        {c.daysLeft !== null && c.daysLeft !== undefined && ["ACTIVE", "EXPIRING"].includes(c.status) && <span className="text-sm text-gold">{c.daysLeft <= 0 ? "Ends today" : `${c.daysLeft} days left`}</span>}
      </div>

      {stage >= 0 && !(candidate && stage < 3) && (
        <Card className="mb-5"><CardBody><Stepper steps={candidate ? ["Offer", "Active"] : stepLabels} current={candidate ? (c.status === "ACTIVE" ? 2 : 0) : c.status === "ACTIVE" ? stepLabels.length : stage} /></CardBody></Card>
      )}

      {c.lastDecline && !candidate && c.status === "DRAFT" && (
        <Card className="mb-5 border-gold/40"><CardBody><p className="text-sm font-medium">Sent back{c.lastDecline.byName ? ` by ${c.lastDecline.byName}` : ""}</p><p className="mt-1 text-sm text-foreground-2">{c.lastDecline.reason}</p></CardBody></Card>
      )}
      {c.terminationReason && <Card className="mb-5 border-danger/30"><CardBody><p className="text-sm font-medium">Contract ended early</p><p className="mt-1 text-sm text-foreground-2">{c.terminationReason}</p></CardBody></Card>}

      {pc && (
        <Card className="mb-5 border-gold/40">
          <CardHeader title={`Change waiting for approval (version ${pc.version})`} description={`${pc.changedBy?.name ?? "Someone"} proposed this${pc.reason ? `: “${pc.reason}”` : ""}`} />
          <CardBody>
            <ChangeList v={pc} currency={cur} admin={admin} />
            {admin && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button loading={run.isPending} onClick={() => act(`versions/${pc.version}/approve`, "Change approved", {})}><Check />Approve change</Button>
                <Button variant="secondary" onClick={() => setDialog("change-send-back")}><Undo2 />Ask for changes</Button>
                <Button variant="secondary" onClick={() => setDialog("change-reject")}><X />Reject</Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Terms" description={`Version ${c.currentVersion}`} />
            <CardBody>
              <dl className="divide-y divide-divider">
                <Row label="Role">{t.title}</Row>
                <Row label="Employment">{EMPLOYMENT_LABEL[t.employmentType] ?? t.employmentType}</Row>
                <Row label="Pay"><span className="font-medium tabular-nums">{payText(t.salary)}</span></Row>
                <Row label="Start date">{formatDate(t.startDate)}</Row>
                <Row label="End date">{t.endDate ? formatDate(t.endDate) : "Open-ended"}</Row>
                <Row label="Working hours">{t.workingHours}</Row>
                <Row label="Probation">{t.probationMonths !== undefined ? `${t.probationMonths} months` : undefined}</Row>
                <Row label="Notice period">{t.noticePeriodDays !== undefined ? `${t.noticePeriodDays} days` : undefined}</Row>
                <Row label="Renewal">{t.renewalTerms}</Row>
                <Row label="Notes">{t.notes}</Row>
              </dl>
            </CardBody>
          </Card>

          {c.documents && c.documents.length > 0 && (
            <Card>
              <CardHeader title="Documents" description="Your copy of the offer and contract. A new version is kept whenever terms change." />
              <CardBody>
                <ul className="divide-y divide-divider">
                  {c.documents.map((d: DocumentItem) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <FileIcon className="size-4 text-foreground-2" />
                      <span className="min-w-0 flex-1 truncate font-medium">{d.label ?? d.originalName}</span>
                      {d.status === "ARCHIVED" && <StatusBadge status="CLOSED" label="Earlier version" />}
                      <Button variant="ghost" size="sm" onClick={() => openDocument(d.id, { inline: true })}><ExternalLink />View</Button>
                      <Button variant="ghost" size="sm" onClick={() => openDocument(d.id)}><Download />Download</Button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {!candidate && ["ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"].includes(c.status) && <ContractPayments contractId={c.id} role={admin ? "admin" : "recruiter"} hourly={t.salary.period === "HOUR"} />}

          {c.versions.length > 1 && (
            <Card>
              <CardHeader title="Version history" description="Earlier versions are never altered." />
              <CardBody className="space-y-5">
                {[...c.versions].reverse().map((v) => (
                  <div key={v.version}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Version {v.version}</p>
                      <StatusBadge status={v.current && v.status === "APPROVED" ? "ACTIVE" : v.status} />
                      <span className="text-xs text-muted">{formatDateTime(v.createdAt)}</span>
                    </div>
                    {!candidate && v.reason && <p className="mt-1 text-sm text-foreground-2">{v.reason}</p>}
                    {!candidate && v.decisionNote && <p className="mt-1 text-xs text-muted">{v.decidedByName ? `${v.decidedByName}: ` : ""}{v.decisionNote}</p>}
                    <ChangeList v={v} currency={cur} admin={admin} />
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {!candidate && (
            <Card>
              <CardHeader title="Activity" />
              <CardBody>{admin ? <EntityActivity entityType="Contract" entityId={c.id} /> : <Timeline items={c.statusHistory.map((h) => ({ title: humanStatus(h.status), description: [h.byName ? `by ${h.byName}` : null, h.note].filter(Boolean).join(" — ") || undefined, time: formatDateTime(h.at) }))} />}</CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          {fin && (
            <Card>
              <CardHeader title="Money" description="Admin only. Calculated by the server." />
              <CardBody className="space-y-3 text-sm">
                {(["monthly", "annual"] as const).map((k) => (
                  <div key={k} className="rounded-lg bg-background-2 p-3">
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">{k === "monthly" ? "Per month" : "Per year"}</p>
                    <dl className="space-y-1 tabular-nums">
                      <div className="flex justify-between"><dt className="text-foreground-2">Gross</dt><dd>{money(fin[k].grossAmount)}</dd></div>
                      <div className="flex justify-between"><dt className="text-foreground-2">Candidate receives</dt><dd>{money(fin[k].candidateAmount)}</dd></div>
                      <div className="flex justify-between"><dt className="text-foreground-2">Platform ({commissionText(t.commission, cur)})</dt><dd className="font-medium text-primary">{money(fin[k].platformAmount)}</dd></div>
                    </dl>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="People" />
            <CardBody className="space-y-2 text-sm">
              {!candidate && <p><span className="text-muted">Candidate </span>{c.candidate.name}<br /><span className="text-xs text-muted">{c.candidate.email}</span></p>}
              {!candidate && c.recruiter && <p><span className="text-muted">Recruiter </span>{c.recruiter.name}</p>}
              <p><span className="text-muted">Company </span>{c.job.company}</p>
              {!candidate && <p><Link className="text-primary hover:underline" href={`/${role}/${admin ? "applications" : "candidates"}/${admin ? c.applicationId : c.candidate.id}`}>View application</Link></p>}
            </CardBody>
          </Card>
        </aside>
      </div>

      <ReasonDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} title={candidate ? "Decline this contract?" : "Send back for changes"}
        description={candidate ? "Tell us what you'd like changed. The team will review and send an updated version." : "The draft returns to editing, with your reason attached."}
        confirmLabel={candidate ? "Decline" : "Send back"} destructive={candidate} onSubmit={(reason) => act("reject", candidate ? "Declined — the team will follow up" : "Sent back", { reason })} />
      <ReasonDialog open={dialog === "terminate"} onOpenChange={(o) => !o && setDialog(null)} title="End this contract?" description="This closes the contract and tells everyone involved." confirmLabel="End contract" destructive
        onSubmit={(reason) => act("terminate", "Contract ended", { reason })} />
      <ReasonDialog open={dialog === "change-reject"} onOpenChange={(o) => !o && setDialog(null)} title="Reject this change" confirmLabel="Reject change" destructive
        onSubmit={(reason) => act(`versions/${pc?.version}/reject`, "Change rejected", { reason })} />
      <ReasonDialog open={dialog === "change-send-back"} onOpenChange={(o) => !o && setDialog(null)} title="Ask for changes" description="The proposer can revise and send it again." confirmLabel="Send back"
        onSubmit={(reason) => act(`versions/${pc?.version}/request-changes`, "Sent back to the proposer", { reason })} />

      {form && <ContractFormDialog open onOpenChange={(o) => !o && setForm(null)} mode={{ kind: form, contractId: c.id }} initial={t} isAdmin={admin} />}
    </>
  );
}
