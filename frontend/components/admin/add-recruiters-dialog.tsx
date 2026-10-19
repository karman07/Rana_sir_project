"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, Trash2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const row = z.object({
  name: z.string().min(2, "Name required"),
  email: z.email("Valid email required"),
  agencyName: z.string().optional(),
});
const schema = z.object({ recruiters: z.array(row).min(1).max(50) });
type Values = z.infer<typeof schema>;

interface Result { ok: boolean; email: string; error?: string; inviteUrl?: string; recruiter?: { name: string } }
interface BulkResponse { created: number; failed: number; results: Result[] }

const blank = { name: "", email: "", agencyName: "" };

export function AddRecruitersDialog() {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState<BulkResponse | null>(null);
  const qc = useQueryClient();
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: { recruiters: [blank, blank] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "recruiters" });

  const create = useMutation({
    mutationFn: (v: Values) => apiPost<BulkResponse>("/recruiters/bulk", { recruiters: v.recruiters.map((r) => ({ ...r, agencyName: r.agencyName || undefined })) }),
    onSuccess: (res) => {
      setResponse(res);
      qc.invalidateQueries({ queryKey: ["recruiters"] });
      if (res.created) toast.success(`${res.created} recruiter${res.created > 1 ? "s" : ""} created`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not create recruiters"),
  });

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) { setResponse(null); reset({ recruiters: [blank, blank] }); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild><Button><UserPlus />Add recruiters</Button></DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        title={response ? "Recruiters created" : "Add recruiters"}
        description={response ? "Share each invite link with its recruiter. They set their own password; links expire in 7 days." : "Accounts you create are approved immediately. Each recruiter receives an invite to set a password."}
      >
        {response ? (
          <div className="space-y-2">
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {response.results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  {r.ok ? <Check className="size-4 shrink-0 text-success" /> : <XCircle className="size-4 shrink-0 text-danger" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.recruiter?.name ?? r.email}</p>
                    <p className="truncate text-xs text-muted">{r.ok ? r.email : r.error}</p>
                  </div>
                  {r.inviteUrl && (
                    <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(r.inviteUrl!); toast.success("Invite link copied"); }}>
                      <Copy />Copy link
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2"><Button onClick={() => close(false)}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3" noValidate>
            <div className="hidden grid-cols-[1fr_1fr_1fr_2rem] gap-2 px-1 text-xs font-medium text-muted sm:grid"><span>Full name</span><span>Email</span><span>Agency (optional)</span><span /></div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {fields.map((f, i) => (
                <div key={f.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_2rem]">
                  <div><Input placeholder="Full name" aria-label="Full name" aria-invalid={!!errors.recruiters?.[i]?.name} {...register(`recruiters.${i}.name`)} /></div>
                  <div><Input type="email" placeholder="name@agency.com" aria-label="Email" aria-invalid={!!errors.recruiters?.[i]?.email} {...register(`recruiters.${i}.email`)} /></div>
                  <div><Input placeholder="Agency" aria-label="Agency" {...register(`recruiters.${i}.agencyName`)} /></div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove row" disabled={fields.length === 1} onClick={() => remove(i)}><Trash2 /></Button>
                </div>
              ))}
            </div>
            {errors.recruiters && <p className="text-xs text-danger">Fill in a valid name and email on every row, or remove empty rows.</p>}
            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="ghost" size="sm" disabled={fields.length >= 50} onClick={() => append(blank)}><Plus />Add another</Button>
              <Button type="submit" loading={create.isPending}>Create {fields.length} recruiter{fields.length > 1 ? "s" : ""}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
