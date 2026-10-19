import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactForm } from "@/components/public/contact-form";
import { PageHero } from "@/components/public/page-hero";

export const metadata: Metadata = { title: "Contact", description: "Talk to the Talentbridge team about hiring or finding a role." };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Let's talk" description="Whether you're hiring or looking for your next role, we'd love to hear from you." />
      <div className="mx-auto max-w-6xl px-5 py-12"><Suspense><ContactForm /></Suspense></div>
    </>
  );
}
