"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck, Monitor, RotateCcw, Save, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { groupOfTemplate, TEMPLATE_GROUPS, type EmailTemplateRow } from "@/lib/communication";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

type Draft = { subject: string; heading: string; body: string; ctaLabel: string; enabled: boolean };
type Field_ = "subject" | "heading" | "body" | "ctaLabel";
const toDraft = (t: EmailTemplateRow): Draft => ({ subject: t.subject, heading: t.heading, body: t.body, ctaLabel: t.ctaLabel ?? "", enabled: t.enabled });

function Editor({ t }: { t: EmailTemplateRow }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(t));
  const [error, setError] = useState<string>();
  const [wide, setWide] = useState(true);
  const [html, setHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const focused = useRef<Field_>("body");
  const refs = { subject: useRef<HTMLInputElement>(null), heading: useRef<HTMLInputElement>(null), body: useRef<HTMLTextAreaElement>(null), ctaLabel: useRef<HTMLInputElement>(null) };

  useEffect(() => { setD(toDraft(t)); setError(undefined); }, [t.id, t.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(toDraft(t)), [d, t]);

  // Live preview of the draft, with sample values, a moment after typing stops.
  useEffect(() => {
    const h = setTimeout(async () => {
      try {
        const r = await apiPost<{ subject: string; html: string }>(`/email-templates/${t.key}/preview`, { subject: d.subject, heading: d.heading, body: d.body, ctaLabel: d.ctaLabel || undefined });
        setHtml(r.html); setPreviewSubject(r.subject);
      } catch { /* the saved wording stays on screen while the draft is mid-edit */ }
    }, 350);
    return () => clearTimeout(h);
  }, [t.key, d.subject, d.heading, d.body, d.ctaLabel]);

  const save = useMutation({
    mutationFn: () => api<EmailTemplateRow>(`/email-templates/${t.key}`, { method: "PATCH", body: JSON.stringify({ subject: d.subject, heading: d.heading, body: d.body, ctaLabel: d.ctaLabel || undefined, enabled: d.enabled }) }),
    onSuccess: () => { toast.success("Saved. The next email uses this wording."); setError(undefined); qc.invalidateQueries({ queryKey: ["email-templates"] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not save"),
  });
  const reset = useMutation({
    mutationFn: () => apiPost(`/email-templates/${t.key}/reset`),
    onSuccess: () => { toast.success("Back to the original wording"); setError(undefined); qc.invalidateQueries({ queryKey: ["email-templates"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not reset"),
  });
  const test = useMutation({
    mutationFn: () => apiPost<{ sent: boolean; to: string }>(`/email-templates/${t.key}/test`),
    onSuccess: (r) => toast.success(r.sent ? `Test sent to ${r.to}` : "Nothing was sent"),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send the test"),
  });

  /** Drops {{name}} into whichever box was last used, where the cursor is. */
  const insert = (v: string) => {
    const f = focused.current, el = refs[f].current;
    const token = `{{${v}}}`;
    if (!el) return;
    const s = el.selectionStart ?? d[f].length, e = el.selectionEnd ?? s;
    const next = d[f].slice(0, s) + token + d[f].slice(e);
    setD((x) => ({ ...x, [f]: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">{t.name}</h2>
              <p className="font-mono text-xs text-muted">{t.key}</p>
            </div>
            <div className="flex items-center gap-2">
              {t.customised ? <StatusBadge status="CHANGES_REQUESTED" label="Edited" /> : <StatusBadge status="CLOSED" label="Original wording" />}
              <label className="flex items-center gap-2 text-sm text-foreground-2">Sending<Switch checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: v })} label={`Send the ${t.name} email`} /></label>
            </div>
          </div>
          {!d.enabled && <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-gold">This email is switched off. Nothing is sent until you turn it back on and save.</p>}
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <Field label="Subject" htmlFor="t-subject"><Input id="t-subject" ref={refs.subject} value={d.subject} onFocus={() => (focused.current = "subject")} onChange={(e) => setD({ ...d, subject: e.target.value })} /></Field>
          <Field label="Heading" htmlFor="t-heading"><Input id="t-heading" ref={refs.heading} value={d.heading} onFocus={() => (focused.current = "heading")} onChange={(e) => setD({ ...d, heading: e.target.value })} /></Field>
          <Field label="Message" htmlFor="t-body" hint="Simple HTML such as <p>, <strong> and <a> is fine. Scripts and anything that could run are removed on save.">
            <Textarea id="t-body" ref={refs.body} rows={9} className="font-mono text-[13px]" value={d.body} onFocus={() => (focused.current = "body")} onChange={(e) => setD({ ...d, body: e.target.value })} />
          </Field>
          <Field label="Button label" htmlFor="t-cta" hint="Leave empty for no button"><Input id="t-cta" ref={refs.ctaLabel} value={d.ctaLabel} onFocus={() => (focused.current = "ctaLabel")} onChange={(e) => setD({ ...d, ctaLabel: e.target.value })} /></Field>

          <div>
            <p className="mb-2 text-sm font-medium">Placeholders you can use</p>
            <div className="flex flex-wrap gap-1.5">
              {t.variables.map((v) => <button key={v} type="button" onClick={() => insert(v)} className="rounded-md border border-border bg-background-2 px-2 py-1 font-mono text-xs text-foreground-2 transition-colors hover:border-primary hover:text-primary" title={`Insert {{${v}}}`}>{`{{${v}}}`}</button>)}
            </div>
            <p className="mt-2 text-xs text-muted">Click one to add it where you were typing. Each is replaced with the real value when the email is sent.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
            <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}><Save />Save changes</Button>
            <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}><MailCheck />Send me a test</Button>
            {t.customised && (
              <ConfirmationDialog trigger={<Button variant="ghost"><RotateCcw />Restore original</Button>} title="Restore the original wording?" description="Your edits to this email are replaced. This can't be undone." confirmLabel="Restore" destructive onConfirm={async () => { await reset.mutateAsync(); }} />
            )}
            {dirty && <span className="ml-auto text-xs text-gold">Unsaved changes</span>}
          </div>
          {dirty && <p className="text-xs text-muted">A test uses the saved wording, so save first to test your edits.</p>}
        </CardBody>
      </Card>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Preview <span className="font-normal text-muted">· sample values</span></p>
          <div className="flex gap-1" role="group" aria-label="Preview width">
            <Button variant={wide ? "secondary" : "ghost"} size="sm" onClick={() => setWide(true)} aria-label="Desktop width"><Monitor /></Button>
            <Button variant={!wide ? "secondary" : "ghost"} size="sm" onClick={() => setWide(false)} aria-label="Phone width"><Smartphone /></Button>
          </div>
        </div>
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-4 py-2.5 text-sm"><span className="text-muted">Subject: </span><span className="font-medium">{previewSubject || d.subject}</span></div>
          <div className="bg-[#f7f4ec] p-3">
            <iframe title="Email preview" sandbox="" srcDoc={html} className={cn("mx-auto h-[34rem] rounded-lg border border-border bg-white transition-all", wide ? "w-full" : "w-[22rem] max-w-full")} />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function TemplatesEditor() {
  const [selected, setSelected] = useState<string>();
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["email-templates"], queryFn: () => api<EmailTemplateRow[]>("/email-templates") });
  const items = list.data ?? [];
  const current = items.find((t) => t.key === (selected ?? items[0]?.key));
  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = items.filter((t) => !needle || `${t.name} ${t.key} ${t.subject}`.toLowerCase().includes(needle));
    return TEMPLATE_GROUPS.map(([g]) => [g, rows.filter((t) => groupOfTemplate(t.key) === g)] as const).filter(([, r]) => r.length);
  }, [items, q]);

  return (
    <>
      <PageHeader title="Email templates" description="Change the wording of any email the platform sends. Edits apply to the next email and never touch ones already sent." />
      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input aria-label="Search templates" placeholder="Search emails…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {list.isPending ? <Skeleton className="h-64 w-full rounded-[16px]" /> : grouped.map(([g, rows]) => (
            <div key={g}>
              <p className="mb-1.5 px-2 text-xs font-medium uppercase tracking-wider text-muted">{g}</p>
              <ul className="space-y-0.5">
                {rows.map((t) => (
                  <li key={t.key}>
                    <button onClick={() => setSelected(t.key)} aria-current={current?.key === t.key ? "true" : undefined}
                      className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors", current?.key === t.key ? "bg-primary text-primary-foreground" : "hover:bg-background-2")}>
                      <span className="truncate">{t.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {t.customised && <span className={cn("size-1.5 rounded-full", current?.key === t.key ? "bg-primary-foreground" : "bg-gold")} title="Edited" />}
                        {!t.enabled && <span className={cn("text-[10px] uppercase tracking-wide", current?.key === t.key ? "text-primary-foreground/70" : "text-muted")}>off</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
        <div>{current ? <Editor key={current.key} t={current} /> : list.isPending ? <Skeleton className="h-96 w-full rounded-[16px]" /> : null}</div>
      </div>
    </>
  );
}
