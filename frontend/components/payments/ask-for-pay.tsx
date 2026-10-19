"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { money, periodLabel } from "@/lib/payments";
import { formatWhen } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";

interface Mine { id: string; period: string; job?: string; requestedAt: string; note?: string; amount: number; currency: string; stage: string; canConfirm: boolean }

/** The candidate asks for their pay. The recruiter and our team are told, the company releases it, and we forward it. */
export function AskForPay() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const q = useQuery({ queryKey: ["payments", "my-requests"], queryFn: () => api<Mine[]>("/payments/my-requests") });
  const refresh = () => { for (const k of ["payments", "salary"]) qc.invalidateQueries({ queryKey: [k] }); };
  const ask = useMutation({
    mutationFn: () => apiPost("/payments/request", { note: note.trim() || undefined }),
    onSuccess: () => { toast.success("Request sent. We've asked the company to release your pay."); setOpen(false); setNote(""); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send your request"),
  });
  const confirm = useMutation({
    mutationFn: (id: string) => apiPost(`/payments/${id}/payout/confirm`),
    onSuccess: () => { toast.success("Thanks for confirming"); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not confirm"),
  });
  const items = q.data ?? [];
  return (
    <Card className="mb-5">
      <CardHeader title="Ask for your pay" description="Our team and the company are told straight away" action={<Button onClick={() => setOpen(true)}><HandCoins />Ask for my pay</Button>} />
      {items.length > 0 && (
        <CardBody>
          <ul className="divide-y divide-divider">
            {items.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0"><span className="block font-medium">{r.job} · {periodLabel(r.period)}</span><span className="block text-xs text-muted">Asked {formatWhen(r.requestedAt).date} · {money(r.amount, r.currency)}</span></span>
                <span className="flex items-center gap-2"><span className="rounded-full bg-background-2 px-2.5 py-1 text-xs font-medium">{r.stage}</span>
                  {r.canConfirm && <ConfirmationDialog title="Did you receive this pay?" description="Only confirm once the money is in your account." confirmLabel="Yes, I received it" onConfirm={() => confirm.mutateAsync(r.id).then(() => undefined)} trigger={<Button size="sm">Confirm received</Button>} />}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Ask for your pay" description="We ask the company to release it. Once it reaches us, we send it on to you.">
          <div className="space-y-4">
            <Field label="Anything we should know?" htmlFor="ask-note" hint="Optional, e.g. why you need it soon"><Textarea id="ask-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={ask.isPending} onClick={() => ask.mutate()}>Send request</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
