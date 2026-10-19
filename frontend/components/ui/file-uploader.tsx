"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Click-or-drop file field. Validates size/type on the client for fast feedback; the server re-checks the real bytes. */
export function FileUploader({ accept = ".pdf,.doc,.docx", maxMB = 5, label, hint, current, onUpload, id }: {
  accept?: string; maxMB?: number; label: string; hint?: string; id?: string;
  current?: { name: string; size?: number } | null; onUpload: (file: File) => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string>();
  const [over, setOver] = useState(false);

  const handle = async (file?: File) => {
    if (!file) return;
    const exts = accept.split(",");
    if (!exts.some((e) => file.name.toLowerCase().endsWith(e.trim()))) { setState("error"); return setError(`Choose a ${exts.join(", ").replace(/\./g, "").toUpperCase()} file`); }
    if (file.size > maxMB * 1024 * 1024) { setState("error"); return setError(`Files must be under ${maxMB} MB`); }
    setState("uploading"); setError(undefined);
    try { await onUpload(file); setState("idle"); } catch (e) { setState("error"); setError(e instanceof ApiError ? e.message : "Upload failed. Please try again."); }
    if (input.current) input.current.value = "";
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
        className={cn("flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4 transition-colors", over ? "border-primary bg-background-2" : "border-border", state === "error" && "border-danger/50")}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background-2 text-secondary-green">
          {state === "uploading" ? <Loader2 className="size-5 animate-spin" /> : current ? <CheckCircle2 className="size-5 text-success" /> : <UploadCloud className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {current ? <p className="flex items-center gap-1.5 truncate text-xs text-foreground-2"><FileText className="size-3.5" />{current.name}{current.size ? ` · ${fmtSize(current.size)}` : ""}</p>
            : <p className="text-xs text-muted">{hint ?? `${accept.replace(/\./g, "").toUpperCase().replace(/,/g, ", ")} · up to ${maxMB} MB`}</p>}
        </div>
        <button type="button" onClick={() => input.current?.click()} disabled={state === "uploading"}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-background-2 disabled:opacity-50">{current ? "Replace" : "Choose file"}</button>
        <input ref={input} id={id} type="file" accept={accept} className="sr-only" onChange={(e) => handle(e.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
