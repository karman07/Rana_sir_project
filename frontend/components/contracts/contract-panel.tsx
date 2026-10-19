"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, FileSignature } from "lucide-react";
import { toMinor } from "@rms/shared";
import { apiList } from "@/lib/api";
import type { ApplicationDetail } from "@/lib/applications";
import type { ContractListItem, ContractTerms, PayPeriod } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ContractFormDialog } from "./contract-form-dialog";

/** Starting terms for a new contract: the job's own pay basis and hours, and what the candidate asked for when it fits. */
function prefill(a: ApplicationDetail): Partial<ContractTerms> {
  const s = a.jobSpec, comp = s?.compensation;
  const cur = comp?.currency ?? a.expectedSalary?.currency ?? "USD";
  const period: PayPeriod = comp?.payBasis === "HOUR" ? "HOUR" : "MONTH";
  const expected = a.expectedSalary && a.expectedSalary.currency === cur ? a.expectedSalary.amount : undefined;
  // Candidates state yearly pay; for a monthly job turn that into a month. For hourly jobs start from the bottom of the range.
  const amount = period === "MONTH" && expected ? Math.round(expected / 12) : comp?.salaryMin;
  return {
    title: s?.title ?? a.job.title ?? "", employmentType: s?.employmentType ?? "PART_TIME",
    salary: { amount: amount ?? toMinor(0, cur), currency: cur, period, hoursPerWeek: period === "HOUR" ? comp?.hoursPerWeek : undefined },
    workingHours: s?.contract?.workingHours, probationMonths: s?.contract?.probationMonths, noticePeriodDays: a.noticePeriodDays ?? s?.contract?.noticePeriodDays,
    startDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
  } as Partial<ContractTerms>;
}

/** Shown on a selected candidate's application: start the contract, or jump to the one that exists. */
export function ContractPanel({ application: a, role }: { application: ApplicationDetail; role: "admin" | "recruiter" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const eligible = a.status === "SELECTED" || a.status === "CONTRACT" || a.status === "PLACED";
  const existing = useQuery({ queryKey: ["contracts", "for-application", a.id], enabled: eligible, queryFn: () => apiList<ContractListItem>(`/contracts?applicationId=${a.id}&limit=1`) });
  const initial = useMemo(() => prefill(a), [a]);
  if (!eligible || existing.isPending) return null;
  const c = existing.data?.items[0];

  return (
    <Card className="mb-6 border-primary/25 bg-primary/[0.03]">
      <CardBody className="flex flex-wrap items-center gap-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><FileSignature className="size-5" /></span>
        <div className="min-w-0 flex-1">
          {c ? (
            <>
              <p className="font-medium">Contract {c.contractNumber}</p>
              <p className="flex items-center gap-2 text-sm text-foreground-2"><StatusBadge status={c.status} /></p>
            </>
          ) : (
            <>
              <p className="font-medium">{a.candidate?.name} has been selected</p>
              <p className="text-sm text-foreground-2">Draft the contract: pay, dates and working terms. Everyone approves it before it starts.</p>
            </>
          )}
        </div>
        {c ? <Button asChild variant="secondary"><Link href={`/${role}/contracts/${c.id}`}>Open contract</Link></Button> : <Button onClick={() => setOpen(true)}><FilePlus2 />Draft contract</Button>}
      </CardBody>
      {open && <ContractFormDialog open onOpenChange={setOpen} mode={{ kind: "create", applicationId: a.id }} initial={initial} isAdmin={role === "admin"} onDone={(id) => id && router.push(`/${role}/contracts/${id}`)} />}
    </Card>
  );
}
