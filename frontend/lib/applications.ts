import type { JobSpec } from "./jobs";

export interface ApplicationListItem {
  id: string; applicationNumber: string; status: string; createdAt: string; updatedAt: string;
  job: { id: string; jobNumber?: string; title?: string; location?: string; workMode?: string; employmentType?: string; status?: string };
  company: { id: string; name?: string };
  expectedSalary?: { amount: number; currency: string }; noticePeriodDays?: number;
  candidate?: { id: string; name?: string; email?: string }; adminScore?: number;
}

export interface StatusChange { status: string; at: string; role?: string; changedByName?: string; reason?: string; notes?: string; override?: boolean }
export interface AllowedTransition { to: string; reasonRequired: boolean; kind: "normal" | "reject" | "withdraw" | "override" }

export interface ApplicationDetail extends ApplicationListItem {
  jobSpec?: JobSpec; coverLetter?: string; relevantInfo?: string; statusHistory: StatusChange[]; transitions: AllowedTransition[];
  documents: { label: string; documentId: string }[]; resumeDocumentId?: string;
  company: { id: string; name?: string; location?: string };
  candidate?: { id: string; name: string; email: string; phone?: string; country?: string };
  candidateProfile?: {
    headline?: string; about?: string; location?: string; skills?: string[]; experienceYears?: number;
    experience?: { company: string; title: string; startDate?: string; endDate?: string; current?: boolean; description?: string }[];
    education?: { institution: string; degree: string; field?: string; startYear?: number; endYear?: number }[];
    expectedSalary?: { amount: number; currency: string }; noticePeriodDays?: number;
  };
  adminNotes?: string; recruiterNotes?: string; recruiterScore?: number; resumeScore?: number; tags?: string[];
  recruiterDecision?: { type: string; reason: string; byName?: string; pending: boolean; at: string };
}

/** Plain-language names for candidates (staff see the raw workflow names, humanised). */
export const CANDIDATE_STATUS: Record<string, { label: string; blurb: string }> = {
  APPLIED: { label: "Application received", blurb: "We've received your application. Our team will review it shortly." },
  ADMIN_REVIEW: { label: "Being reviewed", blurb: "Our recruitment team is reviewing your profile against the role." },
  ADMIN_INTERVIEW: { label: "Interview with our team", blurb: "Our team will interview you first. Check your interviews for the time." },
  ADMIN_SHORTLISTED: { label: "Shortlisted", blurb: "You made our shortlist. We're preparing your profile for the hiring company." },
  SENT_TO_RECRUITER: { label: "With the hiring company", blurb: "Your profile has been shared with the hiring company." },
  RECRUITER_REVIEW: { label: "Under company review", blurb: "The hiring company is reviewing your profile." },
  RECRUITER_APPROVED: { label: "Approved by the company", blurb: "The company wants to move forward. An interview is next." },
  INTERVIEW: { label: "Interview stage", blurb: "You're in the interview stage. Check your interviews for details." },
  SELECTED: { label: "Selected", blurb: "Congratulations — you've been selected. Your contract is being prepared." },
  CONTRACT: { label: "Contract stage", blurb: "Your contract is being finalised." },
  PLACED: { label: "Placed", blurb: "You're placed. Welcome aboard!" },
  REJECTED: { label: "Not progressing", blurb: "Unfortunately this application won't be moving forward. Keep an eye out for other roles." },
  WITHDRAWN: { label: "Withdrawn", blurb: "You withdrew this application." },
};

/** The journey shown to candidates (the main path). */
export const JOURNEY = ["APPLIED", "ADMIN_REVIEW", "SENT_TO_RECRUITER", "INTERVIEW", "SELECTED", "PLACED"] as const;

/** Maps any status to its position on the candidate journey. */
export function journeyIndex(status: string): number {
  const order: Record<string, number> = {
    APPLIED: 0, ADMIN_REVIEW: 1, ADMIN_INTERVIEW: 1, ADMIN_SHORTLISTED: 1, SENT_TO_RECRUITER: 2, RECRUITER_REVIEW: 2, RECRUITER_APPROVED: 3, INTERVIEW: 3, SELECTED: 4, CONTRACT: 4, PLACED: 5,
  };
  return order[status] ?? 0;
}

export const JOURNEY_LABELS = ["Applied", "Under review", "With company", "Interview", "Selected", "Placed"];

export const TERMINAL = ["PLACED", "REJECTED", "WITHDRAWN"];
export const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
