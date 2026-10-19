export interface Match {
  overall: number;
  skills: { percent: number; matched: string[]; missing: string[] };
  experience: { percent: number; years: number | null; required: string };
  salary: { percent: number | null; note: string };
}

export interface RankingRow {
  id: string; applicationNumber: string; status: string; createdAt: string;
  candidate: { id: string; name: string; email: string; headline?: string; location?: string };
  experienceYears: number | null; skills: string[]; match: Match; resumeScore: number | null; adminScore: number | null; tags: string[]; hasNotes: boolean;
  expectedSalary: { amount: number; currency: string } | null; noticePeriodDays: number | null;
  recruiterDecision?: { type: string; reason: string; byName?: string };
}

export interface Ranking {
  job: { id: string; jobNumber: string; title: string; company: string; openings?: number; status: string; skills: string[] };
  rows: RankingRow[];
}

export interface QueueJob {
  id: string; jobNumber: string; title: string; company?: string; location?: string; applied: number; inReview: number; shortlisted: number; waiting: number; oldest?: string;
}

export interface CompareColumn {
  id: string; applicationNumber: string; status: string; job: { id: string; title: string; jobNumber: string };
  candidate: { id: string; name: string; email: string; headline?: string; location?: string };
  experienceYears: number | null; skills: string[]; education: string[]; expectedSalary: { amount: number; currency: string } | null; noticePeriodDays: number | null;
  adminScore: number | null; resumeScore: number | null; tags: string[]; match: Match;
}

/** Colour for a 0-100 value: green strong, gold middling, red weak. */
export const scoreTone = (n: number | null) => (n === null ? "text-muted" : n >= 75 ? "text-success" : n >= 50 ? "text-warning" : "text-danger");
