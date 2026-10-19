"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiList, apiPost, ApiError } from "@/lib/api";
import { money, periodLabel, roleStage, type PaymentItem } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionDialog } from "@/components/payments/action-dialog";

/** The month-by-month payments of one contract, with Admin able to add one by hand. */
export function ContractPayments({ contractId, role, hourly }: { contractId: string; role: "admin" | "recruiter"; hourly: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["payments", "contract", contractId], queryFn: () => apiList<PaymentItem>(`/payments?contractId=${contractId}&limit=24&sort=-period`) });
  const add = useMutation({
    mutationFn: (v: Record<string, string>) => apiPost("/payments/generate", { contractId, period: v.period, hoursWorked: v.hours ? Number(v.hours) : undefined }),
    onSuccess: () => { toast.success("Payment created"); qc.invalidateQueries({ queryKey: ["payments"] }); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Could not create it"); throw e; },
  });
  const month = new Date().toISOString().slice(0, 7);
  return (
    <Card>
      <CardHeader title="Payments" description="One per month. Created automatically once a month is over." action={role === "admin" ? <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Plus />Add</Button> : undefined} />
      <CardBody>
        {!q.data ? <p className="text-sm text-muted">Loading…</p> : q.data.items.length === 0 ? <p className="text-sm text-foreground-2">No payments yet.</p> : (
          <ul className="divide-y divide-divider">
            {q.data.items.map((p) => (
              <li key={p.id}>
                <Link href={`/${role}/payments/${p.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:text-primary">
                  <span className="w-20 font-medium">{periodLabel(p.period)}</span>
                  <span className="font-mono text-xs text-muted">{p.paymentNumber}</span>
                  <span className="ml-auto tabular-nums">{money(role === "admin" ? p.gross : p.amountDue, p.currency)}</span>
                  <StatusBadge status={p.status} label={roleStage(role, p.status)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <ActionDialog open={open} onOpenChange={setOpen} title="Add a payment" description="Creates the payment for one month of this contract." submitLabel="Create payment"
        fields={[{ name: "period", label: "Month (YYYY-MM)", initial: month, placeholder: "2026-11" }, ...(hourly ? [{ name: "hours", label: "Hours worked", kind: "number" as const, optional: true, hint: "Leave blank to use the contract's weekly hours" }] : [])]}
        onSubmit={(v) => add.mutateAsync(v)} />
    </Card>
  );
}
