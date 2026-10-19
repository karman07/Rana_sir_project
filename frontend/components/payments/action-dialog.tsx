"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export interface DialogField { name: string; label: string; kind?: "text" | "money" | "number" | "select" | "textarea"; options?: string[]; optional?: boolean; hint?: string; initial?: string; placeholder?: string }

/** A small form in a modal: collects a few fields, then hands the values to `onSubmit`. */
export function ActionDialog({ open, onOpenChange, title, description, fields, submitLabel, destructive, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; fields: DialogField[]; submitLabel: string; destructive?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
}) {
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? (f.kind === "select" ? f.options?.[0] ?? "" : "")]));
  const [v, setV] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setV(initial()); }, [open]);
  const ready = fields.every((f) => f.optional || (v[f.name] ?? "").trim().length >= (f.kind === "textarea" ? 3 : 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSubmit(v); onOpenChange(false); } catch { /* the caller shows the error */ } finally { setBusy(false); } }}>
          {fields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} hint={f.hint ?? (f.optional ? "Optional" : undefined)}>
              {f.kind === "select" ? <Select id={`f-${f.name}`} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>{f.options?.map((o) => <option key={o}>{o}</option>)}</Select>
                : f.kind === "textarea" ? <Textarea id={`f-${f.name}`} value={v[f.name]} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                : <Input id={`f-${f.name}`} inputMode={f.kind === "money" || f.kind === "number" ? "decimal" : undefined} value={v[f.name]} placeholder={f.placeholder}
                    onChange={(e) => setV({ ...v, [f.name]: f.kind === "money" || f.kind === "number" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })} />}
            </Field>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant={destructive ? "danger" : "primary"} loading={busy} disabled={!ready}>{submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
