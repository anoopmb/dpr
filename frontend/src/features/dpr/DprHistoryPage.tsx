import { Empty, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useDprList, type DprHeaderRead } from '@/api/hooks/useDpr';
import { useDateFormat } from '@/utils/format';

function rowKind(header: DprHeaderRead): 'no-work' | 'pre-work' | 'normal' {
  if (header.no_work) return 'no-work';
  const hasProduction = header.work_items.length > 0;
  const hasExpense = header.materials.length > 0 || header.machinery_entries.length > 0;
  if (!hasProduction && hasExpense) return 'pre-work';
  return 'normal';
}

const ROW_BG: Record<string, string> = {
  'no-work': '#f5f5f5',
  'pre-work': '#fffbe6',
};

export function DprHistoryPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: headers, isLoading } = useDprList(selectedProjectId);
  const { fmtDate } = useDateFormat();

  const sorted = [...(headers ?? [])].sort((a, b) => (a.report_date < b.report_date ? 1 : -1));

  const columns: TableColumnsType<DprHeaderRead> = [
    { title: 'Date', dataIndex: 'report_date', width: 110, render: fmtDate },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <Tag color={s === 'SUBMITTED' ? 'green' : 'blue'}>{s}</Tag>,
    },
    {
      title: 'Day Type',
      key: 'kind',
      width: 160,
      render: (_, header) => {
        const kind = rowKind(header);
        if (kind === 'no-work') {
          return (
            <Tooltip title={header.no_work_reason ?? ''}>
              <Tag color="default">No Work — {header.no_work_reason ?? '—'}</Tag>
            </Tooltip>
          );
        }
        if (kind === 'pre-work') {
          return (
            <Tooltip title="Pre-work day — no BOQ quantity claimed, but expenses recorded">
              <Tag color="gold">Pre-work / Mobilization</Tag>
            </Tooltip>
          );
        }
        return <Tag color="cyan">Production Day</Tag>;
      },
    },
    { title: 'Supervisor', dataIndex: 'supervisor_name', render: (v: string | null) => v ?? '—' },
    { title: "Today's Activity", dataIndex: 'daily_work_summary', render: (v: string | null) => v ?? '—', ellipsis: true },
    {
      title: 'Issues',
      key: 'issues',
      width: 80,
      align: 'center' as const,
      render: (_, header) => (header.issues.length > 0 ? <Tag color="red">{header.issues.length}</Tag> : '—'),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        DPR History
      </Typography.Title>

      <ProjectSelector style={{ marginBottom: 16, width: 320 }} />

      {!selectedProjectId && <Empty description="Select a project to view DPR history." />}

      {selectedProjectId && (
        <Table
          rowKey="id"
          dataSource={sorted}
          columns={columns}
          loading={isLoading}
          size="small"
          bordered
          pagination={{ pageSize: 31 }}
          onRow={(header) => {
            const kind = rowKind(header);
            return { style: { background: ROW_BG[kind] } };
          }}
        />
      )}
    </div>
  );
}
