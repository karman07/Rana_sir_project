import { EmploymentType, WorkMode, fromMinor, toMinor } from "@rms/shared";

export type PayBasis = "HOUR" | "MONTH" | "FIXED";
export const PAY_BASIS_LABEL: Record<PayBasis, string> = { HOUR: "Per hour", MONTH: "Per month", FIXED: "Fixed price for the job" };
export const PAY_BASIS_SUFFIX: Record<PayBasis, string> = { HOUR: "/ hr", MONTH: "/ month", FIXED: "fixed" };

export type PayFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export const PAY_FREQUENCY_LABEL: Record<PayFrequency, string> = { DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month" };

export interface JobSpec {
  title?: string; department?: string; location?: string; workMode?: string; employmentType?: string; openings?: number;
  requirements?: { experienceMin?: number; experienceMax?: number; education?: string; technicalSkills?: string[]; softSkills?: string[]; certifications?: string[]; languages?: string[] };
  compensation?: { salaryMin?: number; salaryMax?: number; currency?: string; benefits?: string[]; bonus?: string; payBasis?: PayBasis; payFrequency?: PayFrequency; hoursPerWeek?: number };
  contract?: { durationMonths?: number; probationMonths?: number; workingHours?: string; noticePeriodDays?: number; renewalTerms?: string };
  details?: { description?: string; responsibilities?: string; requirementsText?: string; specialInstructions?: string; requiredDocuments?: string[] };
}

export interface ReviewEvent { action: string; byName?: string; byRole?: string; note?: string; version: number; at: string }

export interface JobRequest {
  id: string; requestNumber: string; status: string; version: number; spec: JobSpec; companyId: string;
  company?: { id: string; name: string; industry?: string; location?: string };
  recruiter?: { id: string; name: string; email: string };
  submittedAt?: string; updatedAt: string; createdAt: string;
  reviews: ReviewEvent[]; revisions?: { version: number; submittedAt: string; spec: JobSpec }[]; jobId?: string;
}

export interface Job {
  id: string; jobRequestId?: string; jobNumber: string; status: string; publishedAt?: string; closedAt?: string; closeReason?: string; createdAt: string;
  company: { id: string; name: string; industry?: string; location?: string; logoUrl?: string };
  spec: JobSpec;
}

export const WORK_MODE_LABEL: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };
export const EMPLOYMENT_LABEL: Record<string, string> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", TEMPORARY: "Temporary", INTERNSHIP: "Internship" };
export const WORK_MODES = Object.values(WorkMode);
export const EMPLOYMENT_TYPES = Object.values(EmploymentType);

/* ---------- Form <-> API conversion (form holds strings, money in major units) ---------- */

export interface JobFormValues {
  companyId: string; title: string; department: string; location: string; workMode: string; employmentType: string; openings: string;
  experienceMin: string; experienceMax: string; education: string; technicalSkills: string[]; softSkills: string[]; certifications: string[]; languages: string[];
  currency: string; salaryMin: string; salaryMax: string; benefits: string[]; bonus: string; payBasis: string; payFrequency: string; hoursPerWeek: string;
  durationMonths: string; probationMonths: string; workingHours: string; noticePeriodDays: string; renewalTerms: string;
  description: string; responsibilities: string; requirementsText: string; specialInstructions: string; requiredDocuments: string[];
}

export const emptyForm = (currency = "USD"): JobFormValues => ({
  companyId: "", title: "", department: "", location: "", workMode: "", employmentType: "", openings: "1",
  experienceMin: "", experienceMax: "", education: "", technicalSkills: [], softSkills: [], certifications: [], languages: [],
  currency, salaryMin: "", salaryMax: "", benefits: [], bonus: "", payBasis: "MONTH", payFrequency: "MONTHLY", hoursPerWeek: "",
  durationMonths: "", probationMonths: "", workingHours: "", noticePeriodDays: "", renewalTerms: "",
  description: "", responsibilities: "", requirementsText: "", specialInstructions: "", requiredDocuments: [],
});

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));
const str = (s: string) => (s.trim() === "" ? undefined : s.trim());
const arr = (a: string[]) => a;

export function formToSpec(v: JobFormValues): JobSpec {
  const cur = v.currency || undefined;
  const sMin = num(v.salaryMin), sMax = num(v.salaryMax);
  return {
    title: str(v.title), department: str(v.department), location: str(v.location),
    workMode: str(v.workMode), employmentType: str(v.employmentType), openings: num(v.openings),
    requirements: { experienceMin: num(v.experienceMin), experienceMax: num(v.experienceMax), education: str(v.education), technicalSkills: arr(v.technicalSkills), softSkills: arr(v.softSkills), certifications: arr(v.certifications), languages: arr(v.languages) },
    compensation: {
      currency: cur, salaryMin: sMin !== undefined && cur ? toMinor(sMin, cur) : undefined, salaryMax: sMax !== undefined && cur ? toMinor(sMax, cur) : undefined,
      benefits: arr(v.benefits), bonus: str(v.bonus),
      payBasis: (str(v.payBasis) as PayBasis | undefined) ?? "MONTH", payFrequency: (str(v.payFrequency) as PayFrequency | undefined) ?? "MONTHLY", hoursPerWeek: v.payBasis === "HOUR" ? num(v.hoursPerWeek) : undefined,
    },
    contract: { durationMonths: num(v.durationMonths), probationMonths: num(v.probationMonths), workingHours: str(v.workingHours), noticePeriodDays: num(v.noticePeriodDays), renewalTerms: str(v.renewalTerms) },
    details: { description: str(v.description), responsibilities: str(v.responsibilities), requirementsText: str(v.requirementsText), specialInstructions: str(v.specialInstructions), requiredDocuments: arr(v.requiredDocuments) },
  };
}

/** Drop undefined so PATCH only carries what the user filled in (server merges groups). */
export function compact<T>(o: T): T {
  if (Array.isArray(o)) return o as T;
  if (o && typeof o === "object") {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, compact(v)])) as T;
  }
  return o;
}

const s = (n?: number) => (n === undefined || n === null ? "" : String(n));

export function specToForm(r: JobRequest, fallbackCurrency: string): JobFormValues {
  const sp = r.spec ?? {}, q = sp.requirements ?? {}, c = sp.compensation ?? {}, k = sp.contract ?? {}, d = sp.details ?? {};
  const cur = c.currency ?? fallbackCurrency;
  return {
    companyId: r.companyId, title: sp.title ?? "", department: sp.department ?? "", location: sp.location ?? "", workMode: sp.workMode ?? "", employmentType: sp.employmentType ?? "", openings: s(sp.openings) || "1",
    experienceMin: s(q.experienceMin), experienceMax: s(q.experienceMax), education: q.education ?? "", technicalSkills: q.technicalSkills ?? [], softSkills: q.softSkills ?? [], certifications: q.certifications ?? [], languages: q.languages ?? [],
    currency: cur, salaryMin: c.salaryMin !== undefined ? String(fromMinor(c.salaryMin, cur)) : "", salaryMax: c.salaryMax !== undefined ? String(fromMinor(c.salaryMax, cur)) : "",
    benefits: c.benefits ?? [], bonus: c.bonus ?? "", payBasis: c.payBasis ?? "MONTH", payFrequency: c.payFrequency ?? "MONTHLY", hoursPerWeek: s(c.hoursPerWeek),
    durationMonths: s(k.durationMonths), probationMonths: s(k.probationMonths), workingHours: k.workingHours ?? "", noticePeriodDays: s(k.noticePeriodDays), renewalTerms: k.renewalTerms ?? "",
    description: d.description ?? "", responsibilities: d.responsibilities ?? "", requirementsText: d.requirementsText ?? "", specialInstructions: d.specialInstructions ?? "", requiredDocuments: d.requiredDocuments ?? [],
  };
}

/* ---------- Diff between two revisions, for the admin review screen ---------- */

const LABELS: Record<string, string> = {
  title: "Title", department: "Department", location: "Location", workMode: "Work mode", employmentType: "Employment type", openings: "Openings",
  "requirements.experienceMin": "Min experience", "requirements.experienceMax": "Max experience", "requirements.education": "Education",
  "requirements.technicalSkills": "Technical skills", "requirements.softSkills": "Soft skills", "requirements.certifications": "Certifications", "requirements.languages": "Languages",
  "compensation.salaryMin": "Min salary", "compensation.salaryMax": "Max salary", "compensation.currency": "Currency", "compensation.payFrequency": "Paid", "compensation.benefits": "Benefits", "compensation.bonus": "Bonus", "compensation.payBasis": "Pay basis", "compensation.hoursPerWeek": "Hours per week",
  "contract.durationMonths": "Duration (months)", "contract.probationMonths": "Probation (months)", "contract.workingHours": "Working hours", "contract.noticePeriodDays": "Notice period (days)", "contract.renewalTerms": "Renewal terms",
  "details.description": "Description", "details.responsibilities": "Responsibilities", "details.requirementsText": "Requirements", "details.specialInstructions": "Special instructions", "details.requiredDocuments": "Required documents",
};

function flatten(o: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = o;
  return out;
}

export interface FieldChange { label: string; from: unknown; to: unknown }

export function diffSpecs(a: JobSpec, b: JobSpec): FieldChange[] {
  const fa = flatten(a), fb = flatten(b);
  return Object.keys(LABELS)
    .filter((k) => JSON.stringify(fa[k] ?? null) !== JSON.stringify(fb[k] ?? null))
    .map((k) => ({ label: LABELS[k], from: fa[k], to: fb[k] }));
}

/** "₹500 – ₹800 / hr", "₹25,000 – ₹40,000 / month" or "₹5,000 – ₹9,000 fixed". Null if the range isn't set. */
export function payLabel(c: JobSpec["compensation"], formatMoney: (m: { amount: number; currency: string }) => string): string | null {
  if (!c || c.salaryMin === undefined || c.salaryMax === undefined || !c.currency) return null;
  const f = (n: number) => formatMoney({ amount: n, currency: c.currency! }).replace(/\.00$/, "");
  const range = c.salaryMin === c.salaryMax ? f(c.salaryMin) : `${f(c.salaryMin)} – ${f(c.salaryMax)}`;
  return `${range} ${PAY_BASIS_SUFFIX[c.payBasis ?? "MONTH"]}`;
}
