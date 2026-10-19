"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiUpload, ApiError } from "@/lib/api";
import { assetUrl } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Image value that is either an uploaded asset path or a pasted https URL. */
export function ImageField({ value, onChange, label, hint }: { value: string; onChange: (v: string) => void; label: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) return void toast.error("Use a PNG, JPG or WebP image");
    if (file.size > 4 * 1024 * 1024) return void toast.error("Images must be under 4 MB");
    setBusy(true);
    try { const r = await apiUpload<{ url: string }>("/site-content/assets", file); onChange(r.url); toast.success("Image uploaded"); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Upload failed"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background-2">
          {value ? <img src={assetUrl(value)} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-muted" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}{value ? "Replace" : "Upload"}</Button>
          {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}><Trash2 />Remove</Button>}
        </div>
        <input ref={input} type="file" accept=".png,.jpg,.jpeg,.webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      <Input aria-label={`${label} URL`} placeholder="…or paste an image address (https://…)" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
