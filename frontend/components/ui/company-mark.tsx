import { assetUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A company's logo when it has one, otherwise a clean initial tile. */
export function CompanyMark({ name, logoUrl, className }: { name?: string; logoUrl?: string; className?: string }) {
  if (logoUrl) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5", className)}>
        <img src={assetUrl(logoUrl)} alt={name ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
      </span>
    );
  }
  return <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground", className)} aria-hidden>{name?.[0]}</span>;
}
