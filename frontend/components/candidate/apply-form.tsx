"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES, formatMoney, fromMinor, toMinor } from "@rms/shared";
import { api, apiPost, apiUpload, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FileUploader } from "@/components/ui/file-uploader";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/feedback/error-state";
import { Lock } from "lucide-react";
import type { CandidateJob } from "./job-card";

interface Me {
  user: { name: string; currency?: string };
  profile: { expectedSalary?: { amount: number; currency: string }; noticePeriodDays?: number };
  resume: { id: string; originalName: string; size: number } | null;
}
interface Doc { id: string; originalName: string; size: number }
interface FormValues { salary: string; currency: string; notice: string; coverLetter: string; relevantInfo: string }

const isResumeLabel = (l: string) => /^(resume|cv|curriculum vitae)$/i.test(l.trim());
const docType = (label: string) => (/passport|\bid\b|aadhaar|license|licence|national/i.test(label) ? "IDENTIFICATION" : /certificate|degree|diploma|transcript/i.test(label) ? "CERTIFICATE" : "OTHER");

export function ApplyForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useSession();
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api<CandidateJob>(`/jobs/${jobId}`) });
  const me = useQuery({ queryKey: ["candidate", "me"], queryFn: () => api<Me>("/candidates/me") });

  const required = useMemo(() => (job.data?.spec.details?.requiredDocuments ?? []).filter((l) => !isResumeLabel(l)), [job.data]);
  const jobCurrency = job.data?.spec.compensation?.currency;
  const defaults = useMemo<FormValues>(() => {
    const es = me.data?.profile.expectedSalary;
    const cur = es?.currency ?? jobCurrency ?? user?.currency ?? "USD";
    return { salary: es ? String(fromMinor(es.amount, es.currency)) : "", currency: cur, notice: me.data?.profile.noticePeriodDays != null ? String(me.data.profile.noticePeriodDays) : "", coverLetter: "", relevantInfo: "" };
  }, [me.data, jobCurrency, user?.currency]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ values: defaults });
  const [docs, setDocs] = useState<Record<string, Doc>>({});

  const uploadResume = async (file: File) => { await apiUpload("/candidates/me/resume", file); await qc.invalidateQueries({ queryKey: ["candidate", "me"] }); toast.success("Resume uploaded"); };
  const uploadDoc = (label: string) => async (file: File) => {
    const d = await apiUpload<Doc>("/documents", file, { type: docType(label), label });
    setDocs((p) => ({ ...p, [label]: d }));
  };

  const submit = useMutation({
    mutationFn: (v: FormValues) => apiPost<{ id: string }>("/applications", {
      jobId, coverLetter: v.coverLetter || undefined, relevantInfo: v.relevantInfo || undefined,
      noticePeriodDays: v.notice !== "" ? Number(v.notice) : undefined,
      expectedSalary: v.salary !== "" ? { amount: toMinor(Number(v.salary), v.currency), currency: v.currency } : undefined,
      documents: required.filter((l) => docs[l]).map((l) => ({ label: l, documentId: docs[l].id })),
    }),
    onSuccess: (a) => {
      for (const k of ["jobs", "job", "applications"]) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Application submitted. We'll keep you updated by email.");
      router.replace(`/candidate/applications/${a.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "ALREADY_APPLIED") toast.error("You've already applied to this job");
      else toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not submit. Please try again.");
    },
  });

  if (job.isPending || me.isPending) return <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96 w-full rounded-[16px]" /></div>;
  if (job.isError) return <ErrorState compact variant={job.error instanceof ApiError && job.error.status === 404 ? "not-found" : "server"} onRetry={() => job.refetch()} />;
  if (me.isError) return <ErrorState compact variant="server" onRetry={() => me.refetch()} />;
  const j = job.data, resume = me.data.resume;

  if (j.application) {
    return <EmptyState icon={Lock} title="You've already applied to this job" description="You can follow its progress from your applications."
      action={<Button asChild><Link href={`/candidate/applications/${j.application.id}`}>View application</Link></Button>} />;
  }
  const missingDocs = required.filter((l) => !docs[l]);
  const canSubmit = !!resume && missingDocs.length === 0;

  return (
    <form onSubmit={handleSubmit((v) => submit.mutate(v))} noValidate className="mx-auto max-w-2xl space-y-5 pb-24">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href={`/candidate/jobs/${jobId}`}><ArrowLeft />Back to job</Link></Button>
        <h1 className="text-2xl font-semibold tracking-tight">Apply for {j.spec.title}</h1>
        <p className="mt-1 text-sm text-foreground-2">{j.company.name} · {j.spec.location}</p>
      </div>

      <Card>
        <CardHeader title="Resume" description="Required. Our team and the hiring company will see this." />
        <CardBody>
          <FileUploader label={resume ? "Your resume" : "Upload your resume"} current={resume ? { name: resume.originalName, size: resume.size } : null} onUpload={uploadResume} />
        </CardBody>
      </Card>

      {required.length > 0 && (
        <Card>
          <CardHeader title="Documents" description="This job asks for the following. Each must be attached." />
          <CardBody className="space-y-3">
            {required.map((l) => (
              <FileUploader key={l} label={l} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" current={docs[l] ? { name: docs[l].originalName, size: docs[l].size } : null} onUpload={uploadDoc(l)} />
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="About your application" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Expected salary (per year)" htmlFor="salary" hint={j.spec.compensation?.salaryMin !== undefined && jobCurrency ? `This role pays ${formatMoney({ amount: j.spec.compensation.salaryMin, currency: jobCurrency }).replace(/\.00$/, "")} – ${formatMoney({ amount: j.spec.compensation.salaryMax ?? 0, currency: jobCurrency }).replace(/\.00$/, "")}` : undefined} error={errors.salary?.message}>
              <Input id="salary" inputMode="decimal" {...register("salary", { pattern: { value: /^\d*\.?\d{0,2}$/, message: "Numbers only" } })} />
            </Field>
            <Field label="Currency" htmlFor="currency"><Select id="currency" {...register("currency")}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <Field label="Notice period (days)" htmlFor="notice" error={errors.notice?.message}><Input id="notice" inputMode="numeric" {...register("notice", { pattern: { value: /^\d*$/, message: "Whole days only" } })} /></Field>
          <Field label="Cover letter" htmlFor="cover" hint="Optional"><Textarea id="cover" rows={5} maxLength={5000} {...register("coverLetter")} /></Field>
          <Field label="Anything else we should know?" htmlFor="info" hint="Optional"><Textarea id="info" rows={3} maxLength={3000} {...register("relevantInfo")} /></Field>
        </CardBody>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="text-sm text-foreground-2">{!resume ? "Upload your resume to continue" : missingDocs.length ? `Attach: ${missingDocs.join(", ")}` : "Ready to submit"}</p>
          <Button type="submit" size="lg" disabled={!canSubmit} loading={submit.isPending}><Send />Submit application</Button>
        </div>
      </div>
    </form>
  );
}
