"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { EmailStatus } from "@/lib/communication";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";

function Row({ label, children, ok }: { label: string; children: React.ReactNode; ok?: boolean }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-sm">{ok !== undefined && (ok ? <CheckCircle2 className="size-4 text-success" /> : <TriangleAlert className="size-4 text-gold" />)}{children}</dd>
    </div>
  );
}

export function EmailSettings() {
  const q = useQuery({ queryKey: ["emails", "status"], queryFn: () => api<EmailStatus>("/emails/status") });
  const s = q.data;
  return (
    <>
      <Link href="/admin/settings" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Settings</Link>
      <PageHeader title="Email settings" description="How email is set up. Keys and secrets live in the server's environment, and are never shown here." />
      {!s ? <Skeleton className="h-64 w-full max-w-3xl rounded-[16px]" /> : (
        <div className="max-w-3xl space-y-5">
          {!s.live && (
            <Card className="border-gold/40 bg-gold-soft/40"><CardBody className="flex items-start gap-3"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-gold" /><div><p className="font-medium">Emails are not being delivered</p><p className="mt-1 text-sm text-foreground-2">No email provider key is set on the server, so messages are recorded but never leave the system. Add the Resend key to the server's environment to start sending.</p></div></CardBody></Card>
          )}
          <Card>
            <CardHeader title="Delivery" />
            <CardBody>
              <dl className="divide-y divide-divider">
                <Row label="Provider" ok={s.live}>{s.live ? "Resend" : "None (log only)"}</Row>
                <Row label="Sends from">{s.from}</Row>
                <Row label="Background sender" ok={s.worker === "on"}>{s.worker === "on" ? "Running: emails go out within moments, and failed ones retry" : "Off: emails queue up but are not sent"}</Row>
                <Row label="Delivery tracking" ok={s.webhookSigned}>{s.webhookSigned ? "Signed delivery reports from the provider are accepted" : "Not set up: sent emails won't show as delivered or bounced"}</Row>
                <Row label="Links point to">{s.webOrigin}</Row>
              </dl>
            </CardBody>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link href="/admin/emails">Open the email log</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/templates">Edit email templates</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/settings/notifications">Notification preferences</Link></Button>
          </div>
        </div>
      )}
    </>
  );
}
