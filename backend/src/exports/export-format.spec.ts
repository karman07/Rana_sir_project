import ExcelJS from 'exceljs';
import { toCsv, toXlsx, type Column } from './export-format';

const cols: Column[] = [{ key: 'name', label: 'Name' }, { key: 'pay', label: 'Pay', type: 'money' }, { key: 'on', label: 'On', type: 'date' }, { key: 'ok', label: 'OK' }];

describe('export formats', () => {
  it('write CSV that Excel opens correctly, with escaping', () => {
    const buf = toCsv(cols, [{ name: 'Smith, "Jo"', pay: 1234.5, on: new Date('2026-10-08T10:00:00Z'), ok: true }, { name: 'Zoë\nLine2', pay: null, on: undefined, ok: false }]);
    const text = buf.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM so accents survive
    expect(text).toContain('Name,Pay,On,OK\r\n');
    expect(text).toContain('"Smith, ""Jo""",1234.50,2026-10-08,Yes');
    expect(text).toContain('"Zoë\nLine2",,,No');
  });

  it('defuse spreadsheet formulas in text cells', () => {
    const text = toCsv([{ key: 'n', label: 'N' }], [{ n: '=HYPERLINK("http://evil","x")' }, { n: '+1+1' }, { n: '-2' }, { n: '@SUM(A1)' }, { n: 'plain' }]).toString('utf8');
    for (const bad of ['\r\n=HYPERLINK', '\r\n+1', '\r\n-2', '\r\n@SUM']) expect(text).not.toContain(bad);
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain('plain');
  });

  it('write a workbook whose money is a number and whose header is frozen', async () => {
    const buf = await toXlsx('Payments', cols, [{ name: '=cmd', pay: 1234.5, on: new Date('2026-10-08T00:00:00Z'), ok: true }]);
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // a zip, as xlsx is
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet('Payments')!;
    expect(ws.getRow(1).values).toEqual([undefined, 'Name', 'Pay', 'On', 'OK']);
    expect(ws.getCell('B2').value).toBe(1234.5);
    expect(ws.getCell('B2').numFmt).toBe('#,##0.00');
    expect(ws.getCell('A2').value).toBe("'=cmd");
    expect(ws.getCell('C2').value).toEqual(new Date('2026-10-08T00:00:00Z'));
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });
});
