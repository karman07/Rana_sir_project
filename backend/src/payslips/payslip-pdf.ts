import { periodLabel } from '../common/pay-period';
import PDFDocument from 'pdfkit';
import type { PayslipData } from './schemas/payslip.schema';

const GREEN = '#173B2F', GOLD = '#B89A5A', INK = '#18211D', MUTED = '#6F766F', LINE = '#E4DED1';

/** Built-in PDF fonts only cover Western European text, so anything else is simplified rather than printed as garbage. */
const safe = (s: string | undefined) => (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e -ÿ]/g, '?');

const num = (n: number, currency: string) => {
  const minor = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return `${currency} ${(n / 10 ** minor).toLocaleString('en', { minimumFractionDigits: minor, maximumFractionDigits: minor })}`;
};
const monthName = periodLabel;
const day = (ymd?: string) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

/** Renders a payslip as an A4 PDF. The same data always produces the same document. */
export interface Brand { name: string; supportEmail?: string }
export function renderPayslipPdf(d: PayslipData, checksum: string, brand: Brand = { name: 'Talentbridge' }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Payslip ${d.payslipNumber}`, Author: 'Talentbridge', Subject: `Pay for ${monthName(d.period)}` }, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 100;

    // header
    doc.rect(0, 0, doc.page.width, 92).fill(GREEN);
    doc.fillColor('#F7F4EC').font('Helvetica-Bold').fontSize(20).text(safe(brand.name), 50, 34);
    doc.fillColor(GOLD).fontSize(20).text('.', 50 + doc.widthOfString(safe(brand.name)), 34);
    doc.fillColor('#F7F4EC').font('Helvetica').fontSize(11).text('PAYSLIP', 50, 38, { width: W, align: 'right', characterSpacing: 2 });
    doc.fontSize(9).fillColor('#D0B477').text(d.payslipNumber, 50, 56, { width: W, align: 'right' });

    // title
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(`Pay for ${monthName(d.period)}`, 50, 118);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${day(d.periodStart)} – ${day(d.periodEnd)}  ·  Issued ${day(d.issuedOn)}`, 50, 142);

    // two columns: who and for what
    const col = (x: number, y: number, w: number, title: string, rows: [string, string][]) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(title.toUpperCase(), x, y, { characterSpacing: 1 });
      let yy = y + 16;
      for (const [k, v] of rows) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, x, yy, { width: 56 });
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(safe(v), x + 58, yy - 1, { width: w - 58, lineBreak: false, ellipsis: true });
        yy += 17;
      }
      return yy;
    };
    const y1 = col(50, 178, W * 0.52, 'Paid to', [['Name', d.candidate.name], ['Email', d.candidate.email]]);
    const y2 = col(50 + W * 0.56, 178, W * 0.44, 'Engagement', [['Role', d.jobTitle], ['Company', d.company], ['Contract', `${d.contractNumber} (v${d.contractVersion})`]]);
    let y = Math.max(y1, y2) + 14;

    // earnings table
    doc.moveTo(50, y).lineTo(50 + W, y).strokeColor(LINE).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('DESCRIPTION', 50, y, { characterSpacing: 1 }).text('AMOUNT', 50, y, { width: W, align: 'right', characterSpacing: 1 });
    y += 20;
    for (const l of d.lines) {
      doc.font('Helvetica').fontSize(11).fillColor(INK).text(safe(l.label), 50, y, { width: W - 140 });
      doc.text(num(l.amount, d.currency), 50, y, { width: W, align: 'right' });
      y += 17;
      if (l.detail) { doc.fontSize(9).fillColor(MUTED).text(safe(l.detail), 50, y - 2, { width: W - 140 }); y += 16; }
      y += 6;
    }
    doc.moveTo(50, y).lineTo(50 + W, y).strokeColor(LINE).stroke();
    y += 16;

    // net pay
    doc.roundedRect(50, y, W, 56, 8).fill('#F7F4EC');
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('NET PAY', 66, y + 14, { characterSpacing: 1 });
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(22).text(num(d.netPay, d.currency), 66, y + 26, { width: W - 32, align: 'right' });
    y += 76;

    // how it was paid
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('PAYMENT', 50, y, { characterSpacing: 1 });
    y += 16;
    for (const [k, v] of [['Paid on', day(d.payment.paidOn)], ['Method', d.payment.method ?? '—'], ['Reference', d.payment.reference ?? '—']] as [string, string][]) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, 50, y, { width: 80 });
      doc.fontSize(10).fillColor(INK).text(safe(v), 130, y - 1, { width: W - 80 });
      y += 17;
    }

    // footer
    doc.moveTo(50, 748).lineTo(50 + W, 748).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('This payslip is a permanent record of the payment above. Later changes to a contract do not alter it.', 50, 756, { width: W, lineBreak: false });
    doc.text(`Verification code ${checksum.slice(0, 16).toUpperCase()}${brand.supportEmail ? `   ·   Questions: ${safe(brand.supportEmail)}` : ''}`, 50, 770, { width: W, lineBreak: false });
    doc.end();
  });
}
