"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES } from "@rms/shared";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";

interface Settings {
  company: { name: string; legalName: string; supportEmail: string; supportPhone: string; address: string; website: string };
  defaults: { currency: string };
  payments: { dueGraceDays: number; salaryPayLagDays: number };
  documents: { maxUploadMb: number };
}

export function PlatformSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const [s, setS] = useState<Settings>();
  const [error, setError] = useState<string>();
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  const dirty = !!s && !!q.data && JSON.stringify(s) !== JSON.stringify(q.data);

  const save = useMutation({
    mutationFn: () => api<Settings>("/settings", { method: "PATCH", body: JSON.stringify({
      company: { ...s!.company, supportEmail: s!.company.supportEmail || undefined, website: s!.company.website || undefined },
      defaults: s!.defaults, payments: s!.payments, documents: s!.documents,
    }) }),
    onSuccess: (r) => { toast.success("Settings saved"); setError(undefined); qc.setQueryData(["settings"], r); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => setError(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save"),
  });

  const num = (k: "payments" | "documents", f: string, v: string, min: number) => setS((x) => x && ({ ...x, [k]: { ...x[k], [f]: v === "" ? min : Math.max(min, Number(v.replace(/\D/g, ""))) } }));
  const company = (f: keyof Settings["company"], v: string) => setS((x) => x && ({ ...x, company: { ...x.company, [f]: v } }));

  return (
    <>
      <Link href="/admin/settings" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Settings</Link>
      <PageHeader title="Platform settings" description="Your organisation's details and the rules the platform runs by. Changes apply from the next payment, payslip or upload." actions={<Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}><Save />Save changes</Button>} />
      {!s ? <Skeleton className="h-96 w-full max-w-3xl rounded-[16px]" /> : (
        <form className="max-w-3xl space-y-5" onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(); }}>
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Card>
            <CardHeader title="Your organisation" description="Shown on contracts and payslips, and used as the name people see." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="co-name"><Input id="co-name" value={s.company.name} onChange={(e) => company("name", e.target.value)} /></Field>
              <Field label="Legal name" htmlFor="co-legal" hint="Optional"><Input id="co-legal" value={s.company.legalName} onChange={(e) => company("legalName", e.target.value)} /></Field>
              <Field label="Support email" htmlFor="co-email" hint="Printed on payslips and contracts"><Input id="co-email" type="email" value={s.company.supportEmail} onChange={(e) => company("supportEmail", e.target.value)} /></Field>
              <Field label="Support phone" htmlFor="co-phone" hint="Optional"><Input id="co-phone" value={s.company.supportPhone} onChange={(e) => company("supportPhone", e.target.value)} /></Field>
              <Field label="Website" htmlFor="co-web" hint="Include https://"><Input id="co-web" value={s.company.website} onChange={(e) => company("website", e.target.value)} /></Field>
              <Field label="Address" htmlFor="co-addr" hint="Optional"><Input id="co-addr" value={s.company.address} onChange={(e) => company("address", e.target.value)} /></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Currency" />
            <CardBody>
              <Field label="Default currency" htmlFor="cur" hint="Used when someone has no country on their profile"><Select id="cur" value={s.defaults.currency} onChange={(e) => setS({ ...s, defaults: { currency: e.target.value } })} className="max-w-48">{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Payments & pay" description="When money is expected. Existing payments keep the dates they were created with." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Company pays within (days)" htmlFor="grace" hint="After a month ends. Late payments are flagged after this"><Input id="grace" inputMode="numeric" value={String(s.payments.dueGraceDays)} onChange={(e) => num("payments", "dueGraceDays", e.target.value, 0)} /></Field>
              <Field label="Candidates are paid within (days)" htmlFor="lag" hint="After a month ends. Shown to candidates as the expected date"><Input id="lag" inputMode="numeric" value={String(s.payments.salaryPayLagDays)} onChange={(e) => num("payments", "salaryPayLagDays", e.target.value, 0)} /></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <CardBody>
              <Field label="Largest file (MB)" htmlFor="mb" hint="Resumes, IDs and proof of payment. Up to 25"><Input id="mb" inputMode="numeric" value={String(s.documents.maxUploadMb)} onChange={(e) => num("documents", "maxUploadMb", e.target.value, 1)} className="max-w-32" /></Field>
            </CardBody>
          </Card>
        </form>
      )}
    </>
  );
}
