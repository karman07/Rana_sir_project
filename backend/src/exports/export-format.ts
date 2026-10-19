import ExcelJS from 'exceljs';

export type ColType = 'text' | 'money' | 'number' | 'date' | 'datetime';
export interface Column { key: string; label: string; type?: ColType; width?: number }
export type Row = Record<string, string | number | boolean | Date | null | undefined>;

/** A cell starting with = + - @ would run as a formula in Excel; a leading apostrophe-quote keeps it as plain text. */
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const iso = (d: Date, type?: ColType) => (type === 'date' ? d.toISOString().slice(0, 10) : d.toISOString().replace('T', ' ').slice(0, 19));

function cell(v: Row[string], type?: ColType): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return iso(v, type);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return type === 'money' ? v.toFixed(2) : String(v);
  return safeText(v);
}

/** CSV that opens correctly in Excel: UTF-8 with a byte-order mark, CRLF lines, every field quoted when needed. */
export function toCsv(columns: Column[], rows: Row[]): Buffer {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(cell(r[c.key], c.type))).join(','))];
  return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}

/** A real workbook: bold frozen header, money as numbers with two decimals (so it sums), dates as dates, sensible widths. */
export async function toXlsx(sheetName: string, columns: Column[], rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Talentbridge'; wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? (c.type === 'money' || c.type === 'number' ? 14 : c.type === 'date' ? 13 : c.type === 'datetime' ? 20 : 24) }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFDF8' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B2F' } };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const r of rows) {
    ws.addRow(Object.fromEntries(columns.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined || v === '') return [c.key, null];
      if (v instanceof Date) return [c.key, v];
      if (typeof v === 'boolean') return [c.key, v ? 'Yes' : 'No'];
      if (typeof v === 'number') return [c.key, v];
      return [c.key, safeText(v)];
    })));
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'money') col.numFmt = '#,##0.00';
    if (c.type === 'date') col.numFmt = 'yyyy-mm-dd';
    if (c.type === 'datetime') col.numFmt = 'yyyy-mm-dd hh:mm';
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
