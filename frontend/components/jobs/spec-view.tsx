import { formatMoney } from "@rms/shared";
import { EMPLOYMENT_LABEL, PAY_BASIS_SUFFIX, PAY_FREQUENCY_LABEL, WORK_MODE_LABEL, type JobSpec } from "@/lib/jobs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === undefined || children === null || children === "" || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{children}</dd>
    </div>
  );
}

const Chips = ({ items }: { items?: string[] }) =>
  items?.length ? <span className="flex flex-wrap gap-1.5">{items.map((i) => <span key={i} className="rounded-md bg-background-2 px-2 py-0.5 text-xs">{i}</span>)}</span> : null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody><dl className="divide-y divide-divider">{children}</dl></CardBody>
    </Card>
  );
}

/** Read-only rendering of a job spec. `internal` shows admin-only fields (special instructions). */
export function SpecView({ spec, internal = true, locale }: { spec: JobSpec; internal?: boolean; locale?: string }) {
  const q = spec.requirements, c = spec.compensation, k = spec.contract, d = spec.details;
  const money = (n?: number) => (n !== undefined && c?.currency ? formatMoney({ amount: n, currency: c.currency }, locale) : undefined);
  const range = c?.salaryMin !== undefined && c?.salaryMax !== undefined ? `${money(c.salaryMin)} – ${money(c.salaryMax)} ${PAY_BASIS_SUFFIX[c.payBasis ?? "MONTH"]}${c.payFrequency && c.payFrequency !== "MONTHLY" ? ` · paid ${PAY_FREQUENCY_LABEL[c.payFrequency].toLowerCase()}` : ""}` : undefined;
  const exp = q?.experienceMin !== undefined ? `${q.experienceMin}${q.experienceMax !== undefined ? `–${q.experienceMax}` : "+"} years` : undefined;

  return (
    <div className="space-y-4">
      <Section title="Role">
        <Row label="Title">{spec.title}</Row>
        <Row label="Department">{spec.department}</Row>
        <Row label="Location">{[spec.location, spec.workMode && WORK_MODE_LABEL[spec.workMode]].filter(Boolean).join(" · ")}</Row>
        <Row label="Employment">{spec.employmentType && EMPLOYMENT_LABEL[spec.employmentType]}</Row>
        <Row label="Openings">{spec.openings}</Row>
      </Section>
      <Section title="Requirements">
        <Row label="Experience">{exp}</Row>
        <Row label="Education">{q?.education}</Row>
        <Row label="Technical skills"><Chips items={q?.technicalSkills} /></Row>
        <Row label="Soft skills"><Chips items={q?.softSkills} /></Row>
        <Row label="Certifications"><Chips items={q?.certifications} /></Row>
        <Row label="Languages"><Chips items={q?.languages} /></Row>
      </Section>
      <Section title="Compensation">
        <Row label="Pay"><span className="font-medium tabular-nums">{range}</span></Row>
        <Row label="Benefits"><Chips items={c?.benefits} /></Row>
        <Row label="Bonus">{c?.bonus}</Row>
        <Row label="Hours per week">{c?.hoursPerWeek}</Row>
      </Section>
      <Section title="Contract">
        <Row label="Duration">{k?.durationMonths !== undefined ? `${k.durationMonths} months` : undefined}</Row>
        <Row label="Probation">{k?.probationMonths !== undefined ? `${k.probationMonths} months` : undefined}</Row>
        <Row label="Working hours">{k?.workingHours}</Row>
        <Row label="Notice period">{k?.noticePeriodDays !== undefined ? `${k.noticePeriodDays} days` : undefined}</Row>
        <Row label="Renewal terms">{k?.renewalTerms}</Row>
      </Section>
      <Section title="Details">
        <Row label="Description">{d?.description}</Row>
        <Row label="Responsibilities">{d?.responsibilities}</Row>
        <Row label="Requirements">{d?.requirementsText}</Row>
        <Row label="Required documents"><Chips items={d?.requiredDocuments} /></Row>
        {internal && <Row label="Special instructions (internal)">{d?.specialInstructions}</Row>}
      </Section>
    </div>
  );
}
