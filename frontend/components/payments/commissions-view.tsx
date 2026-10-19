"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES, toMinor } from "@rms/shared";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { money, periodLabel, type PaymentSummary } from "@/lib/payments";
import { StatCard } from "@/components/data/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ExportButton } from "@/components/analytics/export-button";
import { HandCoins, Percent } from "lucide-react";

interface Rule { id: string; scope: "GLOBAL" | "RECRUITER" | "JOB"; refLabel?: string; type: "PERCENT" | "FIXED"; label: string; active: boolean; note?: string; createdAt: string }
interface RulesResponse { items: Rule[]; fallback: { label: string; basisPoints: number } }
const SCOPE_LABEL = { GLOBAL: "Everyone", RECRUITER: "Recruiter", JOB: "Job" } as const;

function RuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Rule["scope"]>("GLOBAL");
  const [refId, setRefId] = useState("");
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const targets = useQuery({
    queryKey: ["commission-targets", scope], enabled: open && scope !== "GLOBAL",
    queryFn: async () => scope === "RECRUITER"
      ? (await apiList<{ id: string; name: string; agencyName?: string }>("/recruiters?limit=100&approvalStatus=APPROVED")).items.map((r) => ({ id: r.id, label: r.agencyName ? `${r.name} · ${r.agencyName}` : r.name }))
      : (await apiList<{ id: string; jobNumber: string; spec: { title?: string } }>("/jobs?limit=100")).items.map((j) => ({ id: j.id, label: `${j.jobNumber} · ${j.spec.title}` })),
  });
  const save = useMutation({
    mutationFn: () => apiPost("/commission-rules", {
      scope, refId: scope === "GLOBAL" ? undefined : refId, type, note: note || undefined,
      ...(type === "PERCENT" ? { percent: Number(value) } : { amount: toMinor(Number(value), currency), currency }),
    }),
    onSuccess: () => { toast.success("Rule saved. It applies to new contracts."); qc.invalidateQueries({ queryKey: ["commission-rules"] }); onOpenChange(false); setValue(""); setNote(""); setRefId(""); },
    onError: (e) => setError(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save"),
  });
  const ready = value !== "" && (scope === "GLOBAL" || refId !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New commission rule" description="Applies to contracts created from now on. Existing contracts keep what they were agreed with.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(undefined); save.mutate(); }}>
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Field label="Applies to" htmlFor="r-scope">
            <Select id="r-scope" value={scope} onChange={(e) => { setScope(e.target.value as Rule["scope"]); setRefId(""); }}>
              <option value="GLOBAL">Everyone (default)</option><option value="RECRUITER">One recruiter</option><option value="JOB">One job</option>
            </Select>
          </Field>
          {scope !== "GLOBAL" && (
            <Field label={scope === "RECRUITER" ? "Recruiter" : "Job"} htmlFor="r-target">
              <Select id="r-target" value={refId} onChange={(e) => setRefId(e.target.value)}><option value="">Choose…</option>{targets.data?.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="r-type"><Select id="r-type" value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}><option value="PERCENT">Percentage of each payment</option><option value="FIXED">Fixed amount per payment</option></Select></Field>
            <Field label={type === "PERCENT" ? "Percentage" : "Amount"} htmlFor="r-value" hint={type === "PERCENT" ? "0 – 100" : undefined}><Input id="r-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            {type === "FIXED" && <Field label="Currency" htmlFor="r-cur"><Select id="r-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>}
          </div>
          <Field label="Note" htmlFor="r-note" hint="Optional"><Textarea id="r-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!ready}>Save rule</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CommissionsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rules = useQuery({ queryKey: ["commission-rules"], queryFn: () => api<RulesResponse>("/commission-rules") });
  const summary = useQuery({ queryKey: ["payments", "summary"], queryFn: () => api<PaymentSummary>("/payments/summary") });
  const off = useMutation({
    mutationFn: (id: string) => api(`/commission-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Rule turned off"); qc.invalidateQueries({ queryKey: ["commission-rules"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not turn it off"),
  });
  const t = summary.data?.totals ?? [];
  const byPeriod = summary.data?.commissionByPeriod ?? [];
  const peak = Math.max(1, ...byPeriod.map((m) => m.commission));
  const active = rules.data?.items.filter((r) => r.active) ?? [];
  const history = rules.data?.items.filter((r) => !r.active) ?? [];

  return (
    <>
      <PageHeader title="Commissions" description="What the platform keeps from each payment, and what it has earned. Only Admin sees any of this." actions={<><ExportButton dataset="commissions" label="Statement" /><Button onClick={() => setOpen(true)}><Plus />New rule</Button></>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {t.length === 0 && <StatCard label="Commission earned" value="—" icon={HandCoins} hint="Once payments are confirmed" />}
        {t.map((x) => <StatCard key={x.currency} label={`Earned (${x.currency})`} value={money(x.commissionEarned, x.currency)} icon={HandCoins} hint={x.commissionPending ? `+${money(x.commissionPending, x.currency)} on payments released, waiting for you to confirm` : x.payoutsDue ? `${money(x.payoutsDue, x.currency)} still owed to candidates` : "All candidates paid"} />)}
        <StatCard label="Default rule" value={rules.data ? (active.find((r) => r.scope === "GLOBAL")?.label ?? rules.data.fallback.label.replace("Built-in default", `${rules.data.fallback.basisPoints / 100}%`)) : "…"} icon={Percent} hint={active.some((r) => r.scope === "GLOBAL") ? "Set by you" : "Built-in until you set one"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Rules" description="The most specific rule wins: a job, then a recruiter, then the default." />
          <CardBody>
            {rules.isPending ? <Skeleton className="h-32 w-full" /> : active.length === 0 ? (
              <EmptyState icon={Percent} title="Using the built-in 10%" description="Add a default rule to change what the platform keeps, or set one for a particular recruiter or job." />
            ) : (
              <ul className="divide-y divide-divider">
                {active.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <StatusBadge status={r.scope} label={SCOPE_LABEL[r.scope]} tone={r.scope === "GLOBAL" ? "neutral" : r.scope === "RECRUITER" ? "info" : "gold"} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.refLabel ?? "All contracts"}</p>{r.note && <p className="truncate text-xs text-muted">{r.note}</p>}</div>
                    <span className="text-lg font-semibold tabular-nums">{r.label}</span>
                    <ConfirmationDialog trigger={<Button variant="ghost" size="sm" aria-label="Turn off this rule"><Trash2 /></Button>} title="Turn this rule off?" description="New contracts will use the next most specific rule. Existing contracts are unaffected." confirmLabel="Turn off" destructive onConfirm={async () => { await off.mutateAsync(r.id); }} />
                  </li>
                ))}
              </ul>
            )}
            {history.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer text-foreground-2">Earlier rules ({history.length})</summary><ul className="mt-2 space-y-1 text-foreground-2">{history.map((r) => <li key={r.id}>{SCOPE_LABEL[r.scope]}{r.refLabel ? ` · ${r.refLabel}` : ""} — {r.label}</li>)}</ul></details>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Commission by month" description="From confirmed payments" />
          <CardBody>
            {byPeriod.length === 0 ? <p className="text-sm text-foreground-2">Nothing earned yet.</p> : (
              <ul className="space-y-3">
                {byPeriod.map((m) => (
                  <li key={`${m.period}-${m.currency}`}>
                    <div className="mb-1 flex justify-between text-sm"><span>{periodLabel(m.period)}</span><span className="font-medium tabular-nums">{money(m.commission, m.currency)}</span></div>
                    <div className="h-2 rounded-full bg-background-2"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, (m.commission / peak) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <RuleDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
