import Link from "next/link";
import { Banknote, BellRing, Building2, Globe, Mail, Percent, ScrollText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Settings" };

const ITEMS = [
  { title: "Website content", description: "Hero, trusted companies, categories, testimonials, FAQ and contact details on the public site.", icon: Globe, href: "/admin/settings/website" },
  { title: "Platform settings", description: "Organisation details, default currency, payment timing and upload limits.", icon: Building2, href: "/admin/settings/platform" },
  { title: "Roles & permissions", description: "Who can do what across the platform.", icon: ShieldCheck, href: "/admin/settings/roles" },
  { title: "Email settings", description: "Provider, sender address and delivery tracking.", icon: Mail, href: "/admin/settings/email" },
  { title: "Email templates", description: "Edit the wording of every email, with a live preview.", icon: ScrollText, href: "/admin/templates" },
  { title: "Notification preferences", description: "Which events notify people, in the app and by email.", icon: BellRing, href: "/admin/settings/notifications" },
  { title: "Commission rules", description: "Percentage, fixed and per-recruiter commission.", icon: Percent, href: "/admin/commissions" },
  { title: "Payment settings", description: "When companies and candidates are expected to be paid.", icon: Banknote, href: "/admin/settings/platform" },
] as const;

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Configure how the platform looks and behaves." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ITEMS.map((i) => (
          <Link key={i.title} href={i.href}>
            <Card className="h-full p-5 transition-colors hover:border-secondary-green/50">
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-background-2 text-secondary-green"><i.icon className="size-5" /></span>
              <h2 className="font-semibold tracking-tight">{i.title}</h2>
              <p className="mt-1 text-sm text-foreground-2">{i.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
