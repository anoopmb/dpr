import { useCallback, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Empty, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined, FilePdfOutlined, PrinterOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import dayjs, { type Dayjs } from 'dayjs';
import { buildPrintableHTML, triggerPrint } from './dprPrint';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useProjects } from '@/api/hooks/useProjects';
import {
  useDprMonthlyReport,
  type DailySummaryCell,
  type DprMonthlyReportRead,
  type DprReportItemRead,
  type DprReportSectionRead,
  type ExpenseCategoryRow,
  type LabourRow,
  type MachineryUsageRow,
  type MaterialConsumptionRow,
} from '@/api/hooks/useDpr';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';

// Shared column widths (px). Every stacked report table (Production,
// Materials, Machinery, Labour, Expenses) uses these so the day-by-day
// columns line up vertically down the page. The Production table's own
// columns use these same literal values — keep them in sync. Thinner
// sections pad the leading columns with blank spacers to reach the same
// day-start offset. (Tables scroll horizontally on their own, so alignment
// holds at scroll origin.)
const COL_W = {
  itemNo: 80,
  desc: 220,
  unit: 60,
  rate: 90,
  revRate: 90,
  contractQty: 90,
  totalDone: 90,
  balance: 90,
  openQty: 80,
  openAmt: 95,
  dayQty: 65,
  dayAmt: 75,
  closeQty: 80,
  closeAmt: 95,
};

// The 8 single leading columns before the Opening group, rendered blank as
// spacers in the non-Production sections. `desc`/`unit` are overridden by
// callers that carry real data there.
const LEADING_SPACER_KEYS: { key: string; width: number }[] = [
  { key: 'sp_itemno', width: COL_W.itemNo },
  { key: 'sp_desc', width: COL_W.desc },
  { key: 'sp_unit', width: COL_W.unit },
  { key: 'sp_rate', width: COL_W.rate },
  { key: 'sp_revrate', width: COL_W.revRate },
  { key: 'sp_contractqty', width: COL_W.contractQty },
  { key: 'sp_totaldone', width: COL_W.totalDone },
  { key: 'sp_balance', width: COL_W.balance },
  { key: 'sp_openqty', width: COL_W.openQty },
  { key: 'sp_openamt', width: COL_W.openAmt },
];
// Total leading columns (8 singles + Opening Qty/Amt) that day columns start after.
const LEADING_COUNT = LEADING_SPACER_KEYS.length;

interface SectionSubtotal {
  agreed_amount: string;
  opening_qty: number;
  opening_amount: number;
  daily: { qty: number; amount: number }[];
  closing_qty: number;
  closing_amount: number;
}

function computeSubtotal(section: DprReportSectionRead, daysInMonth: number): SectionSubtotal {
  const daily = Array.from({ length: daysInMonth }, () => ({ qty: 0, amount: 0 }));
  let openingQty = 0;
  let openingAmount = 0;
  let closingQty = 0;
  let closingAmount = 0;
  for (const item of section.items) {
    openingQty += parseFloat(item.opening_qty);
    openingAmount += parseFloat(item.opening_amount);
    closingQty += parseFloat(item.closing_qty);
    closingAmount += parseFloat(item.closing_amount);
    item.daily.forEach((cell, idx) => {
      daily[idx].qty += parseFloat(cell.qty);
      daily[idx].amount += parseFloat(cell.amount);
    });
  }
  return {
    agreed_amount: section.section_agreed_amount,
    opening_qty: openingQty,
    opening_amount: openingAmount,
    daily,
    closing_qty: closingQty,
    closing_amount: closingAmount,
  };
}

type ReportRow =
  | { _type: 'header'; section: DprReportSectionRead; key: string }
  | { _type: 'item'; item: DprReportItemRead; key: string }
  | { _type: 'subtotal'; section: DprReportSectionRead; subtotal: SectionSubtotal; key: string };

/** Materials/Machinery/Labour share an identical shape (name, unit, daily
 * qty+amount, totals) — one generic table renderer for all three instead of
 * three near-identical copies. */
function QtyAmtSection({
  title,
  rows,
  daysInMonth,
  fmtQty,
  fmtAmt,
}: {
  title: string;
  rows: { key: string; name: string; unit: string; daily: { day: number; qty: string; amount: string }[]; total_qty: string; total_amount: string }[];
  daysInMonth: number;
  fmtQty: (v: string | number | null | undefined, dec?: number) => string;
  fmtAmt: (v: string | number | null | undefined) => string;
}) {
  if (rows.length === 0) return null;

  // Leading columns: col 2 = Description (name), col 3 = Unit; the rest are
  // blank spacers so day columns align with the Production table above.
  const columns: TableColumnsType<typeof rows[number]> = [
    ...LEADING_SPACER_KEYS.map((c) => {
      if (c.key === 'sp_desc') {
        return { title: 'Description', key: 'name', width: c.width, ellipsis: true, render: (_: unknown, row: typeof rows[number]) => row.name };
      }
      if (c.key === 'sp_unit') {
        return { title: 'Unit', key: 'unit', width: c.width, render: (_: unknown, row: typeof rows[number]) => row.unit };
      }
      return { title: '', key: c.key, width: c.width, render: () => null };
    }),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return {
        title: `Day ${day}`,
        children: [
          { title: 'Qty', key: `d${day}q`, width: COL_W.dayQty, align: 'right' as const, render: (_: unknown, row: typeof rows[number]) => fmtQty(row.daily[i]?.qty) },
          { title: 'Amt', key: `d${day}a`, width: COL_W.dayAmt, align: 'right' as const, render: (_: unknown, row: typeof rows[number]) => fmtAmt(row.daily[i]?.amount) },
        ],
      };
    }),
    { title: 'Total Qty', key: 'total_qty', width: COL_W.closeQty, align: 'right' as const, render: (_, row) => fmtQty(row.total_qty) },
    { title: 'Total Amt', key: 'total_amount', width: COL_W.closeAmt, align: 'right' as const, render: (_, row) => fmtAmt(row.total_amount) },
  ];

  const totalQty = rows.reduce((s, r) => s + parseFloat(r.total_qty), 0);
  const totalAmount = rows.reduce((s, r) => s + parseFloat(r.total_amount), 0);
  const dailyTotals = Array.from({ length: daysInMonth }, (_, i) =>
    rows.reduce((s, r) => s + parseFloat(r.daily[i]?.amount ?? '0'), 0),
  );

  return (
    <Card title={title} style={{ marginBottom: 16, borderRadius: 14 }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="key"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 'max-content' }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={LEADING_COUNT}>Total</Table.Summary.Cell>
              {dailyTotals.map((amt, i) => (
                <Table.Summary.Cell index={i + 1} colSpan={2} align="right" key={i}>
                  {fmtAmt(amt)}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={daysInMonth + 1} align="right">{fmtQty(totalQty)}</Table.Summary.Cell>
              <Table.Summary.Cell index={daysInMonth + 2} align="right">
                {fmtAmt(totalAmount)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  );
}

function ExpensesSection({
  rows,
  daysInMonth,
  fmtAmt,
}: {
  rows: ExpenseCategoryRow[];
  daysInMonth: number;
  fmtAmt: (v: string | number | null | undefined) => string;
}) {
  if (rows.length === 0) return null;

  // Expenses have amount only, so each day's Qty sub-column is a blank spacer
  // and the value sits under the Amt sub-column — aligning with the Amt
  // columns of the sections above. Leading columns are blank spacers except
  // Description (name).
  const columns: TableColumnsType<ExpenseCategoryRow> = [
    ...LEADING_SPACER_KEYS.map((c) => {
      if (c.key === 'sp_desc') {
        return { title: 'Description', key: 'name', width: c.width, ellipsis: true, render: (_: unknown, row: ExpenseCategoryRow) => row.name };
      }
      return { title: '', key: c.key, width: c.width, render: () => null };
    }),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      title: `Day ${i + 1}`,
      children: [
        { title: '', key: `d${i + 1}q`, width: COL_W.dayQty, render: () => null },
        { title: 'Amt', key: `d${i + 1}a`, width: COL_W.dayAmt, align: 'right' as const, render: (_: unknown, row: ExpenseCategoryRow) => fmtAmt(row.daily[i]?.amount) },
      ],
    })),
    { title: '', key: 'sp_totalqty', width: COL_W.closeQty, render: () => null },
    { title: 'Total', key: 'total_amount', width: COL_W.closeAmt, align: 'right' as const, render: (_, row) => fmtAmt(row.total_amount) },
  ];

  const totalAmount = rows.reduce((s, r) => s + parseFloat(r.total_amount), 0);
  const dailyTotals = Array.from({ length: daysInMonth }, (_, i) =>
    rows.reduce((s, r) => s + parseFloat(r.daily[i]?.amount ?? '0'), 0),
  );

  return (
    <Card title="Expenses" style={{ marginBottom: 16, borderRadius: 14 }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="expense_category_id"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 'max-content' }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={LEADING_COUNT}>Total</Table.Summary.Cell>
              {dailyTotals.map((amt, i) => (
                <Table.Summary.Cell index={i + 1} colSpan={2} align="right" key={i}>
                  {fmtAmt(amt)}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={daysInMonth + 1} />
              <Table.Summary.Cell index={daysInMonth + 2} align="right">
                {fmtAmt(totalAmount)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  );
}

function SummarySection({
  summary,
  fmtDate,
  fmtAmt,
}: {
  summary: DailySummaryCell[];
  fmtDate: (day: number) => string;
  fmtAmt: (v: string | number | null | undefined) => string;
}) {
  if (summary.length === 0) return null;

  const isWeekBoundary = (cell: DailySummaryCell) => cell.day % 7 === 0 || cell.day === summary.length;

  const columns: TableColumnsType<DailySummaryCell> = [
    { title: 'Date', key: 'date', width: 110, render: (_, row) => fmtDate(row.day) },
    { title: 'Total Income', key: 'income', width: 130, align: 'right' as const, render: (_, row) => fmtAmt(row.income) },
    { title: 'Total Expense', key: 'expense', width: 130, align: 'right' as const, render: (_, row) => fmtAmt(row.expense) },
    { title: 'Net Profit/Loss', key: 'profit_loss', width: 130, align: 'right' as const, render: (_, row) => fmtAmt(row.profit_loss) },
    {
      title: 'Profit/Loss %',
      key: 'profit_loss_pct',
      width: 110,
      align: 'right' as const,
      render: (_, row) => (row.profit_loss_pct === null ? '—' : `${parseFloat(row.profit_loss_pct).toFixed(2)}%`),
    },
    {
      title: 'Cumulative Income (since project start)',
      key: 'cumulative_income',
      width: 180,
      align: 'right' as const,
      render: (_, row) => (isWeekBoundary(row) ? fmtAmt(row.cumulative_income) : ''),
    },
    {
      title: 'Cumulative Expense (since project start)',
      key: 'cumulative_expense',
      width: 180,
      align: 'right' as const,
      render: (_, row) => (isWeekBoundary(row) ? fmtAmt(row.cumulative_expense) : ''),
    },
  ];

  return (
    <Card title="Summary" style={{ marginBottom: 16, borderRadius: 14 }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="day"
        dataSource={summary}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 'max-content' }}
        onRow={(row) => ({ style: isWeekBoundary(row) ? { fontWeight: 600 } : undefined })}
      />
    </Card>
  );
}

/** Builds the full multi-section workbook for the selected month, mirroring
 * the page's section order and column structure (Production, Materials,
 * Machinery, Labour, Expenses, Summary). */
function exportMonthlyReportToExcel(
  report: DprMonthlyReportRead,
  projectName: string,
  monthLabel: string,
  fmtQtyRaw: (v: string) => number,
  fmtAmtRaw: (v: string) => number,
) {
  const rows: (string | number)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const daysInMonth = report.days_in_month;

  const pushMerge = (rowIdx: number, startCol: number, endCol: number) => {
    if (endCol > startCol) merges.push({ s: { r: rowIdx, c: startCol }, e: { r: rowIdx, c: endCol } });
  };

  rows.push([`Work Name: ${projectName}`]);
  rows.push([`Month: ${monthLabel}`]);
  rows.push([]);

  // ── A. Daily Production ───────────────────────────────────────────────
  rows.push(['A', 'Daily Production']);
  const prodHeader = ['Item No', 'Description', 'Unit', 'Rate', 'Agreed Qty', 'Total Done', 'Balance', 'Opening Qty', 'Opening Amt'];
  for (let d = 1; d <= daysInMonth; d++) prodHeader.push(`Day ${d} Qty`, `Day ${d} Amt`);
  prodHeader.push('Closing Qty', 'Closing Amt');
  rows.push(prodHeader);

  for (const section of report.sections) {
    const sectionRowIdx = rows.length;
    rows.push([`${section.section_no ? section.section_no + '. ' : ''}${section.section_name.toUpperCase()}`]);
    pushMerge(sectionRowIdx, 0, prodHeader.length - 1);
    for (const item of section.items) {
      const balance = parseFloat(item.agreed_qty) - parseFloat(item.closing_qty);
      const row: (string | number)[] = [item.item_no, item.description, item.unit, fmtQtyRaw(item.rate), fmtQtyRaw(item.agreed_qty), fmtQtyRaw(item.closing_qty), fmtQtyRaw(String(balance)), fmtQtyRaw(item.opening_qty), fmtAmtRaw(item.opening_amount)];
      for (const cell of item.daily) row.push(fmtQtyRaw(cell.qty), fmtAmtRaw(cell.amount));
      row.push(fmtQtyRaw(item.closing_qty), fmtAmtRaw(item.closing_amount));
      rows.push(row);
    }
    const subtotal = computeSubtotal(section, daysInMonth);
    const subtotalRowIdx = rows.length;
    // Section totals sum amounts only — qty cells are left blank (summing qtys
    // across items of different units is meaningless), matching the on-screen table.
    // Column layout mirrors the item rows: Item No, Description, Unit, Rate,
    // Agreed Qty, Total Done, Balance, Opening Qty, Opening Amt, then per-day
    // Qty/Amt pairs, then Closing Qty/Amt.
    const subtotalRow: (string | number)[] = ['', 'Section Total', '', '', '', '', '', '', fmtAmtRaw(String(subtotal.opening_amount))];
    for (const cell of subtotal.daily) subtotalRow.push('', fmtAmtRaw(String(cell.amount)));
    subtotalRow.push('', fmtAmtRaw(String(subtotal.closing_amount)));
    rows.push(subtotalRow);
    pushMerge(subtotalRowIdx, 0, 1);
  }
  rows.push([]);

  // ── B. Expenditure ─────────────────────────────────────────────────────
  rows.push(['B', 'Expenditure']);

  function pushQtyAmtSection(
    label: string,
    sectionRows: { name: string; unit: string; daily: { day: number; qty: string; amount: string }[]; total_qty: string; total_amount: string }[],
  ) {
    const labelRowIdx = rows.length;
    rows.push([label]);
    const headerRowIdx = rows.length;
    const header = ['Description', 'Unit'];
    for (let d = 1; d <= daysInMonth; d++) header.push(`Day ${d} Qty`, `Day ${d} Amt`);
    header.push('Total Qty', 'Total Amt');
    rows.push(header);
    pushMerge(labelRowIdx, 0, header.length - 1);
    for (const r of sectionRows) {
      const row: (string | number)[] = [r.name, r.unit];
      for (const cell of r.daily) row.push(fmtQtyRaw(cell.qty), fmtAmtRaw(cell.amount));
      row.push(fmtQtyRaw(r.total_qty), fmtAmtRaw(r.total_amount));
      rows.push(row);
    }
    const totalRowIdx = rows.length;
    const totalRow: (string | number)[] = ['Total', ''];
    for (let i = 0; i < daysInMonth; i++) {
      const qty = sectionRows.reduce((s, r) => s + parseFloat(r.daily[i]?.qty ?? '0'), 0);
      const amt = sectionRows.reduce((s, r) => s + parseFloat(r.daily[i]?.amount ?? '0'), 0);
      totalRow.push(fmtQtyRaw(String(qty)), fmtAmtRaw(String(amt)));
    }
    const totalQty = sectionRows.reduce((s, r) => s + parseFloat(r.total_qty), 0);
    const totalAmt = sectionRows.reduce((s, r) => s + parseFloat(r.total_amount), 0);
    totalRow.push(fmtQtyRaw(String(totalQty)), fmtAmtRaw(String(totalAmt)));
    rows.push(totalRow);
    pushMerge(totalRowIdx, 0, 1);
    rows.push([]);
    void headerRowIdx;
  }

  pushQtyAmtSection('1) Material Consumption', report.materials);
  pushQtyAmtSection('2) Machinery', report.machinery);
  pushQtyAmtSection(
    '3) Labour',
    report.labour.map((l) => ({ name: l.name, unit: 'Nos', daily: l.daily, total_qty: l.total_qty, total_amount: l.total_amount })),
  );

  // Expenses (amount-only, no qty)
  const expLabelRowIdx = rows.length;
  rows.push(['4) Expenses']);
  const expHeader = ['Description'];
  for (let d = 1; d <= daysInMonth; d++) expHeader.push(`Day ${d}`);
  expHeader.push('Total');
  rows.push(expHeader);
  pushMerge(expLabelRowIdx, 0, expHeader.length - 1);
  for (const e of report.expenses) {
    const row: (string | number)[] = [e.name];
    for (const cell of e.daily) row.push(fmtAmtRaw(cell.amount));
    row.push(fmtAmtRaw(e.total_amount));
    rows.push(row);
  }
  const expTotalRowIdx = rows.length;
  const expTotalRow: (string | number)[] = ['Total'];
  for (let i = 0; i < daysInMonth; i++) {
    const amt = report.expenses.reduce((s, r) => s + parseFloat(r.daily[i]?.amount ?? '0'), 0);
    expTotalRow.push(fmtAmtRaw(String(amt)));
  }
  expTotalRow.push(fmtAmtRaw(String(report.expenses.reduce((s, r) => s + parseFloat(r.total_amount), 0))));
  rows.push(expTotalRow);
  rows.push([]);
  void expTotalRowIdx;

  // ── C. Summary ──────────────────────────────────────────────────────────
  rows.push(['C', 'Summary']);
  rows.push(['Date', 'Total Income', 'Total Expense', 'Net Profit/Loss', 'Profit/Loss %', 'Cumulative Income (since start)', 'Cumulative Expense (since start)']);
  for (const cell of report.summary) {
    const isWeekBoundary = cell.day % 7 === 0 || cell.day === report.summary.length;
    rows.push([
      cell.day,
      fmtAmtRaw(cell.income),
      fmtAmtRaw(cell.expense),
      fmtAmtRaw(cell.profit_loss),
      cell.profit_loss_pct === null ? '' : `${parseFloat(cell.profit_loss_pct).toFixed(2)}%`,
      isWeekBoundary ? fmtAmtRaw(cell.cumulative_income) : '',
      isWeekBoundary ? fmtAmtRaw(cell.cumulative_expense) : '',
    ]);
  }

  rows.push([]);
  rows.push([]);
  rows.push([`Prepared by (Site Engineer): ${report.prepared_by_name ?? ''}`, '', '', `Verified by (Project Manager): ${report.verified_by_name ?? ''}`]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }];
  const sheetName = monthLabel.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 31) || 'DPR Report';
  wb.SheetNames.push(sheetName);
  wb.Sheets[sheetName] = ws;
  const filename = `DPR_${projectName.replace(/\s+/g, '_')}_${monthLabel.replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function DprMonthlyReportPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: projects } = useProjects();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const monthStr = month.format('YYYY-MM');
  const { resolvedMode } = useThemeMode();
  const { fmtAmt, fmtQty, fmtQtyByUnit, symbol } = useNumberFormat();
  const { dateFormat } = useDateFormat();

  const HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';
  const SUB_BG = resolvedMode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#fafafa';

  const { data: report, isLoading } = useDprMonthlyReport(selectedProjectId, monthStr);

  const daysInMonth = report?.days_in_month ?? month.daysInMonth();

  const rows: ReportRow[] = useMemo(() => {
    if (!report) return [];
    const result: ReportRow[] = [];
    for (const section of report.sections) {
      result.push({ _type: 'header', section, key: `hdr-${section.section_id ?? 'none'}` });
      for (const item of section.items) {
        result.push({ _type: 'item', item, key: item.boq_item_id });
      }
      result.push({
        _type: 'subtotal',
        section,
        subtotal: computeSubtotal(section, daysInMonth),
        key: `sub-${section.section_id ?? 'none'}`,
      });
    }
    return result;
  }, [report, daysInMonth]);

  // Item No + Description are the only `fixed: 'left'` columns. A colSpan
  // that crosses from a fixed column into a non-fixed one breaks antd's
  // frozen-column overlay (it renders fixed columns as a separate cloned
  // table laid on top of the scrollable one) — the overlay can't represent
  // "this cell also covers columns that aren't in the overlay", so the
  // banner text bled out over the scrollable columns whenever you scrolled
  // horizontally. Every header/subtotal banner row now spans only the 2
  // fixed columns; every other column renders its own ordinary (blank, for
  // header rows) cell instead, picking up the banner color from onRow's
  // row-level background rather than a per-cell override — so the table
  // grid stays fully accounted for (no colSpan: 0 cells, which would also
  // shift subsequent columns left to fill the gap; the BOQ table page hit
  // this same issue).
  const FIXED_COLUMN_COUNT = 2;

  const headerItemNoOnCell = (row: ReportRow) =>
    row._type === 'header' || row._type === 'subtotal'
      ? { colSpan: FIXED_COLUMN_COUNT, style: { fontWeight: 600, padding: '6px 12px' } }
      : {};
  // Description is always the 2nd fixed column — always absorbed into Item
  // No's span above, for both header and subtotal rows.
  const descriptionOnCell = (row: ReportRow) =>
    row._type === 'header' || row._type === 'subtotal' ? { colSpan: 0 } : {};
  // Unit/Rate/Agreed Qty sit just past the fixed columns — never part of the
  // banner span, so they always render as their own ordinary cell.
  const blankOnCell = () => ({});
  // Like blankOnCell, but keeps the cell visible (styled) for subtotal rows
  // instead of hiding it — used for every numeric column past the label span
  // so section subtotals (daily qty/amt, opening/closing qty) actually render.
  const dataOnCell = (row: ReportRow) =>
    row._type === 'subtotal' ? { style: { fontWeight: 700, whiteSpace: 'nowrap' as const } } : {};

  const columns: TableColumnsType<ReportRow> = useMemo(() => {
    const cols: TableColumnsType<ReportRow> = [
      {
        title: 'Item No',
        key: 'item_no',
        fixed: 'left',
        width: 80,
        onCell: headerItemNoOnCell,
        render: (_, row) => {
          if (row._type === 'header') return `${row.section.section_no ? row.section.section_no + '. ' : ''}${row.section.section_name.toUpperCase()}`;
          if (row._type === 'item') return row.item.item_no;
          if (row._type === 'subtotal') return 'Section Total';
          return null;
        },
      },
      {
        title: 'Description',
        key: 'description',
        fixed: 'left',
        width: 220,
        ellipsis: true,
        onCell: descriptionOnCell,
        render: (_, row) => {
          if (row._type === 'item') return row.item.description;
          return null;
        },
      },
      {
        title: 'Unit',
        key: 'unit',
        width: 60,
        onCell: blankOnCell,
        render: (_, row) => (row._type === 'item' ? row.item.unit : null),
      },
      {
        title: `Contract Rate (${symbol})`,
        key: 'rate',
        width: 90,
        align: 'right' as const,
        onCell: blankOnCell,
        render: (_, row) => (row._type === 'item' ? fmtQty(row.item.rate, 2) : null),
      },
      {
        title: `Revised Rate (${symbol})`,
        key: 'current_rate',
        width: 90,
        align: 'right' as const,
        onCell: blankOnCell,
        render: (_, row) => {
          if (row._type !== 'item') return null;
          const isRevised = row.item.current_rate !== row.item.rate;
          return isRevised ? (
            <Space size={2}>
              <Tag color="orange" style={{ marginRight: 0, fontSize: 10, padding: '0 3px' }}>R</Tag>
              {fmtQty(row.item.current_rate, 2)}
            </Space>
          ) : <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        },
      },
      {
        title: 'Contract Qty',
        key: 'agreed_qty',
        width: 90,
        align: 'right' as const,
        onCell: blankOnCell,
        render: (_, row) => (row._type === 'item' ? fmtQtyByUnit(row.item.agreed_qty, row.item.unit) : null),
      },
      {
        title: 'Total Done',
        key: 'total_done',
        width: 90,
        align: 'right' as const,
        onCell: dataOnCell,
        render: (_, row) => {
          if (row._type === 'item') return fmtQtyByUnit(row.item.closing_qty, row.item.unit);
          return null; // subtotal qty omitted — see opening_qty note
        },
      },
      {
        title: 'Balance',
        key: 'balance_qty',
        width: 90,
        align: 'right' as const,
        onCell: blankOnCell,
        // Contract − done, per item. Blank on subtotal rows: summing balance
        // across mixed-unit items isn't meaningful (same reason Contract Qty
        // is blank there).
        render: (_, row) => {
          if (row._type !== 'item') return null;
          const bal = parseFloat(row.item.agreed_qty) - parseFloat(row.item.closing_qty);
          return fmtQtyByUnit(bal, row.item.unit);
        },
      },
      {
        title: 'Up to Date (Start of Month)',
        children: [
          {
            title: 'Qty',
            key: 'opening_qty',
            width: 80,
            align: 'right' as const,
            onCell: dataOnCell,
            render: (_, row) => {
              if (row._type === 'item') return fmtQtyByUnit(row.item.opening_qty, row.item.unit);
              // Section subtotals deliberately omit a quantity sum — adding up
              // qtys across items of different units (CUM/SQM/MT) is meaningless.
              return null;
            },
          },
          {
            title: 'Amt',
            key: 'opening_amount',
            width: 95,
            align: 'right' as const,
            onCell: dataOnCell,
            render: (_, row) => {
              if (row._type === 'item') return fmtAmt(row.item.opening_amount);
              if (row._type === 'subtotal') return fmtAmt(row.subtotal.opening_amount);
              return null;
            },
          },
        ],
      },
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        return {
          title: `Day ${day}`,
          children: [
            {
              title: 'Qty',
              key: `day_${day}_qty`,
              width: 65,
              align: 'right' as const,
              onCell: dataOnCell,
              render: (_: unknown, row: ReportRow) => {
                if (row._type === 'item') return fmtQtyByUnit(row.item.daily[i].qty, row.item.unit);
                return null; // subtotal qty omitted — see opening_qty note
              },
            },
            {
              title: 'Amt',
              key: `day_${day}_amt`,
              width: 75,
              align: 'right' as const,
              onCell: dataOnCell,
              render: (_: unknown, row: ReportRow) => {
                if (row._type === 'item') return fmtAmt(row.item.daily[i].amount);
                if (row._type === 'subtotal') return fmtAmt(row.subtotal.daily[i].amount);
                return null;
              },
            },
          ],
        };
      }),
      {
        title: 'Up to Date (End of Month)',
        children: [
          {
            title: 'Qty',
            key: 'closing_qty',
            width: 80,
            align: 'right' as const,
            onCell: dataOnCell,
            render: (_, row) => {
              if (row._type === 'item') return fmtQtyByUnit(row.item.closing_qty, row.item.unit);
              return null; // subtotal qty omitted — see opening_qty note
            },
          },
          {
            title: 'Amt',
            key: 'closing_amount',
            width: 95,
            align: 'right' as const,
            onCell: dataOnCell,
            render: (_, row) => {
              if (row._type === 'item') return fmtAmt(row.item.closing_amount);
              if (row._type === 'subtotal') return fmtAmt(row.subtotal.closing_amount);
              return null;
            },
          },
        ],
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysInMonth, fmtAmt, fmtQty]);

  const materialRows = (report?.materials ?? []).map((m: MaterialConsumptionRow) => ({ key: m.material_id, ...m }));
  const machineryRows = (report?.machinery ?? []).map((m: MachineryUsageRow) => ({ key: m.machinery_id, ...m }));
  const labourRows = (report?.labour ?? []).map((l: LabourRow) => ({ key: l.worker_category_id, name: l.name, unit: 'Nos', daily: l.daily, total_qty: l.total_qty, total_amount: l.total_amount }));

  const fmtDateForDay = (day: number) => month.date(day).format(dateFormat);

  const handleExport = () => {
    if (!report) return;
    const project = (projects ?? []).find((p) => p.id === selectedProjectId);
    // Pass through as real numbers (not formatted/localized strings) so
    // Excel treats every figure as numeric data — sortable, summable, and
    // formattable with its own number format — rather than plain text.
    const toNum = (v: string) => parseFloat(v) || 0;
    exportMonthlyReportToExcel(report, project?.name ?? 'Project', month.format('MMMM YYYY'), toNum, toNum);
  };

  const handlePrint = useCallback(() => {
    if (!report) return;
    const project = (projects ?? []).find((p) => p.id === selectedProjectId);
    const html = buildPrintableHTML(
      report,
      project?.name ?? 'Project',
      month.format('MMMM YYYY'),
      month,
      fmtAmt,
      fmtQty,
      symbol,
      dateFormat,
    );
    triggerPrint(html);
  }, [report, projects, selectedProjectId, month, fmtAmt, fmtQty, symbol, dateFormat]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Monthly DPR Report
        </Typography.Title>
        <div style={{ display: 'flex', gap: 12 }}>
          <DatePicker picker="month" value={month} onChange={(d) => { if (d) setMonth(d); }} allowClear={false} />
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!report}>
            Export
          </Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} disabled={!report}>
            Print
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={handlePrint} disabled={!report}>
            Export PDF
          </Button>
        </div>
      </div>

      <ProjectSelector style={{ marginBottom: 16, width: 320 }} />

      {!selectedProjectId && <Empty description="Select a project to view the monthly DPR report." />}

      {selectedProjectId && (
        <>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            {month.format('MMMM YYYY')}
          </Typography.Title>
          <Card title="A. Daily Production" style={{ marginBottom: 16, borderRadius: 14 }} styles={{ body: { padding: 0 } }}>
            <Table
              rowKey="key"
              dataSource={rows}
              columns={columns}
              loading={isLoading}
              pagination={false}
              size="small"
              bordered
              scroll={{ x: 'max-content', y: 600 }}
              onRow={(row) => ({
                style: { background: row._type === 'header' ? HDR_BG : row._type === 'subtotal' ? SUB_BG : undefined },
              })}
            />
          </Card>

          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            B. Expenditure
          </Typography.Title>
          <QtyAmtSection title="1) Material Consumption" rows={materialRows} daysInMonth={daysInMonth} fmtQty={fmtQty} fmtAmt={fmtAmt} />
          <QtyAmtSection title="2) Machinery" rows={machineryRows} daysInMonth={daysInMonth} fmtQty={fmtQty} fmtAmt={fmtAmt} />
          <QtyAmtSection title="3) Labour" rows={labourRows} daysInMonth={daysInMonth} fmtQty={fmtQty} fmtAmt={fmtAmt} />
          <ExpensesSection rows={report?.expenses ?? []} daysInMonth={daysInMonth} fmtAmt={fmtAmt} />

          <SummarySection summary={report?.summary ?? []} fmtDate={fmtDateForDay} fmtAmt={fmtAmt} />

          {report && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, marginTop: 40, marginBottom: 24, padding: '0 24px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: 200 }}>
                <div style={{ borderTop: '1px solid #999', paddingTop: 6, fontWeight: 600 }}>
                  {report.prepared_by_name ?? '—'}
                </div>
                <Typography.Text type="secondary">Prepared by (Site Engineer)</Typography.Text>
              </div>
              <div style={{ textAlign: 'center', minWidth: 200 }}>
                <div style={{ borderTop: '1px solid #999', paddingTop: 6, fontWeight: 600 }}>
                  {report.verified_by_name ?? '—'}
                </div>
                <Typography.Text type="secondary">Verified by (Project Manager)</Typography.Text>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
