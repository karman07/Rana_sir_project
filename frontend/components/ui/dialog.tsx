"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/50 backdrop-blur-[2px]" />;
}

/** Centered modal. */
export function DialogContent({ title, description, children, className }: {
  title: string; description?: string; children?: React.ReactNode; className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-border bg-card p-6 shadow-card", className)}>
        <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className={cn("mt-1 text-sm text-foreground-2", !description && "sr-only")}>{description ?? title}</DialogPrimitive.Description>
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-background-2 hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side drawer. `side` defaults to right; used for contextual detail panels and the mobile nav. */
export function DrawerContent({ title, description, children, side = "right", className }: {
  title: string; description?: string; children?: React.ReactNode; side?: "left" | "right"; className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-0 z-50 flex h-full w-[min(92vw,26rem)] flex-col border-border bg-card shadow-card",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-divider p-5">
          <div>
            <DialogPrimitive.Title className="font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className={cn("mt-0.5 text-sm text-foreground-2", !description && "sr-only")}>{description ?? title}</DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-background-2" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
