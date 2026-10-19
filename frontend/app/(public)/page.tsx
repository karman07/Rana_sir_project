import type { Metadata } from "next";
import { Categories, CandidateBand, CtaBand, Faq, FeaturedJobs, HowItWorks, NumbersStrip, ProcessTimeline, Testimonials, WhyTrust } from "@/components/public/sections";
import { Hero } from "@/components/public/hero";

export const metadata: Metadata = {
  title: { absolute: "Talentbridge — Connecting exceptional talent with exceptional companies" },
  description: "Talentbridge reviews every opening, screens every applicant and sends companies only the candidates worth interviewing — then handles agreements, pay and payslips.",
};

export default function Landing() {
  return (
    <>
      <Hero />
      <FeaturedJobs />
      <Categories />
      <HowItWorks />
      <ProcessTimeline />
      <WhyTrust />
      <CandidateBand />
      <Testimonials />
      <NumbersStrip />
      <Faq />
      <CtaBand />
    </>
  );
}
