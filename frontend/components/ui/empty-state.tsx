import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: {
  icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border px-6 py-14 text-center", className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-background-2 text-secondary-green">
        <Icon className="size-5" />
      </div>
      <h3 className="font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-foreground-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
