import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Base {
  label: string;
  value: string;
  icon?: LucideIcon;
  delta?: { value: string; direction: "up" | "down"; good?: boolean };
  hint?: string;
  href?: string;
}

/** Plain metric. */
export function StatCard({ label, value, icon: Icon, delta, hint, href }: Base) {
  const body = (
    <Card className={cn("p-5", href && "transition-colors hover:border-secondary-green/40")}>
      <div className="flex items-center justify-between text-sm text-foreground-2">
        <span>{label}</span>
        {Icon && <Icon className="size-4 text-muted" />}
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", (delta.good ?? delta.direction === "up") ? "text-success" : "text-danger")}>
            {delta.direction === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {delta.value}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Needs-attention metric: forest-green tile for action queues. */
export function AttentionCard({ label, value, icon: Icon, hint, href }: Base) {
  const body = (
    <div className="rounded-[16px] bg-primary p-5 text-primary-foreground shadow-card">
      <div className="flex items-center justify-between text-sm opacity-80">
        <span>{label}</span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="mt-2 text-[32px] font-semibold leading-none tabular-nums">{value}</div>
      {hint && <div className="mt-2 text-xs opacity-70">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Financial metric: gold hairline. Gold is reserved for money. */
export function MoneyCard({ label, value, hint, delta }: Pick<Base, "label" | "value" | "hint" | "delta">) {
  return (
    <Card className="relative p-5">
      <span className="absolute inset-y-5 left-0 w-0.5 rounded-full bg-gold" />
      <div className="text-sm text-foreground-2">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        {delta && <span className={cn("font-medium", delta.direction === "up" ? "text-success" : "text-danger")}>{delta.value}</span>}
        {hint}
      </div>
    </Card>
  );
}
