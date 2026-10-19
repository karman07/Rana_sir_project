"use client";

import Link from "next/link";
import { Briefcase, Building2, Check, ExternalLink, FileQuestion, KeyRound, MessageSquareWarning, Pencil, Undo2, UserCheck, UsersRound, X, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type ApprovalActionKey = "approve" | "reject" | "request-changes";
export interface ApprovalItem {
  id: string; category: string; categoryLabel: string; itemLabel: string; entityId: string; title: string; subtitle?: string;
  requester?: { id?: string; name: string; role: string }; related?: { type: string; label: string; href?: string };
  href?: string; submittedAt: string; priority: "HIGH" | "MEDIUM" | "NORMAL"; waitingDays: number; tags?: string[]; actions: ApprovalActionKey[];
}

const ICON: Record<string, LucideIcon> = { JOB_REQUEST: Briefcase, RECRUITER_ACCOUNT: UserCheck, COMPANY: Building2, COMPANY_LINK: KeyRound, RECRUITER_DECISION: Undo2, JOB_CHANGE: Pencil, CANDIDATE_REQUEST: UsersRound };
const PRIORITY = {
  HIGH: { label: "High priority", cls: "bg-danger/12 text-danger" },
  MEDIUM: { label: "Medium", cls: "bg-warning/14 text-warning" },
  NORMAL: { label: "New", cls: "bg-background-2 text-foreground-2" },
};

export const waitingLabel = (days: number) => (days <= 0 ? "Today" : days === 1 ? "1 day" : `${days} days`);

/** One thing waiting on Admin, with its decision buttons always visible (never buried in a menu). */
export function ApprovalCard({ item, busy, onAction }: { item: ApprovalItem; busy?: boolean; onAction: (item: ApprovalItem, action: ApprovalActionKey) => void }) {
  const Icon = ICON[item.category] ?? FileQuestion;
  const p = PRIORITY[item.priority];
  return (
    <Card className={cn("p-4 sm:p-5", item.priority === "HIGH" && "border-danger/30")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-2 text-secondary-green"><Icon className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{item.itemLabel}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", p.cls)}>{p.label}</span>
              {item.tags?.map((t) => <span key={t} className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">{t}</span>)}
            </div>
            <h3 className="mt-1 truncate text-[15px] font-semibold tracking-tight">{item.title}</h3>
            {item.subtitle && <p className="truncate text-sm text-foreground-2">{item.subtitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {item.requester && <span className="flex items-center gap-1.5"><Avatar name={item.requester.name} size={18} />{item.requester.name}</span>}
              {item.related && (item.related.href ? <Link href={item.related.href} className="hover:text-foreground">{item.related.type}: {item.related.label}</Link> : <span>{item.related.type}: {item.related.label}</span>)}
              <span title={new Date(item.submittedAt).toLocaleString()}>Waiting {waitingLabel(item.waitingDays)}</span>
              <StatusBadge status="PENDING_REVIEW" className="py-0" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {item.actions.includes("approve") && <Button size="sm" disabled={busy} onClick={() => onAction(item, "approve")}><Check />Approve</Button>}
          {item.actions.includes("request-changes") && <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction(item, "request-changes")}><MessageSquareWarning />Request changes</Button>}
          {item.actions.includes("reject") && <Button size="sm" variant="outlineDanger" disabled={busy} onClick={() => onAction(item, "reject")}><X />Reject</Button>}
          {item.href && <Button asChild size="sm" variant="ghost"><Link href={item.href}>Review<ExternalLink /></Link></Button>}
        </div>
      </div>
    </Card>
  );
}
