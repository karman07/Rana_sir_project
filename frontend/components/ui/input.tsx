import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted transition-colors hover:border-secondary-green/50 focus-visible:border-secondary-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, "h-9", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, "min-h-24 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(field, "h-9 pr-8", className)} {...props} />,
);
Select.displayName = "Select";

/** Native date input styled like the rest of the fields (swap for a calendar popover later if needed). */
export const DatePicker = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  (props, ref) => <Input ref={ref} type="date" {...props} />,
);
DatePicker.displayName = "DatePicker";

export function Field({
  label, hint, error, children, htmlFor,
}: { label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
