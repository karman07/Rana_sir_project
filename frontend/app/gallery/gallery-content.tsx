"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea, DatePicker } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger, DrawerContent } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AttentionCard, MoneyCard, StatCard } from "@/components/data/stat-card";
import { ChartCard } from "@/components/data/chart-card";
import { Timeline } from "@/components/data/timeline";
import { Stepper } from "@/components/data/stepper";
import { DataTable } from "@/components/data/data-table";
import { ErrorState } from "@/components/feedback/error-state";
import { formatMoney } from "@rms/shared";
import type { ColumnDef } from "@tanstack/react-table";

interface Row { name: string; company: string; status: string; salary: number }
const rows: Row[] = [
  { name: "Ananya Rao", company: "Northwind Labs", status: "ADMIN_SHORTLISTED", salary: 8500000 },
  { name: "Karan Shah", company: "Helix Retail", status: "PENDING_REVIEW", salary: 6000000 },
  { name: "Meera Iyer", company: "Northwind Labs", status: "INTERVIEW", salary: 9200000 },
  { name: "Dev Patel", company: "Orchard Health", status: "REJECTED", salary: 5200000 },
  { name: "Isha Kapoor", company: "Helix Retail", status: "PLACED", salary: 7800000 },
];
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Candidate", cell: ({ row }) => (
    <div className="flex items-center gap-2"><Avatar name={row.original.name} size={28} /><span className="font-medium">{row.original.name}</span></div>) },
  { accessorKey: "company", header: "Company" },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: "salary", header: "Expected", cell: ({ getValue }) => <span className="tabular-nums">{formatMoney({ amount: getValue() as number, currency: "INR" }, "en-IN")}</span> },
];
const chart = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m, i) => ({ m, v: [12, 19, 14, 27, 31, 38][i] }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h2>{children}</section>;
}

export function GalleryContent() {
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Component gallery</h1>
      </div>

      <Section title="Buttons & badges">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Approve</Button><Button variant="secondary">Request changes</Button><Button variant="ghost">Ghost</Button>
          <Button variant="danger">Reject</Button><Button loading>Saving</Button>
          {["PENDING_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "ACTIVE", "DRAFT", "INTERVIEW"].map((s) => <StatusBadge key={s} status={s} />)}
        </div>
      </Section>

      <Section title="Stat cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AttentionCard label="Pending approvals" value="14" hint="3 older than 2 days" />
          <StatCard label="Open jobs" value="48" delta={{ value: "12%", direction: "up" }} hint="vs last month" />
          <MoneyCard label="Commission earned" value={formatMoney({ amount: 1250000000, currency: "INR" }, "en-IN")} hint="This quarter" />
          <StatCard label="Time to hire" value="18 days" delta={{ value: "2 days", direction: "down", good: true }} />
        </div>
      </Section>

      <Section title="Data table">
        <DataTable data={rows} columns={columns} selectable exportName="candidates" searchPlaceholder="Search candidates…"
          bulkActions={() => <Button size="sm" variant="secondary">Shortlist</Button>}
          renderCard={(r) => <Card className="p-4"><p className="font-medium">{r.name}</p><p className="text-sm text-foreground-2">{r.company}</p><div className="mt-2"><StatusBadge status={r.status} /></div></Card>} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Applications" description="Last 6 months">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid vertical={false} stroke="var(--divider)" />
              <XAxis dataKey="m" tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
              <YAxis tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
              <Tooltip cursor={{ fill: "var(--background-2)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Bar dataKey="v" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card>
          <CardHeader title="Candidate timeline" />
          <CardBody>
            <Timeline items={[
              { title: "Application created", time: "2 Oct", state: "done" },
              { title: "Shortlisted by Admin", time: "4 Oct", state: "done" },
              { title: "Sent to recruiter", description: "Awaiting decision", state: "current" },
              { title: "Interview", state: "upcoming" },
            ]} />
          </CardBody>
        </Card>
      </div>

      <Section title="Forms">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Job title" hint="As shown to candidates"><Input placeholder="Senior Backend Engineer" /></Field>
          <Field label="Employment type"><Select><option>Full-time</option><option>Contract</option></Select></Field>
          <Field label="Start date"><DatePicker /></Field>
          <Field label="Salary" error="Enter a number"><Input aria-invalid defaultValue="abc" /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><Textarea /></Field></div>
        </Card>
        <Stepper steps={["Job", "Requirements", "Compensation", "Contract", "Details"]} current={2} />
      </Section>

      <Section title="Overlays, tabs, toasts">
        <div className="flex flex-wrap gap-2">
          <Dialog><DialogTrigger asChild><Button variant="secondary">Modal</Button></DialogTrigger>
            <DialogContent title="Request changes" description="Tell the recruiter what to update."><Textarea /></DialogContent></Dialog>
          <Dialog><DialogTrigger asChild><Button variant="secondary">Drawer</Button></DialogTrigger>
            <DrawerContent title="Candidate summary" description="Contextual side panel">Details…</DrawerContent></Dialog>
          <ConfirmationDialog destructive title="Reject this job request?" description="The recruiter will be notified by email." confirmLabel="Reject"
            onConfirm={() => { toast.success("Job request rejected"); }} trigger={<Button variant="outlineDanger"><Trash2 />Reject</Button>} />
          <Button variant="secondary" onClick={() => toast("Saved", { description: "Your changes were stored." })}>Toast</Button>
        </div>
        <Tabs defaultValue="overview">
          <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="resume">Resume</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
          <TabsContent value="overview"><p className="text-sm text-foreground-2">Overview content.</p></TabsContent>
          <TabsContent value="resume"><p className="text-sm text-foreground-2">Resume content.</p></TabsContent>
          <TabsContent value="activity"><p className="text-sm text-foreground-2">Activity content.</p></TabsContent>
        </Tabs>
      </Section>

      <Section title="Loading, empty, errors">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /></Card>
          <EmptyState title="No candidates are waiting for review" description="New applicants will appear here once they apply." />
        </div>
        <Card><ErrorState compact variant="network" onRetry={() => {}} /></Card>
      </Section>
    </main>
  );
}
