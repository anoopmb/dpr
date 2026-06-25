import type {
  DprMonthlyReportRead,
  DprReportItemRead,
  ExpenseCategoryRow,
  DailySummaryCell,
} from '@/api/hooks/useDpr';
import type { Dayjs } from 'dayjs';

type Fmt = (v: string | number | null | undefined) => string;
type FmtQty = (v: string | number | null | undefined, dec?: number) => string;

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nonZero(v: number, fn: (n: number) => string): string {
  return v === 0 ? '' : fn(v);
}

interface Slice {
  startDayIdx: number;
  endDayIdx: number;
  startDay: number;
  endDay: number;
}

function makeSlices(daysInMonth: number): Slice[] {
  const slices: Slice[] = [];
  for (let s = 0; s < daysInMonth; s += 7) {
    const e = Math.min(s + 6, daysInMonth - 1);
    slices.push({ startDayIdx: s, endDayIdx: e, startDay: s + 1, endDay: e + 1 });
  }
  return slices;
}

interface QtyAmt { qty: number; amt: number }

function itemSliceOpening(item: DprReportItemRead, startDayIdx: number): QtyAmt {
  let qty = parseFloat(item.opening_qty);
  let amt = parseFloat(item.opening_amount);
  for (let i = 0; i < startDayIdx; i++) {
    qty += parseFloat(item.daily[i]?.qty ?? '0');
    amt += parseFloat(item.daily[i]?.amount ?? '0');
  }
  return { qty, amt };
}

function itemSliceClosing(item: DprReportItemRead, startDayIdx: number, endDayIdx: number): QtyAmt {
  const o = itemSliceOpening(item, startDayIdx);
  for (let i = startDayIdx; i <= endDayIdx; i++) {
    o.qty += parseFloat(item.daily[i]?.qty ?? '0');
    o.amt += parseFloat(item.daily[i]?.amount ?? '0');
  }
  return o;
}

const CELL = 'border:0.5px solid #777;padding:2px 3px;';
const TH1 = 'background:#c5d8f0;font-weight:700;';
const TH2 = 'background:#dce8fb;font-weight:600;';
const SECHDR = 'background:#dce8fb;font-weight:700;';
const SUBTOT = 'background:#f0f0f0;font-weight:700;';
const TABLE = 'width:100%;table-layout:fixed;border-collapse:collapse;font-size:6.5pt;margin-bottom:3px;';

function td(style: string, content: string | number = ''): string {
  return `<td style="${CELL}${style}">${content}</td>`;
}

function buildProductionTable(
  report: DprMonthlyReportRead,
  slice: Slice,
  month: Dayjs,
  fmtAmt: Fmt,
  fmtQty: FmtQty,
  symbol: string,
): string {
  const { startDayIdx, endDayIdx, startDay, endDay } = slice;
  const numDays = endDay - startDay + 1;
  const dayIdxs = Array.from({ length: numDays }, (_, i) => startDayIdx + i);
  const totalCols = 5 + 2 + numDays * 2 + 2;

  const openLabel = startDay === 1 ? 'Opening' : `Up to Day ${startDay - 1}`;

  // Column widths in % summing to ~100 across A3 landscape
  // Fixed: 3.5+17+2.5+3.5+3.5=30; Opening: 3.7+4.5=8.2; 7days*(3.5+4)=52.5; Closing: 3.7+4.5=8.2 → 98.9%
  const dayQtyW = `${(24.5 / numDays).toFixed(1)}%`;
  const dayAmtW = `${(28 / numDays).toFixed(1)}%`;

  let t = `<table style="${TABLE}">
<colgroup>
  <col style="width:3.5%"><col style="width:17%"><col style="width:2.5%"><col style="width:3.5%"><col style="width:3.5%">
  <col style="width:3.7%"><col style="width:4.5%">
  ${dayIdxs.map(() => `<col style="width:${dayQtyW}"><col style="width:${dayAmtW}">`).join('')}
  <col style="width:3.7%"><col style="width:4.5%">
</colgroup>
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}" rowspan="2">Item No</th>
  <th style="${CELL}${TH1}text-align:left" rowspan="2">Description</th>
  <th style="${CELL}${TH1}" rowspan="2">Unit</th>
  <th style="${CELL}${TH1}" rowspan="2">Rate(${esc(symbol)})</th>
  <th style="${CELL}${TH1}" rowspan="2">Agreed</th>
  <th style="${CELL}${TH1}" colspan="2">${esc(openLabel)}</th>
  ${dayIdxs.map(i => `<th style="${CELL}${TH1}" colspan="2">Day ${i + 1}<br><span style="font-size:5.5pt;font-weight:400">${esc(month.date(i + 1).format('DD/MM'))}</span></th>`).join('')}
  <th style="${CELL}${TH1}" colspan="2">Up to Day ${endDay}</th>
</tr>
<tr style="${TH2}text-align:center">
  <th style="${CELL}${TH2}">Qty</th><th style="${CELL}${TH2}">Amt</th>
  ${dayIdxs.map(() => `<th style="${CELL}${TH2}">Qty</th><th style="${CELL}${TH2}">Amt</th>`).join('')}
  <th style="${CELL}${TH2}">Qty</th><th style="${CELL}${TH2}">Amt</th>
</tr>
</thead>
<tbody>`;

  for (const section of report.sections) {
    t += `<tr style="page-break-after:avoid;break-after:avoid"><td colspan="${totalCols}" style="${CELL}${SECHDR}">${esc((section.section_no ? section.section_no + '. ' : '') + section.section_name.toUpperCase())}</td></tr>`;

    let subOQ = 0, subOA = 0, subCQ = 0, subCA = 0;
    const subDQ = dayIdxs.map(() => 0);
    const subDA = dayIdxs.map(() => 0);

    for (const item of section.items) {
      const op = itemSliceOpening(item, startDayIdx);
      const cl = itemSliceClosing(item, startDayIdx, endDayIdx);
      subOQ += op.qty; subOA += op.amt; subCQ += cl.qty; subCA += cl.amt;

      t += `<tr>
        ${td('text-align:center;overflow:hidden', esc(item.item_no))}
        ${td('overflow:hidden;text-overflow:ellipsis;white-space:nowrap', esc(item.description))}
        ${td('text-align:center', esc(item.unit))}
        ${td('text-align:right', fmtQty(item.rate, 2))}
        ${td('text-align:right', fmtQty(item.agreed_qty))}
        ${td('text-align:right', nonZero(op.qty, q => fmtQty(q)))}
        ${td('text-align:right', nonZero(op.amt, a => fmtAmt(a)))}`;

      dayIdxs.forEach((di, i) => {
        const dq = parseFloat(item.daily[di]?.qty ?? '0');
        const da = parseFloat(item.daily[di]?.amount ?? '0');
        subDQ[i] += dq; subDA[i] += da;
        t += td('text-align:right', nonZero(dq, q => fmtQty(q)));
        t += td('text-align:right', nonZero(da, a => fmtAmt(a)));
      });

      t += `${td('text-align:right', nonZero(cl.qty, q => fmtQty(q)))}${td('text-align:right', nonZero(cl.amt, a => fmtAmt(a)))}</tr>`;
    }

    t += `<tr style="${SUBTOT}">
      <td colspan="5" style="${CELL}${SUBTOT}">Section Total</td>
      ${td(SUBTOT + 'text-align:right', nonZero(subOQ, q => fmtQty(q)))}
      ${td(SUBTOT + 'text-align:right', nonZero(subOA, a => fmtAmt(a)))}
      ${subDQ.map((q, i) => td(SUBTOT + 'text-align:right', nonZero(q, v => fmtQty(v))) + td(SUBTOT + 'text-align:right', nonZero(subDA[i], v => fmtAmt(v)))).join('')}
      ${td(SUBTOT + 'text-align:right', fmtQty(subCQ))}
      ${td(SUBTOT + 'text-align:right', fmtAmt(subCA))}
    </tr>`;
  }

  t += '</tbody></table>';
  return t;
}

interface PrintRow {
  name: string;
  unit: string;
  daily: { qty?: string; amount?: string }[];
}

function buildQtyAmtSection(
  label: string,
  rows: PrintRow[],
  slice: Slice,
  fmtAmt: Fmt,
  fmtQty: FmtQty,
): string {
  if (rows.length === 0) return '';
  const { startDayIdx, startDay, endDay } = slice;
  const numDays = endDay - startDay + 1;
  const dayIdxs = Array.from({ length: numDays }, (_, i) => startDayIdx + i);
  const dqw = `${(56 / numDays).toFixed(1)}%`;
  const daw = `${(66 / numDays).toFixed(1)}%`;

  let t = `<div style="font-size:6.5pt;font-weight:700;margin:3px 0 1px;padding:1px 4px;background:#e8f0fe;page-break-after:avoid;break-after:avoid">${esc(label)}</div>
<table style="${TABLE}">
<colgroup>
  <col style="width:20%"><col style="width:6%">
  ${dayIdxs.map(() => `<col style="width:${dqw}"><col style="width:${daw}">`).join('')}
  <col style="width:6%"><col style="width:8%">
</colgroup>
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}text-align:left">Description</th>
  <th style="${CELL}${TH1}">Unit</th>
  ${dayIdxs.map(i => `<th style="${CELL}${TH1}" colspan="2">Day ${i + 1}</th>`).join('')}
  <th style="${CELL}${TH1}" colspan="2">Week Total</th>
</tr>
<tr style="${TH2}text-align:center">
  <th style="${CELL}${TH2}"></th><th style="${CELL}${TH2}"></th>
  ${dayIdxs.map(() => `<th style="${CELL}${TH2}">Qty</th><th style="${CELL}${TH2}">Amt</th>`).join('')}
  <th style="${CELL}${TH2}">Qty</th><th style="${CELL}${TH2}">Amt</th>
</tr>
</thead>
<tbody>`;

  const totDQ = dayIdxs.map(() => 0);
  const totDA = dayIdxs.map(() => 0);
  let totWQ = 0, totWA = 0;

  for (const row of rows) {
    const wq = dayIdxs.reduce((s, di) => s + parseFloat(row.daily[di]?.qty ?? '0'), 0);
    const wa = dayIdxs.reduce((s, di) => s + parseFloat(row.daily[di]?.amount ?? '0'), 0);
    totWQ += wq; totWA += wa;

    t += `<tr>${td('overflow:hidden;text-overflow:ellipsis;white-space:nowrap', esc(row.name))}${td('text-align:center', esc(row.unit))}`;
    dayIdxs.forEach((di, i) => {
      const dq = parseFloat(row.daily[di]?.qty ?? '0');
      const da = parseFloat(row.daily[di]?.amount ?? '0');
      totDQ[i] += dq; totDA[i] += da;
      t += td('text-align:right', nonZero(dq, v => fmtQty(v)));
      t += td('text-align:right', nonZero(da, v => fmtAmt(v)));
    });
    t += `${td('text-align:right', nonZero(wq, v => fmtQty(v)))}${td('text-align:right', nonZero(wa, v => fmtAmt(v)))}</tr>`;
  }

  t += `<tr style="${SUBTOT}">
    <td colspan="2" style="${CELL}${SUBTOT}">Total</td>
    ${totDQ.map((q, i) => td(SUBTOT + 'text-align:right', nonZero(q, v => fmtQty(v))) + td(SUBTOT + 'text-align:right', nonZero(totDA[i], v => fmtAmt(v)))).join('')}
    ${td(SUBTOT + 'text-align:right', nonZero(totWQ, v => fmtQty(v)))}
    ${td(SUBTOT + 'text-align:right', nonZero(totWA, v => fmtAmt(v)))}
  </tr>`;

  t += '</tbody></table>';
  return t;
}

function buildExpensesSection(
  expenses: ExpenseCategoryRow[],
  slice: Slice,
  fmtAmt: Fmt,
): string {
  if (expenses.length === 0) return '';
  const { startDayIdx, startDay, endDay } = slice;
  const numDays = endDay - startDay + 1;
  const dayIdxs = Array.from({ length: numDays }, (_, i) => startDayIdx + i);
  const daw = `${(80 / numDays).toFixed(1)}%`;

  let t = `<div style="font-size:6.5pt;font-weight:700;margin:3px 0 1px;padding:1px 4px;background:#e8f0fe;page-break-after:avoid;break-after:avoid">4) Expenses</div>
<table style="${TABLE}">
<colgroup>
  <col style="width:22%">
  ${dayIdxs.map(() => `<col style="width:${daw}">`).join('')}
  <col style="width:9%">
</colgroup>
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}text-align:left">Description</th>
  ${dayIdxs.map(i => `<th style="${CELL}${TH1}">Day ${i + 1}</th>`).join('')}
  <th style="${CELL}${TH1}">Week Total</th>
</tr>
</thead>
<tbody>`;

  const totD = dayIdxs.map(() => 0);
  let totW = 0;

  for (const row of expenses) {
    const wa = dayIdxs.reduce((s, di) => s + parseFloat(row.daily[di]?.amount ?? '0'), 0);
    totW += wa;
    t += `<tr>${td('overflow:hidden;text-overflow:ellipsis;white-space:nowrap', esc(row.name))}`;
    dayIdxs.forEach((di, i) => {
      const da = parseFloat(row.daily[di]?.amount ?? '0');
      totD[i] += da;
      t += td('text-align:right', nonZero(da, v => fmtAmt(v)));
    });
    t += `${td('text-align:right', nonZero(wa, v => fmtAmt(v)))}</tr>`;
  }

  t += `<tr style="${SUBTOT}">
    ${td(SUBTOT, 'Total')}
    ${totD.map(a => td(SUBTOT + 'text-align:right', nonZero(a, v => fmtAmt(v)))).join('')}
    ${td(SUBTOT + 'text-align:right', nonZero(totW, v => fmtAmt(v)))}
  </tr>`;

  t += '</tbody></table>';
  return t;
}

function buildSummarySection(
  summary: DailySummaryCell[],
  slice: Slice,
  month: Dayjs,
  fmtAmt: Fmt,
): string {
  const rows = summary.filter(c => c.day >= slice.startDay && c.day <= slice.endDay);
  if (rows.length === 0) return '';
  const lastDay = summary.length;

  let t = `<div style="font-size:7pt;font-weight:700;margin:4px 0 1px;padding:2px 4px;background:#e0ebff;border-left:3px solid #4472c4;page-break-after:avoid;break-after:avoid">C. Summary</div>
<table style="${TABLE}">
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}text-align:left;width:11%">Date</th>
  <th style="${CELL}${TH1}">Total Income</th>
  <th style="${CELL}${TH1}">Total Expense</th>
  <th style="${CELL}${TH1}">Net P/L</th>
  <th style="${CELL}${TH1};width:7%">P/L %</th>
  <th style="${CELL}${TH1}">Cumul. Income</th>
  <th style="${CELL}${TH1}">Cumul. Expense</th>
</tr>
</thead>
<tbody>`;

  for (const cell of rows) {
    const wb = cell.day % 7 === 0 || cell.day === lastDay;
    const rs = wb ? SUBTOT : '';
    t += `<tr style="${rs}">
      ${td(rs, esc(month.date(cell.day).format('DD/MM/YYYY')))}
      ${td(rs + 'text-align:right', fmtAmt(cell.income))}
      ${td(rs + 'text-align:right', fmtAmt(cell.expense))}
      ${td(rs + 'text-align:right', fmtAmt(cell.profit_loss))}
      ${td(rs + 'text-align:right', cell.profit_loss_pct !== null ? parseFloat(cell.profit_loss_pct).toFixed(2) + '%' : '—')}
      ${td(rs + 'text-align:right', wb ? fmtAmt(cell.cumulative_income) : '')}
      ${td(rs + 'text-align:right', wb ? fmtAmt(cell.cumulative_expense) : '')}
    </tr>`;
  }

  t += '</tbody></table>';
  return t;
}

export function buildPrintableHTML(
  report: DprMonthlyReportRead,
  projectName: string,
  monthLabel: string,
  month: Dayjs,
  fmtAmt: Fmt,
  fmtQty: FmtQty,
  symbol: string,
): string {
  const slices = makeSlices(report.days_in_month);

  const pages = slices.map((slice, idx) => {
    const matRows: PrintRow[] = report.materials.map(m => ({
      name: m.name, unit: m.unit,
      daily: m.daily.map(d => ({ qty: d.qty, amount: d.amount })),
    }));
    const machRows: PrintRow[] = report.machinery.map(m => ({
      name: m.name, unit: m.unit,
      daily: m.daily.map(d => ({ qty: d.qty, amount: d.amount })),
    }));
    const labRows: PrintRow[] = report.labour.map(l => ({
      name: l.name, unit: 'Nos',
      daily: l.daily.map(d => ({ qty: d.qty, amount: d.amount })),
    }));

    return `<div class="page">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #333;padding-bottom:3px;margin-bottom:5px">
    <div style="font-size:9pt;font-weight:700">${esc(projectName)}</div>
    <div style="font-size:8pt;font-weight:600">Month: ${esc(monthLabel)} &nbsp;|&nbsp; Days ${slice.startDay}–${slice.endDay}</div>
    <div style="font-size:7pt;color:#555">Page ${idx + 1} of ${slices.length}</div>
  </div>

  <div style="font-size:7.5pt;font-weight:700;margin:0 0 2px;padding:2px 4px;background:#e0ebff;border-left:3px solid #4472c4;page-break-after:avoid;break-after:avoid">A. Daily Production</div>
  ${buildProductionTable(report, slice, month, fmtAmt, fmtQty, symbol)}

  <div style="font-size:7.5pt;font-weight:700;margin:4px 0 2px;padding:2px 4px;background:#e0ebff;border-left:3px solid #4472c4;page-break-after:avoid;break-after:avoid">B. Expenditure</div>
  ${buildQtyAmtSection('1) Material Consumption', matRows, slice, fmtAmt, fmtQty)}
  ${buildQtyAmtSection('2) Machinery', machRows, slice, fmtAmt, fmtQty)}
  ${buildQtyAmtSection('3) Labour', labRows, slice, fmtAmt, fmtQty)}
  ${buildExpensesSection(report.expenses, slice, fmtAmt)}

  ${buildSummarySection(report.summary, slice, month, fmtAmt)}
</div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DPR Report – ${esc(projectName)} – ${esc(monthLabel)}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000; margin: 0; padding: 0; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  @media screen {
    body { background: #d0d0d0; padding: 10mm; }
    .page { background: #fff; margin-bottom: 16mm; padding: 8mm; box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
  }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

export function triggerPrint(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  };
  iframe.contentWindow!.onafterprint = cleanup;

  setTimeout(() => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
  }, 400);
}
