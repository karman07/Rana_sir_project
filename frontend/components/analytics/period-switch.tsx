"use client";

import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/reports";
import { cn } from "@/lib/utils";

/** One row of choices above the charts; the choice applies to everything on the page. */
export function PeriodSwitch({ value, onChange }: { value: PeriodKey; onChange: (p: PeriodKey) => void }) {
  return (
    <div role="radiogroup" aria-label="Time period" className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
      {PERIOD_OPTIONS.map((o) => (
        <button key={o.key} role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={cn("rounded-md px-3 py-1.5 transition-colors", value === o.key ? "bg-primary text-primary-foreground" : "text-foreground-2 hover:text-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}
