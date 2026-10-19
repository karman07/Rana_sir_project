"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Check, MessageSquareWarning, Plus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api, apiList, apiPost, apiUpload, ApiError } from "@/lib/api";
import { CompanyMark } from "@/components/ui/company-mark";
import { ImagePlus } from "lucide-react";
import { DataTable } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

interface Company { id: string; logoUrl?: string; name: string; industry?: string; location?: string; website?: string; approvalStatus: string; linkStatus?: string; reviewNote?: string; submittedAt?: string }

const schema = z.object({
  name: z.string().trim().min(2, "Enter the company name"),
  industry: z.string(),
  location: z.string(),
  website: z.string().refine((v) => v === "" || /^https?:\/\/.+\..+/.test(v), "Include http:// or https://"),
});

function AddCompany({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: "", industry: "", location: "", website: "" } });
  const create = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => apiPost("/companies", Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ""))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["overview"] }); toast.success(admin ? "Company added" : "Company submitted for review"); reset(); setOpen(false); },
    onError: (e) => { if (e instanceof ApiError && e.code === "COMPANY_EXISTS") setError("name", { message: e.message }); else toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not add company"); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Add company</Button></DialogTrigger>
      <DialogContent title="Add a client company" description={admin ? "Companies you add are approved immediately." : "Our team reviews new companies before you can post openings for them."}>
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
          <Field label="Company name" htmlFor="c-name" error={errors.name?.message}><Input id="c-name" autoFocus aria-invalid={!!errors.name} {...register("name")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry" htmlFor="c-ind" hint="Optional"><Input id="c-ind" {...register("industry")} /></Field>
            <Field label="Location" htmlFor="c-loc" hint="Optional"><Input id="c-loc" {...register("location")} /></Field>
          </div>
          <Field label="Website" htmlFor="c-web" hint="Optional" error={errors.website?.message}><Input id="c-web" placeholder="https://" {...register("website")} /></Field>
          <div className="flex justify-end"><Button type="submit" loading={create.isPending}>{admin ? "Add company" : "Submit for review"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompaniesView({ mode }: { mode: "admin" | "recruiter" }) {
  const admin = mode === "admin";
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState(admin ? "PENDING_REVIEW" : "");
  const [decision, setDecision] = useState<{ c: Company; kind: "reject" | "request-changes" } | null>(null);

  const counts = useQuery({ queryKey: ["companies", "counts"], queryFn: () => api<Record<string, number>>("/companies/counts"), enabled: admin });
  const list = useQuery({ queryKey: ["companies", mode, tab], queryFn: () => apiList<Company>(`/companies?limit=100${tab ? `&approvalStatus=${tab}` : ""}`) });

  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown; ok: string }) => apiPost(`/companies/${id}/${action}`, body ?? {}),
    onSuccess: (_r, v) => { toast.success(v.ok); qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["overview"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action failed"),
  });

  const columns = useMemo<ColumnDef<Company, unknown>[]>(() => [
    { accessorKey: "name", header: "Company", cell: ({ row: { original: c } }) => (
      <div className="flex items-center gap-3"><CompanyMark name={c.name} logoUrl={c.logoUrl} className="size-10 text-sm" />
        <div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="truncate text-xs text-muted">{[c.industry, c.location].filter(Boolean).join(" · ")}</p></div></div>) },
    { accessorKey: "approvalStatus", header: admin ? "Review" : "Company status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
    ...(!admin ? [{ accessorKey: "linkStatus", header: "Your access", cell: ({ getValue }: { getValue: () => unknown }) => <StatusBadge status={(getValue() as string) ?? "PENDING_REVIEW"} /> } as ColumnDef<Company, unknown>] : []),
    ...(admin ? [{
      id: "actions", header: "", enableHiding: false, enableSorting: false, cell: ({ row: { original: c } }: { row: { original: Company } }) => (
        <div className="flex justify-end gap-1.5">
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground-2 hover:bg-background-2 hover:text-foreground [&_svg]:size-4">
            <ImagePlus />{c.logoUrl ? "Change logo" : "Add logo"}
            <input type="file" accept=".png,.jpg,.jpeg,.webp" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              try { await apiUpload(`/companies/${c.id}/logo`, f); toast.success("Logo updated"); qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["public"] }); }
              catch (err) { toast.error(err instanceof ApiError ? err.message : "Upload failed"); }
            }} />
          </label>
          {c.approvalStatus !== "APPROVED" && <Button size="sm" onClick={() => act.mutate({ id: c.id, action: "approve", ok: `${c.name} approved` })}><Check />Approve</Button>}
          {c.approvalStatus === "PENDING_REVIEW" && <Button size="sm" variant="secondary" onClick={() => setDecision({ c, kind: "request-changes" })}><MessageSquareWarning />Changes</Button>}
          {c.approvalStatus !== "REJECTED" && <Button size="sm" variant="outlineDanger" onClick={() => setDecision({ c, kind: "reject" })}><X />Reject</Button>}
        </div>) } as ColumnDef<Company, unknown>] : []),
  ], [admin, act]);

  const tabs = [{ key: "PENDING_REVIEW", label: "Pending review" }, { key: "APPROVED", label: "Approved" }, { key: "CHANGES_REQUESTED", label: "Changes requested" }, { key: "REJECTED", label: "Rejected" }, { key: "", label: "All" }];

  return (
    <>
      <PageHeader title={admin ? "Companies" : "Your client companies"} description={admin ? "Client companies recruiters represent. You approve each one." : "Companies you can post openings for. New companies are reviewed by our team."} actions={<AddCompany admin={admin} />} />
      {admin && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
          {tabs.map((t) => {
            const n = t.key ? counts.data?.[t.key] : Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);
            return (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>
                {t.label}{n !== undefined && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-primary-foreground/20" : "bg-background-2")}>{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      <DataTable
        data={list.data?.items ?? []} columns={columns} loading={list.isPending} searchPlaceholder="Search companies…" exportName={admin ? "companies" : undefined} onRowClick={admin ? (c) => router.push(`/admin/companies/${c.id}`) : undefined}
        empty={admin
          ? { title: "No companies here", description: "Companies submitted by recruiters appear here for review." }
          : { title: "You haven't added a company yet", description: "Add the companies you recruit for. Once our team approves one, you can post openings for it." }}
        renderCard={(c) => <Card className="p-4"><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{[c.industry, c.location].filter(Boolean).join(" · ")}</p><div className="mt-2"><StatusBadge status={c.approvalStatus} /></div></Card>}
      />
      <ReasonDialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)} destructive={decision?.kind === "reject"}
        title={decision?.kind === "reject" ? `Reject ${decision?.c.name}?` : `Request changes for ${decision?.c.name}`} description="The recruiter will see your note."
        confirmLabel={decision?.kind === "reject" ? "Reject" : "Send request"}
        onSubmit={(note) => act.mutateAsync({ id: decision!.c.id, action: decision!.kind, body: { note }, ok: decision!.kind === "reject" ? "Company rejected" : "Changes requested" })} />
    </>
  );
}
