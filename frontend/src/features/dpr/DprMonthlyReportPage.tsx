import { useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useDprMonthlyReport,
  type DprReportItemRead,
  type DprReportSectionRead,
} from '@/api/hooks/useDpr';

function fmtQty(v: string) {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function fmtAmt(v: string) {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

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

const HDR_BG = '#f0f5ff';
const SUB_BG = '#fafafa';

export function DprMonthlyReportPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const monthStr = month.format('YYYY-MM');

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

  const totalLeafColumns = 5 + 2 + daysInMonth * 2 + 2;

  const headerOnCell = (row: ReportRow) =>
    row._type === 'header' ? { colSpan: totalLeafColumns } : row._type === 'subtotal' ? { colSpan: 0 } : {};
  const blankOnCell = (row: ReportRow) =>
    row._type === 'header' ? { colSpan: 0 } : row._type === 'subtotal' ? { colSpan: 0 } : {};
  const subtotalLabelOnCell = (row: ReportRow) =>
    row._type === 'header' ? { colSpan: 0 } : row._type === 'subtotal' ? { colSpan: 4, style: { background: SUB_BG, fontWeight: 600 } } : {};
  const subtotalSkipOnCell = (row: ReportRow) =>
    row._type === 'header' ? { colSpan: 0 } : row._type === 'subtotal' ? { colSpan: 0 } : {};

  const columns: TableColumnsType<ReportRow> = useMemo(() => {
    const cols: TableColumnsType<ReportRow> = [
      {
        title: 'Item No',
        key: 'item_no',
        fixed: 'left',
        width: 80,
        onCell: headerOnCell,
        render: (_, row) => {
          if (row._type === 'header') return `${row.section.section_no ? row.section.section_no + '. ' : ''}${row.section.section_name.toUpperCase()}`;
          if (row._type === 'item') return row.item.item_no;
          return null;
        },
      },
      {
        title: 'Description',
        key: 'description',
        fixed: 'left',
        width: 220,
        ellipsis: true,
        onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : row._type === 'subtotal' ? subtotalLabelOnCell(row) : {}),
        render: (_, row) => {
          if (row._type === 'item') return row.item.description;
          if (row._type === 'subtotal') return 'Section Total';
          return null;
        },
      },
      {
        title: 'Unit',
        key: 'unit',
        width: 60,
        onCell: (row) => (row._type === 'subtotal' ? subtotalSkipOnCell(row) : blankOnCell(row)),
        render: (_, row) => (row._type === 'item' ? row.item.unit : null),
      },
      {
        title: 'Rate (₹)',
        key: 'rate',
        width: 80,
        align: 'right' as const,
        onCell: (row) => (row._type === 'subtotal' ? subtotalSkipOnCell(row) : blankOnCell(row)),
        render: (_, row) => (row._type === 'item' ? fmtAmt(row.item.rate) : null),
      },
      {
        title: 'Agreed Qty',
        key: 'agreed_qty',
        width: 90,
        align: 'right' as const,
        onCell: (row) => (row._type === 'subtotal' ? subtotalSkipOnCell(row) : blankOnCell(row)),
        render: (_, row) => (row._type === 'item' ? fmtQty(row.item.agreed_qty) : null),
      },
      {
        title: 'Up to Date (Start of Month)',
        children: [
          {
            title: 'Qty',
            key: 'opening_qty',
            width: 80,
            align: 'right' as const,
            onCell: blankOnCell,
            render: (_, row) => {
              if (row._type === 'item') return fmtQty(row.item.opening_qty);
              if (row._type === 'subtotal') return fmtQty(String(row.subtotal.opening_qty));
              return null;
            },
          },
          {
            title: 'Amt (₹)',
            key: 'opening_amount',
            width: 95,
            align: 'right' as const,
            onCell: (row) => (row._type === 'subtotal' ? { style: { background: SUB_BG, fontWeight: 600 } } : blankOnCell(row)),
            render: (_, row) => {
              if (row._type === 'item') return fmtAmt(row.item.opening_amount);
              if (row._type === 'subtotal') return fmtAmt(String(row.subtotal.opening_amount));
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
              onCell: blankOnCell,
              render: (_: unknown, row: ReportRow) => {
                if (row._type === 'item') return fmtQty(row.item.daily[i].qty);
                if (row._type === 'subtotal') return fmtQty(String(row.subtotal.daily[i].qty));
                return null;
              },
            },
            {
              title: 'Amt',
              key: `day_${day}_amt`,
              width: 75,
              align: 'right' as const,
              onCell: blankOnCell,
              render: (_: unknown, row: ReportRow) => {
                if (row._type === 'item') return fmtAmt(row.item.daily[i].amount);
                if (row._type === 'subtotal') return fmtAmt(String(row.subtotal.daily[i].amount));
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
            onCell: blankOnCell,
            render: (_, row) => {
              if (row._type === 'item') return fmtQty(row.item.closing_qty);
              if (row._type === 'subtotal') return fmtQty(String(row.subtotal.closing_qty));
              return null;
            },
          },
          {
            title: 'Amt (₹)',
            key: 'closing_amount',
            width: 95,
            align: 'right' as const,
            onCell: (row) => (row._type === 'subtotal' ? { style: { background: SUB_BG, fontWeight: 600 } } : blankOnCell(row)),
            render: (_, row) => {
              if (row._type === 'item') return fmtAmt(row.item.closing_amount);
              if (row._type === 'subtotal') return fmtAmt(String(row.subtotal.closing_amount));
              return null;
            },
          },
        ],
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysInMonth]);

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Monthly DPR Report
        </Typography.Title>
        <div style={{ display: 'flex', gap: 12 }}>
          <DatePicker picker="month" value={month} onChange={(d) => { if (d) setMonth(d); }} allowClear={false} />
          <Button icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!report}>
            Print
          </Button>
        </div>
      </div>

      <div className="no-print">
        <ProjectSelector style={{ marginBottom: 16, width: 320 }} />
      </div>

      {!selectedProjectId && <Empty description="Select a project to view the monthly DPR report." />}

      {selectedProjectId && (
        <>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            {month.format('MMMM YYYY')}
          </Typography.Title>
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
        </>
      )}
    </div>
  );
}
