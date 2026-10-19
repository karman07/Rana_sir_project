"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Banknote, Building2, ChevronDown, ClipboardCheck, FileSignature, FileText, Handshake, History, Layers, MessagesSquare,
  Receipt, SearchCheck, Send, UserCheck, UsersRound,
} from "lucide-react";
import { apiList } from "@/lib/api";
import { compactCount } from "@/lib/public";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard, type CandidateJob } from "@/components/candidate/job-card";
import { cn } from "@/lib/utils";
import { usePublicStats } from "./hero";
import { HScroller } from "./h-scroller";
import { useAfterHydration, useSiteContent } from "@/lib/site";
import { Reveal } from "./reveal";

export function SectionHeading({ eyebrow, title, description, center = true }: { eyebrow?: string; title: string; description?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold">{eyebrow}</p>}
      <h2 className="text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-foreground-2 sm:text-lg">{description}</p>}
    </div>
  );
}

export const Section = ({ children, className, id, tone = "default" }: { children: React.ReactNode; className?: string; id?: string; tone?: "default" | "alt" | "dark" }) => (
  <section id={id} className={cn("py-20 sm:py-24", tone === "alt" && "bg-background-2/60", tone === "dark" && "bg-[#173b2f] text-[#f7f4ec]", className)}>
    <div className="mx-auto max-w-6xl px-5">{children}</div>
  </section>
);

/* ---------------- Departments + featured jobs ---------------- */

export function DepartmentChips() {
  const stats = usePublicStats();
  const deps = stats.data?.departments ?? [];
  if (!deps.length) return null;
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-2">
      {deps.map((d) => (
        <Link key={d.name} href={`/jobs?search=${encodeURIComponent(d.name)}`} className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground-2 transition-colors hover:border-secondary-green/50 hover:text-foreground">
          {d.name} <span className="ml-1 text-muted">{d.count}</span>
        </Link>
      ))}
    </div>
  );
}

export function FeaturedJobs() {
  const site = useSiteContent();
  const count = site.data?.featuredJobs.count ?? 10;
  const q = useQuery({ queryKey: ["public", "featured", count], queryFn: () => apiList<CandidateJob>(`/public/jobs?limit=${count}`), staleTime: 60_000, enabled: !!site.data });
  const f = site.data?.featuredJobs;
  const jobs = useAfterHydration(q.data);
  return (
    <Section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading center={false} eyebrow="Open roles" title={f?.title ?? "Roles open right now"} description={f?.subtitle} />
        <Button asChild variant="secondary"><Link href="/jobs">Browse all jobs<ArrowRight /></Link></Button>
      </div>
      <DepartmentChips />
      <div className="mt-8">
        {!jobs ? (
          <div className="flex gap-5 overflow-hidden">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 w-[380px] shrink-0 rounded-[16px]" />)}</div>
        ) : jobs.items.length ? (
          <HScroller label="Featured jobs">
            {jobs.items.map((j) => <div key={j.id} className="w-[300px] shrink-0 snap-start sm:w-[380px]"><JobCard job={j} publicMode /></div>)}
            <Link href="/jobs" className="flex w-[220px] shrink-0 snap-start flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border text-sm font-medium text-primary hover:bg-background-2"><ArrowRight className="size-6" />See every open job</Link>
          </HScroller>
        ) : (
          <p className="rounded-2xl border border-dashed border-border py-14 text-center text-foreground-2">New roles are published regularly. Check back soon, or create a profile and we&apos;ll let you know.</p>
        )}
      </div>
    </Section>
  );
}

export function Categories() {
  const site = useSiteContent();
  const c = site.data?.categories;
  if (!c?.enabled || !c.items.length) return null;
  return (
    <Section tone="alt">
      <SectionHeading center={false} eyebrow="Browse" title={c.title} />
      <div className="mt-8">
        <HScroller label="Job categories">
          {c.items.map((it) => (
            <Link key={it.label} href={`/jobs?search=${encodeURIComponent(it.query)}`} className="group flex h-44 w-[240px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-secondary-green/50">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">{it.label[0]}</span>
              <div><p className="font-semibold tracking-tight">{it.label}</p>{it.description && <p className="mt-1 line-clamp-2 text-xs text-foreground-2">{it.description}</p>}<p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">Browse jobs<ArrowRight className="size-3" /></p></div>
            </Link>
          ))}
        </HScroller>
      </div>
    </Section>
  );
}

export function Testimonials() {
  const site = useSiteContent();
  const t = site.data?.testimonials;
  if (!t?.enabled || !t.items.length) return null;
  return (
    <Section>
      <SectionHeading eyebrow="Testimonials" title={t.title} />
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {t.items.map((it, i) => (
          <Reveal key={`${it.name}-${i}`} delay={(i % 3) * 0.06}>
            <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-card">
              <blockquote className="flex-1 text-[15px] leading-relaxed text-foreground">&ldquo;{it.quote}&rdquo;</blockquote>
              <figcaption className="mt-5 text-sm"><p className="font-semibold">{it.name}</p><p className="text-foreground-2">{[it.role, it.company].filter(Boolean).join(" · ")}</p></figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- How it works ---------------- */

const TRACKS = {
  companies: {
    label: "For companies",
    steps: [
      [FileText, "Tell us what you need", "Describe the role, requirements and budget in a short guided form."],
      [ClipboardCheck, "We review and publish", "Our team checks every requirement and publishes the opening to candidates."],
      [SearchCheck, "We screen the applicants", "Applicants are reviewed against your brief and scored. You never wade through a stack of CVs."],
      [UsersRound, "You meet the best few", "Only the strongest candidates reach you, with our notes. Approve, interview, decide."],
    ],
  },
  candidates: {
    label: "For candidates",
    steps: [
      [UserCheck, "Build your profile", "Upload your resume and tell us what you are looking for — once."],
      [SearchCheck, "Apply to approved roles", "Every job is verified, with the pay (hourly or monthly) and requirements shown up front."],
      [MessagesSquare, "Get screened by a person", "Our team reviews your application and champions you to the hiring company."],
      [Handshake, "Interview, agree, get started", "Track every step, agree your terms and see your pay details — all in one place."],
    ],
  },
} as const;

export function HowItWorks() {
  const [tab, setTab] = useState<keyof typeof TRACKS>("companies");
  const t = TRACKS[tab];
  return (
    <Section tone="alt" id="how-it-works">
      <SectionHeading eyebrow="How it works" title="Four steps from brief to hire" />
      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-xl bg-background p-1 shadow-card" role="tablist">
          {(Object.keys(TRACKS) as (keyof typeof TRACKS)[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-lg px-5 py-2 text-sm font-medium transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-foreground-2 hover:text-foreground")}>{TRACKS[k].label}</button>
          ))}
        </div>
      </div>
      <ol className="mt-12 grid gap-6 md:grid-cols-4">
        {t.steps.map(([Icon, title, body], i) => (
          <li key={`${tab}-${title}`} className="relative rounded-2xl border border-border bg-card p-6 shadow-card">
            <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Icon className="size-5" /></span>
            <span className="absolute right-5 top-5 text-4xl font-semibold tabular-nums text-border">{i + 1}</span>
            <h3 className="font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground-2">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10 text-center"><Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">See the full process<ArrowRight className="size-4" /></Link></div>
    </Section>
  );
}

/* ---------------- Process timeline ---------------- */

export const PROCESS = [
  [FileText, "Brief", "The company submits what it needs: the role, skills, hours, and pay (hourly or monthly)."],
  [ClipboardCheck, "Approval", "We review it, ask for changes if needed, and publish only what meets our standard."],
  [Send, "Applications", "Candidates apply with their resume, expected pay and availability."],
  [SearchCheck, "Screening", "We score, compare and shortlist — and send the best matches to the company."],
  [MessagesSquare, "Interview", "Interviews are scheduled and feedback is captured against clear criteria."],
  [FileSignature, "Contract", "Terms are agreed, versioned and signed. Every change is recorded."],
  [Banknote, "Pay & payslips", "Pay is tracked each period — hourly or monthly — with payslips issued."],
] as const;

export function ProcessTimeline({ withHeading = true }: { withHeading?: boolean }) {
  return (
    <Section>
      {withHeading && <SectionHeading eyebrow="Our recruitment process" title="A process you can see into" description="You always know where a role or a candidate stands, and what happens next." />}
      <ol className="relative mx-auto mt-14 max-w-3xl space-y-8 before:absolute before:bottom-2 before:left-[1.4rem] before:top-2 before:w-px before:bg-border">
        {PROCESS.map(([Icon, title, body], i) => (
          <Reveal key={title}>
            <li className="relative flex gap-5">
              <span className="z-10 flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary shadow-card"><Icon className="size-5" /></span>
              <div className="pt-1"><p className="text-xs font-medium uppercase tracking-wider text-gold">Step {i + 1}</p><h3 className="text-lg font-semibold tracking-tight">{title}</h3><p className="mt-1 text-foreground-2">{body}</p></div>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ---------------- Trust grid ---------------- */

const TRUST = [
  [SearchCheck, "Screened by people", "Every applicant is reviewed against your brief before anyone reaches you."],
  [Layers, "One pipeline, fully visible", "Track every candidate from application to placement in a single view."],
  [FileSignature, "Contracts with history", "Changes create a new version. Nothing is overwritten or lost."],
  [Banknote, "Pay you can trace", "Hours, rates and monthly pay are calculated and recorded line by line."],
  [Receipt, "Payslips, automatically", "Professional payslips are generated and delivered each pay period."],
  [History, "A complete audit trail", "Who did what, and when — for every approval, change and payment."],
] as const;

export function WhyTrust() {
  return (
    <Section tone="alt">
      <SectionHeading eyebrow="Why companies trust us" title="Built for hiring that has to be right" description="From the first brief to the final payslip, nothing happens in the dark." />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST.map(([Icon, title, body], i) => (
          <Reveal key={title} delay={(i % 3) * 0.06}>
            <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-colors hover:border-secondary-green/40">
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-background-2 text-secondary-green"><Icon className="size-5" /></span>
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-2">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Candidates band ---------------- */

export function CandidateBand() {
  return (
    <Section tone="dark">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#d0b477]">For candidates</p>
          <h2 className="text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">Know exactly where you stand — at every step.</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-[#f7f4ec]/75">No black holes. See your application status, interview details, agreed terms, pay and payslips in one calm, simple place.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-[#f7f4ec] text-[#173b2f] hover:bg-white"><Link href="/register">Create your profile</Link></Button>
            <Button asChild size="lg" variant="ghost" className="text-[#f7f4ec] hover:bg-white/10 hover:text-white"><Link href="/jobs">Browse jobs</Link></Button>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {["Track every application", "Clear next steps", "Interview details in one place", "See your terms and pay", "Download your payslips", "Updates by email and in-app"].map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm"><span className="size-1.5 shrink-0 rounded-full bg-[#d0b477]" />{t}</li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ---------------- Numbers ---------------- */

export function NumbersStrip() {
  const { data, isPending } = usePublicStats();
  const site = useSiteContent();
  if (site.data && !site.data.stats.show) return null;
  const items = [["Open roles", data?.openJobs, Building2], ["Client companies", data?.companies, Building2], ["Candidate profiles", data?.candidates, UsersRound], ["Placements", data?.placements, Handshake]] as const;
  return (
    <Section>
      <dl className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
        {items.map(([label, v]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <dd className="text-4xl font-semibold tabular-nums tracking-tight text-primary">{isPending ? <Skeleton className="mx-auto h-9 w-16" /> : compactCount(v ?? 0)}</dd>
            <dt className="mt-1 text-sm text-foreground-2">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-center text-xs text-muted">Live figures from the platform.</p>
    </Section>
  );
}

/* ---------------- FAQ ---------------- */

export const FAQ = [
  ["How does Talentbridge work?", "Companies (or their recruiters) submit a hiring requirement. Our team reviews it and publishes it. Candidates apply, we screen and shortlist, and only the strongest candidates are sent to the company for review, interview and selection."],
  ["Does it cost anything for candidates?", "No. Candidates never pay to apply, be screened or be placed."],
  ["How do you decide who is sent to the company?", "A member of our team reviews each application against the role's requirements, scores it, and compares candidates side by side before shortlisting. The company only sees candidates we recommend."],
  ["How is pay handled?", "Jobs pay either by the hour or by the month, as shown on each listing. Pay is calculated and recorded on the platform, so every amount is traceable, and payslips are generated for each pay period."],
  ["Can a contract change after it is signed?", "Yes — a change is requested, reviewed and, if approved, becomes a new version of the contract. Earlier versions and past payslips are never altered."],
  ["Which currencies do you support?", "Amounts are stored in the currency they were agreed in and shown in the format that suits your location."],
  ["I'm a recruiter. Can I post for several companies?", "Yes. Apply for a recruiter account; once our team approves you, add each client company (also reviewed) and post openings for any of them."],
] as const;

export function Faq() {
  const site = useSiteContent();
  const items = site.data?.faqs?.length ? site.data.faqs.map((f) => [f.q, f.a] as const) : FAQ;
  return (
    <Section tone="alt">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card shadow-card">
        {items.map(([q, a]) => (
          <details key={q} className="group px-6 py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {q}<ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-5 pr-8 text-sm leading-relaxed text-foreground-2">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Final CTA ---------------- */

export function CtaBand({ title = "Ready to hire — or be hired?", primary = { label: "Find a job", href: "/jobs" }, secondary = { label: "Hire talent", href: "/contact?topic=HIRING" } }: {
  title?: string; primary?: { label: string; href: string }; secondary?: { label: string; href: string };
}) {
  return (
    <section className="px-5 pb-20 sm:pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#173b2f] px-6 py-16 text-center text-[#f7f4ec] sm:px-12">
        <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-[#b89a5a]/20 blur-3xl" />
        <h2 className="relative mx-auto max-w-2xl text-[clamp(1.7rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-[#f7f4ec]/75">Tell us what you&apos;re looking for. We&apos;ll take it from there.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-[#f7f4ec] text-[#173b2f] hover:bg-white"><Link href={primary.href}>{primary.label}</Link></Button>
          <Button asChild size="lg" variant="ghost" className="border border-white/25 text-[#f7f4ec] hover:bg-white/10 hover:text-white"><Link href={secondary.href}>{secondary.label}</Link></Button>
        </div>
      </div>
    </section>
  );
}
