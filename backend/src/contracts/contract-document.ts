import PDFDocument from 'pdfkit';
import { formatMoney } from '@rms/shared';
import type { CommissionCalculationService } from './commission-calculation.service';
import type { ContractTerms } from './schemas/contract-version.schema';

export type DocKind = 'OFFER' | 'CONTRACT';
export type DocAudience = 'CANDIDATE' | 'COMPANY';

/** Everything a contract document says. It never contains the platform's commission or split, for either audience. */
export interface ContractDocView {
  kind: DocKind; audience: DocAudience; contractNumber: string; version: number; issuedOn: string;
  candidate: { name: string; email: string }; company: string; jobTitle: string; employmentType: string;
  pay: { amount: number; currency: string; period: 'HOUR' | 'MONTH' | 'YEAR'; hoursPerWeek?: number };
  startDate: string; endDate?: string; workingHours?: string; probationMonths?: number; noticePeriodDays?: number; renewalTerms?: string; notes?: string;
  accepted?: { by: string; on: string };
}

/**
 * Builds the view for one reader. The candidate's copy states the pay they receive; the company's copy states the rate the company pays.
 * Each is consistent with what that person sees everywhere else in the app.
 */
export function buildContractDocView(
  input: { kind: DocKind; audience: DocAudience; contractNumber: string; version: number; terms: ContractTerms; candidate: { name: string; email: string }; company: string; jobTitle: string; accepted?: { by: string; on: string } },
  calc: CommissionCalculationService,
): ContractDocView {
  const t = input.terms;
  const amount = input.audience === 'CANDIDATE' ? Math.round(t.salary.amount * calc.candidateShare(t.salary, t.salary.currency, t.commission)) : t.salary.amount;
  return {
    kind: input.kind, audience: input.audience, contractNumber: input.contractNumber, version: input.version, issuedOn: new Date().toISOString().slice(0, 10),
    candidate: input.candidate, company: input.company, jobTitle: input.jobTitle || t.title, employmentType: t.employmentType,
    pay: { amount, currency: t.salary.currency, period: t.salary.period, hoursPerWeek: t.salary.hoursPerWeek },
    startDate: t.startDate, endDate: t.endDate, workingHours: t.workingHours, probationMonths: t.probationMonths, noticePeriodDays: t.noticePeriodDays, renewalTerms: t.renewalTerms, notes: t.notes,
    accepted: input.accepted,
  };
}

const GREEN = '#173B2F', GOLD = '#B89A5A', INK = '#18211D', MUTED = '#6F766F', LINE = '#E4DED1';
const safe = (s?: string) => (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e -ÿ]/g, '?');
const day = (ymd?: string) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const EMPLOYMENT: Record<string, string> = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', TEMPORARY: 'Temporary', INTERNSHIP: 'Internship' };

export const payLine = (p: ContractDocView['pay']) => {
  const code = new Intl.NumberFormat('en', { style: 'currency', currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = `${p.currency} ${(p.amount / 10 ** code).toLocaleString('en', { minimumFractionDigits: code, maximumFractionDigits: code })}`;
  return `${money} ${p.period === 'HOUR' ? 'per hour' : p.period === 'MONTH' ? 'per month' : 'per year'}${p.period === 'HOUR' && p.hoursPerWeek ? `, about ${p.hoursPerWeek} hours a week` : ''}`;
};
void formatMoney;

export function renderContractPdf(v: ContractDocView, brand: { name: string; supportEmail?: string } = { name: 'Talentbridge' }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const offer = v.kind === 'OFFER';
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${offer ? 'Offer' : 'Contract'} ${v.contractNumber}`, Author: 'Talentbridge' }, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 100;

    doc.rect(0, 0, doc.page.width, 92).fill(GREEN);
    doc.fillColor('#F7F4EC').font('Helvetica-Bold').fontSize(20).text(safe(brand.name), 50, 34);
    doc.fillColor(GOLD).text('.', 50 + doc.widthOfString(safe(brand.name)), 34);
    doc.fillColor('#F7F4EC').font('Helvetica').fontSize(11).text(offer ? 'OFFER OF ENGAGEMENT' : 'ENGAGEMENT CONTRACT', 50, 38, { width: W, align: 'right', characterSpacing: 2 });
    doc.fontSize(9).fillColor('#D0B477').text(`${v.contractNumber} · version ${v.version}`, 50, 56, { width: W, align: 'right' });

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(safe(v.jobTitle), 50, 118, { width: W });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${safe(v.company)}  ·  Issued ${day(v.issuedOn)}`, 50, 142);

    let y = 176;
    const rows: [string, string][] = [
      [v.audience === 'CANDIDATE' ? 'Engaged' : 'Candidate', `${v.candidate.name} (${v.candidate.email})`],
      ['Company', v.company],
      ['Role', v.jobTitle],
      ['Type', EMPLOYMENT[v.employmentType] ?? v.employmentType],
      [v.audience === 'CANDIDATE' ? 'Your pay' : 'Rate', payLine(v.pay)],
      ['Starts', day(v.startDate)],
      ['Ends', v.endDate ? day(v.endDate) : 'Open-ended'],
    ];
    if (v.workingHours) rows.push(['Working hours', v.workingHours]);
    if (v.probationMonths !== undefined) rows.push(['Probation', `${v.probationMonths} month${v.probationMonths === 1 ? '' : 's'}`]);
    if (v.noticePeriodDays !== undefined) rows.push(['Notice period', `${v.noticePeriodDays} days`]);
    if (v.renewalTerms) rows.push(['Renewal', v.renewalTerms]);
    doc.moveTo(50, y - 8).lineTo(50 + W, y - 8).strokeColor(LINE).stroke();
    for (const [k, val] of rows) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k.toUpperCase(), 50, y + 2, { width: 110, characterSpacing: 0.5 });
      const h = doc.font('Helvetica').fontSize(11).fillColor(INK).heightOfString(safe(val), { width: W - 130 });
      doc.text(safe(val), 170, y, { width: W - 120 });
      y += Math.max(22, h + 10);
    }
    doc.moveTo(50, y).lineTo(50 + W, y).strokeColor(LINE).stroke();
    y += 16;
    if (v.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', 50, y, { characterSpacing: 0.5 });
      doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(safe(v.notes), 50, y + 14, { width: W });
      y = doc.y + 16;
    }
    doc.roundedRect(50, y, W, 58, 8).fill('#F7F4EC');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(v.accepted ? 'Accepted' : offer ? 'For your review' : 'Awaiting acceptance', 66, y + 12);
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(
      v.accepted ? `Accepted by ${safe(v.accepted.by)} on ${day(v.accepted.on)} through Talentbridge.` : 'Review these terms in your Talentbridge account, then accept, or ask for changes.', 66, y + 28, { width: W - 32 },
    );

    doc.moveTo(50, 748).lineTo(50 + W, 748).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('A change to these terms creates a new version. Earlier versions are kept and never altered.', 50, 756, { width: W, lineBreak: false });
    doc.text(`${v.contractNumber} · version ${v.version}${brand.supportEmail ? `   ·   Questions: ${safe(brand.supportEmail)}` : ''}`, 50, 770, { width: W, lineBreak: false });
    doc.end();
  });
}
