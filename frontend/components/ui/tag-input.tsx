"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Type and press Enter or comma to add; Backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder, id, max = 30, className }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; max?: number; className?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((n) => n.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p.slice(0, 80));
    onChange(next);
    setDraft("");
  };
  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 focus-within:border-secondary-green focus-within:ring-2 focus-within:ring-ring/25", className)}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-background-2 px-2 py-0.5 text-sm">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="text-muted hover:text-foreground"><X className="size-3" /></button>
        </span>
      ))}
      <input
        id={id} value={draft} placeholder={value.length ? "" : placeholder}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted"
      />
    </div>
  );
}
