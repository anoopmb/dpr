import { useState } from 'react';
import { DatePicker, Empty, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useProductionProgress, type BoqItemProgressRead, type SectionProgressRead } from '@/api/hooks/useDpr';

type ProgressRow =
  | { _type: 'header'; section: SectionProgressRead; key: string }
  | { _type: 'item'; item: BoqItemProgressRead; key: string }
  | { _type: 'subtotal'; section: SectionProgressRead; key: string };

function buildRows(sections: SectionProgressRead[]): ProgressRow[] {
  const rows: ProgressRow[] = [];
  for (const section of sections) {
    rows.push({ _type: 'header', section, key: `hdr-${section.section_id ?? 'none'}` });
    for (const item of section.items) {
      rows.push({ _type: 'item', item, key: item.boq_item_id });
    }
    rows.push({ _type: 'subtotal', section, key: `sub-${section.section_id ?? 'none'}` });
  }
  return rows;
}

function fmt(v: string | number | null | undefined, decimals = 2) {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

const NCOLS = 10;
const HDR_BG = '#f0f5ff';
const SUB_BG = '#fafafa';

export function ProductionProgressPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const [asOf, setAsOf] = useState<Dayjs>(dayjs());

  const asOfStr = asOf.format('YYYY-MM-DD');
  const { data: progress, isLoading } = useProductionProgress(selectedProjectId, asOfStr);

  const rows = progress ? buildRows(progress.sections) : [];

  const columns: TableColumnsType<ProgressRow> = [
    {
      title: 'Item No',
      key: 'item_no',
      width: 80,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: NCOLS, style: { background: HDR_BG, fontWeight: 600, padding: '6px 12px' } };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'header') return `${row.section.section_no ? row.section.section_no + '. ' : ''}${row.section.section_name.toUpperCase()}`;
        if (row._type === 'subtotal') return null;
        return row.item.item_no;
      },
    },
    {
      title: 'Description',
      key: 'description',
      ellipsis: true,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 2, style: { background: SUB_BG, fontWeight: 600 } };
        return {};
      },
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
      align: 'center' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? row.item.unit : null),
    },
    {
      title: 'Rate (₹)',
      key: 'rate',
      width: 90,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? fmt(row.item.rate) : null),
    },
    {
      title: 'Agreed Qty',
      key: 'agreed_qty',
      width: 95,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? fmt(row.item.agreed_qty, 3) : null),
    },
    {
      title: 'Agreed Amt (₹)',
      key: 'agreed_amount',
      width: 115,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUB_BG, fontWeight: 600 } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') {
          const a = parseFloat(row.item.agreed_qty) * parseFloat(row.item.rate);
          return fmt(a);
        }
        if (row._type === 'subtotal') return `₹ ${fmt(row.section.section_agreed_amount)}`;
        return null;
      },
    },
    {
      title: 'Executed Qty',
      key: 'exec_qty',
      width: 105,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? fmt(row.item.executed_qty, 3) : null),
    },
    {
      title: 'Executed Amt (₹)',
      key: 'exec_amount',
      width: 120,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUB_BG, fontWeight: 600 } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') return `₹ ${fmt(row.item.executed_amount)}`;
        if (row._type === 'subtotal') return `₹ ${fmt(row.section.section_executed_amount)}`;
        return null;
      },
    },
    {
      title: 'Remaining Qty',
      key: 'remaining',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? fmt(row.item.remaining_qty, 3) : null),
    },
    {
      title: '% Done',
      key: 'pct',
      width: 75,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return row.item.percent_complete !== null ? `${fmt(row.item.percent_complete)}%` : '—';
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
          scroll={{ x: 900 }}
          onRow={(row) => ({
            style: {
              background:
                row._type === 'header' ? HDR_BG : row._type === 'subtotal' ? SUB_BG : undefined,
            },
          })}
          summary={() =>
            progress ? (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 700, background: '#e6f7ff' }}>
                  <Table.Summary.Cell index={0} colSpan={5}>
                    Grand Total
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    ₹ {fmt(progress.total_agreed_amount)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                  <Table.Summary.Cell index={7} align="right">
                    ₹ {fmt(progress.total_executed_amount)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} />
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
