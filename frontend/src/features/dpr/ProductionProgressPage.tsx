import { useState } from 'react';
import { DatePicker, Empty, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useProductionProgress, type BoqItemProgressRead, type SectionProgressRead } from '@/api/hooks/useDpr';
import { useThemeMode } from '@/theme/theme-context';
import { useNumberFormat } from '@/utils/format';

// ── Types ──────────────────────────────────────────────────────────────────

interface SectionTotals {
  agreedQty: number;
  agreedAmount: number;
  executedQty: number;
  executedAmount: number;
  remainingQty: number;
}

type ProgressRow =
  | { _type: 'header';   section: SectionProgressRead; key: string }
  | { _type: 'item';     item: BoqItemProgressRead;    key: string }
  | { _type: 'subtotal'; section: SectionProgressRead; totals: SectionTotals; key: string };

// ── Helpers ────────────────────────────────────────────────────────────────

function computeTotals(section: SectionProgressRead): SectionTotals {
  let agreedQty = 0, executedQty = 0, remainingQty = 0;
  for (const item of section.items) {
    agreedQty    += parseFloat(item.agreed_qty)    || 0;
    executedQty  += parseFloat(item.executed_qty)  || 0;
    remainingQty += parseFloat(item.remaining_qty) || 0;
  }
  return {
    agreedQty,
    agreedAmount:   parseFloat(section.section_agreed_amount)   || 0,
    executedQty,
    executedAmount: parseFloat(section.section_executed_amount) || 0,
    remainingQty,
  };
}

function buildRows(sections: SectionProgressRead[]): ProgressRow[] {
  const rows: ProgressRow[] = [];
  for (const section of sections) {
    rows.push({ _type: 'header', section, key: `hdr-${section.section_id ?? 'none'}` });
    for (const item of section.items) {
      rows.push({ _type: 'item', item, key: item.boq_item_id });
    }
    rows.push({
      _type: 'subtotal',
      section,
      totals: computeTotals(section),
      key: `sub-${section.section_id ?? 'none'}`,
    });
  }
  return rows;
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Total number of leaf columns in the table.
 * Item No | Description | Unit | Rate | Agreed Qty | Agreed Amt | Exec Qty | Exec Amt | Remaining Qty | % Done
 * = 10 columns
 */
const NCOLS = 10;

/**
 * How many columns the "Section Total" label spans.
 * It should cover EXACTLY: Item No (0) + Description (1) + Unit (2) + Rate (3) = 4 columns,
 * so that the first numeric column (Agreed Qty at index 4) starts at the correct position.
 */
const LABEL_SPAN = 4;

// ── Component ──────────────────────────────────────────────────────────────

export function ProductionProgressPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const [asOf, setAsOf] = useState<Dayjs>(dayjs());
  const { resolvedMode } = useThemeMode();
  const { fmtAmt, fmtQty, fmtQtyByUnit } = useNumberFormat();

  const HDR_BG   = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';
  const SUB_BG   = resolvedMode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : '#f5f5f5';
  const TOTAL_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.15)' : '#e6f7ff';

  const SUB_STYLE: React.CSSProperties = {
    background: SUB_BG,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
  const SUB_LABEL_STYLE: React.CSSProperties = {
    background: SUB_BG,
    fontWeight: 700,
  };

  const asOfStr = asOf.format('YYYY-MM-DD');
  const { data: progress, isLoading } = useProductionProgress(selectedProjectId, asOfStr);
  const rows = progress ? buildRows(progress.sections) : [];

  // Grand-total qty sums (API provides amounts already)
  const allItems = progress?.sections.flatMap((s) => s.items) ?? [];
  const totalAgreedQty    = allItems.reduce((s, i) => s + (parseFloat(i.agreed_qty)    || 0), 0);
  const totalExecutedQty  = allItems.reduce((s, i) => s + (parseFloat(i.executed_qty)  || 0), 0);
  const totalRemainingQty = allItems.reduce((s, i) => s + (parseFloat(i.remaining_qty) || 0), 0);

  const columns: TableColumnsType<ProgressRow> = [
    // ── Col 0: Item No
    // header   → colSpan NCOLS (full-row section header)
    // subtotal → colSpan LABEL_SPAN (covers cols 0–3), renders "Section Total"
    // item     → normal
    {
      title: 'Item No',
      key: 'item_no',
      width: 80,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: NCOLS, style: { background: HDR_BG, fontWeight: 600, padding: '6px 12px' } };
        if (row._type === 'subtotal') return { colSpan: LABEL_SPAN, style: SUB_LABEL_STYLE };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'header')   return `${row.section.section_no ? row.section.section_no + '. ' : ''}${row.section.section_name.toUpperCase()}`;
        if (row._type === 'subtotal') return 'Section Total';
        return row.item.item_no;
      },
    },

    // ── Col 1: Description — colSpan 0 for both header and subtotal
    {
      title: 'Description',
      key: 'description',
      ellipsis: true,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? row.item.description : null),
    },

    // ── Col 2: Unit — colSpan 0 for header and subtotal
    {
      title: 'Unit',
      key: 'unit',
      width: 60,
      align: 'center' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? row.item.unit : null),
    },

    // ── Col 3: Rate — colSpan 0 for header and subtotal
    {
      title: 'Rate (₹)',
      key: 'rate',
      width: 100,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? fmtQty(row.item.rate, 2) : null),
    },

    // ── Col 4: Agreed Qty
    {
      title: 'Agreed Qty',
      key: 'agreed_qty',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: SUB_STYLE };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item')     return fmtQtyByUnit(row.item.agreed_qty, row.item.unit);
        if (row._type === 'subtotal') return fmtQty(row.totals.agreedQty, 3);
        return null;
      },
    },

    // ── Col 5: Agreed Amt
    {
      title: 'Agreed Amt',
      key: 'agreed_amount',
      width: 150,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: SUB_STYLE };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') {
          const a = parseFloat(row.item.agreed_qty) * parseFloat(row.item.rate);
          return fmtAmt(a);
        }
        if (row._type === 'subtotal') return fmtAmt(row.totals.agreedAmount);
        return null;
      },
    },

    // ── Col 6: Executed Qty
    {
      title: 'Executed Qty',
      key: 'exec_qty',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: SUB_STYLE };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item')     return fmtQtyByUnit(row.item.executed_qty, row.item.unit);
        if (row._type === 'subtotal') return fmtQty(row.totals.executedQty, 3);
        return null;
      },
    },

    // ── Col 7: Executed Amt
    {
      title: 'Executed Amt',
      key: 'exec_amount',
      width: 150,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: SUB_STYLE };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item')     return fmtAmt(row.item.executed_amount);
        if (row._type === 'subtotal') return fmtAmt(row.totals.executedAmount);
        return null;
      },
    },

    // ── Col 8: Remaining Qty
    {
      title: 'Remaining Qty',
      key: 'remaining',
      width: 115,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: SUB_STYLE };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item')     return fmtQtyByUnit(row.item.remaining_qty, row.item.unit);
        if (row._type === 'subtotal') return fmtQty(row.totals.remainingQty, 3);
        return null;
      },
    },

    // ── Col 9: % Done — hidden for subtotal
    {
      title: '% Done',
      key: 'pct',
      width: 80,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header')   return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return row.item.percent_complete !== null
          ? `${fmtQty(row.item.percent_complete, 2)}%`
          : '—';
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Production Progress
        </Typography.Title>
        <DatePicker
          value={asOf}
          onChange={(d) => { if (d) setAsOf(d); }}
          disabledDate={(d) => d.isAfter(dayjs())}
          allowClear={false}
        />
      </div>

      <ProjectSelector style={{ marginBottom: 16, width: 320 }} />

      {!selectedProjectId && (
        <Empty description="Select a project to view production progress." />
      )}
      {selectedProjectId && !isLoading && progress && progress.sections.length === 0 && (
        <Empty description="No BOQ items with production entries found up to this date." />
      )}

      {selectedProjectId && (
        <Table
          rowKey="key"
          dataSource={rows}
          columns={columns}
          loading={isLoading}
          pagination={false}
          size="small"
          bordered
          scroll={{ x: 'max-content' }}
          onRow={(row) => ({
            style: {
              background:
                row._type === 'header'
                  ? HDR_BG
                  : row._type === 'subtotal'
                  ? SUB_BG
                  : undefined,
            },
          })}
          summary={() =>
            progress ? (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 700, background: TOTAL_BG }}>
                  <Table.Summary.Cell index={0} colSpan={LABEL_SPAN}>Grand Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={4}  align="right">{fmtQty(totalAgreedQty, 3)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={5}  align="right">{fmtAmt(progress.total_agreed_amount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6}  align="right">{fmtQty(totalExecutedQty, 3)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7}  align="right">{fmtAmt(progress.total_executed_amount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8}  align="right">{fmtQty(totalRemainingQty, 3)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={9} />
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          }
        />
      )}
    </div>
  );
}
