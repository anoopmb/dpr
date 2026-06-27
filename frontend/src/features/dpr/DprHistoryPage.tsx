import { useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useApproveDpr,
  useDprApprovals,
  useDprList,
  useDprMeasurements,
  useRejectDpr,
  type DprHeaderApprovalRead,
  type DprHeaderRead,
  type DprStatus,
} from '@/api/hooks/useDpr';
import { useAuthStore } from '@/store/auth-store';
import { useMaterials, useMachinery } from '@/api/hooks/useMasters';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useEffectiveWorkflow, type WorkflowDefinitionRead } from '@/api/hooks/useWorkflowConfig';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import type { MeasurementRead, MeasurementStatus } from '@/api/hooks/useMeasurements';

// DRAFT/SUBMITTED/REJECTED/LOCKED/APPROVED are fixed bookends with fixed
// colors; everything else is an admin-configured approval level — colored
// by cycling a palette keyed on the level's position in its workflow.
const FIXED_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'blue',
  SUBMITTED: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  LOCKED: 'green',
};
const LEVEL_COLOR_PALETTE = ['gold', 'cyan', 'purple', 'geekblue', 'volcano', 'lime'];

function statusColor(status: string, workflow: WorkflowDefinitionRead | undefined): string {
  if (FIXED_STATUS_COLOR[status]) return FIXED_STATUS_COLOR[status];
  const idx = workflow?.levels.findIndex((l) => l.status_code === status) ?? -1;
  return idx >= 0 ? LEVEL_COLOR_PALETTE[idx % LEVEL_COLOR_PALETTE.length] : 'default';
}

function statusLabel(status: string, workflow: WorkflowDefinitionRead | undefined): string {
  const level = workflow?.levels.find((l) => l.status_code === status);
  return level ? level.label : status.replace(/_/g, ' ');
}

function rowKind(header: DprHeaderRead): 'no-work' | 'pre-work' | 'normal' {
  if (header.no_work) return 'no-work';
  const hasProduction = header.work_items.length > 0;
  const hasExpense = header.materials.length > 0 || header.machinery_entries.length > 0;
  if (!hasProduction && hasExpense) return 'pre-work';
  return 'normal';
}

const APPROVAL_COLS: TableColumnsType<DprHeaderApprovalRead> = [
  { title: 'Actor', dataIndex: 'actor_name', key: 'actor_name', width: 150 },
  {
    title: 'Transition',
    key: 'transition',
    width: 220,
    render: (_, r) => (
      <Space size={4}>
        <Tag>{r.from_status}</Tag>→
        <Tag color={r.to_status === 'APPROVED' ? 'green' : r.to_status === 'DRAFT' ? 'orange' : 'default'}>
          {r.to_status}
        </Tag>
      </Space>
    ),
  },
  {
    title: 'Remarks',
    dataIndex: 'remarks',
    key: 'remarks',
    render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
  },
];

function DprDetailPanel({
  header,
  materialById,
  machineryById,
  boqById,
}: {
  header: DprHeaderRead;
  materialById: Map<string, { name: string }>;
  machineryById: Map<string, { name: string }>;
  boqById: Map<string, { item_no: string; description: string }>;
}) {
  const { data: approvals, isLoading: approvalsLoading } = useDprApprovals(header.id);
  const { data: measurements, isLoading: measurementsLoading } = useDprMeasurements(header.id);
  const { data: measurementWorkflow } = useEffectiveWorkflow('MEASUREMENT', header.project_id);
  const { fmtDateTime, fmtDate } = useDateFormat();
  const { fmtAmt } = useNumberFormat();

  const approvalCols: TableColumnsType<DprHeaderApprovalRead> = [
    ...APPROVAL_COLS,
    { title: 'When', key: 'acted_at', width: 160, render: (_, r) => fmtDateTime(r.acted_at) },
  ];

  const measurementCols: TableColumnsType<MeasurementRead> = [
    {
      title: 'BOQ Item',
      key: 'boq',
      render: (_, m) => {
        const item = boqById.get(m.boq_item_id);
        return item ? `${item.item_no} — ${item.description}` : m.boq_item_id;
      },
    },
    { title: 'Date', dataIndex: 'measurement_date', width: 100, render: fmtDate },
    { title: 'Qty', dataIndex: 'computed_qty', width: 90, align: 'right' as const },
    { title: 'Chainage', dataIndex: 'chainage', width: 130, render: (v: string | null) => v ?? '—' },
    { title: 'Recorded By', dataIndex: 'recorded_by_name', width: 140 },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: MeasurementStatus) => (
        <Tag color={statusColor(s, measurementWorkflow)}>{statusLabel(s, measurementWorkflow)}</Tag>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px 16px 16px' }}>
      {header.materials.length > 0 && (
        <>
          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            Materials Used
          </Typography.Text>
          <ul style={{ margin: '0 0 12px 16px', padding: 0 }}>
            {header.materials.map((m) => (
              <li key={m.id}>
                {materialById.get(m.material_id)?.name ?? m.material_id} — {m.qty_consumed}
                {m.rate ? ` @ ${fmtAmt(m.rate)}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {header.machinery_entries.length > 0 && (
        <>
          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            Machinery Used
          </Typography.Text>
          <ul style={{ margin: '0 0 12px 16px', padding: 0 }}>
            {header.machinery_entries.map((m) => (
              <li key={m.id}>
                {machineryById.get(m.machinery_id)?.name ?? m.machinery_id} — {m.quantity_used} {m.hire_unit}
                {m.hire_rate ? ` @ ${fmtAmt(m.hire_rate)}/${m.hire_unit}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {header.issues.length > 0 && (
        <>
          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            Issues
          </Typography.Text>
          <ul style={{ margin: '0 0 12px 16px', padding: 0 }}>
            {header.issues.map((issue) => (
              <li key={issue.id}>
                <Tag color={issue.severity === 'CRITICAL' ? 'red' : issue.severity === 'HIGH' ? 'orange' : 'default'}>
                  {issue.severity}
                </Tag>
                {issue.description}
              </li>
            ))}
          </ul>
        </>
      )}

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        Measurements ({(measurements ?? []).length})
      </Typography.Text>
      {(measurements ?? []).length === 0 && !measurementsLoading ? (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          No measurements recorded for this date.
        </Typography.Text>
      ) : (
        <Table<MeasurementRead>
          size="small"
          dataSource={measurements ?? []}
          columns={measurementCols}
          rowKey="id"
          loading={measurementsLoading}
          pagination={false}
          bordered
          scroll={{ x: 700 }}
          style={{ marginBottom: 16 }}
        />
      )}

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        Approval History
      </Typography.Text>
      <Table<DprHeaderApprovalRead>
        size="small"
        dataSource={approvals ?? []}
        columns={approvalCols}
        rowKey="id"
        loading={approvalsLoading}
        pagination={false}
        bordered
        locale={{ emptyText: 'No approval actions yet' }}
      />
    </div>
  );
}

export function DprHistoryPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: headers, isLoading } = useDprList(selectedProjectId);
  const { data: materials } = useMaterials();
  const { data: machineryList } = useMachinery();
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const user = useAuthStore((s) => s.user);
  const { fmtDate } = useDateFormat();
  const { resolvedMode } = useThemeMode();
  const approveDpr = useApproveDpr();
  const rejectDpr = useRejectDpr();
  const { data: dprWorkflow } = useEffectiveWorkflow('DPR_HEADER', selectedProjectId);

  // The level a SUBMITTED (or mid-chain) header is currently awaiting, if
  // any — null when there's nothing left to approve at this status.
  const getActionLevel = (header: DprHeaderRead) => {
    if (!dprWorkflow) return null;
    const codes = dprWorkflow.levels.map((l) => l.status_code);
    if (header.status === 'SUBMITTED' && dprWorkflow.levels.length > 0) return dprWorkflow.levels[0];
    const idx = codes.indexOf(header.status);
    if (idx >= 0 && idx + 1 < dprWorkflow.levels.length) return dprWorkflow.levels[idx + 1];
    return null;
  };

  const canActOnLevel = (level: { allowed_roles: string[] }) =>
    user?.role === 'ADMIN' || level.allowed_roles.includes(user?.role as never);

  // Static column-inclusion check (AntD columns are an array, not per-row) —
  // show the Actions column at all if this user's role could act on any
  // configured level; the per-row render below still gates by the specific
  // level each header is actually awaiting.
  const canApproveAnything =
    user?.role === 'ADMIN' || (dprWorkflow?.levels.some((l) => l.allowed_roles.includes(user?.role as never)) ?? false);

  const ROW_BG: Record<string, string | undefined> = {
    'no-work': resolvedMode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#f5f5f5',
    'pre-work': resolvedMode === 'dark' ? 'rgba(250, 173, 20, 0.12)' : '#fffbe6',
    normal: undefined,
  };

  const [searchText, setSearchText] = useState('');
  const [rejectingHeader, setRejectingHeader] = useState<DprHeaderRead | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const materialById = new Map((materials ?? []).map((m) => [m.id, { name: m.name }]));
  const machineryById = new Map((machineryList ?? []).map((m) => [m.id, { name: m.name }]));
  const boqById = new Map((boqItems ?? []).map((b) => [b.id, { item_no: b.item_no, description: b.description }]));

  const sorted = [...(headers ?? [])].sort((a, b) => (a.report_date < b.report_date ? 1 : -1));

  const filtered = sorted.filter((h) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return (
      (h.supervisor_name ?? '').toLowerCase().includes(q) ||
      (h.daily_work_summary ?? '').toLowerCase().includes(q)
    );
  });

  const handleApprove = async (header: DprHeaderRead) => {
    try {
      await approveDpr.mutateAsync({ headerId: header.id });
      message.success(`DPR for ${fmtDate(header.report_date)} approved`);
    } catch {
      message.error('Could not approve DPR');
    }
  };

  const handleReject = async () => {
    if (!rejectingHeader || !rejectRemarks.trim()) return;
    try {
      await rejectDpr.mutateAsync({ headerId: rejectingHeader.id, remarks: rejectRemarks.trim() });
      message.success(`DPR for ${fmtDate(rejectingHeader.report_date)} returned for correction`);
      setRejectingHeader(null);
      setRejectRemarks('');
    } catch {
      message.error('Could not reject DPR');
    }
  };

  const columns: TableColumnsType<DprHeaderRead> = [
    { title: 'Date', dataIndex: 'report_date', width: 110, render: fmtDate },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s: DprStatus) => <Tag color={statusColor(s, dprWorkflow)}>{statusLabel(s, dprWorkflow)}</Tag>,
    },
    {
      title: 'Day Type',
      key: 'kind',
      width: 180,
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
    {
      title: "Today's Activity",
      dataIndex: 'daily_work_summary',
      render: (v: string | null) => v ?? '—',
      ellipsis: true,
    },
    {
      title: 'Issues',
      key: 'issues',
      width: 70,
      align: 'center' as const,
      render: (_, header) =>
        header.issues.length > 0 ? <Tag color="red">{header.issues.length}</Tag> : '—',
    },
    ...(canApproveAnything
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 180,
            render: (_: unknown, header: DprHeaderRead) => {
              const level = getActionLevel(header);
              if (!level || !canActOnLevel(level)) return null;
              return (
                <Space>
                  <Popconfirm
                    title={`${level.label}?`}
                    description="This will formally sign off the day's report."
                    onConfirm={() => handleApprove(header)}
                    okText="Approve"
                  >
                    <Button size="small" type="primary" loading={approveDpr.isPending}>
                      {level.label}
                    </Button>
                  </Popconfirm>
                  {level.allow_reject && (
                    <Button
                      size="small"
                      danger
                      onClick={() => {
                        setRejectRemarks('');
                        setRejectingHeader(header);
                      }}
                    >
                      Return
                    </Button>
                  )}
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        DPR History
      </Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <ProjectSelector style={{ width: 320 }} />
        <Input.Search
          placeholder="Search by supervisor or activity"
          allowClear
          style={{ width: 260 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </Space>

      {!selectedProjectId && <Empty description="Select a project to view DPR history." />}

      {selectedProjectId && (
        <Table
          rowKey="id"
          dataSource={filtered}
          columns={columns}
          loading={isLoading}
          size="small"
          bordered
          scroll={{ x: 900 }}
          pagination={{ pageSize: 31 }}
          onRow={(header) => {
            const kind = rowKind(header);
            return { style: { background: ROW_BG[kind] } };
          }}
          expandable={{
            expandedRowRender: (header) => (
              <DprDetailPanel
                header={header}
                materialById={materialById}
                machineryById={machineryById}
                boqById={boqById}
              />
            ),
          }}
        />
      )}

      <Modal
        title="Return DPR for Correction"
        open={!!rejectingHeader}
        onCancel={() => setRejectingHeader(null)}
        onOk={handleReject}
        okText="Return for Correction"
        okButtonProps={{ danger: true, disabled: !rejectRemarks.trim() }}
        confirmLoading={rejectDpr.isPending}
        destroyOnHidden
      >
        {rejectingHeader && (
          <Alert
            type="warning"
            showIcon
            message={`DPR for ${fmtDate(rejectingHeader.report_date)} will be sent back to DRAFT. The engineer will be notified and can fix and resubmit.`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical">
          <Form.Item label="Reason for returning" required>
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder="Explain what needs to be corrected…"
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
