"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Mail, MapPin, Phone } from "lucide-react";
import { formatMoney } from "@rms/shared";
import { api, documentUrl, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/applications";
import { EntityActivity } from "@/components/data/entity-activity";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/feedback/error-state";
import { Wallet } from "lucide-react";

interface Profile {
  user: { id: string; name: string; email: string; phone?: string; country?: string; status: string; emailVerified: boolean; createdAt: string; lastLoginAt?: string };
  profile: { headline?: string; about?: string; location?: string; currentTitle?: string; skills?: string[]; experienceYears?: number; expectedSalary?: { amount: number; currency: string }; noticePeriodDays?: number;
    experience?: { company: string; title: string; startDate?: string; endDate?: string; current?: boolean; description?: string }[]; education?: { institution: string; degree: string; field?: string; endYear?: number }[] };
  applications: { id: string; applicationNumber: string; status: string; createdAt: string; job: { title?: string; jobNumber?: string; location?: string }; company?: string; adminScore?: number }[];
  documents: { id: string; type: string; label?: string; version: number; status: string; originalName: string; size: number; createdAt: string }[];
}

export function AdminCandidateProfile({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["candidate-pool", id], queryFn: () => api<Profile>(`/candidate-pool/${id}`) });
  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-28 rounded-[16px]" /><Skeleton className="h-72 rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const { user: u, profile: p, applications, documents } = q.data;
  const resume = documents.find((d) => d.type === "RESUME" && d.status === "ACTIVE");
  const none = (title: string, d: string) => <EmptyState title={title} description={d} />;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/admin/candidates"><ArrowLeft />Candidate pool</Link></Button>
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={u.name} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{u.name}</h1>
            <p className="text-foreground-2">{p.headline ?? p.currentTitle ?? "No headline yet"}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1.5"><Mail className="size-4" />{u.email}</span>
              {u.phone && <span className="flex items-center gap-1.5"><Phone className="size-4" />{u.phone}</span>}
              {p.location && <span className="flex items-center gap-1.5"><MapPin className="size-4" />{p.location}</span>}
            </div>
          </div>
          <div className="text-right text-sm"><p className="text-xs text-muted">Expected salary</p><p className="font-semibold tabular-nums">{p.expectedSalary ? formatMoney(p.expectedSalary).replace(/\.00$/, "") : "—"}</p><p className="mt-1 text-xs text-muted">{p.experienceYears != null ? `${p.experienceYears} yrs experience` : ""}{p.noticePeriodDays != null ? ` · ${p.noticePeriodDays}d notice` : ""}</p></div>
          {resume && <Button asChild variant="secondary"><a href={documentUrl(resume.id, true)} target="_blank" rel="noreferrer"><FileText />View resume</a></Button>}
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>{["overview", "experience", "education", "applications", "documents", "payments", "activity"].map((t) => <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>)}</TabsList>
        <TabsContent value="overview"><Card><CardBody className="space-y-4 pt-5 text-sm">
          <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">About</p><p className="whitespace-pre-line text-foreground-2">{p.about || "—"}</p></div>
          <div><p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Skills</p><div className="flex flex-wrap gap-1.5">{p.skills?.length ? p.skills.map((s) => <span key={s} className="rounded-md bg-background-2 px-2 py-0.5 text-xs">{s}</span>) : "—"}</div></div>
          <p className="text-xs text-muted">Joined {timeAgo(u.createdAt).toLowerCase()} · {u.emailVerified ? "email verified" : "email not verified"}</p>
        </CardBody></Card></TabsContent>
        <TabsContent value="experience">{p.experience?.length ? <ul className="space-y-3">{p.experience.map((e, i) => <Card key={i} className="p-4"><p className="font-medium">{e.title} · {e.company}</p><p className="text-xs text-muted">{e.startDate ?? "—"} – {e.current ? "Present" : e.endDate ?? "—"}</p>{e.description && <p className="mt-1 text-sm text-foreground-2">{e.description}</p>}</Card>)}</ul> : none("No experience added", "The candidate hasn't added work history.")}</TabsContent>
        <TabsContent value="education">{p.education?.length ? <ul className="space-y-3">{p.education.map((e, i) => <Card key={i} className="p-4"><p className="font-medium">{e.degree}{e.field ? `, ${e.field}` : ""}</p><p className="text-sm text-muted">{e.institution}{e.endYear ? ` · ${e.endYear}` : ""}</p></Card>)}</ul> : none("No education added", "The candidate hasn't added education.")}</TabsContent>
        <TabsContent value="applications">{applications.length ? <ul className="space-y-3">{applications.map((a) => <Link key={a.id} href={`/admin/applications/${a.id}`} className="block"><Card className="flex items-center justify-between gap-3 p-4 hover:border-secondary-green/40"><div><p className="font-medium">{a.job.title}</p><p className="text-xs text-muted">{a.company} · {a.applicationNumber} · applied {timeAgo(a.createdAt).toLowerCase()}</p></div><StatusBadge status={a.status} /></Card></Link>)}</ul> : none("No applications yet", "They haven't applied to any jobs.")}</TabsContent>
        <TabsContent value="documents">{documents.length ? <ul className="space-y-2">{documents.map((d) => <Card key={d.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{d.label ?? d.type}{d.status === "ARCHIVED" && <span className="ml-2 text-xs text-muted">(older version)</span>}</p><p className="truncate text-xs text-muted">{d.originalName} · v{d.version}</p></div><Button asChild size="sm" variant="secondary"><a href={documentUrl(d.id)} target="_blank" rel="noreferrer">Download</a></Button></Card>)}</ul> : none("No documents", "Nothing has been uploaded.")}</TabsContent>
        <TabsContent value="payments"><EmptyState icon={Wallet} title="No payments or payslips yet" description="Contracts, payments and payslips appear here once this candidate is placed." /></TabsContent>
        <TabsContent value="activity"><Card><CardBody className="pt-5"><EntityActivity entityType="User" entityId={u.id} /></CardBody></Card></TabsContent>
      </Tabs>
    </>
  );
}
