"use client";

import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { useSiteContent } from "@/lib/site";
import { Logo } from "@/components/shell/sidebar";

const COLS = [
  { title: "Explore", links: [["Find jobs", "/jobs"], ["For companies", "/for-companies"], ["For candidates", "/for-candidates"], ["How it works", "/how-it-works"]] },
  { title: "Get started", links: [["Create a candidate profile", "/register"], ["Become a recruiter partner", "/register?as=recruiter"], ["Sign in", "/login"]] },
  { title: "Talk to us", links: [["Contact", "/contact"], ["Hire talent", "/contact?topic=HIRING"]] },
];

export function PublicFooter() {
  const { data } = useSiteContent();
  const contact = data?.contact;
  const rows = [[Mail, contact?.email, contact?.email ? `mailto:${contact.email}` : ""], [Phone, contact?.phone, contact?.phone ? `tel:${contact.phone.replace(/\s/g, "")}` : ""], [MapPin, contact?.address, ""], [Clock, contact?.hours, ""]] as const;
  return (
    <footer className="border-t border-border bg-background-2/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-foreground-2">{data?.footer.tagline ?? "Connecting exceptional talent with exceptional companies."}</p>
          <ul className="mt-5 space-y-2 text-sm text-foreground-2">
            {rows.filter(([, v]) => v).map(([Icon, v, href], i) => (
              <li key={i} className="flex items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0 text-muted" />{href ? <a href={href} className="hover:text-foreground">{v}</a> : <span>{v}</span>}</li>
            ))}
          </ul>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 text-sm font-semibold">{c.title}</h2>
            <ul className="space-y-2.5 text-sm text-foreground-2">{c.links.map(([label, href]) => <li key={href}><Link href={href} className="hover:text-foreground">{label}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border"><p className="mx-auto max-w-6xl px-5 py-5 text-xs text-muted">© Talentbridge. All rights reserved.</p></div>
    </footer>
  );
}
