import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, FileSignature, Receipt, SearchCheck, Users } from "lucide-react";
import { PageHero } from "@/components/public/page-hero";
import { Reveal } from "@/components/public/reveal";
import { CtaBand, ProcessTimeline, Section, SectionHeading, WhyTrust } from "@/components/public/sections";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For companies", description: "Hire better with a recruitment partner that screens every applicant, manages contracts and handles pay." };

const BENEFITS = [
  [SearchCheck, "Meet only the best few", "We screen every applicant against your brief, score and compare them, and send you a short list — not a pile of CVs."],
  [Users, "One partner for every hire", "Post openings across several client companies from a single recruiter account."],
  [FileSignature, "Contracts that stay accurate", "Rate changes and renewals create new versions, with every figure recalculated for you."],
  [Receipt, "Hourly or monthly pay, handled", "We calculate each person's pay for the period, track every payment and issue payslips."],
  [BadgeCheck, "You stay in control", "Approve or decline every candidate. If you say no, we decide the next step with you — never behind your back."],
  [Building2, "Built for agencies and in-house teams", "Manage multiple companies, openings and candidates without spreadsheets."],
] as const;

export default function Page() {
  return (
    <>
      <PageHero eyebrow="For companies" title="Hire the right people, without the noise" description="Tell us what you need. We review the role, find and screen the candidates, and manage everything through to pay.">
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href="/register?as=recruiter">Become a recruiter partner<ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="secondary"><Link href="/contact?topic=HIRING">Talk to us</Link></Button>
        </div>
      </PageHero>
      <Section>
        <SectionHeading eyebrow="What you get" title="Everything between 'we need someone' and 'they've started'" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={(i % 3) * 0.06}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-card">
                <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-background-2 text-secondary-green"><Icon className="size-5" /></span>
                <h3 className="font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-relaxed text-foreground-2">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>
      <ProcessTimeline />
      <WhyTrust />
      <CtaBand title="Let's fill your next role" primary={{ label: "Become a recruiter partner", href: "/register?as=recruiter" }} secondary={{ label: "Talk to us", href: "/contact?topic=HIRING" }} />
    </>
  );
}
