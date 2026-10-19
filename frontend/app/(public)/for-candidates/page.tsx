import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, FileText, Receipt, Route, ShieldCheck, Wallet } from "lucide-react";
import { PageHero } from "@/components/public/page-hero";
import { Reveal } from "@/components/public/reveal";
import { CandidateBand, CtaBand, FeaturedJobs, Section, SectionHeading } from "@/components/public/sections";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For candidates", description: "Apply to verified roles, track every step, and see your terms, pay and payslips in one place." };

const BENEFITS = [
  [ShieldCheck, "Verified roles only", "Every job is reviewed by our team, with pay (hourly or monthly) and requirements shown before you apply."],
  [Route, "Know where you stand", "A clear tracker shows your application's stage and what happens next — no more silence."],
  [Bell, "Updates that matter", "Interview invitations and decisions reach you by email and in the app."],
  [FileText, "Your contract, clearly", "Review and respond to your contract, and see any changes as new versions."],
  [Wallet, "Transparent pay", "See your pay status and expected payment dates, including any delays and why."],
  [Receipt, "Payslips on demand", "View and download your payslips whenever you need them."],
] as const;

export default function Page() {
  return (
    <>
      <PageHero eyebrow="For candidates" title="Be hired by people who've actually looked at your profile" description="Our team reviews your application and champions you to the hiring company. It's free for candidates.">
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href="/register">Create your profile<ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="secondary"><Link href="/jobs">Browse jobs</Link></Button>
        </div>
      </PageHero>
      <Section>
        <SectionHeading eyebrow="Why apply through us" title="A hiring process that respects your time" />
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
      <FeaturedJobs />
      <CandidateBand />
      <CtaBand title="Your next role starts here" primary={{ label: "Create your profile", href: "/register" }} secondary={{ label: "Browse jobs", href: "/jobs" }} />
    </>
  );
}
