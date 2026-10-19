"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { SiteContent } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { ImageField } from "./image-field";

function Section({ title, description, children, defaultOpen = false }: { title: string; description?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-[16px] border border-border bg-card shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div><h2 className="font-semibold tracking-tight">{title}</h2>{description && <p className="text-sm text-foreground-2">{description}</p>}</div>
        <span className="text-xs text-muted group-open:hidden">Edit</span><span className="hidden text-xs text-muted group-open:inline">Close</span>
      </summary>
      <div className="space-y-4 border-t border-divider p-5">{children}</div>
    </details>
  );
}

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
);

/** Admin edits everything the public landing page shows. Saved changes go live immediately. */
export function WebsiteEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["site-content"], queryFn: () => api<SiteContent>("/site-content"), staleTime: 0 });
  const [c, setC] = useState<SiteContent | null>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => { if (q.data) { setC(q.data); setSaved(JSON.stringify(q.data)); } }, [q.data]);

  const save = useMutation({
    mutationFn: (body: SiteContent) => api<SiteContent>("/site-content", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => { toast.success("Website updated"); setC(data); setSaved(JSON.stringify(data)); qc.invalidateQueries({ queryKey: ["public"] }); qc.invalidateQueries({ queryKey: ["site-content"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save"),
  });

  if (q.isPending || !c) return <div className="space-y-4"><Skeleton className="h-12 w-72" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-[16px]" />)}</div>;
  if (q.isError) return <ErrorState compact variant="server" onRetry={() => q.refetch()} />;

  const dirty = JSON.stringify(c) !== saved;
  const up = <K extends keyof SiteContent>(k: K, patch: Partial<SiteContent[K]>) => setC((p) => (p ? { ...p, [k]: { ...(p[k] as object), ...patch } as SiteContent[K] } : p));
  const rowBtn = (onClick: () => void) => <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={onClick}><Trash2 /></Button>;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link href="/admin/settings"><ArrowLeft />Settings</Link></Button>
      <PageHeader title="Website content" description="Everything on the public landing page. Changes go live as soon as you save."
        actions={<Button asChild variant="secondary"><a href="/" target="_blank" rel="noreferrer"><ExternalLink />View site</a></Button>} />

      <div className="space-y-4 pb-24">
        <Section title="Announcement bar" description="A one-line notice across the top of every public page.">
          <Toggle label="Show the announcement bar" checked={c.announcement.enabled} onChange={(v) => up("announcement", { enabled: v })} />
          <Field label="Text" htmlFor="an-t"><Input id="an-t" maxLength={200} value={c.announcement.text} onChange={(e) => up("announcement", { text: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link label" htmlFor="an-l"><Input id="an-l" value={c.announcement.linkLabel} onChange={(e) => up("announcement", { linkLabel: e.target.value })} /></Field>
            <Field label="Link address" htmlFor="an-u" hint="https://… or a path like /jobs"><Input id="an-u" value={c.announcement.linkUrl} onChange={(e) => up("announcement", { linkUrl: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Hero" description="The big opening section with the job search." defaultOpen>
          <Field label="Headline" htmlFor="h-h"><Input id="h-h" maxLength={120} value={c.hero.headline} onChange={(e) => up("hero", { headline: e.target.value })} /></Field>
          <Field label="Sub-headline" htmlFor="h-s"><Textarea id="h-s" rows={2} maxLength={300} value={c.hero.subheadline} onChange={(e) => up("hero", { subheadline: e.target.value })} /></Field>
          <Field label="Search box placeholder" htmlFor="h-p"><Input id="h-p" maxLength={80} value={c.hero.searchPlaceholder} onChange={(e) => up("hero", { searchPlaceholder: e.target.value })} /></Field>
          <ImageField label="Background image" value={c.hero.backgroundImage} onChange={(v) => up("hero", { backgroundImage: v })} hint="Wide landscape, at least 1600px. Leave empty for the default green gradient. Only use images you have the rights to." />
          <Field label="Background video address" htmlFor="h-v" hint="Optional. A direct link to an MP4 you have the rights to use (https://…). It plays muted and can be paused."><Input id="h-v" value={c.hero.backgroundVideo} onChange={(e) => up("hero", { backgroundVideo: e.target.value })} /></Field>
          <Field label={`Overlay darkness: ${c.hero.overlayStrength}%`} htmlFor="h-o" hint="Darker keeps the text readable over bright images."><input id="h-o" type="range" min={20} max={90} className="w-full accent-[var(--primary)]" value={c.hero.overlayStrength} onChange={(e) => up("hero", { overlayStrength: Number(e.target.value) })} /></Field>
        </Section>

        <Section title="Quick search buttons" description="Buttons under the search box. Each runs a job search.">
          {c.quickLinks.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field label="Button text" htmlFor={`ql-l-${i}`}><Input id={`ql-l-${i}`} value={l.label} onChange={(e) => setC({ ...c, quickLinks: c.quickLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
              <Field label="Searches for" htmlFor={`ql-q-${i}`}><Input id={`ql-q-${i}`} value={l.query} onChange={(e) => setC({ ...c, quickLinks: c.quickLinks.map((x, j) => (j === i ? { ...x, query: e.target.value } : x)) })} /></Field>
              {rowBtn(() => setC({ ...c, quickLinks: c.quickLinks.filter((_, j) => j !== i) }))}
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={c.quickLinks.length >= 8} onClick={() => setC({ ...c, quickLinks: [...c.quickLinks, { label: "", query: "" }] })}><Plus />Add button</Button>
        </Section>

        <Section title="Trusted by" description="Companies shown under the hero. Only add companies that have agreed to be named.">
          <Toggle label="Show this row" checked={c.trustedBy.enabled} onChange={(v) => up("trustedBy", { enabled: v })} />
          <Field label="Label" htmlFor="tb-l"><Input id="tb-l" maxLength={40} value={c.trustedBy.label} onChange={(e) => up("trustedBy", { label: e.target.value })} /></Field>
          <div className="space-y-4">
            {c.trustedBy.companies.map((co, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Field label="Company name" htmlFor={`co-n-${i}`}><Input id={`co-n-${i}`} value={co.name} onChange={(e) => up("trustedBy", { companies: c.trustedBy.companies.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></Field>
                  <Field label="Website (optional)" htmlFor={`co-u-${i}`}><Input id={`co-u-${i}`} placeholder="https://" value={co.url} onChange={(e) => up("trustedBy", { companies: c.trustedBy.companies.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /></Field>
                  {rowBtn(() => up("trustedBy", { companies: c.trustedBy.companies.filter((_, j) => j !== i) }))}
                </div>
                <ImageField label="Logo" value={co.logo} onChange={(v) => up("trustedBy", { companies: c.trustedBy.companies.map((x, j) => (j === i ? { ...x, logo: v } : x)) })} hint="A transparent PNG works best. It's shown in white on the dark hero. Without a logo the name is shown as text." />
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={c.trustedBy.companies.length >= 12} onClick={() => up("trustedBy", { companies: [...c.trustedBy.companies, { name: "", logo: "", url: "" }] })}><Plus />Add company</Button>
        </Section>

        <Section title="Categories" description="The scrolling category cards. Each opens a job search.">
          <Toggle label="Show categories" checked={c.categories.enabled} onChange={(v) => up("categories", { enabled: v })} />
          <Field label="Section title" htmlFor="ca-t"><Input id="ca-t" maxLength={60} value={c.categories.title} onChange={(e) => up("categories", { title: e.target.value })} /></Field>
          {c.categories.items.map((it, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
              <Field label="Name" htmlFor={`ci-l-${i}`}><Input id={`ci-l-${i}`} value={it.label} onChange={(e) => up("categories", { items: c.categories.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
              <Field label="Searches for" htmlFor={`ci-q-${i}`}><Input id={`ci-q-${i}`} value={it.query} onChange={(e) => up("categories", { items: c.categories.items.map((x, j) => (j === i ? { ...x, query: e.target.value } : x)) })} /></Field>
              <Field label="Short description" htmlFor={`ci-d-${i}`}><Input id={`ci-d-${i}`} maxLength={120} value={it.description} onChange={(e) => up("categories", { items: c.categories.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} /></Field>
              {rowBtn(() => up("categories", { items: c.categories.items.filter((_, j) => j !== i) }))}
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={c.categories.items.length >= 12} onClick={() => up("categories", { items: [...c.categories.items, { label: "", query: "", description: "" }] })}><Plus />Add category</Button>
        </Section>

        <Section title="Featured jobs & numbers" description="The scrolling job row and the live figures.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="fj-t"><Input id="fj-t" maxLength={80} value={c.featuredJobs.title} onChange={(e) => up("featuredJobs", { title: e.target.value })} /></Field>
            <Field label="How many jobs to show (3–20)" htmlFor="fj-c"><Input id="fj-c" inputMode="numeric" value={String(c.featuredJobs.count)} onChange={(e) => up("featuredJobs", { count: Math.min(20, Math.max(3, Number(e.target.value.replace(/\D/g, "")) || 3)) })} /></Field>
          </div>
          <Field label="Subtitle" htmlFor="fj-s"><Input id="fj-s" maxLength={200} value={c.featuredJobs.subtitle} onChange={(e) => up("featuredJobs", { subtitle: e.target.value })} /></Field>
          <Toggle label="Show live platform numbers (open roles, companies, placements)" checked={c.stats.show} onChange={(v) => up("stats", { show: v })} />
        </Section>

        <Section title="Testimonials" description="Only add quotes from people who have given permission.">
          <Toggle label="Show testimonials" checked={c.testimonials.enabled} onChange={(v) => up("testimonials", { enabled: v })} />
          <Field label="Section title" htmlFor="te-t"><Input id="te-t" maxLength={60} value={c.testimonials.title} onChange={(e) => up("testimonials", { title: e.target.value })} /></Field>
          {c.testimonials.items.map((it, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border p-4">
              <Field label="Quote" htmlFor={`te-q-${i}`}><Textarea id={`te-q-${i}`} rows={3} maxLength={500} value={it.quote} onChange={(e) => up("testimonials", { items: c.testimonials.items.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)) })} /></Field>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                {(["name", "role", "company"] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} htmlFor={`te-${k}-${i}`}><Input id={`te-${k}-${i}`} value={it[k]} onChange={(e) => up("testimonials", { items: c.testimonials.items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} /></Field>)}
                {rowBtn(() => up("testimonials", { items: c.testimonials.items.filter((_, j) => j !== i) }))}
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={c.testimonials.items.length >= 9} onClick={() => up("testimonials", { items: [...c.testimonials.items, { quote: "", name: "", role: "", company: "" }] })}><Plus />Add testimonial</Button>
        </Section>

        <Section title="FAQ" description="Questions shown at the bottom of the landing page and on How it works.">
          {c.faqs.map((f, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border p-4">
              <Field label="Question" htmlFor={`fq-q-${i}`}><Input id={`fq-q-${i}`} maxLength={160} value={f.q} onChange={(e) => setC({ ...c, faqs: c.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} /></Field>
              <Field label="Answer" htmlFor={`fq-a-${i}`}><Textarea id={`fq-a-${i}`} rows={3} maxLength={1200} value={f.a} onChange={(e) => setC({ ...c, faqs: c.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} /></Field>
              <Button type="button" variant="ghost" size="sm" onClick={() => setC({ ...c, faqs: c.faqs.filter((_, j) => j !== i) })}><Trash2 />Remove</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={c.faqs.length >= 20} onClick={() => setC({ ...c, faqs: [...c.faqs, { q: "", a: "" }] })}><Plus />Add question</Button>
        </Section>

        <Section title="Contact details & footer" description="Shown in the website footer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="ct-e"><Input id="ct-e" type="email" value={c.contact.email} onChange={(e) => up("contact", { email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="ct-p"><Input id="ct-p" value={c.contact.phone} onChange={(e) => up("contact", { phone: e.target.value })} /></Field>
            <Field label="Address" htmlFor="ct-a"><Input id="ct-a" value={c.contact.address} onChange={(e) => up("contact", { address: e.target.value })} /></Field>
            <Field label="Reply time / hours" htmlFor="ct-h"><Input id="ct-h" value={c.contact.hours} onChange={(e) => up("contact", { hours: e.target.value })} /></Field>
          </div>
          <Field label="Footer tagline" htmlFor="ft-t"><Textarea id="ft-t" rows={2} maxLength={300} value={c.footer.tagline} onChange={(e) => up("footer", { tagline: e.target.value })} /></Field>
        </Section>

        <Section title="Search engines" description="The title and description search engines show for the home page.">
          <Field label="Page title" htmlFor="se-t"><Input id="se-t" maxLength={120} value={c.seo.title} onChange={(e) => up("seo", { title: e.target.value })} /></Field>
          <Field label="Description" htmlFor="se-d"><Textarea id="se-d" rows={2} maxLength={300} value={c.seo.description} onChange={(e) => up("seo", { description: e.target.value })} /></Field>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-sm text-foreground-2">{dirty ? "You have unsaved changes" : "All changes saved"}</p>
          <div className="flex gap-2">{dirty && <Button variant="ghost" onClick={() => setC(JSON.parse(saved))}>Discard</Button>}<Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(c)}><Save />Save and publish</Button></div>
        </div>
      </div>
    </>
  );
}
