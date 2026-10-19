"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Minus, ShieldCheck, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

type Access = "yes" | "own" | "approved" | "none";
interface Group { area: string; rows: { capability: string; note?: string; admin: Access; recruiter: Access; candidate: Access }[] }

const LABEL: Record<Access, string> = { yes: "Yes", own: "Their own", approved: "After approval", none: "No" };
function Cell({ v }: { v: Access }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", v === "none" ? "text-muted" : v === "yes" ? "text-success" : "text-foreground-2")}>
      {v === "yes" ? <Check className="size-4" aria-hidden /> : v === "none" ? <Minus className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
      <span>{LABEL[v]}</span>
    </span>
  );
}

export function RolesMatrix() {
  const q = useQuery({ queryKey: ["settings", "permissions"], queryFn: () => api<{ groups: Group[] }>("/settings/permissions") });
  return (
    <>
      <Link href="/admin/settings" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Settings</Link>
      <PageHeader title="Roles & permissions" description="Who can do what. These rules are built into the platform and checked on every request, so they can't be bypassed from a screen." />
      <p className="mb-5 flex items-start gap-2 rounded-xl bg-background-2 px-4 py-3 text-sm text-foreground-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />&ldquo;Their own&rdquo; means only the records that belong to that person. &ldquo;After approval&rdquo; means once you have approved their account.</p>
      {!q.data ? <Skeleton className="h-96 w-full rounded-[16px]" /> : (
        <div className="space-y-5">
          {q.data.groups.map((g) => (
            <Card key={g.area}>
              <CardHeader title={g.area} />
              <CardBody className="overflow-x-auto p-0">
                <table className="w-full min-w-[40rem] text-left">
                  <thead><tr className="text-xs uppercase tracking-wider text-muted"><th className="px-5 pb-2 font-medium">What</th><th className="px-3 pb-2 font-medium">Admin</th><th className="px-3 pb-2 font-medium">Recruiter</th><th className="px-3 pb-2 font-medium">Candidate</th></tr></thead>
                  <tbody>{g.rows.map((r) => (
                    <tr key={r.capability} className="border-t border-divider align-top">
                      <th scope="row" className="px-5 py-3 text-sm font-medium">{r.capability}{r.note && <span className="mt-0.5 block text-xs font-normal text-muted">{r.note}</span>}</th>
                      <td className="px-3 py-3"><Cell v={r.admin} /></td><td className="px-3 py-3"><Cell v={r.recruiter} /></td><td className="px-3 py-3"><Cell v={r.candidate} /></td>
                    </tr>))}</tbody>
                </table>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
