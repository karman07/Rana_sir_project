"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, FolderOpen, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, apiUpload, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { TYPE_LABEL, UPLOAD_TYPES, fileSize, openDocument, relatedHref, type DocumentItem } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";

type Role = "candidate" | "recruiter";

const GROUPS: { key: string; title: string; description: string; types: string[]; roles: Role[] }[] = [
  { key: "agreements", title: "Contracts & offers", description: "Your offer letters and signed contracts. A new version is kept whenever terms change.", types: ["OFFER_LETTER", "CONTRACT"], roles: ["candidate", "recruiter"] },
  { key: "payslips", title: "Payslips", description: "One for every payment you've received.", types: ["PAYSLIP"], roles: ["candidate"] },
  { key: "resume", title: "Resume", description: "Your current resume and earlier versions.", types: ["RESUME"], roles: ["candidate"] },
  { key: "mine", title: "Your documents", description: "Identification, certificates and anything else you've added.", types: ["IDENTIFICATION", "CERTIFICATE", "COVER_LETTER", "OTHER"], roles: ["candidate"] },
  { key: "proof", title: "Proof of payment", description: "Screenshots and receipts you attached to payments.", types: ["PAYMENT_PROOF"], roles: ["recruiter"] },
];

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<(typeof UPLOAD_TYPES)[number]>("IDENTIFICATION");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const up = useMutation({
    mutationFn: () => apiUpload("/documents", file!, { type, ...(label.trim() ? { label: label.trim() } : {}) }),
    onSuccess: () => { toast.success("Document added"); qc.invalidateQueries({ queryKey: ["documents"] }); onOpenChange(false); setFile(null); setLabel(""); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not upload that file"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a document" description="PDF, PNG, JPG or Word files up to 5 MB. Only you and our team can open it.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); up.mutate(); }}>
          <Field label="What is it?" htmlFor="d-type"><Select id="d-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{UPLOAD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>
          <Field label="Name" htmlFor="d-label" hint="Optional, e.g. Passport"><Input id="d-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="File" htmlFor="d-file">
            <input ref={ref} id="d-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="secondary" className="w-full justify-start" onClick={() => ref.current?.click()}><Upload />{file ? file.name : "Choose a file…"}</Button>
          </Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={up.isPending} disabled={!file}>Add document</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ d, role }: { d: DocumentItem; role: Role }) {
  const href = relatedHref(d, role);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background-2 text-foreground-2"><FileText className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{d.label ?? d.originalName}</p>
        <p className="truncate text-xs text-muted">{TYPE_LABEL[d.type] ?? d.type} · {fileSize(d.size)} · {formatDateTime(d.createdAt)}{href && <> · <Link href={href} className="text-primary hover:underline">View contract</Link></>}</p>
      </div>
      {d.version > 1 && <span className="rounded-md bg-background-2 px-2 py-0.5 text-xs text-foreground-2">v{d.version}</span>}
      {d.status === "ARCHIVED" && <StatusBadge status="CLOSED" label="Earlier version" />}
      <Button variant="ghost" size="sm" onClick={() => openDocument(d.id, { inline: true })} aria-label={`View ${d.label ?? d.originalName}`}><ExternalLink />View</Button>
      <Button variant="ghost" size="sm" onClick={() => openDocument(d.id)} aria-label={`Download ${d.label ?? d.originalName}`}><Download />Download</Button>
    </li>
  );
}

export function MyDocuments({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["documents", "mine"], queryFn: () => api<DocumentItem[]>("/documents") });
  const groups = GROUPS.filter((g) => g.roles.includes(role));
  const items = q.data ?? [];

  return (
    <>
      <PageHeader title="Documents" description={role === "candidate" ? "Everything of yours in one place: contracts, payslips, your resume and what you've added." : "Your copies of contracts, and the proof you attached to payments."}
        actions={role === "candidate" ? <Button onClick={() => setOpen(true)}><Upload />Add document</Button> : undefined} />
      {q.isPending ? <div className="space-y-4"><Skeleton className="h-32 w-full rounded-[16px]" /><Skeleton className="h-32 w-full rounded-[16px]" /></div>
        : items.length === 0 ? <EmptyState icon={FolderOpen} title="No documents yet" description={role === "candidate" ? "Offer letters, contracts and payslips appear here automatically. You can also add your own." : "Contract copies appear here once a contract takes effect."} />
        : (
          <div className="space-y-5">
            {groups.map((g) => {
              const rows = items.filter((d) => g.types.includes(d.type));
              if (rows.length === 0) return null;
              return (
                <Card key={g.key}>
                  <CardHeader title={g.title} description={g.description} />
                  <CardBody><ul className="divide-y divide-divider">{rows.map((d) => <Row key={d.id} d={d} role={role} />)}</ul></CardBody>
                </Card>
              );
            })}
          </div>
        )}
      {role === "candidate" && <UploadDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
