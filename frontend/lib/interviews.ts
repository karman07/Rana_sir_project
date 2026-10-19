export interface InterviewItem {
  id: string; interviewNumber: string; applicationId: string; type: "VIDEO" | "PHONE" | "IN_PERSON"; status: string;
  startsAt: string; durationMinutes: number; timezone: string; round: number; stage?: "ADMIN" | "RECRUITER";
  meetingLink?: string; location?: string; phoneNumber?: string; interviewers: { name: string; email?: string }[];
  instructions?: string; notes?: string; cancelReason?: string; rescheduledFrom?: string; rescheduledTo?: string;
  job: { id: string; title?: string; company?: string; location?: string; jobNumber?: string };
  candidate: { id: string; name?: string; email?: string };
  recruiter?: { id: string; name?: string };
  history?: { status: string; at: string; byName?: string; reason?: string }[];
  feedback?: Feedback[];
}

export interface Feedback {
  id: string; authorName: string; authorRole: string; overallRating: number; technicalRating?: number; communicationRating?: number; cultureFit?: number;
  strengths?: string; weaknesses?: string; recommendation: "STRONG_HIRE" | "HIRE" | "MAYBE" | "REJECT"; notes?: string; createdAt: string;
}

/** Who is interviewing: our own team first, then the hiring company. */
export const stageLabel = (i: Pick<InterviewItem, "stage" | "round">, forCandidate = false) =>
  i.stage === "ADMIN" ? (forCandidate ? "Interview with our team" : `Our interview${i.round > 1 ? ` ${i.round}` : ""}`) : forCandidate ? "Interview with the hiring company" : `Company round ${i.round}`;

export const TYPE_LABEL = { VIDEO: "Video call", PHONE: "Phone call", IN_PERSON: "In person" } as const;
export const RECOMMENDATION_LABEL = { STRONG_HIRE: "Strong hire", HIRE: "Hire", MAYBE: "Maybe", REJECT: "Reject" } as const;
export const RECOMMENDATION_TONE = { STRONG_HIRE: "bg-success/15 text-success", HIRE: "bg-success/10 text-success", MAYBE: "bg-warning/14 text-warning", REJECT: "bg-danger/12 text-danger" } as const;

/** Has the interview's start time passed (so it can be closed out and reviewed)? */
export const hasStarted = (i: Pick<InterviewItem, "startsAt">) => +new Date(i.startsAt) <= Date.now();
export const isLive = (i: Pick<InterviewItem, "status">) => i.status === "SCHEDULED";
