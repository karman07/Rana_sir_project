"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatMoney, toMinor } from "@rms/shared";
import type { JobSpec } from "@/lib/jobs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";

export interface JobCommission {
  type: "PERCENT" | "FIXED"; percent?: number; amount?: number; label: string; source: "JOB" | "RECRUITER" | "GLOBAL" | "DEFAULT";
  candidateCompensation?: JobSpec["compensation"];
  earned: { currency: string; commission: number; gross: number; payments: number }[];
  pending: { currency: string; commission: number; gross: number; payments: number }[];
}
export interface CommissionInput { type: "PERCENT" | "FIXED"; value: string }

const money = (n: number, cur: string) => formatMoney({ amount: n, currency: cur }).replace(/\.00$/, "");
const SOURCE: Record<string, string> = { JOB: "Set for this opening", RECRUITER: "This recruiter's rate", GLOBAL: "Our standard rate", DEFAULT: "Built-in default" };

/** The commission as the API wants it, or null while it isn't a usable figure. */
export function commissionBody(i: CommissionInput, currency = "USD") {
  const n = Number(i.value);
  if (!i.value.trim() || !Number.isFinite(n) || n <= 0) return null;
  if (i.type === "PERCENT") return n < 100 && /^\d+(\.\d{1,2})?$/.test(i.value) ? { type: "PERCENT" as const, percent: n } : null;
  return /^\d+(\.\d{1,2})?$/.test(i.value) ? { type: "FIXED" as const, amount: toMinor(n, currency) } : null;
}

/** What the company pays, what the candidate will be shown, and what we keep. Admin only. */
export function CommissionEditor({ spec, value, onChange, current }: { spec: JobSpec; value: CommissionInput; onChange: (v: CommissionInput) => void; current?: JobCommission }) {
  const c = spec.compensation, cur = c?.currency ?? "USD", hourly = c?.payBasis === "HOUR";
  const body = commissionBody(value, cur);
  const hi = c?.salaryMax ?? c?.salaryMin, lo = c?.salaryMin ?? c?.salaryMax;
  const cut = (n: number) => (!body ? 0 : body.type === "PERCENT" ? Math.round((n * Math.round(body.percent * 100) + 5_000) / 10_000) : Math.min(body.amount, n));
  const row = (label: string, a?: number, b?: number) => a === undefined ? null : (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-foreground-2">{label}</span><span className="font-medium tabular-nums">{b === undefined || a === b ? money(a, cur) : `${money(a, cur)} – ${money(b, cur)}`}</span></div>
  );
  return (
    <Card>
      <CardHeader title="Our commission" description="Set this before approving. Only you see it." />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-[8.5rem_1fr] gap-2">
          <Select aria-label="Commission type" value={value.type} onChange={(e) => onChange({ type: e.target.value as "PERCENT" | "FIXED", value: "" })}>
            <option value="PERCENT">Percentage</option>
            <option value="FIXED" disabled={hourly}>Fixed amount</option>
          </Select>
          <Input aria-label="Commission" inputMode="decimal" placeholder={value.type === "PERCENT" ? "e.g. 25" : `Amount in ${cur}`} value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value.replace(/[^\d.]/g, "") })} />
        </div>
        {hourly && <p className="text-xs text-muted">Hourly openings take a percentage.</p>}
        {current && <p className="text-xs text-muted">If you don&apos;t change it: {current.label} ({SOURCE[current.source].toLowerCase()}).</p>}
        {lo !== undefined && (
          <div className="divide-y divide-divider rounded-xl border border-border bg-background-2 px-3">
            {row("Company pays", lo, hi)}
            {body && row("We keep", cut(lo), hi !== undefined ? cut(hi) : undefined)}
            {body && row("Candidates see", lo - cut(lo), hi !== undefined ? hi - cut(hi) : undefined)}
          </div>
        )}
        <p className="text-xs text-muted">Applied to every contract and payment on this opening. Recruiters and candidates never see the commission.</p>
      </CardBody>
    </Card>
  );
}

/** Change our commission on one opening. Saved straight to the job; nobody but Admin ever sees it. */
export function EditCommissionDialog({ jobId, spec, current, open, onOpenChange, onSaved }: { jobId: string; spec: JobSpec; current?: JobCommission; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<CommissionInput>({ type: current?.type ?? "PERCENT", value: current ? String(current.type === "PERCENT" ? current.percent ?? "" : (current.amount ?? 0) / 100) : "" });
  const body = commissionBody(value, spec.compensation?.currency ?? "USD");
  const save = useMutation({
    mutationFn: () => api(`/jobs/${jobId}/commission`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Commission updated"); for (const k of ["job-request", "jobs", "job", "audit"]) qc.invalidateQueries({ queryKey: [k] }); onOpenChange(false); onSaved?.(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Our commission on this opening" description="Applies to new contracts and payments on this job, and changes the pay candidates see. Contracts already agreed keep their rate.">
        <div className="space-y-4">
          <CommissionEditor spec={spec} value={value} onChange={setValue} current={current} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!body} loading={save.isPending} onClick={() => save.mutate()}>Save commission</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** For a live opening: the rate in force, what candidates see, and what has been earned so far. */
export function CommissionSummary({ c, spec, jobId }: { c: JobCommission; spec: JobSpec; jobId?: string }) {
  const [editing, setEditing] = useState(false);
  const cur = spec.compensation?.currency ?? "USD", cc = c.candidateCompensation;
  return (
    <Card>
      <CardHeader title="Our commission" description="Only you see this." />
      <CardBody className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><span className="text-foreground-2">Rate</span><span className="font-medium">{c.type === "FIXED" ? money(c.amount ?? 0, cur) : c.label}</span></div>
        <p className="text-xs text-muted">{SOURCE[c.source]}</p>
        {cc?.salaryMin !== undefined && <div className="flex items-center justify-between"><span className="text-foreground-2">Candidates see</span><span className="font-medium tabular-nums">{cc.salaryMin === cc.salaryMax ? money(cc.salaryMin, cur) : `${money(cc.salaryMin, cur)} – ${money(cc.salaryMax ?? cc.salaryMin, cur)}`}</span></div>}
        <div className="border-t border-divider pt-3">
          <p className="mb-1 text-foreground-2">Earned so far</p>
          {c.earned.length ? c.earned.map((e) => <p key={e.currency} className="flex justify-between"><span>{e.payments} payment{e.payments > 1 ? "s" : ""} received</span><span className="font-medium tabular-nums">{money(e.commission, e.currency)}</span></p>) : <p className="text-muted">Nothing yet. It builds up as the recruiter&apos;s payments are confirmed.</p>}
        </div>
        {c.pending.map((e) => <p key={e.currency} className="flex justify-between text-foreground-2"><span>{e.payments} released, to confirm</span><span className="font-medium tabular-nums">{money(e.commission, e.currency)}</span></p>)}
        {jobId && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change commission</Button>}
        {jobId && <EditCommissionDialog jobId={jobId} spec={spec} current={c} open={editing} onOpenChange={setEditing} />}
        <Link href="/admin/commissions" className="block text-xs font-medium text-primary hover:underline">All commission rates</Link>
      </CardBody>
    </Card>
  );
}
