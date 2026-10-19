"use client";

import { useState } from "react";
import { Dialog, DialogClose, DialogContent } from "./dialog";
import { Button } from "./button";

export function ConfirmationDialog({
  trigger, title, description, confirmLabel = "Confirm", destructive, onConfirm,
}: {
  trigger: React.ReactNode; title: string; description: string; confirmLabel?: string;
  destructive?: boolean; onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button
            variant={destructive ? "danger" : "primary"}
            loading={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } finally { setBusy(false); } }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
