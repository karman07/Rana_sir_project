"use client";

import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@rms/shared";
import { api } from "@/lib/api";
import { humanize } from "@/lib/applications";
import { scoreTone, type CompareColumn } from "@/lib/screening";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreBar } from "./score-bar";

/** The best value in a row is highlighted so differences are obvious at a glance. */
function best(vals: (number | null)[], higher = true) {
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  return higher ? Math.max(...nums) : Math.min(...nums);
}

export function CompareDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const q = useQuery({ queryKey: ["compare", ids.join(",")], queryFn: () => api<{ columns: CompareColumn[] }>(`/screening/compare?ids=${ids.join(",")}`) });
  const cols = q.data?.columns ?? [];

  const rows: { label: string; render: (c: CompareColumn) => React.ReactNode; hi?: (c: CompareColumn) => number | null; higher?: boolean }[] = [
    { label: "Job match", render: (c) => <ScoreBar value={c.match.overall} />, hi: (c) => c.match.overall },
    { label: "Admin score", render: (c) => <span className={cn("font-semibold", scoreTone(c.adminScore))}>{c.adminScore ?? "—"}</span>, hi: (c) => c.adminScore },
    { label: "Resume score", render: (c) => <span className={cn("font-semibold", scoreTone(c.resumeScore))}>{c.resumeScore ?? "—"}</span>, hi: (c) => c.resumeScore },
    { label: "Skills match", render: (c) => <ScoreBar value={c.match.skills.percent} />, hi: (c) => c.match.skills.percent },
    { label: "Experience", render: (c) => (c.experienceYears !== null ? `${c.experienceYears} yrs` : "—"), hi: (c) => c.experienceYears },
    { label: "Expected salary", render: (c) => (c.expectedSalary ? formatMoney(c.expectedSalary).replace(/\.00$/, "") : "—") },
    { label: "Notice period", render: (c) => (c.noticePeriodDays !== null ? `${c.noticePeriodDays} days` : "—"), hi: (c) => c.noticePeriodDays, higher: false },
    { label: "Skills", render: (c) => (
      <div className="flex flex-wrap gap-1">
        {c.skills.slice(0, 10).map((s) => <span key={s} className={cn("rounded px-1.5 py-0.5 text-xs", c.match.skills.matched.some((m) => m.toLowerCase() === s.toLowerCase() || s.toLowerCase().includes(m.toLowerCase())) ? "bg-success/12 text-success" : "bg-background-2")}>{s}</span>)}
        {c.match.skills.missing.map((s) => <span key={s} className="rounded border border-dashed border-danger/40 px-1.5 py-0.5 text-xs text-danger">missing: {s}</span>)}
      </div>) },
    { label: "Education", render: (c) => (c.education.length ? <ul className="space-y-1">{c.education.map((e) => <li key={e}>{e}</li>)}</ul> : "—") },
    { label: "Tags", render: (c) => (c.tags.length ? c.tags.join(", ") : "—") },
    { label: "Status", render: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[16px] border border-border bg-card p-6 shadow-card">
          <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">Compare candidates</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-foreground-2">The strongest value in each row is highlighted.</DialogPrimitive.Description>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-background-2" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
          {q.isPending ? <Skeleton className="h-72 w-full" /> : q.isError ? <p className="text-sm text-danger">Couldn&apos;t load the comparison.</p> : (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr><th className="w-32" />
                  {cols.map((c) => (
                    <th key={c.id} className="px-3 pb-4 text-left align-bottom font-normal">
                      <div className="flex items-center gap-2"><Avatar name={c.candidate.name} size={36} /><div><p className="font-semibold">{c.candidate.name}</p><p className="text-xs text-muted">{c.candidate.headline ?? c.job.title}</p></div></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.hi ? best(cols.map(r.hi), r.higher ?? true) : null;
                  return (
                    <tr key={r.label} className="border-t border-divider">
                      <td className="py-3 pr-3 align-top text-xs font-medium uppercase tracking-wide text-muted">{r.label}</td>
                      {cols.map((c) => (
                        <td key={c.id} className={cn("px-3 py-3 align-top", b !== null && r.hi!(c) === b && "bg-success/6")}>{r.render(c)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted">{cols[0] && humanize(cols[0].status) ? "Job match is a rules-based guide (skills, experience, salary). Your score decides." : ""}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
