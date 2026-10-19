"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, ExternalLink } from "lucide-react";
import { apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { TYPE_LABEL, fileSize, openDocument, relatedHref, type DocumentItem } from "@/lib/documents";
import { DataTable } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "", label: "All" }, { key: "CONTRACT", label: "Contracts" }, { key: "OFFER_LETTER", label: "Offers" }, { key: "PAYSLIP", label: "Payslips" },
  { key: "RESUME", label: "Resumes" }, { key: "PAYMENT_PROOF", label: "Payment proof" }, { key: "OTHER_GROUP", label: "Other" },
];

export function AdminDocuments() {
  const [tab, setTab] = useState("");
  const [archived, setArchived] = useState(false);
  const path = `/documents/all?limit=100${tab && tab !== "OTHER_GROUP" ? `&type=${tab}` : ""}${archived ? "&status=ARCHIVED" : ""}`;
  const list = useQuery({ queryKey: ["documents", "all", tab, archived], queryFn: () => apiList<DocumentItem>(path) });
  const items = tab === "OTHER_GROUP" ? (list.data?.items ?? []).filter((d) => ["IDENTIFICATION", "CERTIFICATE", "COVER_LETTER", "OTHER", "INTERVIEW"].includes(d.type)) : list.data?.items ?? [];

  const columns = useMemo<ColumnDef<DocumentItem, unknown>[]>(() => [
    { id: "file", header: "File", accessorFn: (d) => d.label ?? d.originalName, cell: ({ row: { original: d } }) => <div className="min-w-0"><p className="truncate text-sm font-medium">{d.label ?? d.originalName}</p><p className="truncate text-xs text-muted">{fileSize(d.size)}{d.version > 1 ? ` · v${d.version}` : ""}</p></div> },
    { accessorKey: "type", header: "Type", cell: ({ getValue }) => <span className="text-sm">{TYPE_LABEL[getValue() as string] ?? (getValue() as string)}</span> },
    { id: "owner", header: "Owner", accessorFn: (d) => d.owner?.name ?? "", cell: ({ row: { original: d } }) => <div className="min-w-0"><p className="truncate text-sm">{d.owner?.name}</p><p className="truncate text-xs text-muted">{d.owner?.role?.toLowerCase()}</p></div> },
    { id: "for", header: "Belongs to", enableSorting: false, cell: ({ row: { original: d } }) => { const h = relatedHref(d, "admin"); return h ? <Link href={h} onClick={(e) => e.stopPropagation()} className="text-sm text-primary hover:underline">Contract</Link> : <span className="text-sm text-muted">—</span>; } },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() === "ARCHIVED" ? "CLOSED" : "ACTIVE"} label={getValue() === "ARCHIVED" ? "Earlier version" : "Current"} /> },
    { accessorKey: "createdAt", header: "Added", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm text-foreground-2">{formatDateTime(getValue() as string)}</span> },
    { id: "actions", header: "", enableSorting: false, cell: ({ row: { original: d } }) => (
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={() => openDocument(d.id, { inline: true })} aria-label={`View ${d.label ?? d.originalName}`}><ExternalLink /></Button>
        <Button variant="ghost" size="sm" onClick={() => openDocument(d.id)} aria-label={`Download ${d.label ?? d.originalName}`}><Download /></Button>
      </div>) },
  ], []);

  return (
    <>
      <PageHeader title="Documents" description="Every file in the system. Candidates and recruiters only ever see their own." />
      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:text-foreground")}>{t.label}</button>)}
        <label className="ml-auto flex items-center gap-2 text-sm text-foreground-2"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-4 accent-[var(--primary)]" />Earlier versions only</label>
      </div>
      <DataTable data={items} columns={columns} loading={list.isPending} exportName="documents" searchPlaceholder="Search by name or file…"
        empty={{ title: "No documents here", description: "Files appear as candidates upload them and as contracts and payslips are issued." }}
        renderCard={(d) => <Card className="p-4"><p className="font-medium">{d.label ?? d.originalName}</p><p className="text-sm text-foreground-2">{TYPE_LABEL[d.type]} · {d.owner?.name}</p></Card>} />
    </>
  );
}
