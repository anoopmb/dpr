import { useMemo, useState } from 'react';
import {
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useApproveMeasurement,
  useDeleteMeasurement,
  useLockMeasurement,
  useMeasurementApprovals,
  useMeasurements,
  useRejectMeasurement,
  useRecallMeasurement,
  useSubmitMeasurement,
  useUpdateMeasurement,
  type MeasurementApprovalRead,
  type MeasurementRead,
  type MeasurementStatus,
} from '@/api/hooks/useMeasurements';
import { useAuthStore } from '@/store/auth-store';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { useEffectiveWorkflow, type WorkflowDefinitionRead } from '@/api/hooks/useWorkflowConfig';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat } from '@/utils/format';

// DRAFT/SUBMITTED/REJECTED/LOCKED are fixed bookends with a fixed color;
// everything else is an admin-configured approval level — colored by
// cycling a palette keyed on the level's position in the workflow.
const FIXED_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  REJECTED: 'red',
  LOCKED: 'green',
};
const LEVEL_COLOR_PALETTE = ['gold', 'cyan', 'purple', 'geekblue', 'volcano', 'lime'];

function statusColor(status: MeasurementStatus, workflow: WorkflowDefinitionRead | undefined): string {
  if (FIXED_STATUS_COLOR[status]) return FIXED_STATUS_COLOR[status];
  const idx = workflow?.levels.findIndex((l) => l.status_code === status) ?? -1;
  return idx >= 0 ? LEVEL_COLOR_PALETTE[idx % LEVEL_COLOR_PALETTE.length] : 'default';
}

function statusLabel(status: MeasurementStatus, workflow: WorkflowDefinitionRead | undefined): string {
  const level = workflow?.levels.find((l) => l.status_code === status);
  return level ? level.label : status.replace(/_/g, ' ');
}

const FIELD_LABELS: Record<string, string> = {
  length: 'Length (m)',
  width: 'Width (m)',
  depth: 'Depth (m)',
  breadth: 'Breadth (m)',
  height: 'Height (m)',
  thickness: 'Thickness (m)',
  diameter: 'Diameter (mm)',
};

// expand column + 7 data columns
const NCOLS = 8;

type MeasurementRow =
  | { _type: 'date-header'; date: string; count: number; key: string }
  | { _type: 'item'; measurement: MeasurementRead; key: string };

function buildDateGroupedRows(measurements: MeasurementRead[]): MeasurementRow[] {
  const sorted = [...measurements].sort((a, b) => (a.measurement_date < b.measurement_date ? 1 : -1));
  const rows: MeasurementRow[] = [];
  let currentDate: string | null = null;
  for (const m of sorted) {
    if (m.measurement_date !== currentDate) {
      currentDate = m.measurement_date;
      const count = sorted.filter((x) => x.measurement_date === currentDate).length;
      rows.push({ _type: 'date-header', date: currentDate, count, key: `hdr-${currentDate}` });
    }
    rows.push({ _type: 'item', measurement: m, key: m.id });
  }
  return rows;
}

const APPROVAL_COLS: TableColumnsType<MeasurementApprovalRead> = [
  { title: 'Actor', dataIndex: 'actor_name', key: 'actor_name', width: 150 },
  {
    title: 'Transition',
    key: 'transition',
    width: 220,
    render: (_, r) => (
      <span>
        <Tag>{r.from_status}</Tag>→<Tag color={r.to_status === 'REJECTED' ? 'red' : 'green'}>{r.to_status}</Tag>
      </span>
    ),
  },
  {
    title: 'Remarks',
    dataIndex: 'remarks',
    key: 'remarks',
    render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
  },
];

function MeasurementDetailPanel({
  measurement,
  boqRate,
}: {
  measurement: MeasurementRead;
  boqRate: string | null;
}) {
  const { data: approvals, isLoading } = useMeasurementApprovals(measurement.id);
  const { fmtDate, fmtDateTime } = useDateFormat();

  const approvalCols: TableColumnsType<MeasurementApprovalRead> = [
    ...APPROVAL_COLS,
    {
      title: 'When',
      key: 'acted_at',
      width: 160,
      render: (_, r) => fmtDateTime(r.acted_at),
    },
  ];

  const effectiveRate = measurement.rate ?? boqRate;
  const isOverride = measurement.rate != null && boqRate != null && parseFloat(measurement.rate) !== parseFloat(boqRate);

  return (
    <div style={{ padding: '8px 16px 16px' }}>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Recorded By">{measurement.recorded_by_name}</Descriptions.Item>
        <Descriptions.Item label="Date">{fmtDate(measurement.measurement_date)}</Descriptions.Item>
        <Descriptions.Item label="Computed Qty">{measurement.computed_qty}</Descriptions.Item>
        <Descriptions.Item label="Chainage">{measurement.chainage ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Rate">
          {effectiveRate != null ? effectiveRate : '—'}
          {isOverride && (
            <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
              (BOQ rate: {boqRate} — overridden)
            </Typography.Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Amount">
          {effectiveRate != null
            ? (parseFloat(measurement.computed_qty) * parseFloat(effectiveRate)).toFixed(2)
            : '—'}
        </Descriptions.Item>
        {Object.entries(measurement.dimensions).map(([k, v]) => (
          <Descriptions.Item key={k} label={FIELD_LABELS[k] ?? k}>
            {v}
          </Descriptions.Item>
        ))}
      </Descriptions>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        Approval History
      </Typography.Text>
      <Table<MeasurementApprovalRead>
        size="small"
        dataSource={approvals ?? []}
        columns={approvalCols}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        bordered
        locale={{ emptyText: 'No approval actions yet' }}
      />
    </div>
  );
}

export function MeasurementsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const { data: workflow } = useEffectiveWorkflow('MEASUREMENT', selectedProjectId);
  const user = useAuthStore((s) => s.user);
  const { resolvedMode } = useThemeMode();
  const { fmtDate } = useDateFormat();

  const DATE_HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';

  const submit = useSubmitMeasurement();
  const approve = useApproveMeasurement();
  const reject = useRejectMeasurement();
  const lock = useLockMeasurement();
  const updateMeasurement = useUpdateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();
  const recallMeasurement = useRecallMeasurement();

  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRead | null>(null);
  const [editDimensions, setEditDimensions] = useState<Record<string, number>>({});
  const [editChainage, setEditChainage] = useState('');
  const [editRate, setEditRate] = useState<number | null>(null);

  const [rejectingMeasurement, setRejectingMeasurement] = useState<MeasurementRead | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const openEditModal = (record: MeasurementRead) => {
    setEditDimensions(
      Object.fromEntries(
        Object.entries(record.dimensions).map(([k, v]) => [k, parseFloat(v) || 0]),
      ),
    );
    setEditChainage(record.chainage ?? '');
    setEditRate(record.rate != null ? parseFloat(record.rate) : null);
    setEditingMeasurement(record);
  };

  const openRejectModal = (record: MeasurementRead) => {
    setRejectRemarks('');
    setRejectingMeasurement(record);
  };

  const editWorkType = useMemo(
    () => (editingMeasurement ? (workTypes ?? []).find((w) => w.id === editingMeasurement.work_type_id) : undefined),
    [editingMeasurement, workTypes],
  );

  const editComputedQty = useMemo(() => {
    if (!editWorkType) return 0;
    return calculateQuantity(editWorkType.formula, editWorkType.dimension_fields, editDimensions);
  }, [editWorkType, editDimensions]);

  const boqById = new Map((boqItems ?? []).map((b) => [b.id, b]));

  const [searchText, setSearchText] = useState('');

  const filteredMeasurements = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return measurements ?? [];
    return (measurements ?? []).filter((m) => {
      const item = boqById.get(m.boq_item_id);
      return (
        (item?.item_no ?? '').toLowerCase().includes(q) ||
        (item?.description ?? '').toLowerCase().includes(q) ||
        (m.chainage ?? '').toLowerCase().includes(q)
      );
    });
  }, [measurements, boqById, searchText]);

  const rows = useMemo(() => buildDateGroupedRows(filteredMeasurements), [filteredMeasurements]);

  const runAction = async (action: typeof submit, id: string, label: string) => {
    try {
      await action.mutateAsync({ id });
      message.success(`Measurement ${label}`);
    } catch {
      message.error(`Could not ${label.toLowerCase()} measurement`);
    }
  };

  const handleRecall = async (record: MeasurementRead) => {
    try {
      await recallMeasurement.mutateAsync({ id: record.id });
      message.success('Measurement recalled to draft — you can now edit and resubmit it');
    } catch {
      message.error('Could not recall measurement');
    }
  };

  const handleReject = async () => {
    if (!rejectingMeasurement || !rejectRemarks.trim()) return;
    try {
      await reject.mutateAsync({ id: rejectingMeasurement.id, remarks: rejectRemarks.trim() });
      message.success('Measurement rejected');
      setRejectingMeasurement(null);
      setRejectRemarks('');
    } catch {
      message.error('Could not reject measurement');
    }
  };

  const handleEditSave = async () => {
    if (!editingMeasurement || !editWorkType) return;
    try {
      await updateMeasurement.mutateAsync({
        id: editingMeasurement.id,
        data: {
          dimensions: Object.fromEntries(
            editWorkType.dimension_fields.map((f) => [f, String(editDimensions[f] ?? 0)]),
          ),
          chainage: editChainage.trim() || null,
          rate: editRate != null ? String(editRate) : null,
        },
      });
      message.success('Measurement updated');
      setEditingMeasurement(null);
    } catch {
      message.error('Could not update measurement — check it does not exceed the BOQ tolerance.');
    }
  };

  const handleDelete = async (record: MeasurementRead) => {
    try {
      await deleteMeasurement.mutateAsync({ id: record.id, projectId: record.project_id });
      message.success('Measurement deleted');
    } catch {
      message.error('Could not delete measurement');
    }
  };

  const canEditOrDelete = (record: MeasurementRead) =>
    record.recorded_by === user?.id || user?.role === 'ADMIN';

  const renderActions = (record: MeasurementRead) => {
    const buttons: React.ReactNode[] = [];
    if (record.status === 'DRAFT') {
      buttons.push(
        <Button key="submit" size="small" onClick={() => runAction(submit, record.id, 'submitted')}>
          Submit
        </Button>,
      );
      if (canEditOrDelete(record)) {
        buttons.push(
          <Button key="edit" size="small" onClick={() => openEditModal(record)}>
            Edit
          </Button>,
          <Popconfirm
            key="delete"
            title="Delete this measurement?"
            description="This will also remove its contribution from DPR production."
            onConfirm={() => handleDelete(record)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger loading={deleteMeasurement.isPending}>
              Delete
            </Button>
          </Popconfirm>,
        );
      }
    }
    if (workflow) {
      const codes = workflow.levels.map((l) => l.status_code);
      let levelIndex = -1;
      if (record.status === 'SUBMITTED' && workflow.levels.length > 0) {
        levelIndex = 0;
      } else {
        const idx = codes.indexOf(record.status);
        if (idx >= 0 && idx + 1 < workflow.levels.length) levelIndex = idx + 1;
      }
      if (levelIndex >= 0) {
        const level = workflow.levels[levelIndex];
        const canAct = user?.role === 'ADMIN' || level.allowed_roles.includes(user?.role as never);
        if (canAct) {
          buttons.push(
            <Button key="approve" size="small" type="primary" onClick={() => runAction(approve, record.id, `${level.label} recorded`)}>
              {level.label}
            </Button>,
          );
          if (level.allow_reject) {
            buttons.push(
              <Button key="reject" size="small" danger onClick={() => openRejectModal(record)}>
                Reject
              </Button>,
            );
          }
        }
      }

      const finalLevel = workflow.levels.find((l) => l.is_final_approval);
      if (finalLevel && record.status === finalLevel.status_code) {
        const canLock = user?.role === 'ADMIN' || (workflow.lock_allowed_roles ?? []).includes(user?.role as never);
        if (canLock) {
          buttons.push(
            <Button key="lock" size="small" type="primary" onClick={() => runAction(lock, record.id, 'locked')}>
              Lock
            </Button>,
          );
        }
      }
    }
    if (record.status === 'REJECTED' && canEditOrDelete(record)) {
      buttons.push(
        <Popconfirm
          key="recall"
          title="Recall to Draft?"
          description="This measurement will return to Draft so you can edit and resubmit it."
          onConfirm={() => handleRecall(record)}
          okText="Recall"
        >
          <Button size="small" loading={recallMeasurement.isPending}>
            Recall to Draft
          </Button>
        </Popconfirm>,
      );
    }
    return <Space>{buttons}</Space>;
  };

  const columns: TableColumnsType<MeasurementRow> = [
    {
      title: 'BOQ Item',
      key: 'boq_item',
      onCell: (row) => (row._type === 'date-header' ? { colSpan: NCOLS, style: { background: DATE_HDR_BG, fontWeight: 600 } } : {}),
      render: (_, row) => {
        if (row._type === 'date-header') return `${fmtDate(row.date)} (${row.count} entr${row.count === 1 ? 'y' : 'ies'})`;
        const item = boqById.get(row.measurement.boq_item_id);
        return item ? `${item.item_no} — ${item.description}` : row.measurement.boq_item_id;
      },
    },
    {
      title: 'Chainage / Location',
      key: 'chainage',
      width: 140,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.measurement.chainage ?? '—' : null),
    },
    {
      title: 'Computed Qty',
      key: 'computed_qty',
      width: 110,
      align: 'right' as const,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.measurement.computed_qty : null),
    },
    {
      title: 'Rate',
      key: 'rate',
      width: 100,
      align: 'right' as const,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const boqRate = boqById.get(row.measurement.boq_item_id)?.rate ?? null;
        const rate = row.measurement.rate ?? boqRate;
        if (rate == null) return '—';
        const isOverride = row.measurement.rate != null && boqRate != null && parseFloat(row.measurement.rate) !== parseFloat(boqRate);
        return <span title={isOverride ? `BOQ rate: ${boqRate}` : undefined}>{rate}{isOverride && ' *'}</span>;
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) =>
        row._type === 'item' ? (
          <Tag color={statusColor(row.measurement.status, workflow)}>{statusLabel(row.measurement.status, workflow)}</Tag>
        ) : null,
    },
    {
      title: 'Billed',
      key: 'billed',
      width: 70,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? (row.measurement.billed ? 'Yes' : 'No') : null),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? renderActions(row.measurement) : null),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Measurement Book & Approvals
        </Typography.Title>
        <Space>
          <ProjectSelector />
          <Input.Search
            placeholder="Search by item no, description, or chainage"
            allowClear
            style={{ width: 280 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
      </div>

      <Table
        rowKey="key"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        bordered
        pagination={false}
        scroll={{ x: 900 }}
        onRow={(row) => ({ style: { background: row._type === 'date-header' ? DATE_HDR_BG : undefined } })}
        expandable={{
          expandedRowRender: (row) =>
            row._type === 'item' ? (
              <MeasurementDetailPanel
                measurement={row.measurement}
                boqRate={boqById.get(row.measurement.boq_item_id)?.rate ?? null}
              />
            ) : null,
          rowExpandable: (row) => row._type === 'item',
        }}
      />

      <Modal
        title="Reject Measurement"
        open={!!rejectingMeasurement}
        onCancel={() => setRejectingMeasurement(null)}
        onOk={handleReject}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !rejectRemarks.trim() }}
        confirmLoading={reject.isPending}
        destroyOnHidden
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Rejection Reason" required>
            <Input.TextArea
              rows={4}
              maxLength={500}
              showCount
              placeholder="Describe why this measurement is being rejected…"
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Measurement"
        open={!!editingMeasurement}
        onCancel={() => setEditingMeasurement(null)}
        onOk={handleEditSave}
        confirmLoading={updateMeasurement.isPending}
        destroyOnHidden
      >
        {editingMeasurement && editWorkType && (
          <Form layout="vertical">
            <Form.Item label="Chainage / Location (optional)">
              <Input
                value={editChainage}
                onChange={(e) => setEditChainage(e.target.value)}
                placeholder="e.g. 2/130–2/390"
              />
            </Form.Item>
            <Form.Item label="Rate (optional override)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                value={editRate}
                placeholder="BOQ item rate"
                onChange={(v) => setEditRate(v)}
              />
            </Form.Item>
            {editWorkType.dimension_fields.map((field) => (
              <Form.Item key={field} label={FIELD_LABELS[field] ?? field}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={editDimensions[field] ?? 0}
                  onChange={(v) => setEditDimensions((prev) => ({ ...prev, [field]: v ?? 0 }))}
                />
              </Form.Item>
            ))}
            <Statistic title="Computed Quantity" value={editComputedQty.toFixed(3)} />
          </Form>
        )}
      </Modal>
    </div>
  );
}
