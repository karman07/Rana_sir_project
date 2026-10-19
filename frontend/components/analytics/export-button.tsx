"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportUrl, type PeriodKey } from "@/lib/reports";
import { Button } from "@/components/ui/button";

/** Download this data as a spreadsheet. What is in the file depends on who you are, the same as on the pages. */
export function ExportButton({ dataset, period, status, label = "Export" }: { dataset: string; period?: PeriodKey; status?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}><Download />{label}<ChevronDown className="size-3.5" /></Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-card">
          <a role="menuitem" href={exportUrl(dataset, "xlsx", period, status)} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-background-2"><FileSpreadsheet className="size-4 text-foreground-2" />Excel (.xlsx)</a>
          <a role="menuitem" href={exportUrl(dataset, "csv", period, status)} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-background-2"><FileText className="size-4 text-foreground-2" />CSV</a>
        </div>
      )}
    </div>
  );
}
