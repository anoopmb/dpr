import { useMemo, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api-error';
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
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useDeleteMeasurement,
  useMeasurements,
  useUpdateMeasurement,
  type MeasurementRead,
} from '@/api/hooks/useMeasurements';
import { useAuthStore } from '@/store/auth-store';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';

const FIELD_LABELS: Record<string, string> = {
  nos: 'No.',
  l: 'L (m)',
  b: 'B (m)',
  d: 'D (m)',
};

const NCOLS = 7;

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

function MeasurementDetailPanel({
  measurement,
  boqRate,
}: {
  measurement: MeasurementRead;
  boqRate: string | null;
}) {
  const { fmtDate } = useDateFormat();
  const { fmtAmt } = useNumberFormat();
  const effectiveRate = measurement.rate ?? boqRate;
  const isOverride = measurement.rate != null && boqRate != null && parseFloat(measurement.rate) !== parseFloat(boqRate);

  return (
    <div style={{ padding: '8px 16px 16px' }}>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
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
            ? fmtAmt(parseFloat(measurement.computed_qty) * parseFloat(effectiveRate))
            : '—'}
        </Descriptions.Item>
        {Object.entries(measurement.dimensions).map(([k, v]) => (
          <Descriptions.Item key={k} label={FIELD_LABELS[k] ?? k}>
            {v}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </div>
  );
}

export function MeasurementsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const user = useAuthStore((s) => s.user);
  const { resolvedMode } = useThemeMode();
  const { fmtDate } = useDateFormat();
  const { fmtQty } = useNumberFormat();

  const DATE_HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';

  const updateMeasurement = useUpdateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();

  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRead | null>(null);
  const [editDimensions, setEditDimensions] = useState<Record<string, number>>({});
  const [editChainage, setEditChainage] = useState('');
  const [editRate, setEditRate] = useState<number | null>(null);

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
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not update measurement'));
    }
  };

  const handleDelete = async (record: MeasurementRead) => {
    try {
      await deleteMeasurement.mutateAsync({ id: record.id, projectId: record.project_id });
      message.success('Measurement deleted');
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not delete measurement'));
    }
  };

  const canEditOrDelete = (record: MeasurementRead) =>
    record.recorded_by === user?.id || user?.role === 'ADMIN';

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
      title: 'Billed',
      key: 'billed',
      width: 70,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? (row.measurement.billed ? 'Yes' : 'No') : null),
    },
    {
      title: 'Recorded By',
      key: 'recorded_by',
      width: 140,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.measurement.recorded_by_name : null),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item' || !canEditOrDelete(row.measurement)) return null;
        return (
          <Space>
            <Button size="small" onClick={() => openEditModal(row.measurement)}>Edit</Button>
            <Popconfirm
              title="Delete this measurement?"
              description="This will also remove its contribution from DPR production."
              onConfirm={() => handleDelete(row.measurement)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger loading={deleteMeasurement.isPending}>Delete</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Measurement Book
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
            <Statistic title="Computed Quantity" value={fmtQty(editComputedQty)} />
          </Form>
        )}
      </Modal>
    </div>
  );
}
