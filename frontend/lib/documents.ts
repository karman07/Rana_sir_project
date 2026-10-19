import { toast } from "sonner";
import { API_URL, apiPost, ApiError } from "./api";

export interface DocumentItem {
  id: string; type: string; label?: string; version: number; status: "ACTIVE" | "ARCHIVED"; originalName: string; mime: string; size: number; createdAt: string;
  related?: { type: string; id: string };
  owner?: { id: string; name: string; email: string; role: string };
}

export const TYPE_LABEL: Record<string, string> = {
  RESUME: "Resume", COVER_LETTER: "Cover letter", IDENTIFICATION: "Identification", CERTIFICATE: "Certificate", OFFER_LETTER: "Offer letter", CONTRACT: "Contract",
  PAYSLIP: "Payslip", PAYMENT_PROOF: "Proof of payment", INTERVIEW: "Interview", OTHER: "Other",
};
export const UPLOAD_TYPES = ["IDENTIFICATION", "CERTIFICATE", "COVER_LETTER", "OTHER"] as const;

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** The page a document belongs to, for the roles that can open it. */
export const relatedHref = (d: DocumentItem, role: "admin" | "recruiter" | "candidate") =>
  d.related?.type === "Contract" ? `/${role}/contracts/${d.related.id}` : undefined;

/**
 * Opens a file through a short-lived signed link, in a new tab (or as a download). The tab is opened first, in response to the click,
 * so the browser doesn't block it, and then pointed at the link once the server has issued it.
 */
export async function openDocument(id: string, opts: { inline?: boolean } = {}) {
  const tab = opts.inline ? window.open("", "_blank") : null;
  try {
    const r = await apiPost<{ path: string }>(`/documents/${id}/link`, { inline: !!opts.inline });
    const url = `${API_URL}${r.path}`;
    if (tab) tab.location.href = url; else window.location.assign(url);
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Could not open that file");
  }
}
