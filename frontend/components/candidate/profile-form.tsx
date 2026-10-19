"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES, fromMinor, toMinor } from "@rms/shared";
import { api, apiUpload, documentUrl, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FileUploader } from "@/components/ui/file-uploader";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/ui/tag-input";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";

interface Me {
  user: { name: string; email: string; phone?: string; country?: string; currency?: string; emailVerified: boolean };
  profile: {
    headline?: string; about?: string; currentTitle?: string; location?: string; skills: string[]; experienceYears?: number;
    expectedSalary?: { amount: number; currency: string }; noticePeriodDays?: number;
    experience: { company: string; title: string; startDate?: string; endDate?: string; current?: boolean; description?: string }[];
    education: { institution: string; degree: string; field?: string; startYear?: number; endYear?: number }[];
  };
  resume: { id: string; originalName: string; size: number } | null;
}

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  phone: z.string().max(30),
  country: z.string().refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), "Use a 2-letter country code, e.g. IN"),
  headline: z.string().max(140), currentTitle: z.string().max(140), about: z.string().max(3000), location: z.string().max(140),
  skills: z.array(z.string()),
  experienceYears: z.string().refine((v) => v === "" || /^\d{1,2}$/.test(v), "Whole years"),
  salary: z.string().refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Numbers only"),
  currency: z.string(),
  notice: z.string().refine((v) => v === "" || /^\d{1,3}$/.test(v), "Whole days"),
  experience: z.array(z.object({ company: z.string().trim().min(1, "Required"), title: z.string().trim().min(1, "Required"), startDate: z.string(), endDate: z.string(), current: z.boolean(), description: z.string().max(1500) })),
  education: z.array(z.object({ institution: z.string().trim().min(1, "Required"), degree: z.string().trim().min(1, "Required"), field: z.string(), startYear: z.string().refine((v) => v === "" || /^\d{4}$/.test(v), "YYYY"), endYear: z.string().refine((v) => v === "" || /^\d{4}$/.test(v), "YYYY") })),
});
type V = z.infer<typeof schema>;

const toValues = (m: Me, fallbackCurrency: string): V => ({
  name: m.user.name, phone: m.user.phone ?? "", country: m.user.country ?? "",
  headline: m.profile.headline ?? "", currentTitle: m.profile.currentTitle ?? "", about: m.profile.about ?? "", location: m.profile.location ?? "",
  skills: m.profile.skills ?? [], experienceYears: m.profile.experienceYears != null ? String(m.profile.experienceYears) : "",
  salary: m.profile.expectedSalary ? String(fromMinor(m.profile.expectedSalary.amount, m.profile.expectedSalary.currency)) : "",
  currency: m.profile.expectedSalary?.currency ?? m.user.currency ?? fallbackCurrency, notice: m.profile.noticePeriodDays != null ? String(m.profile.noticePeriodDays) : "",
  experience: (m.profile.experience ?? []).map((e) => ({ company: e.company, title: e.title, startDate: e.startDate ?? "", endDate: e.endDate ?? "", current: !!e.current, description: e.description ?? "" })),
  education: (m.profile.education ?? []).map((e) => ({ institution: e.institution, degree: e.degree, field: e.field ?? "", startYear: e.startYear ? String(e.startYear) : "", endYear: e.endYear ? String(e.endYear) : "" })),
});

const BLANK: V = { name: "", phone: "", country: "", headline: "", currentTitle: "", about: "", location: "", skills: [], experienceYears: "", salary: "", currency: "USD", notice: "", experience: [], education: [] };

export function ProfileForm() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["candidate", "me"], queryFn: () => api<Me>("/candidates/me") });
  const { register, control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<V>({ resolver: zodResolver(schema) as never, defaultValues: BLANK });
  const exp = useFieldArray({ control, name: "experience" });
  const edu = useFieldArray({ control, name: "education" });
  useEffect(() => { if (q.data) reset(toValues(q.data, "USD")); }, [q.data, reset]);

  const save = useMutation({
    mutationFn: (v: V) => api<Me>("/candidates/me", {
      method: "PATCH",
      body: JSON.stringify({
        name: v.name, phone: v.phone || undefined, country: v.country || undefined, headline: v.headline, currentTitle: v.currentTitle, about: v.about, location: v.location,
        skills: v.skills, experienceYears: v.experienceYears !== "" ? Number(v.experienceYears) : undefined,
        expectedSalary: v.salary !== "" ? { amount: toMinor(Number(v.salary), v.currency), currency: v.currency } : undefined,
        noticePeriodDays: v.notice !== "" ? Number(v.notice) : undefined,
        experience: v.experience.map((e) => ({ company: e.company, title: e.title, startDate: e.startDate || undefined, endDate: e.current ? undefined : e.endDate || undefined, current: e.current, description: e.description || undefined })),
        education: v.education.map((e) => ({ institution: e.institution, degree: e.degree, field: e.field || undefined, startYear: e.startYear ? Number(e.startYear) : undefined, endYear: e.endYear ? Number(e.endYear) : undefined })),
      }),
    }),
    onSuccess: (m) => { qc.setQueryData(["candidate", "me"], m); qc.invalidateQueries({ queryKey: ["overview"] }); toast.success("Profile saved"); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save your profile"),
  });
  const uploadResume = async (file: File) => { await apiUpload("/candidates/me/resume", file); await qc.invalidateQueries({ queryKey: ["candidate", "me"] }); toast.success("Resume uploaded"); };

  if (q.isPending) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-48" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full rounded-[16px]" />)}</div>;
  if (q.isError) return <ErrorState compact variant="server" onRetry={() => q.refetch()} />;
  const err = (m?: { message?: string }) => m?.message;

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="mx-auto max-w-3xl space-y-5 pb-24">
      <PageHeader title="Your profile" description="Keep this up to date — it's what our team and hiring companies see." />

      <Card>
        <CardHeader title="Resume" description="Used for every application. Uploading a new one keeps the old versions on file." />
        <CardBody className="space-y-2">
          <FileUploader label={q.data.resume ? "Your resume" : "Upload your resume"} current={q.data.resume ? { name: q.data.resume.originalName, size: q.data.resume.size } : null} onUpload={uploadResume} />
          {q.data.resume && <a className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" href={documentUrl(q.data.resume.id, true)} target="_blank" rel="noreferrer"><FileText className="size-4" />Preview current resume</a>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Basics" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={err(errors.name)}><Input id="name" {...register("name")} /></Field>
          <Field label="Email" htmlFor="email"><Input id="email" value={q.data.user.email} disabled readOnly /></Field>
          <Field label="Phone" htmlFor="phone" error={err(errors.phone)}><Input id="phone" type="tel" {...register("phone")} /></Field>
          <Field label="Country" htmlFor="country" hint="2-letter code, e.g. IN, US, GB" error={err(errors.country)}><Input id="country" maxLength={2} className="uppercase" {...register("country")} /></Field>
          <Field label="Headline" htmlFor="headline"><Input id="headline" placeholder="Full-stack engineer with 5 years in fintech" {...register("headline")} /></Field>
          <Field label="Current role" htmlFor="currentTitle"><Input id="currentTitle" {...register("currentTitle")} /></Field>
          <div className="sm:col-span-2"><Field label="Location" htmlFor="location"><Input id="location" placeholder="Bengaluru, India" {...register("location")} /></Field></div>
          <div className="sm:col-span-2"><Field label="About you" htmlFor="about"><Textarea id="about" rows={4} {...register("about")} /></Field></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Skills & preferences" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Skills" htmlFor="skills" hint="Press Enter after each skill"><Controller control={control} name="skills" render={({ field }) => <TagInput id="skills" value={field.value} onChange={field.onChange} placeholder="React, Node.js, SQL…" />} /></Field></div>
          <Field label="Years of experience" htmlFor="years" error={err(errors.experienceYears)}><Input id="years" inputMode="numeric" {...register("experienceYears")} /></Field>
          <Field label="Notice period (days)" htmlFor="notice" error={err(errors.notice)}><Input id="notice" inputMode="numeric" {...register("notice")} /></Field>
          <div className="grid grid-cols-[1fr_6rem] gap-2 sm:col-span-2">
            <Field label="Expected salary (per year)" htmlFor="salary" error={err(errors.salary)}><Input id="salary" inputMode="decimal" {...register("salary")} /></Field>
            <Field label="Currency" htmlFor="currency"><Select id="currency" {...register("currency")}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Experience" action={<Button type="button" variant="secondary" size="sm" onClick={() => exp.append({ company: "", title: "", startDate: "", endDate: "", current: false, description: "" })}><Plus />Add</Button>} />
        <CardBody className="space-y-4">
          {exp.fields.length === 0 && <p className="text-sm text-foreground-2">Add your past roles to help us match you.</p>}
          {exp.fields.map((f, i) => (
            <div key={f.id} className="space-y-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" htmlFor={`e-c-${i}`} error={err(errors.experience?.[i]?.company)}><Input id={`e-c-${i}`} {...register(`experience.${i}.company`)} /></Field>
                <Field label="Title" htmlFor={`e-t-${i}`} error={err(errors.experience?.[i]?.title)}><Input id={`e-t-${i}`} {...register(`experience.${i}.title`)} /></Field>
                <Field label="Start" htmlFor={`e-s-${i}`}><Input id={`e-s-${i}`} type="month" {...register(`experience.${i}.startDate`)} /></Field>
                <Field label="End" htmlFor={`e-e-${i}`}><Input id={`e-e-${i}`} type="month" {...register(`experience.${i}.endDate`)} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--primary)]" {...register(`experience.${i}.current`)} />I currently work here</label>
              <Field label="What you did" htmlFor={`e-d-${i}`}><Textarea id={`e-d-${i}`} rows={2} {...register(`experience.${i}.description`)} /></Field>
              <Button type="button" variant="ghost" size="sm" onClick={() => exp.remove(i)}><Trash2 />Remove</Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Education" action={<Button type="button" variant="secondary" size="sm" onClick={() => edu.append({ institution: "", degree: "", field: "", startYear: "", endYear: "" })}><Plus />Add</Button>} />
        <CardBody className="space-y-4">
          {edu.fields.length === 0 && <p className="text-sm text-foreground-2">Add your education.</p>}
          {edu.fields.map((f, i) => (
            <div key={f.id} className="space-y-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Institution" htmlFor={`d-i-${i}`} error={err(errors.education?.[i]?.institution)}><Input id={`d-i-${i}`} {...register(`education.${i}.institution`)} /></Field>
                <Field label="Degree" htmlFor={`d-d-${i}`} error={err(errors.education?.[i]?.degree)}><Input id={`d-d-${i}`} {...register(`education.${i}.degree`)} /></Field>
                <Field label="Field of study" htmlFor={`d-f-${i}`}><Input id={`d-f-${i}`} {...register(`education.${i}.field`)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From" htmlFor={`d-s-${i}`} error={err(errors.education?.[i]?.startYear)}><Input id={`d-s-${i}`} inputMode="numeric" placeholder="YYYY" {...register(`education.${i}.startYear`)} /></Field>
                  <Field label="To" htmlFor={`d-e-${i}`} error={err(errors.education?.[i]?.endYear)}><Input id={`d-e-${i}`} inputMode="numeric" placeholder="YYYY" {...register(`education.${i}.endYear`)} /></Field>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => edu.remove(i)}><Trash2 />Remove</Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-sm text-foreground-2">{isDirty ? "You have unsaved changes" : "All changes saved"}</p>
          <Button type="submit" loading={save.isPending} disabled={!isDirty}><Save />Save profile</Button>
        </div>
      </div>
    </form>
  );
}
