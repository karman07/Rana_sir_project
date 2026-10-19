"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Building2, MessageSquareWarning, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES } from "@rms/shared";
import { api, apiPost, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { PAY_BASIS_LABEL, PAY_BASIS_SUFFIX, PAY_FREQUENCY_LABEL, type PayFrequency, type PayBasis, EMPLOYMENT_LABEL, EMPLOYMENT_TYPES, WORK_MODE_LABEL, WORK_MODES, compact, emptyForm, formToSpec, specToForm, type JobFormValues, type JobRequest } from "@/lib/jobs";
import { Stepper } from "@/components/data/stepper";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/ui/tag-input";

const intStr = (label: string, required = false) =>
  z.string().refine((v) => (v === "" ? !required : /^\d+$/.test(v)), required ? `${label} is required` : `${label} must be a whole number`);
const moneyStr = (label: string) => z.string().refine((v) => v !== "" && /^\d+(\.\d{1,2})?$/.test(v), `${label} is required (numbers only)`);

const schema = z
  .object({
    companyId: z.string().min(1, "Choose a company"),
    title: z.string().trim().min(2, "Enter a job title"),
    department: z.string(),
    location: z.string().trim().min(2, "Enter a location"),
    workMode: z.string().min(1, "Choose remote, hybrid or on-site"),
    employmentType: z.string().min(1, "Choose an employment type"),
    openings: intStr("Openings", true).refine((v) => Number(v) >= 1, "At least 1 opening"),
    experienceMin: intStr("Minimum experience", true),
    experienceMax: intStr("Maximum experience"),
    education: z.string(),
    technicalSkills: z.array(z.string()).min(1, "Add at least one technical skill"),
    softSkills: z.array(z.string()), certifications: z.array(z.string()), languages: z.array(z.string()),
    currency: z.string().min(1, "Choose a currency"),
    salaryMin: moneyStr("Minimum salary"), salaryMax: moneyStr("Maximum salary"),
    benefits: z.array(z.string()), bonus: z.string(), payBasis: z.string(), payFrequency: z.string(), hoursPerWeek: z.string(),
    durationMonths: intStr("Duration"), probationMonths: intStr("Probation"), workingHours: z.string(),
    noticePeriodDays: intStr("Notice period"), renewalTerms: z.string(),
    description: z.string().trim().min(30, "Describe the role in at least 30 characters"),
    responsibilities: z.string().trim().min(1, "List the main responsibilities"),
    requirementsText: z.string(), specialInstructions: z.string(), requiredDocuments: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const issue = (path: keyof JobFormValues, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.experienceMax !== "" && v.experienceMin !== "" && Number(v.experienceMax) < Number(v.experienceMin)) issue("experienceMax", "Can't be below the minimum");
    if (v.salaryMin && v.salaryMax && Number(v.salaryMax) < Number(v.salaryMin)) issue("salaryMax", "Can't be below the minimum");
    if ((v.employmentType === "CONTRACT" || v.employmentType === "TEMPORARY") && !v.durationMonths) issue("durationMonths", "Required for contract and temporary roles");
  });

const STEPS: { title: string; blurb: string; fields: FieldPath<JobFormValues>[] }[] = [
  { title: "Job", blurb: "What's the role and where is it?", fields: ["companyId", "title", "department", "location", "workMode", "employmentType", "openings"] },
  { title: "Requirements", blurb: "Who are you looking for?", fields: ["experienceMin", "experienceMax", "education", "technicalSkills", "softSkills", "certifications", "languages"] },
  { title: "Compensation", blurb: "What does the role pay?", fields: ["currency", "salaryMin", "salaryMax", "payBasis", "payFrequency", "hoursPerWeek", "benefits", "bonus"] },
  { title: "Contract", blurb: "Terms of employment.", fields: ["durationMonths", "probationMonths", "workingHours", "noticePeriodDays", "renewalTerms"] },
  { title: "Details", blurb: "The full picture for candidates and our team.", fields: ["description", "responsibilities", "requirementsText", "specialInstructions", "requiredDocuments"] },
];

interface Company { id: string; name: string; country?: string }

/** `changeFor` turns this into a request to edit an opening that is already live: nothing changes until Admin approves. */
/** `admin` is Admin reshaping an opening before it goes live: it saves in place (on the request, or on the approved job), with no resubmission. */
export function JobRequestForm({ initial, changeFor, admin }: { initial?: JobRequest; changeFor?: { jobId: string }; admin?: { jobId?: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useSession();
  const [step, setStep] = useState(0);
  const [requestId, setRequestId] = useState<string | undefined>(initial?.id);
  const [companyLocked] = useState(!!initial && initial.version > 0);
  const [reason, setReason] = useState("");
  const waiting = initial?.status === "PENDING_ADMIN_REVIEW"; // already with Admin: saving sends the new version straight back for review

  const companies = useQuery({ queryKey: ["companies", "usable"], queryFn: () => api<Company[]>("/companies/mine/usable"), enabled: !admin });
  const defaults = useMemo(() => (initial ? specToForm(initial, user?.currency ?? "USD") : emptyForm(user?.currency ?? "USD")), [initial, user?.currency]);
  const { register, control, handleSubmit, getValues, watch, trigger, setFocus, formState: { errors } } = useForm<JobFormValues>({
    resolver: zodResolver(schema) as never, defaultValues: defaults, mode: "onTouched",
  });

  const payBasis = watch("payBasis");

  const persist = useMutation({
    mutationFn: async () => {
      const v = getValues();
      if (admin) return api<JobRequest>(admin.jobId ? `/jobs/${admin.jobId}` : `/job-requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ spec: compact(formToSpec(v)) }) });
      if (!v.companyId) throw new Error("Choose a company first");
      const body = { companyId: v.companyId, spec: compact(formToSpec(v)) };
      if (requestId) return api<JobRequest>(`/job-requests/${requestId}`, { method: "PATCH", body: JSON.stringify(companyLocked ? { spec: body.spec } : body) });
      const created = await apiPost<JobRequest>("/job-requests", body);
      setRequestId(created.id);
      window.history.replaceState(null, "", `/recruiter/jobs/${created.id}/edit`);
      return created;
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : (e as Error).message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (admin) return persist.mutateAsync();
      if (changeFor) return apiPost<{ id: string }>(`/jobs/${changeFor.jobId}/change-requests`, { type: "EDIT", reason: reason.trim(), spec: compact(formToSpec(getValues())) });
      const saved = await persist.mutateAsync();
      if (waiting) return saved;
      return apiPost<JobRequest>(`/job-requests/${saved.id}/submit`);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["job-requests"] });
      qc.invalidateQueries({ queryKey: ["job-changes"] });
      if (admin) { toast.success("Changes saved"); qc.invalidateQueries({ queryKey: ["job-request"] }); qc.invalidateQueries({ queryKey: ["jobs"] }); router.push(`/admin/job-requests/${initial!.id}`); return; }
      if (changeFor) { toast.success("Request sent. The opening stays as it is until our team approves."); router.push(`/recruiter/jobs/${initial!.id}`); return; }
      toast.success(waiting ? "Updated. Our team will review the new version." : "Submitted for review. We'll email you when there's a decision.");
      router.push(`/recruiter/jobs/${r.id}`);
    },
  });

  const saveDraft = () => persist.mutate(undefined, { onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-requests"] }); toast.success("Draft saved"); } });

  const next = async () => {
    if (await trigger(STEPS[step].fields)) setStep((s) => s + 1);
  };
  const onSubmit = handleSubmit(
    () => { if (changeFor && reason.trim().length < 5) { toast.error("Tell us why you're making this change"); return; } submit.mutate(); },
    (errs) => {
      const first = STEPS.findIndex((s) => s.fields.some((f) => errs[f as keyof JobFormValues]));
      if (first >= 0) {
        setStep(first);
        const field = STEPS[first].fields.find((f) => errs[f as keyof JobFormValues]);
        if (field) setTimeout(() => setFocus(field), 50);
      }
      toast.error("Please fix the highlighted fields before submitting");
    },
  );

  const last = step === STEPS.length - 1;
  const note = initial?.status === "CHANGES_REQUESTED" ? [...initial.reviews].reverse().find((r) => r.action === "CHANGES_REQUESTED") : undefined;
  const err = (n: keyof JobFormValues) => errors[n]?.message as string | undefined;

  if (!admin && companies.isPending) return <Skeleton className="h-96 w-full rounded-[16px]" />;
  if (!admin && !companies.data?.length && !requestId) {
    return (
      <EmptyState icon={Building2} title="Add a client company first"
        description="You can post openings for companies our team has approved for you. Add one, and we'll review it — usually within a business day."
        action={<Button asChild><Link href="/recruiter/companies">Go to companies</Link></Button>} />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-5">
      {note && (
        <div className="flex gap-3 rounded-xl border border-gold/40 bg-gold-soft p-4 text-sm">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-gold" />
          <div><p className="font-medium">Changes requested by our team</p><p className="mt-1 whitespace-pre-line text-foreground-2">{note.note}</p></div>
        </div>
      )}
      <Stepper steps={STEPS.map((s) => s.title)} current={step} />

      <Card>
        <CardBody className="space-y-5 p-6">
          <div><h2 className="text-lg font-semibold tracking-tight">{STEPS[step].title}</h2><p className="text-sm text-foreground-2">{STEPS[step].blurb}</p></div>

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Client company" htmlFor="companyId" error={err("companyId")} hint={companyLocked ? "The company can't change after submission." : undefined}>
                  <Select id="companyId" disabled={companyLocked} aria-invalid={!!errors.companyId} {...register("companyId")}>
                    <option value="">Select a company…</option>
                    {(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {companyLocked && initial?.company && !(companies.data ?? []).some((c) => c.id === initial.companyId) && <option value={initial.companyId}>{initial.company.name}</option>}
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-2"><Field label="Job title" htmlFor="title" error={err("title")}><Input id="title" placeholder="Senior Backend Engineer" aria-invalid={!!errors.title} {...register("title")} /></Field></div>
              <Field label="Department" htmlFor="department" hint="Optional"><Input id="department" placeholder="Engineering" {...register("department")} /></Field>
              <Field label="Location" htmlFor="location" error={err("location")}><Input id="location" placeholder="Bengaluru, India" aria-invalid={!!errors.location} {...register("location")} /></Field>
              <Field label="Work mode" htmlFor="workMode" error={err("workMode")}>
                <Select id="workMode" aria-invalid={!!errors.workMode} {...register("workMode")}><option value="">Select…</option>{WORK_MODES.map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}</Select>
              </Field>
              <Field label="Employment type" htmlFor="employmentType" error={err("employmentType")}>
                <Select id="employmentType" aria-invalid={!!errors.employmentType} {...register("employmentType")}><option value="">Select…</option>{EMPLOYMENT_TYPES.map((m) => <option key={m} value={m}>{EMPLOYMENT_LABEL[m]}</option>)}</Select>
              </Field>
              <Field label="Number of openings" htmlFor="openings" error={err("openings")}><Input id="openings" inputMode="numeric" aria-invalid={!!errors.openings} {...register("openings")} /></Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum experience (years)" htmlFor="experienceMin" error={err("experienceMin")}><Input id="experienceMin" inputMode="numeric" aria-invalid={!!errors.experienceMin} {...register("experienceMin")} /></Field>
              <Field label="Maximum experience (years)" htmlFor="experienceMax" hint="Optional" error={err("experienceMax")}><Input id="experienceMax" inputMode="numeric" {...register("experienceMax")} /></Field>
              <div className="sm:col-span-2"><Field label="Education" htmlFor="education" hint="Optional"><Input id="education" placeholder="Bachelor's in Computer Science or equivalent" {...register("education")} /></Field></div>
              <div className="sm:col-span-2"><Field label="Technical skills" htmlFor="technicalSkills" hint="Press Enter after each skill" error={err("technicalSkills")}>
                <Controller control={control} name="technicalSkills" render={({ field }) => <TagInput id="technicalSkills" value={field.value} onChange={field.onChange} placeholder="Node.js, MongoDB…" />} /></Field></div>
              <div className="sm:col-span-2"><Field label="Soft skills" htmlFor="softSkills" hint="Optional"><Controller control={control} name="softSkills" render={({ field }) => <TagInput id="softSkills" value={field.value} onChange={field.onChange} placeholder="Communication, ownership…" />} /></Field></div>
              <Field label="Certifications" htmlFor="certifications" hint="Optional"><Controller control={control} name="certifications" render={({ field }) => <TagInput id="certifications" value={field.value} onChange={field.onChange} />} /></Field>
              <Field label="Languages" htmlFor="languages" hint="Optional"><Controller control={control} name="languages" render={({ field }) => <TagInput id="languages" value={field.value} onChange={field.onChange} placeholder="English, Hindi…" />} /></Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Currency" htmlFor="currency" error={err("currency")}>
                <Select id="currency" {...register("currency")}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
              </Field>
              <Field label="Pay is" htmlFor="payBasis"><Select id="payBasis" {...register("payBasis")}>{(Object.keys(PAY_BASIS_LABEL) as PayBasis[]).map((k) => <option key={k} value={k}>{PAY_BASIS_LABEL[k]}</option>)}</Select></Field>
              <Field label="Paid" htmlFor="payFrequency" hint="How often the person is paid"><Select id="payFrequency" {...register("payFrequency")}>{(Object.keys(PAY_FREQUENCY_LABEL) as PayFrequency[]).map((k) => <option key={k} value={k}>{PAY_FREQUENCY_LABEL[k]}</option>)}</Select></Field>
              {payBasis === "HOUR" && <Field label="Hours per week" htmlFor="hoursPerWeek" hint="Expected" error={err("hoursPerWeek")}><Input id="hoursPerWeek" inputMode="numeric" placeholder="20" {...register("hoursPerWeek")} /></Field>}
              <Field label={payBasis === "HOUR" ? "Minimum rate" : payBasis === "FIXED" ? "Minimum price" : "Minimum pay"} htmlFor="salaryMin" hint={PAY_BASIS_SUFFIX[payBasis as PayBasis] ?? ""} error={err("salaryMin")}><Input id="salaryMin" inputMode="decimal" aria-invalid={!!errors.salaryMin} {...register("salaryMin")} /></Field>
              <Field label={payBasis === "HOUR" ? "Maximum rate" : payBasis === "FIXED" ? "Maximum price" : "Maximum pay"} htmlFor="salaryMax" hint={PAY_BASIS_SUFFIX[payBasis as PayBasis] ?? ""} error={err("salaryMax")}><Input id="salaryMax" inputMode="decimal" aria-invalid={!!errors.salaryMax} {...register("salaryMax")} /></Field>
              <div className="sm:col-span-3"><Field label="Benefits" htmlFor="benefits" hint="Optional"><Controller control={control} name="benefits" render={({ field }) => <TagInput id="benefits" value={field.value} onChange={field.onChange} placeholder="Health insurance, paid leave…" />} /></Field></div>
              <div className="sm:col-span-3"><Field label="Bonus" htmlFor="bonus" hint="Optional"><Input id="bonus" placeholder="Bonus on completion, performance bonus…" {...register("bonus")} /></Field></div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contract duration (months)" htmlFor="durationMonths" hint="Required for contract roles" error={err("durationMonths")}><Input id="durationMonths" inputMode="numeric" {...register("durationMonths")} /></Field>
              <Field label="Probation (months)" htmlFor="probationMonths" hint="Optional" error={err("probationMonths")}><Input id="probationMonths" inputMode="numeric" {...register("probationMonths")} /></Field>
              <Field label="Working hours" htmlFor="workingHours" hint="Optional"><Input id="workingHours" placeholder="40 hours/week, Mon–Fri" {...register("workingHours")} /></Field>
              <Field label="Notice period (days)" htmlFor="noticePeriodDays" hint="Optional" error={err("noticePeriodDays")}><Input id="noticePeriodDays" inputMode="numeric" {...register("noticePeriodDays")} /></Field>
              <div className="sm:col-span-2"><Field label="Renewal terms" htmlFor="renewalTerms" hint="Optional"><Textarea id="renewalTerms" rows={3} {...register("renewalTerms")} /></Field></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Field label="Description" htmlFor="description" error={err("description")}><Textarea id="description" rows={5} aria-invalid={!!errors.description} {...register("description")} /></Field>
              <Field label="Responsibilities" htmlFor="responsibilities" error={err("responsibilities")}><Textarea id="responsibilities" rows={5} aria-invalid={!!errors.responsibilities} {...register("responsibilities")} /></Field>
              <Field label="Additional requirements" htmlFor="requirementsText" hint="Optional"><Textarea id="requirementsText" rows={3} {...register("requirementsText")} /></Field>
              <Field label="Required documents" htmlFor="requiredDocuments" hint="Candidates will be asked to upload these. Optional."><Controller control={control} name="requiredDocuments" render={({ field }) => <TagInput id="requiredDocuments" value={field.value} onChange={field.onChange} placeholder="Passport copy, degree certificate…" />} /></Field>
              <Field label="Special instructions for our team" htmlFor="specialInstructions" hint="Internal. Never shown to candidates."><Textarea id="specialInstructions" rows={3} {...register("specialInstructions")} /></Field>
            </div>
          )}
        </CardBody>
      </Card>

      {changeFor && last && (
        <Card><CardBody>
          <Field label="Why do you need this change?" htmlFor="changeReason" hint="Our team reads this before approving. Candidates keep seeing the current version until then."><Textarea id="changeReason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </CardBody></Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft />Back</Button>
        <div className="flex gap-2">
          {!changeFor && !waiting && !admin && <Button type="button" variant="secondary" loading={persist.isPending && !submit.isPending} onClick={saveDraft}><Save />Save draft</Button>}
          {last ? (
            <Button type="submit" loading={submit.isPending}><Send />{admin ? "Save changes" : changeFor ? "Send edit request" : waiting ? "Save and resend for review" : initial && initial.version > 0 ? "Resubmit for review" : "Submit for review"}</Button>
          ) : (
            <Button type="button" onClick={next}>Next<ArrowRight /></Button>
          )}
        </div>
      </div>
      {submit.isError && <p role="alert" className="text-sm text-danger">{submit.error instanceof ApiError ? (submit.error.details ?? [submit.error.message]).join(" · ") : (submit.error as Error).message}</p>}
    </form>
  );
}
