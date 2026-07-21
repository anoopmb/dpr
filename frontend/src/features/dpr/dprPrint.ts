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

// nowrap so amounts/totals stay on one line; overflow hidden so a rare
// oversized value clips at its own border rather than bleeding over the
// neighbour. Day/amount columns below are widened to fit typical figures.
const CELL = 'border:0.5px solid #777;padding:2px 3px;white-space:nowrap;overflow:hidden;';
const TH1 = 'background:#c5d8f0;font-weight:700;';
const TH2 = 'background:#dce8fb;font-weight:600;';
const SECHDR = 'background:#dce8fb;font-weight:700;';
const SUBTOT = 'background:#f0f0f0;font-weight:700;';
const TABLE = 'width:100%;table-layout:fixed;border-collapse:collapse;font-size:6.5pt;margin-bottom:3px;';

function td(style: string, content: string | number = ''): string {
  return `<td style="${CELL}${style}">${content}</td>`;
}

// ── Unified column grid ──────────────────────────────────────────────────
// Every stacked section (Production, Materials, Machinery, Labour, Expenses)
// prints with the SAME colgroup so the day-by-day columns line up vertically
// down the page. Sections with fewer real leading columns pad with blank
// spacer cells. Layout = LEAD leading columns + numDays×(Qty,Amt) + 2 trailing.
const LEAD = 9; // Item No, Description, Unit, Rate, Agreed, Total Done, Balance, Opening Qty, Opening Amt
// Leading column widths (%). Sum ≈ 40; trailing ≈ 7.5; days share the rest.
// Amount columns get the larger share (leading Amt = 4.5, day Amt = 60% of a
// day pair, trailing Amt = 5) so figures fit without wrapping.
const LEAD_W = [3, 12.5, 2.5, 3.5, 3.5, 3.5, 3.5, 3, 4.5];
const TRAIL_Q = 3.5;
const TRAIL_A = 5;

function unifiedColgroup(numDays: number): string {
  const dayBlock = (100 - LEAD_W.reduce((s, w) => s + w, 0) - TRAIL_Q - TRAIL_A) / numDays;
  const qtyW = (dayBlock * 0.40).toFixed(2);
  const amtW = (dayBlock * 0.60).toFixed(2);
  return `<colgroup>
  ${LEAD_W.map((w) => `<col style="width:${w}%">`).join('')}
  ${Array.from({ length: numDays }, () => `<col style="width:${qtyW}%"><col style="width:${amtW}%">`).join('')}
  <col style="width:${TRAIL_Q}%"><col style="width:${TRAIL_A}%">
</colgroup>`;
}

/** A run of `n` blank spacer <td>s (the unused leading columns) as one
 * colspanned cell — keeps the day columns on their colgroup positions. */
function blankSpan(n: number, style = ''): string {
  return `<td colspan="${n}" style="${CELL}${style}"></td>`;
}

function shortDateFmt(dateFormat: string): string {
  return dateFormat.replace('YYYY-', '').replace('-YYYY', '').replace('/YYYY', '').replace('YYYY/', '');
}

function buildProductionTable(
  report: DprMonthlyReportRead,
  slice: Slice,
  month: Dayjs,
  fmtAmt: Fmt,
  fmtQty: FmtQty,
  symbol: string,
  dateFormat: string,
): string {
  const { startDayIdx, endDayIdx, startDay, endDay } = slice;
  const numDays = endDay - startDay + 1;
  const dayIdxs = Array.from({ length: numDays }, (_, i) => startDayIdx + i);
  const totalCols = LEAD + numDays * 2 + 2;

  const openLabel = startDay === 1 ? 'Opening' : `Up to Day ${startDay - 1}`;

  let t = `<table style="${TABLE}">
${unifiedColgroup(numDays)}
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}" rowspan="2">Item No</th>
  <th style="${CELL}${TH1}text-align:left" rowspan="2">Description</th>
  <th style="${CELL}${TH1}" rowspan="2">Unit</th>
  <th style="${CELL}${TH1}" rowspan="2">Rate(${esc(symbol)})</th>
  <th style="${CELL}${TH1}" rowspan="2">Agreed</th>
  <th style="${CELL}${TH1}" rowspan="2">Total<br>Done</th>
  <th style="${CELL}${TH1}" rowspan="2">Balance</th>
  <th style="${CELL}${TH1}" colspan="2">${esc(openLabel)}</th>
  ${dayIdxs.map(i => `<th style="${CELL}${TH1}" colspan="2">Day ${i + 1}<br><span style="font-size:5.5pt;font-weight:400">${esc(month.date(i + 1).format(shortDateFmt(dateFormat)))}</span></th>`).join('')}
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

    let subOQ = 0, subOA = 0, subCQ = 0, subCA = 0, subDone = 0;
    const subDQ = dayIdxs.map(() => 0);
    const subDA = dayIdxs.map(() => 0);

    for (const item of section.items) {
      const op = itemSliceOpening(item, startDayIdx);
      const cl = itemSliceClosing(item, startDayIdx, endDayIdx);
      subOQ += op.qty; subOA += op.amt; subCQ += cl.qty; subCA += cl.amt;
      // Total Done / Balance are whole-month figures (contract progress),
      // shown identically on every weekly page — not slice-dependent.
      const done = parseFloat(item.closing_qty);
      const balance = parseFloat(item.agreed_qty) - done;
      subDone += done;

      t += `<tr>
        ${td('text-align:center;overflow:hidden', esc(item.item_no))}
        ${td('overflow:hidden;text-overflow:ellipsis;white-space:nowrap', esc(item.description))}
        ${td('text-align:center', esc(item.unit))}
        ${td('text-align:right', fmtQty(item.rate, 2))}
        ${td('text-align:right', fmtQty(item.agreed_qty))}
        ${td('text-align:right', fmtQty(done))}
        ${td('text-align:right', fmtQty(balance))}
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
      ${td(SUBTOT + 'text-align:right', nonZero(subDone, q => fmtQty(q)))}
      ${td(SUBTOT, '')}
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
  // Unified grid: real leading cols = Description (col2) + Unit (col3);
  // cols 1 and 4–9 are blank spacers so day data aligns with Production.
  let t = `<div style="font-size:6.5pt;font-weight:700;margin:3px 0 1px;padding:1px 4px;background:#e8f0fe;page-break-after:avoid;break-after:avoid">${esc(label)}</div>
<table style="${TABLE}">
${unifiedColgroup(numDays)}
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}"></th>
  <th style="${CELL}${TH1}text-align:left">Description</th>
  <th style="${CELL}${TH1}">Unit</th>
  <th style="${CELL}${TH1}" colspan="6"></th>
  ${dayIdxs.map(i => `<th style="${CELL}${TH1}" colspan="2">Day ${i + 1}</th>`).join('')}
  <th style="${CELL}${TH1}" colspan="2">Week Total</th>
</tr>
<tr style="${TH2}text-align:center">
  <th style="${CELL}${TH2}"></th><th style="${CELL}${TH2}"></th><th style="${CELL}${TH2}"></th>
  <th style="${CELL}${TH2}" colspan="6"></th>
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

    t += `<tr>${blankSpan(1)}${td('overflow:hidden;text-overflow:ellipsis;white-space:nowrap', esc(row.name))}${td('text-align:center', esc(row.unit))}${blankSpan(6)}`;
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
    <td colspan="${LEAD}" style="${CELL}${SUBTOT}">Total</td>
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
  // Unified grid: expenses have amount only, so each day's Qty sub-column is
  // blank and the value sits under the Amt sub-column — aligning expense
  // amounts with the Amt columns of Production/Materials above.
  let t = `<div style="font-size:6.5pt;font-weight:700;margin:3px 0 1px;padding:1px 4px;background:#e8f0fe;page-break-after:avoid;break-after:avoid">4) Expenses</div>
<table style="${TABLE}">
${unifiedColgroup(numDays)}
<thead>
<tr style="${TH1}text-align:center">
  <th style="${CELL}${TH1}"></th>
  <th style="${CELL}${TH1}text-align:left">Description</th>
  <th style="${CELL}${TH1}" colspan="7"></th>
  ${dayIdxs.map(i => `<th style="${CELL}${TH1}" colspan="2">Day ${i + 1}</th>`).join('')}
  <th style="${CELL}${TH1}" colspan="2">Week Total</th>
</tr>
</thead>
<tbody>`;

  const totD = dayIdxs.map(() => 0);
  let totW = 0;

  for (const row of expenses) {
    const wa = dayIdxs.reduce((s, di) => s + parseFloat(row.daily[di]?.amount ?? '0'), 0);
    totW += wa;
    t += `<tr>${blankSpan(1)}${td('overflow:hidden;text-overflow:ellipsis;white-space:nowrap', esc(row.name))}${blankSpan(7)}`;
    dayIdxs.forEach((di, i) => {
      const da = parseFloat(row.daily[di]?.amount ?? '0');
      totD[i] += da;
      t += `${td('')}${td('text-align:right', nonZero(da, v => fmtAmt(v)))}`;
    });
    t += `${td('')}${td('text-align:right', nonZero(wa, v => fmtAmt(v)))}</tr>`;
  }

  t += `<tr style="${SUBTOT}">
    <td colspan="${LEAD}" style="${CELL}${SUBTOT}">Total</td>
    ${totD.map(a => `${td(SUBTOT)}${td(SUBTOT + 'text-align:right', nonZero(a, v => fmtAmt(v)))}`).join('')}
    ${td(SUBTOT)}${td(SUBTOT + 'text-align:right', nonZero(totW, v => fmtAmt(v)))}
  </tr>`;

  t += '</tbody></table>';
  return t;
}

function buildSummarySection(
  summary: DailySummaryCell[],
  slice: Slice,
  month: Dayjs,
  fmtAmt: Fmt,
  dateFormat: string,
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
      ${td(rs, esc(month.date(cell.day).format(dateFormat)))}
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

function buildSignatures(report: DprMonthlyReportRead): string {
  const block = (name: string | null, role: string) =>
    `<div style="text-align:center;min-width:200px">
      <div style="height:22px"></div>
      <div style="border-top:1px solid #333;padding-top:3px;font-weight:600">${esc(name ?? '')}</div>
      <div style="font-size:7pt;color:#333">${esc(role)}</div>
    </div>`;
  return `<div style="display:flex;justify-content:space-between;margin-top:28px;padding:0 40px;page-break-inside:avoid">
    ${block(report.prepared_by_name, 'Prepared by (Site Engineer)')}
    ${block(report.verified_by_name, 'Verified by (Project Manager)')}
  </div>`;
}

export function buildPrintableHTML(
  report: DprMonthlyReportRead,
  projectName: string,
  monthLabel: string,
  month: Dayjs,
  fmtAmt: Fmt,
  fmtQty: FmtQty,
  symbol: string,
  dateFormat: string,
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
      name: l.category_name ? `${l.name} (${l.category_name})` : l.name, unit: 'Nos',
      daily: l.daily.map(d => ({ qty: d.qty, amount: d.amount })),
    }));

    return `<div class="page">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #333;padding-bottom:3px;margin-bottom:5px">
    <div style="font-size:9pt;font-weight:700">${esc(projectName)}</div>
    <div style="font-size:8pt;font-weight:600">Month: ${esc(monthLabel)} &nbsp;|&nbsp; Days ${slice.startDay}–${slice.endDay}</div>
    <div style="font-size:7pt;color:#555">Page ${idx + 1} of ${slices.length}</div>
  </div>

  <div style="font-size:7.5pt;font-weight:700;margin:0 0 2px;padding:2px 4px;background:#e0ebff;border-left:3px solid #4472c4;page-break-after:avoid;break-after:avoid">A. Daily Production</div>
  ${buildProductionTable(report, slice, month, fmtAmt, fmtQty, symbol, dateFormat)}

  <div style="font-size:7.5pt;font-weight:700;margin:4px 0 2px;padding:2px 4px;background:#e0ebff;border-left:3px solid #4472c4;page-break-after:avoid;break-after:avoid">B. Expenditure</div>
  ${buildQtyAmtSection('1) Material Consumption', matRows, slice, fmtAmt, fmtQty)}
  ${buildQtyAmtSection('2) Machinery', machRows, slice, fmtAmt, fmtQty)}
  ${buildQtyAmtSection('3) Labour', labRows, slice, fmtAmt, fmtQty)}
  ${buildExpensesSection(report.expenses, slice, fmtAmt)}

  ${buildSummarySection(report.summary, slice, month, fmtAmt, dateFormat)}
  ${idx === slices.length - 1 ? buildSignatures(report) : ''}
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
