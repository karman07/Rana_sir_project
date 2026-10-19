"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES, fromMinor, toMinor } from "@rms/shared";
import { api, apiPost, ApiError } from "@/lib/api";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES } from "@/lib/jobs";
import { PERIOD_LABEL, type ContractTerms, type PayPeriod } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

interface FormState {
  title: string; employmentType: string; amount: string; currency: string; period: PayPeriod; hoursPerWeek: string;
  startDate: string; endDate: string; probationMonths: string; workingHours: string; noticePeriodDays: string; renewalTerms: string; notes: string;
  commissionPercent: string; reason: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function termsToForm(t?: Partial<ContractTerms>): FormState {
  const cur = t?.salary?.currency ?? "USD";
  return {
    title: t?.title ?? "", employmentType: t?.employmentType ?? "PART_TIME",
    amount: t?.salary?.amount !== undefined ? String(fromMinor(t.salary.amount, cur)) : "", currency: cur, period: t?.salary?.period ?? "MONTH", hoursPerWeek: t?.salary?.hoursPerWeek ? String(t.salary.hoursPerWeek) : "",
    startDate: t?.startDate ?? today(), endDate: t?.endDate ?? "", probationMonths: t?.probationMonths !== undefined ? String(t.probationMonths) : "", workingHours: t?.workingHours ?? "",
    noticePeriodDays: t?.noticePeriodDays !== undefined ? String(t.noticePeriodDays) : "", renewalTerms: t?.renewalTerms ?? "", notes: t?.notes ?? "",
    commissionPercent: t?.commission?.type === "PERCENT" ? String(t.commission.basisPoints / 100) : "", reason: "",
  };
}

const blank = (s: string) => s.trim() === "";

function toBody(f: FormState, canSetCommission: boolean) {
  const body: Record<string, unknown> = {
    title: f.title.trim(), employmentType: f.employmentType, currency: f.currency, salaryPeriod: f.period, startDate: f.startDate,
    salaryAmount: !blank(f.amount) && !Number.isNaN(Number(f.amount)) ? toMinor(Number(f.amount), f.currency) : undefined,
    hoursPerWeek: f.period === "HOUR" && !blank(f.hoursPerWeek) ? Number(f.hoursPerWeek) : undefined,
  };
  if (!blank(f.endDate)) body.endDate = f.endDate;
  if (!blank(f.probationMonths)) body.probationMonths = Number(f.probationMonths);
  if (!blank(f.noticePeriodDays)) body.noticePeriodDays = Number(f.noticePeriodDays);
  if (!blank(f.workingHours)) body.workingHours = f.workingHours.trim();
  if (!blank(f.renewalTerms)) body.renewalTerms = f.renewalTerms.trim();
  if (!blank(f.notes)) body.notes = f.notes.trim();
  if (canSetCommission && !blank(f.commissionPercent)) body.commissionPercent = Number(f.commissionPercent);
  return body;
}

export type ContractFormMode = { kind: "create"; applicationId: string } | { kind: "edit"; contractId: string } | { kind: "change"; contractId: string };

/** One form for drafting a contract, editing the draft, and proposing a change to a live contract. */
export function ContractFormDialog({ open, onOpenChange, mode, initial, isAdmin, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; mode: ContractFormMode; initial?: Partial<ContractTerms>; isAdmin: boolean; onDone?: (id?: string) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(() => termsToForm(initial));
  const [error, setError] = useState<string>();
  useEffect(() => { if (open) { setF(termsToForm(initial)); setError(undefined); } }, [open, initial]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const change = mode.kind === "change";

  const save = useMutation({
    mutationFn: async () => {
      const body = toBody(f, isAdmin);
      if (mode.kind === "create") return apiPost<{ id: string }>("/contracts", { applicationId: mode.applicationId, ...body });
      if (mode.kind === "edit") return api<{ id: string }>(`/contracts/${mode.contractId}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiPost<{ id: string }>(`/contracts/${mode.contractId}/versions`, { ...body, reason: f.reason.trim() });
    },
    onSuccess: (r) => {
      toast.success(mode.kind === "create" ? "Contract drafted" : mode.kind === "edit" ? "Draft updated" : isAdmin ? "Change applied" : "Change sent to Admin for approval");
      for (const k of ["contract", "contracts", "application", "applications", "overview", "approvals"]) qc.invalidateQueries({ queryKey: [k] });
      onOpenChange(false);
      onDone?.(r?.id);
    },
    onError: (e) => setError(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Something went wrong"),
  });

  const title = mode.kind === "create" ? "Draft a contract" : mode.kind === "edit" ? "Edit the draft" : "Propose a change";
  const disabled = !f.title.trim() || blank(f.amount) || (change && f.reason.trim().length < 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={change ? "The current terms stay as they are until the change is approved." : "Pay, dates and working terms. You can edit this until it is submitted."} className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(undefined); save.mutate(); }}>
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Job title" htmlFor="c-title"><Input id="c-title" value={f.title} onChange={(e) => set("title", e.target.value)} /></Field></div>
            <Field label="Employment type" htmlFor="c-type"><Select id="c-type" value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)}>{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_LABEL[t]}</option>)}</Select></Field>
            <Field label="Currency" htmlFor="c-cur"><Select id="c-cur" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Pay is" htmlFor="c-period"><Select id="c-period" value={f.period} onChange={(e) => set("period", e.target.value as PayPeriod)}>{(Object.keys(PERIOD_LABEL) as PayPeriod[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}</Select></Field>
            <Field label={f.period === "HOUR" ? "Rate" : "Amount"} htmlFor="c-amount"><Input id="c-amount" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            {f.period === "HOUR" && <Field label="Hours per week" htmlFor="c-hours" hint="Expected"><Input id="c-hours" inputMode="numeric" value={f.hoursPerWeek} onChange={(e) => set("hoursPerWeek", e.target.value.replace(/\D/g, ""))} /></Field>}
            {isAdmin && <Field label="Platform commission (%)" htmlFor="c-comm" hint="Only Admin sees this"><Input id="c-comm" inputMode="decimal" placeholder="10" value={f.commissionPercent} onChange={(e) => set("commissionPercent", e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
            <Field label="Start date" htmlFor="c-start"><Input id="c-start" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="End date" htmlFor="c-end" hint="Required for contract, temporary and internship roles"><Input id="c-end" type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
            <Field label="Working hours" htmlFor="c-wh"><Input id="c-wh" placeholder="20 hours/week, flexible" value={f.workingHours} onChange={(e) => set("workingHours", e.target.value)} /></Field>
            <Field label="Notice period (days)" htmlFor="c-np"><Input id="c-np" inputMode="numeric" value={f.noticePeriodDays} onChange={(e) => set("noticePeriodDays", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Probation (months)" htmlFor="c-pm"><Input id="c-pm" inputMode="numeric" value={f.probationMonths} onChange={(e) => set("probationMonths", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Renewal terms" htmlFor="c-rt"><Input id="c-rt" value={f.renewalTerms} onChange={(e) => set("renewalTerms", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes" htmlFor="c-notes" hint="Shown to everyone on the contract"><Textarea id="c-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
            {change && <div className="sm:col-span-2"><Field label="Reason for the change" htmlFor="c-reason"><Textarea id="c-reason" placeholder="Why is this changing?" value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field></div>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={disabled}>{mode.kind === "create" ? "Create draft" : mode.kind === "edit" ? "Save changes" : isAdmin ? "Apply change" : "Send for approval"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
