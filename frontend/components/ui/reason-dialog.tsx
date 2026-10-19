"use client";

import { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent } from "./dialog";
import { Textarea } from "./input";

/** Modal that collects a required note before a decision (reject / request changes). */
export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onSubmit, optional, placeholder = "Explain what's needed…" }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel: string;
  destructive?: boolean; optional?: boolean; placeholder?: string; onSubmit: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const close = (o: boolean) => { onOpenChange(o); if (!o) setNote(""); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={title} description={description}>
        <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label="Note" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
          <Button variant={destructive ? "danger" : "primary"} loading={busy} disabled={!optional && note.trim().length < 3}
            onClick={async () => { setBusy(true); try { await onSubmit(note.trim()); close(false); } catch { /* caller shows the error */ } finally { setBusy(false); } }}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
