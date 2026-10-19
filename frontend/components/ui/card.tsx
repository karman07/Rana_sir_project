import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[16px] border border-border bg-card shadow-card", className)} {...props} />;
}
export function CardHeader({ title, description, action, className }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 p-5 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-foreground-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5 pt-2", className)} {...props} />
);
