"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, HandCoins, Paperclip, Send, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { toMinor } from "@rms/shared";
import { api, apiPost, apiUpload, documentUrl, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { commissionText, formatDate } from "@/lib/contracts";
import { LEDGER_LABEL, METHODS, money, periodLabel, roleStage, type Leg, type PaymentItem } from "@/lib/payments";
import { EntityActivity } from "@/components/data/entity-activity";
import { Timeline } from "@/components/data/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { ActionDialog } from "./action-dialog";

type Role = "admin" | "recruiter" | "candidate";
type Dlg = null | "mark-paid" | "confirm-received" | "dispute-client" | "resolve-client" | "send-payout" | "resolve-payout" | "adjust" | "cancel" | "dispute-payout";

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]"><dt className="text-sm text-muted">{label}</dt><dd className="text-sm">{children}</dd></div>;
}

function ProofUpload({ id, leg, has, onDone }: { id: string; leg: "client" | "payout"; has?: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: (f: File) => apiUpload(`/payments/${id}/proof?leg=${leg}`, f),
    onSuccess: () => { toast.success("Proof attached"); onDone(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not upload that file"),
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {has && <Button asChild variant="secondary" size="sm"><a href={documentUrl(has, true)} target="_blank" rel="noreferrer"><FileText />View proof</a></Button>}
      <input ref={ref} type="file" accept="image/png,image/jpeg,application/pdf" className="sr-only" aria-label="Attach proof of payment" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ""; }} />
      <Button variant="ghost" size="sm" loading={up.isPending} onClick={() => ref.current?.click()}><Paperclip />{has ? "Replace proof" : "Attach proof"}</Button>
    </div>
  );
}

function LegCard({ title, leg, p, id, proofLeg, canProof, onDone, awaitingText }: { title: string; leg?: Leg; p: PaymentItem; id: string; proofLeg: "client" | "payout"; canProof: boolean; onDone: () => void; awaitingText: string }) {
  const started = leg && !["AWAITING", "NOT_DUE", "PENDING"].includes(leg.status);
  return (
    <Card>
      <CardHeader title={title} action={leg ? <StatusBadge status={leg.status} /> : undefined} />
      <CardBody>
        {started ? (
          <>
            <dl className="divide-y divide-divider">
              <Row label="Amount">{money(leg!.amountReceived ?? leg!.amountSent, p.currency)}</Row>
              <Row label="Method">{leg!.method}</Row>
              <Row label="Reference"><span className="font-mono text-xs">{leg!.reference}</span></Row>
              <Row label="Recorded">{leg!.sentAt ? formatDateTime(leg!.sentAt) : undefined}</Row>
              <Row label="Confirmed">{leg!.confirmedAt ? formatDateTime(leg!.confirmedAt) : undefined}</Row>
              <Row label="Note">{leg!.note}</Row>
            </dl>
            {leg!.disputeNote && <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{leg!.disputeNote}</p>}
            {(canProof || leg!.proofDocumentId) && (canProof ? <ProofUpload id={id} leg={proofLeg} has={leg!.proofDocumentId} onDone={onDone} /> : <div className="mt-3"><Button asChild variant="secondary" size="sm"><a href={documentUrl(leg!.proofDocumentId!, true)} target="_blank" rel="noreferrer"><FileText />View proof</a></Button></div>)}
          </>
        ) : <p className="text-sm text-foreground-2">{awaitingText}</p>}
      </CardBody>
    </Card>
  );
}

export function PaymentDetailView({ id, role }: { id: string; role: Role }) {
  const qc = useQueryClient();
  const admin = role === "admin";
  const [dlg, setDlg] = useState<Dlg>(null);
  const q = useQuery({ queryKey: ["payment", id], queryFn: () => api<PaymentItem>(`/payments/${id}`) });
  const refresh = () => { for (const k of ["payment", "payments", "overview", "approvals", "audit", "notifications"]) qc.invalidateQueries({ queryKey: [k] }); };
  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; ok: string }) => apiPost(`/payments/${id}/${path}`, body),
    onSuccess: (_r, v) => { toast.success(v.ok); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Could not complete that"); refresh(); },
  });
  const act = (path: string, ok: string, body?: unknown) => run.mutateAsync({ path, ok, body });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;

  const p = q.data, cur = p.currency;
  const can = (a: string) => p.actions.includes(a);
  const cents = (s: string) => toMinor(Number(s), cur);
  const hourly = p.hoursWorked !== undefined;
  const amount = admin ? p.gross : role === "recruiter" ? p.amountDue : p.amount;
  const proofClient = admin ? ["MARKED_PAID", "RECEIVED", "DISPUTED"].includes(p.client?.status ?? "") : role === "recruiter" && ["MARKED_PAID", "RECEIVED", "DISPUTED"].includes(p.client?.status ?? "");

  return (
    <>
      <Link href={`/${role}/payments`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Payments</Link>
      <PageHeader
        title={`${p.paymentNumber} · ${periodLabel(p.period)}`}
        description={[p.job.company, admin || role === "recruiter" ? p.candidate?.name : undefined, p.contractNumber].filter(Boolean).join(" · ")}
        actions={
          <>
            {can("mark-paid") && <Button onClick={() => setDlg("mark-paid")}><Send />{admin ? "Record company payment" : "Release payment"}</Button>}
            {can("confirm-received") && <Button onClick={() => setDlg("confirm-received")}><Check />Confirm received</Button>}
            {can("dispute-client") && <Button variant="secondary" onClick={() => setDlg("dispute-client")}><X />Dispute</Button>}
            {can("resolve-client") && <Button variant="secondary" onClick={() => setDlg("resolve-client")}>Mark as settled</Button>}
            {can("send-payout") && <Button onClick={() => setDlg("send-payout")}><Send />Release to candidate</Button>}
            {can("resolve-payout") && <Button variant="secondary" onClick={() => setDlg("resolve-payout")}>Mark payout settled</Button>}
            {can("confirm-payout") && <Button loading={run.isPending} onClick={() => act("payout/confirm", "Thanks — marked as received")}><Check />I received it</Button>}
            {can("dispute-payout") && <Button variant="secondary" onClick={() => setDlg("dispute-payout")}><X />I didn&apos;t receive it</Button>}
            {can("adjust") && <Button variant="secondary" onClick={() => setDlg("adjust")}>Adjust amount</Button>}
            {can("cancel") && <Button variant="danger" onClick={() => setDlg("cancel")}>Cancel</Button>}
          </>
        }
      />

      {p.candidateRequest && (
        <div className="mb-5 flex gap-3 rounded-xl border border-gold/40 bg-gold-soft p-4 text-sm">
          <HandCoins className="mt-0.5 size-4 shrink-0 text-gold" />
          <div><p className="font-medium">{p.candidate?.name ?? "The candidate"} asked for this pay · {formatDateTime(p.candidateRequest.at)}</p>{p.candidateRequest.note && <p className="mt-1 text-foreground-2">&ldquo;{p.candidateRequest.note}&rdquo;</p>}</div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={p.status} label={roleStage(role, p.status)} />
        {p.overdue && <span className="flex items-center gap-1.5 text-sm text-danger"><TriangleAlert className="size-4" />Overdue since {formatDate(p.dueDate)}</span>}
        {!p.overdue && role !== "candidate" && <span className="text-sm text-foreground-2">Due {formatDate(p.dueDate)}</span>}
        <span className="font-mono text-xs text-muted">{p.transactionId}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {role === "candidate" ? (
            <LegCard title="Your payment" leg={p.payout} p={p} id={id} proofLeg="payout" canProof={false} onDone={refresh} awaitingText="We're preparing this payment. You'll be told as soon as it is sent." />
          ) : (
            <>
              <LegCard title="Company payment" leg={p.client} p={p} id={id} proofLeg="client" canProof={proofClient} onDone={refresh} awaitingText={role === "recruiter" ? "Pay the amount due, then record it here with the reference so we can confirm it." : "Waiting for the company to pay."} />
              {admin && <LegCard title="Payout to candidate" leg={p.payout} p={p} id={id} proofLeg="payout" canProof={["SENT", "CONFIRMED", "DISPUTED"].includes(p.payout?.status ?? "")} onDone={refresh} awaitingText="Due once the company's payment is confirmed." />}
            </>
          )}
          {admin && p.ledger && p.ledger.length > 0 && (
            <Card>
              <CardHeader title="Ledger" description="Append-only; corrections are new lines." />
              <CardBody>
                <ul className="divide-y divide-divider text-sm">
                  {p.ledger.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{LEDGER_LABEL[l.type]}{l.reference && <span className="ml-2 font-mono text-xs text-muted">{l.reference}</span>}</span>
                      <span className={l.amount < 0 ? "tabular-nums text-foreground-2" : "font-medium tabular-nums"}>{l.amount < 0 ? "−" : "+"}{money(Math.abs(l.amount), l.currency)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {admin && (
            <Card>
              <CardHeader title="History" />
              <CardBody>
                <Timeline items={[...(p.history ?? [])].reverse().map((h, i) => ({ title: roleStage("admin", h.status), description: [h.byName ? `by ${h.byName}` : null, h.note].filter(Boolean).join(" — ") || undefined, time: formatDateTime(h.at), state: i === 0 ? "current" as const : "done" as const }))} />
              </CardBody>
            </Card>
          )}
          {admin && <Card><CardHeader title="Audit trail" /><CardBody><EntityActivity entityType="Payment" entityId={p.id} /></CardBody></Card>}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title={role === "candidate" ? "Your pay" : role === "recruiter" ? "Amount due" : "Amount"} />
            <CardBody>
              <p className="text-3xl font-semibold tabular-nums">{money(amount, cur)}</p>
              <p className="mt-1 text-sm text-foreground-2">{periodLabel(p.period)}{hourly ? ` · ${p.hoursWorked} hours` : ""}</p>
              {admin && (
                <dl className="mt-4 space-y-1.5 border-t border-divider pt-4 text-sm tabular-nums">
                  <div className="flex justify-between"><dt className="text-foreground-2">Company pays</dt><dd>{money(p.gross, cur)}</dd></div>
                  <div className="flex justify-between"><dt className="text-foreground-2">Candidate receives</dt><dd>{money(p.candidateAmount, cur)}</dd></div>
                  <div className="flex justify-between"><dt className="text-foreground-2">Commission{p.rule ? ` (${commissionText(p.rule as never, cur)})` : ""}</dt><dd className="font-medium text-primary">{money(p.commission, cur)}</dd></div>
                  <p className="pt-2 text-xs text-muted">Figures are fixed when the payment is created; later contract changes affect future payments only.</p>
                </dl>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Contract" />
            <CardBody className="space-y-1.5 text-sm">
              <p>{p.job.title}</p>
              <p className="text-foreground-2">{p.job.company}</p>
              <p><Link className="text-primary hover:underline" href={`/${role}/contracts/${p.contractId}`}>{p.contractNumber}</Link></p>
            </CardBody>
          </Card>
        </aside>
      </div>

      <ActionDialog open={dlg === "mark-paid"} onOpenChange={(o) => !o && setDlg(null)} title={admin ? "Record the company's payment" : "Release the payment"} description={admin ? "Tell us how and when the company paid." : "Tell us how you released the payment. Our team is notified and confirms once it reaches us, then releases it to the candidate."} submitLabel={admin ? "Record payment" : "Release payment"}
        fields={[{ name: "method", label: "How did you pay?", kind: "select", options: METHODS }, { name: "reference", label: "Reference or transaction ID", placeholder: "e.g. UTR / receipt number" }, { name: "amount", label: "Amount sent", kind: "money", initial: String((amount ?? 0) / 100), hint: "Change this only if you paid a different amount" }, { name: "note", label: "Note", kind: "textarea", optional: true }]}
        onSubmit={(v) => act("client/mark-paid", admin ? "Payment recorded" : "Payment released. Our team has been notified.", { method: v.method, reference: v.reference, amount: cents(v.amount), note: v.note || undefined })} />
      <ActionDialog open={dlg === "confirm-received"} onOpenChange={(o) => !o && setDlg(null)} title="Confirm the money arrived" description={`Check your account for ${money(p.gross, cur)}. A different amount is recorded as a dispute.`} submitLabel="Confirm received"
        fields={[{ name: "amount", label: "Amount received", kind: "money", initial: String((p.gross ?? 0) / 100) }, { name: "note", label: "Note", kind: "textarea", optional: true }]}
        onSubmit={(v) => act("client/confirm", Number(v.amount) * 100 === p.gross ? "Payment confirmed" : "Recorded as a dispute", { amountReceived: cents(v.amount), note: v.note || undefined })} />
      <ActionDialog open={dlg === "send-payout"} onOpenChange={(o) => !o && setDlg(null)} title="Release the payout to the candidate" description={`${money(p.candidateAmount, cur)} to ${p.candidate?.name}. They'll be asked to confirm they received it.`} submitLabel="Release payout"
        fields={[{ name: "method", label: "How did you pay?", kind: "select", options: METHODS }, { name: "reference", label: "Reference or transaction ID" }, { name: "note", label: "Note", kind: "textarea", optional: true }]}
        onSubmit={(v) => act("payout/send", "Payout recorded", { method: v.method, reference: v.reference, note: v.note || undefined })} />
      <ActionDialog open={dlg === "adjust"} onOpenChange={(o) => !o && setDlg(null)} title="Adjust the amount" description="Only possible before any money moves. Commission is recalculated." submitLabel="Update amount"
        fields={[...(hourly ? [{ name: "hours", label: "Hours worked", kind: "number" as const, initial: String(p.hoursWorked ?? ""), optional: true }] : []), { name: "amount", label: hourly ? "…or set the amount directly" : "New amount", kind: "money", optional: hourly, initial: hourly ? "" : String((p.gross ?? 0) / 100) }, { name: "reason", label: "Reason", kind: "textarea" }]}
        onSubmit={(v) => act("adjust", "Amount updated", v.hours && !v.amount ? { hoursWorked: Number(v.hours), reason: v.reason } : { grossAmount: cents(v.amount), reason: v.reason })} />
      <ReasonDialog open={dlg === "dispute-client"} onOpenChange={(o) => !o && setDlg(null)} title="Dispute this payment" description="The company will see your reason and can record the payment again." confirmLabel="Dispute" destructive onSubmit={(note) => act("client/dispute", "Marked as disputed", { note })} />
      <ReasonDialog open={dlg === "resolve-client"} onOpenChange={(o) => !o && setDlg(null)} title="Mark as settled" description="Use this when the money turned up or the difference was agreed. It's recorded with your reason." confirmLabel="Settle" onSubmit={(note) => act("client/resolve", "Marked as received", { note })} />
      <ReasonDialog open={dlg === "resolve-payout"} onOpenChange={(o) => !o && setDlg(null)} title="Mark the payout settled" description="Use this once you've sorted it out with the candidate." confirmLabel="Settle" onSubmit={(note) => act("payout/resolve", "Payout settled", { note })} />
      <ReasonDialog open={dlg === "cancel"} onOpenChange={(o) => !o && setDlg(null)} title="Cancel this payment?" description="For a payment created in error. This can't be undone." confirmLabel="Cancel payment" destructive onSubmit={(note) => act("cancel", "Payment cancelled", { note })} />
      <ReasonDialog open={dlg === "dispute-payout"} onOpenChange={(o) => !o && setDlg(null)} title="Tell us what happened" description="We'll check and get back to you." confirmLabel="Send" destructive onSubmit={(note) => act("payout/dispute", "We've been told — we'll look into it", { note })} />
    </>
  );
}
