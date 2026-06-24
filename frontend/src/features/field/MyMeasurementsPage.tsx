import { useMemo, useState } from 'react';
import { Button, Empty, Form, Input, InputNumber, Modal, Popconfirm, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import {
  useDeleteMeasurement,
  useMeasurements,
  useSubmitMeasurement,
  useUpdateMeasurement,
  type MeasurementRead,
  type MeasurementStatus,
} from '@/api/hooks/useMeasurements';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
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

export function MyMeasurementsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const user = useAuthStore((s) => s.user);
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const submitMeasurement = useSubmitMeasurement();
  const updateMeasurement = useUpdateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();
  const { fmtDate } = useDateFormat();

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

  const mine = useMemo(
    () => (measurements ?? []).filter((m) => m.recorded_by === user?.id),
    [measurements, user?.id],
  );

  const handleSubmit = async (id: string) => {
    try {
      await submitMeasurement.mutateAsync({ id });
      message.success('Measurement submitted for approval');
    } catch {
      message.error('Could not submit measurement');
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

  const columns: TableColumnsType<MeasurementRead> = [
    { title: 'Date', dataIndex: 'measurement_date', width: 100, render: fmtDate },
    {
      title: 'BOQ Item',
      dataIndex: 'boq_item_id',
      render: (id: string) => {
        const item = boqById.get(id);
        return item ? `${item.item_no} — ${item.description}` : id;
      },
    },
    { title: 'Chainage', dataIndex: 'chainage', render: (v: string | null) => v ?? '—', width: 130 },
    { title: 'Qty', dataIndex: 'computed_qty', width: 90, align: 'right' as const },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status: MeasurementStatus) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, record) =>
        record.status === 'DRAFT' ? (
          <Space>
            <Button size="small" type="primary" loading={submitMeasurement.isPending} onClick={() => handleSubmit(record.id)}>
              Submit
            </Button>
            <Button size="small" onClick={() => openEditModal(record)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete this measurement?"
              description="This will also remove its contribution from DPR production."
              onConfirm={() => handleDelete(record)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger loading={deleteMeasurement.isPending}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>My Measurements</Typography.Title>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Empty description="Select a project to view your measurements." />}

      {selectedProjectId && (
        <Table rowKey="id" loading={isLoading} dataSource={mine} columns={columns} bordered size="small" scroll={{ x: 680 }} />
      )}

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
