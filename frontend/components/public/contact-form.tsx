"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Mail, MapPin, Clock } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.email("Enter a valid email"),
  company: z.string().max(120),
  topic: z.enum(["HIRING", "CANDIDATE", "GENERAL"]),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(3000),
});
type V = z.infer<typeof schema>;

export function ContactForm() {
  const topic = useSearchParams().get("topic");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema), defaultValues: { name: "", email: "", company: "", message: "", topic: topic === "HIRING" || topic === "CANDIDATE" ? topic : "GENERAL" },
  });

  const submit = handleSubmit(async (v) => {
    setError(undefined);
    try { await apiPost("/public/contact", { ...v, company: v.company || undefined }); setDone(true); }
    catch (e) { setError(e instanceof ApiError ? (e.status === 429 ? "You've sent a few messages already. Please try again in a minute." : (e.details?.[0] ?? e.message)) : "Something went wrong. Please try again."); }
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <Card className="p-6 sm:p-8">
        {done ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto mb-4 size-10 text-success" />
            <h2 className="text-xl font-semibold tracking-tight">Thanks — we&apos;ve got your message</h2>
            <p className="mx-auto mt-2 max-w-sm text-foreground-2">Someone from our team will get back to you, usually within one business day.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="c-name" error={errors.name?.message}><Input id="c-name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} /></Field>
              <Field label="Email" htmlFor="c-email" error={errors.email?.message}><Input id="c-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} /></Field>
              <Field label="Company" htmlFor="c-company" hint="Optional"><Input id="c-company" autoComplete="organization" {...register("company")} /></Field>
              <Field label="I'm contacting you about" htmlFor="c-topic"><Select id="c-topic" {...register("topic")}><option value="HIRING">Hiring talent</option><option value="CANDIDATE">Finding a job</option><option value="GENERAL">Something else</option></Select></Field>
            </div>
            <Field label="How can we help?" htmlFor="c-msg" error={errors.message?.message}><Textarea id="c-msg" rows={6} aria-invalid={!!errors.message} {...register("message")} /></Field>
            {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" size="lg" loading={isSubmitting}>Send message</Button>
          </form>
        )}
      </Card>
      <aside className="space-y-5 text-sm">
        {[[Clock, "Reply time", "Usually within one business day."], [Mail, "Hiring?", "Tell us the role, location and timeline and we'll suggest the quickest route to the right people."], [MapPin, "Job seekers", "Questions about an application? Sign in and check its status first — it shows what happens next."]].map(([Icon, title, body]) => {
          const I = Icon as typeof Mail;
          return <div key={title as string} className="flex gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background-2 text-secondary-green"><I className="size-4" /></span><div><p className="font-medium">{title as string}</p><p className="text-foreground-2">{body as string}</p></div></div>;
        })}
      </aside>
    </div>
  );
}
