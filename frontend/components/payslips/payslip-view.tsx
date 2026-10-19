"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ShieldCheck, TriangleAlert } from "lucide-react";
import { api, documentUrl, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/contracts";
import { money, periodLabel } from "@/lib/payments";
import type { PayslipDetail } from "@/lib/payslips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";

export function PayslipView({ id, role }: { id: string; role: "admin" | "candidate" }) {
  const q = useQuery({ queryKey: ["payslip", id], queryFn: () => api<PayslipDetail>(`/payslips/${id}`) });
  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96 w-full max-w-2xl rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const p = q.data, d = p.data, cur = d.currency;

  return (
    <>
      <Link href={`/${role}/payslips`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Payslips</Link>
      <PageHeader title={`${p.payslipNumber} · ${periodLabel(p.period)}`} description={role === "admin" ? `${d.candidate.name} · ${d.jobTitle}` : `${d.jobTitle} at ${d.company}`}
        actions={p.pdfDocumentId ? <Button asChild><a href={documentUrl(p.pdfDocumentId)}><Download />Download PDF</a></Button> : undefined} />

      {/* The payslip as a page, matching the PDF. */}
      <article className="max-w-2xl overflow-hidden rounded-[16px] border border-border bg-card shadow-card" aria-label={`Payslip ${p.payslipNumber}`}>
        <header className="flex items-start justify-between bg-[#173b2f] px-7 py-6 text-[#f7f4ec]">
          <p className="text-xl font-semibold tracking-tight">Talentbridge<span className="text-[#b89a5a]">.</span></p>
          <div className="text-right"><p className="text-xs tracking-[0.2em]">PAYSLIP</p><p className="mt-1 text-xs text-[#d0b477]">{p.payslipNumber}</p></div>
        </header>
        <div className="space-y-6 px-7 py-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Pay for {periodLabel(p.period)}</h2>
            <p className="mt-1 text-sm text-foreground-2">{formatDate(d.periodStart)} – {formatDate(d.periodEnd)} · Issued {formatDate(d.issuedOn)}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Paid to</p><p className="text-sm font-medium">{d.candidate.name}</p><p className="text-sm text-foreground-2">{d.candidate.email}</p></div>
            <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Engagement</p><p className="text-sm font-medium">{d.jobTitle}</p><p className="text-sm text-foreground-2">{d.company}</p><p className="text-sm text-foreground-2">{d.contractNumber} (v{d.contractVersion})</p></div>
          </div>
          <div className="border-y border-divider py-4">
            <div className="mb-3 flex justify-between text-xs font-medium uppercase tracking-wider text-muted"><span>Description</span><span>Amount</span></div>
            {d.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-4 py-1.5 text-sm"><div><p>{l.label}</p>{l.detail && <p className="text-xs text-muted">{l.detail}</p>}</div><p className="tabular-nums">{money(l.amount, cur)}</p></div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-background-2 px-5 py-4"><p className="text-xs font-medium uppercase tracking-wider text-muted">Net pay</p><p className="text-2xl font-semibold tabular-nums text-primary">{money(d.netPay, cur)}</p></div>
          <dl className="grid gap-1.5 text-sm sm:grid-cols-[6rem_1fr]">
            <dt className="text-muted">Paid on</dt><dd>{formatDate(d.payment.paidOn)}</dd>
            <dt className="text-muted">Method</dt><dd>{d.payment.method ?? "—"}</dd>
            <dt className="text-muted">Reference</dt><dd className="font-mono text-xs">{d.payment.reference ?? "—"}</dd>
          </dl>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-7 py-3 text-xs text-muted">
          <span>A permanent record. Later contract changes never alter it.</span>
          <span className={p.verified ? "flex items-center gap-1.5 text-success" : "flex items-center gap-1.5 text-danger"}>
            {p.verified ? <ShieldCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}{p.verified ? "Verified" : "Does not match its record"} · {p.verificationCode}
          </span>
        </footer>
      </article>
    </>
  );
}
