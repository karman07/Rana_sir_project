"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { toMinor } from "@rms/shared";
import { apiPost, ApiError } from "@/lib/api";
import { METHODS, money, periodLabel, type PaymentItem } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionDialog } from "./action-dialog";

/** What is owed on each row, whichever role is looking. */
const due = (p: PaymentItem, role: "admin" | "recruiter") => (role === "admin" ? p.gross : p.amountDue) ?? 0;
const sumBy = (rows: PaymentItem[], f: (p: PaymentItem) => number) => {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + f(r));
  return [...by].map(([c, n]) => money(n, c)).join(" + ");
};
const useRefresh = () => { const qc = useQueryClient(); return () => { for (const k of ["payments", "salary", "approvals", "overview"]) qc.invalidateQueries({ queryKey: [k] }); }; };
const fail = (e: unknown) => toast.error(e instanceof ApiError ? (e.details?.length ? `${e.message}` : e.message) : "Something went wrong");

/** The recruiter (or Admin on their behalf) tells us one transfer covers all of these payments. */
export function BulkRelease({ rows, role }: { rows: PaymentItem[]; role: "admin" | "recruiter" }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const refresh = useRefresh();
  const usable = rows.filter((r) => r.actions.includes("mark-paid"));
  const send = useMutation({
    mutationFn: () => {
      // only the payments released at a different amount than they were due carry an amount
      const changed = usable.flatMap((r) => { const v = amounts[r.id]; return v !== undefined && v !== "" && toMinor(Number(v), r.currency) !== due(r, role) ? [{ paymentId: r.id, amount: toMinor(Number(v), r.currency) }] : []; });
      return apiPost("/payments/release-batch", { paymentIds: usable.map((r) => r.id), method, reference: reference.trim(), note: note.trim() || undefined, amounts: changed.length ? changed : undefined });
    },
    onSuccess: () => { toast.success(`Released ${usable.length} payment${usable.length > 1 ? "s" : ""}. Our team has been notified.`); setOpen(false); setReference(""); setNote(""); setAmounts({}); refresh(); },
    onError: fail,
  });
  if (!usable.length) return null;
  const total = sumBy(usable.map((r) => ({ ...r, amountDue: amounts[r.id] ? toMinor(Number(amounts[r.id]), r.currency) : due(r, role), gross: amounts[r.id] ? toMinor(Number(amounts[r.id]), r.currency) : r.gross })), (r) => due(r, role));
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Send />{role === "admin" ? "Record company payment" : "Release payment"} ({usable.length})</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Release ${usable.length} payment${usable.length > 1 ? "s" : ""}`} description="One transfer, several candidates. Our team is told once and confirms when the money arrives." className="max-w-2xl">
          <div className="space-y-4">
            <div className="max-h-64 divide-y divide-divider overflow-y-auto rounded-xl border border-border">
              {usable.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_9rem] items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{r.candidate?.name ?? "Candidate"}</p><p className="truncate text-xs text-muted">{r.job.title} · {periodLabel(r.period)}</p></div>
                  <Input aria-label={`Amount for ${r.candidate?.name}`} inputMode="decimal" placeholder={String(due(r, role) / 100)} value={amounts[r.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value.replace(/[^\d.]/g, "") })} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">Leave an amount empty to release exactly what is due. Fill it only if you are releasing a different amount.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="How did you pay?" htmlFor="b-method"><Select id="b-method" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
              <Field label="Reference or transaction ID" htmlFor="b-ref"><Input id="b-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR / receipt number" /></Field>
            </div>
            <Field label="Note" htmlFor="b-note" hint="Optional"><Textarea id="b-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-foreground-2">Total sent: <span className="font-semibold text-foreground">{total}</span></p>
              <div className="flex gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={reference.trim().length < 2} loading={send.isPending} onClick={() => send.mutate()}>Release payment</Button></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Admin: one transfer reached the account for all of these. A wrong total confirms none of them. */
export function BulkConfirm({ rows }: { rows: PaymentItem[] }) {
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const usable = rows.filter((r) => r.actions.includes("confirm-received"));
  if (!usable.length) return null;
  const currencies = new Set(usable.map((r) => r.currency));
  const expected = usable.reduce((n, r) => n + (r.gross ?? 0), 0);
  const cur = usable[0].currency;
  return (
    <>
      <Button size="sm" disabled={currencies.size > 1} title={currencies.size > 1 ? "Select payments in one currency" : undefined} onClick={() => setOpen(true)}><Check />Confirm received ({usable.length})</Button>
      <ActionDialog open={open} onOpenChange={setOpen} title={`Confirm ${usable.length} payment${usable.length > 1 ? "s" : ""}`}
        description={`The company's transfer should total ${money(expected, cur)}. A different total confirms none of them: they are held as disputes until it is sorted out.`} submitLabel="Confirm received"
        fields={[{ name: "amount", label: "Total that reached the account", kind: "money", initial: String(expected / 100) }, { name: "note", label: "Note", kind: "textarea", optional: true }]}
        onSubmit={async (v) => {
          try {
            const r = await apiPost<{ confirmed: number; disputed: number }>("/payments/confirm-batch", { paymentIds: usable.map((x) => x.id), amountReceived: toMinor(Number(v.amount), cur), note: v.note || undefined });
            if (r.confirmed) toast.success(`${r.confirmed} payment${r.confirmed > 1 ? "s" : ""} confirmed`); else toast.warning(`The total did not match. ${r.disputed} held as disputed.`);
            refresh();
          } catch (e) { fail(e); throw e; }
        }} />
    </>
  );
}

/** Admin forwards several candidates' pay with one reference. */
export function BulkPayout({ rows }: { rows: PaymentItem[] }) {
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const usable = rows.filter((r) => r.actions.includes("send-payout"));
  if (!usable.length) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Wallet />Release to candidates ({usable.length})</Button>
      <ActionDialog open={open} onOpenChange={setOpen} title={`Release ${usable.length} payout${usable.length > 1 ? "s" : ""}`}
        description={`${sumBy(usable, (r) => r.candidateAmount ?? 0)} in total to ${usable.length} candidate${usable.length > 1 ? "s" : ""}. Each is asked to confirm they received theirs.`} submitLabel="Release payouts"
        fields={[{ name: "method", label: "How are you paying them?", kind: "select", options: METHODS }, { name: "reference", label: "Reference", placeholder: "One reference for the whole transfer" }, { name: "note", label: "Note", kind: "textarea", optional: true }]}
        onSubmit={async (v) => {
          try { await apiPost("/payments/payout-batch", { paymentIds: usable.map((x) => x.id), method: v.method, reference: v.reference, note: v.note || undefined }); toast.success("Payouts released"); refresh(); }
          catch (e) { fail(e); throw e; }
        }} />
    </>
  );
}
