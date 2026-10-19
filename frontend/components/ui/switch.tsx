"use client";

import { cn } from "@/lib/utils";

/** An on/off toggle that works with the keyboard and announces its state. */
export function Switch({ checked, onCheckedChange, label, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onCheckedChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50", checked ? "border-primary bg-primary" : "border-border bg-background-2", className)}
    >
      <span className={cn("inline-block size-4.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[1.35rem]" : "translate-x-0.5")} />
    </button>
  );
}
