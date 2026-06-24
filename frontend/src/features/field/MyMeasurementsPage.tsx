import { useMemo } from 'react';
import { Button, Empty, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import { useMeasurements, useSubmitMeasurement, type MeasurementRead, type MeasurementStatus } from '@/api/hooks/useMeasurements';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useDateFormat } from '@/utils/format';

const STATUS_COLOR: Record<MeasurementStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  PM_APPROVED: 'gold',
  QS_APPROVED: 'cyan',
  LOCKED: 'green',
  REJECTED: 'red',
};

export function MyMeasurementsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const user = useAuthStore((s) => s.user);
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const submitMeasurement = useSubmitMeasurement();
  const { fmtDate } = useDateFormat();

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
      width: 100,
      render: (_, record) =>
        record.status === 'DRAFT' ? (
          <Button size="small" type="primary" loading={submitMeasurement.isPending} onClick={() => handleSubmit(record.id)}>
            Submit
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>My Measurements</Typography.Title>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Empty description="Select a project to view your measurements." />}

      {selectedProjectId && (
        <Table rowKey="id" loading={isLoading} dataSource={mine} columns={columns} bordered size="small" />
      )}
    </div>
  );
}
