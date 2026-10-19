/** Variables a template may use, so a typo fails loudly instead of sending an email with a hole in it. */
export const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function variablesIn(...texts: (string | undefined)[]): string[] {
  const found = new Set<string>();
  for (const t of texts) if (t) for (const m of t.matchAll(VAR_PATTERN)) found.add(m[1]);
  return [...found];
}

/**
 * Template bodies are HTML written by Admin and end up in other people's inboxes. This strips what could ever run or phone home:
 * scripts, frames, embeds, forms, inline event handlers and javascript: links. Ordinary formatting and links are kept.
 */
export function sanitizeBody(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*("|')?\s*(javascript|data|vbscript)\s*:[^"'>\s]*/gi, '$1=$2#');
}

/** Believable sample values for previews and test sends, so an editor sees a finished email rather than {{placeholders}}. */
export const SAMPLE_VALUES: Record<string, string> = {
  name: 'Alex', link: 'https://example.com/open', subject: 'A short update', message: 'Here is a short message for you.',
  jobTitle: 'Product Designer', companyName: 'Northwind Labs', candidateName: 'Priya Sharma', recruiterName: 'Marcus Webb', recruiterEmail: 'marcus@example.com',
  amount: '$2,400.00', amountDue: '$2,400.00', period: 'October 2026', payslipMonth: 'October 2026', dueDate: '5 Nov 2026', expectedDate: '14 Nov 2026', reason: 'Waiting for the company to release funds',
  method: 'Bank transfer', reference: 'UTR-2026-4471', interviewDate: 'Tue 14 Oct 2026', interviewTime: '10:30 AM', interviewMode: 'Video call', location: 'Google Meet',
  contractStartDate: '1 Nov 2026', contractEndDate: '30 Apr 2027', salary: '$24.00 / hour', senderName: 'Sam Lee', senderEmail: 'sam@example.com',
};
