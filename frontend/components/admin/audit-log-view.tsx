"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";
import { api, apiList } from "@/lib/api";
import { formatDateTime, humanizeAction, type AuditEntry } from "@/lib/audit";
import { DataTable } from "@/components/data/data-table";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";

const json = (v: unknown) => JSON.stringify(v, null, 2);

function StateBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <pre className="overflow-x-auto rounded-lg bg-background-2 p-3 text-xs leading-relaxed">{json(value)}</pre>
    </div>
  );
}

export function AuditLogView() {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const actions = useQuery({ queryKey: ["audit", "actions"], queryFn: () => api<string[]>("/audit-logs/actions") });
  const list = useQuery({
    queryKey: ["audit", "list", action, from],
    queryFn: () => apiList<AuditEntry>(`/audit-logs?limit=100${action ? `&action=${action}` : ""}${from ? `&from=${new Date(from).toISOString()}` : ""}`),
  });

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(() => [
    { accessorKey: "createdAt", header: "When", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm text-foreground-2">{formatDateTime(getValue() as string)}</span> },
    { accessorKey: "actorName", header: "Actor", cell: ({ row: { original: e } }) => (
      <div><p className="font-medium">{e.actorName ?? "System"}</p><p className="text-xs text-muted">{e.actorRole.toLowerCase()}</p></div>) },
    { accessorKey: "action", header: "Action", cell: ({ getValue }) => <span className="font-medium">{humanizeAction(getValue() as string)}</span> },
    { accessorKey: "entityType", header: "Entity", cell: ({ row: { original: e } }) => (
      <div><p>{e.entityType}</p><p className="font-mono text-xs text-muted">{e.entityId.slice(-8)}</p></div>) },
    { accessorKey: "reason", header: "Reason", cell: ({ getValue }) => <span className="line-clamp-1 max-w-64 text-sm text-foreground-2">{(getValue() as string) || "—"}</span> },
  ], []);

  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of every important action. Entries cannot be edited or deleted." />
      <DataTable
        data={list.data?.items ?? []}
        columns={columns}
        loading={list.isPending}
        searchPlaceholder="Search actor, action, entity or reason…"
        exportName="audit-log"
        pageSize={15}
        onRowClick={setSelected}
        empty={{ title: "No activity recorded yet", description: "Actions such as approvals, contract changes and payments will appear here as they happen." }}
        filters={
          <>
            <Select aria-label="Filter by action" className="w-auto min-w-44" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.data?.map((a) => <option key={a} value={a}>{humanizeAction(a)}</option>)}
            </Select>
            <Input aria-label="From date" type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          </>
        }
        renderCard={(e) => (
          <button onClick={() => setSelected(e)} className="w-full rounded-xl border border-border bg-card p-4 text-left">
            <p className="font-medium">{humanizeAction(e.action)}</p>
            <p className="text-sm text-foreground-2">{e.actorName ?? "System"} · {formatDateTime(e.createdAt)}</p>
          </button>
        )}
      />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DrawerContent title={humanizeAction(selected.action)} description={formatDateTime(selected.createdAt)}>
            <div className="space-y-5 text-sm">
              <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-secondary-green" /><span>Immutable record</span></div>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-2">
                <dt className="text-muted">Actor</dt><dd>{selected.actorName ?? "System"} <StatusBadge status={selected.actorRole} tone="neutral" /></dd>
                <dt className="text-muted">Entity</dt><dd>{selected.entityType} <span className="font-mono text-xs text-muted">{selected.entityId}</span></dd>
                {selected.reason && (<><dt className="text-muted">Reason</dt><dd>{selected.reason}</dd></>)}
              </dl>
              <StateBlock label="Before" value={selected.previousState} />
              <StateBlock label="After" value={selected.newState} />
              <StateBlock label="Details" value={selected.metadata} />
            </div>
          </DrawerContent>
        )}
      </Dialog>
    </>
  );
}
