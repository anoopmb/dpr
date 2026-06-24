import { useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useApproveMeasurement,
  useDeleteMeasurement,
  useLockMeasurement,
  useMeasurements,
  useRejectMeasurement,
  useSubmitMeasurement,
  useUpdateMeasurement,
  type MeasurementRead,
  type MeasurementStatus,
} from '@/api/hooks/useMeasurements';
import { useAuthStore } from '@/store/auth-store';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat } from '@/utils/format';

const STATUS_COLOR: Record<MeasurementStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  PM_APPROVED: 'gold',
  QS_APPROVED: 'cyan',
  LOCKED: 'green',
  REJECTED: 'red',
};

const FIELD_LABELS: Record<string, string> = {
  length: 'Length (m)',
  width: 'Width (m)',
  depth: 'Depth (m)',
  breadth: 'Breadth (m)',
  height: 'Height (m)',
  thickness: 'Thickness (m)',
  diameter: 'Diameter (mm)',
};

const NCOLS = 6;

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

export function MeasurementsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
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

  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRead | null>(null);
  const [editDimensions, setEditDimensions] = useState<Record<string, number>>({});
  const [editChainage, setEditChainage] = useState('');

  const openEditModal = (record: MeasurementRead) => {
    setEditDimensions(
      Object.fromEntries(
        Object.entries(record.dimensions).map(([k, v]) => [k, parseFloat(v) || 0]),
      ),
    );
    setEditChainage(record.chainage ?? '');
    setEditingMeasurement(record);
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

  const rows = useMemo(() => buildDateGroupedRows(measurements ?? []), [measurements]);

  const runAction = async (action: typeof submit, id: string, label: string) => {
    try {
      await action.mutateAsync({ id });
      message.success(`Measurement ${label}`);
    } catch {
      message.error(`Could not ${label.toLowerCase()} measurement`);
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
    if (record.status === 'SUBMITTED' && (user?.role === 'PROJECT_MANAGER' || user?.role === 'ADMIN')) {
      buttons.push(
        <Button key="approve" size="small" type="primary" onClick={() => runAction(approve, record.id, 'PM approved')}>
          PM Approve
        </Button>,
        <Button key="reject" size="small" danger onClick={() => runAction(reject, record.id, 'rejected')}>
          Reject
        </Button>,
      );
    }
    if (record.status === 'PM_APPROVED' && (user?.role === 'QUANTITY_SURVEYOR' || user?.role === 'ADMIN')) {
      buttons.push(
        <Button key="approve" size="small" type="primary" onClick={() => runAction(approve, record.id, 'QS approved')}>
          QS Approve
        </Button>,
        <Button key="reject" size="small" danger onClick={() => runAction(reject, record.id, 'rejected')}>
          Reject
        </Button>,
      );
    }
    if (record.status === 'QS_APPROVED' && (user?.role === 'QUANTITY_SURVEYOR' || user?.role === 'ADMIN')) {
      buttons.push(
        <Button key="lock" size="small" type="primary" onClick={() => runAction(lock, record.id, 'locked')}>
          Lock
        </Button>,
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
      title: 'Status',
      key: 'status',
      width: 110,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) =>
        row._type === 'item' ? <Tag color={STATUS_COLOR[row.measurement.status]}>{row.measurement.status}</Tag> : null,
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
        <ProjectSelector />
      </div>

      <Table
        rowKey="key"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        bordered
        onRow={(row) => ({ style: { background: row._type === 'date-header' ? DATE_HDR_BG : undefined } })}
      />

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
