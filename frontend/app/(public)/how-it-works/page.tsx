import type { Metadata } from "next";
import { PageHero } from "@/components/public/page-hero";
import { CtaBand, Faq, HowItWorks, ProcessTimeline } from "@/components/public/sections";

export const metadata: Metadata = { title: "How it works", description: "From hiring brief to payslip: the Talentbridge recruitment process, step by step." };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="How it works" title="From brief to first payday, with nothing hidden" description="Talentbridge sits between companies and candidates as the recruitment operator. We review, screen and coordinate — and keep every step visible to the people it affects." />
      <HowItWorks />
      <ProcessTimeline withHeading={false} />
      <Faq />
      <CtaBand />
    </>
  );
}
