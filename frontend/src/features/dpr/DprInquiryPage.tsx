import { useMemo, useState } from 'react';
import { Empty, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useDprList, type DprHeaderRead, type DprStatus } from '@/api/hooks/useDpr';
import { useEffectiveWorkflow } from '@/api/hooks/useWorkflowConfig';
import { useDateFormat } from '@/utils/format';
import { statusColor, statusLabel } from '@/features/dpr/dprStatus';

const FIXED_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED'];

// Virtual (derived) statuses — not stored on the DPR, inferred from how many
// times it was returned to DRAFT after submission.
const RETURNED = '__returned__';
const RESUBMITTED = '__resubmitted__';

// 'returned'  → currently a DRAFT that was previously sent back for correction.
// 'resubmitted' → back in the workflow (submitted/in-review/approved) after
//                 having been returned at least once.
function derivedState(h: DprHeaderRead): 'returned' | 'resubmitted' | null {
  if (h.return_count > 0) return h.status === 'DRAFT' ? 'returned' : 'resubmitted';
  return null;
}

export function DprInquiryPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: headers, isLoading } = useDprList(selectedProjectId);
  const { data: dprWorkflow } = useEffectiveWorkflow('DPR_HEADER', selectedProjectId);
  const { fmtDate } = useDateFormat();

  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fixed bookends plus any admin-configured approval levels — deduped so a
  // level named e.g. "APPROVED" doesn't show twice.
  const statusOptions = useMemo(() => {
    const codes = [...FIXED_STATUSES, ...(dprWorkflow?.levels.map((l) => l.status_code) ?? [])];
    const seen = new Set<string>();
    const unique = codes.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
    return [
      { value: '', label: 'All statuses' },
      ...unique.map((c) => ({ value: c, label: statusLabel(c, dprWorkflow) })),
      { value: RETURNED, label: 'Returned to draft' },
      { value: RESUBMITTED, label: 'Resubmitted' },
    ];
  }, [dprWorkflow]);

  const rows = useMemo(() => {
    const sorted = [...(headers ?? [])].sort((a, b) => (a.report_date < b.report_date ? 1 : -1));
    if (!statusFilter) return sorted;
    if (statusFilter === RETURNED) return sorted.filter((h) => derivedState(h) === 'returned');
    if (statusFilter === RESUBMITTED) return sorted.filter((h) => derivedState(h) === 'resubmitted');
    return sorted.filter((h) => h.status === statusFilter);
  }, [headers, statusFilter]);

  const columns: TableColumnsType<DprHeaderRead> = [
    { title: 'Date', dataIndex: 'report_date', width: 120, render: fmtDate },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 220,
      render: (s: DprStatus, h) => {
        const derived = derivedState(h);
        return (
          <Space size={4} wrap>
            <Tag color={statusColor(s, dprWorkflow)} style={{ margin: 0 }}>{statusLabel(s, dprWorkflow)}</Tag>
            {derived === 'returned' && (
              <Tooltip title={`Returned for correction ${h.return_count} time${h.return_count === 1 ? '' : 's'}`}>
                <Tag color="volcano" style={{ margin: 0 }}>Returned to draft</Tag>
              </Tooltip>
            )}
            {derived === 'resubmitted' && (
              <Tooltip title={`Resubmitted after being returned ${h.return_count} time${h.return_count === 1 ? '' : 's'}`}>
                <Tag color="geekblue" style={{ margin: 0 }}>Resubmitted</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    { title: 'Supervisor', dataIndex: 'supervisor_name', width: 180, render: (v: string | null) => v ?? '—' },
    {
      title: "Today's Activity",
      dataIndex: 'daily_work_summary',
      render: (v: string | null) => v ?? '—',
      ellipsis: true,
    },
    {
      title: 'Issues',
      key: 'issues',
      width: 80,
      align: 'center' as const,
      render: (_, header) =>
        header.issues.length > 0 ? (
          <Tooltip title={`${header.issues.length} issue(s) logged`}>
            <Tag color="red">{header.issues.length}</Tag>
          </Tooltip>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        DPR Inquiry
      </Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <ProjectSelector style={{ width: 320 }} />
        <Select
          style={{ width: 200 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
        />
      </Space>

      {!selectedProjectId ? (
        <Empty description="Select a project to inquire on its DPRs." />
      ) : (
        <Table
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={isLoading}
          size="small"
          bordered
          scroll={{ x: 800 }}
          pagination={{ pageSize: 31, showTotal: (total) => `${total} DPRs` }}
        />
      )}
    </div>
  );
}
