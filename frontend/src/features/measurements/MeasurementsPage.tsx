import { useMemo, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api-error';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined, FilePdfOutlined, FileTextOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useDeleteMeasurement,
  useMeasurements,
  useUpdateMeasurement,
  useUpdateMeasurementNotes,
  type MeasurementRead,
} from '@/api/hooks/useMeasurements';
import { useAuthStore } from '@/store/auth-store';
import { useProjects } from '@/api/hooks/useProjects';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useUoms, useWorkTypes } from '@/api/hooks/useMasters';
import { calculateQuantity, evaluateExpression, isArithmeticExpression, ExpressionError } from '@/features/measurements/formulaEngine';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { MeasurementPhotos } from '@/features/measurements/MeasurementPhotos';
import { buildMeasurementExportRows, exportMeasurementsToExcel } from '@/features/measurements/measurementExport';
import { buildMeasurementPrintableHTML } from '@/features/measurements/measurementPrint';
import { triggerPrint } from '@/features/dpr/dprPrint';

const FIELD_LABELS: Record<string, string> = {
  nos: 'No.',
  l: 'L (m)',
  b: 'B (m)',
  d: 'D (m)',
};

const NCOLS = 9;

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
            {measurement.dimension_expressions?.[k] ?? v}
          </Descriptions.Item>
        ))}
        <Descriptions.Item label="Notes" span={3}>
          {measurement.notes || <Typography.Text type="secondary">—</Typography.Text>}
        </Descriptions.Item>
      </Descriptions>
      <div style={{ marginTop: 12 }}>
        <MeasurementPhotos photos={measurement.photos} />
      </div>
    </div>
  );
}

export function MeasurementsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const { data: projects } = useProjects();
  const { data: uoms } = useUoms();
  const user = useAuthStore((s) => s.user);
  const { resolvedMode } = useThemeMode();
  const { fmtDate, dateFormat } = useDateFormat();
  const { fmtQty } = useNumberFormat();

  const DATE_HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';

  const updateMeasurement = useUpdateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();
  const updateMeasurementNotes = useUpdateMeasurementNotes();

  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRead | null>(null);
  const [editBoqItemId, setEditBoqItemId] = useState<string | null>(null);
  const [editDimensions, setEditDimensions] = useState<Record<string, number>>({});
  const [editDimensionText, setEditDimensionText] = useState<Record<string, string>>({});
  const [editChainage, setEditChainage] = useState('');
  const [editRate, setEditRate] = useState<number | null>(null);

  const [notesModalEntry, setNotesModalEntry] = useState<MeasurementRead | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const canEditNotes = (record: MeasurementRead) => record.recorded_by === user?.id || user?.role === 'ADMIN';

  const openNotesModal = (record: MeasurementRead) => {
    setNotesModalEntry(record);
    setNotesDraft(record.notes ?? '');
  };

  const saveNotes = async () => {
    if (!notesModalEntry) return;
    setNotesSaving(true);
    try {
      await updateMeasurementNotes.mutateAsync({ id: notesModalEntry.id, notes: notesDraft.trim() || null });
      message.success('Notes saved');
      setNotesModalEntry(null);
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not save notes'));
    } finally {
      setNotesSaving(false);
    }
  };

  const openEditModal = (record: MeasurementRead) => {
    setEditBoqItemId(record.boq_item_id);
    setEditDimensions(
      Object.fromEntries(
        Object.entries(record.dimensions).map(([k, v]) => [k, parseFloat(v) || 0]),
      ),
    );
    setEditDimensionText(
      Object.fromEntries(
        Object.entries(record.dimensions).map(([k, v]) => [k, record.dimension_expressions?.[k] ?? v]),
      ),
    );
    setEditChainage(record.chainage ?? '');
    setEditRate(record.rate != null ? parseFloat(record.rate) : null);
    setEditingMeasurement(record);
  };

  // Re-point the line at a different BOQ item: reset dimensions to the new
  // work type's fields (mirrors the create form's handleSelectBoq), since the
  // old L/B/D values don't necessarily map onto a different formula.
  const handleEditBoqChange = (value: string) => {
    const item = (boqItems ?? []).find((b) => b.id === value);
    const wt = (workTypes ?? []).find((w) => w.id === item?.work_type_id);
    setEditBoqItemId(value);
    setEditDimensions(wt?.dimension_fields.includes('nos') ? { nos: 1 } : {});
    setEditDimensionText(wt?.dimension_fields.includes('nos') ? { nos: '1' } : {});
  };

  // l/b/d accept a plain number or an arithmetic expression like "(1+2.5)/2".
  const patchEditDimensionText = (field: string, text: string) => {
    setEditDimensionText((prev) => ({ ...prev, [field]: text }));
    let parsed: number | null;
    try {
      parsed = isArithmeticExpression(text) ? evaluateExpression(text) : (text.trim() === '' ? 0 : parseFloat(text));
    } catch (err) {
      if (err instanceof ExpressionError) return;
      throw err;
    }
    if (parsed == null || Number.isNaN(parsed)) return;
    setEditDimensions((prev) => ({ ...prev, [field]: parsed }));
  };

  const editBoqItem = useMemo(
    () => (editBoqItemId ? (boqItems ?? []).find((b) => b.id === editBoqItemId) : undefined),
    [editBoqItemId, boqItems],
  );
  const editWorkType = useMemo(
    () => (editBoqItem ? (workTypes ?? []).find((w) => w.id === editBoqItem.work_type_id) : undefined),
    [editBoqItem, workTypes],
  );
  // This modal renders dimension fields only — steel bar entry lives on the
  // field Measurement screen. Steel rows keep their existing no-op edit here.
  // Re-pointing is restricted to items of the *same* construction type so the
  // carried-over template (and auto-material behaviour) stays valid.
  const editingConstructionType = editingMeasurement
    ? (boqItems ?? []).find((b) => b.id === editingMeasurement.boq_item_id)?.construction_type ?? null
    : null;
  const editingIsSteel = editingConstructionType === 'STEEL';
  const boqChangeOptions = useMemo(
    () =>
      (boqItems ?? [])
        .filter((b) => b.construction_type === editingConstructionType)
        .map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` })),
    [boqItems, editingConstructionType],
  );

  const editComputedQty = useMemo(() => {
    if (!editWorkType) return 0;
    return calculateQuantity(editWorkType.formula, editWorkType.dimension_fields, editDimensions);
  }, [editWorkType, editDimensions]);

  const boqById = new Map((boqItems ?? []).map((b) => [b.id, b]));
  const uomById = useMemo(() => new Map((uoms ?? []).map((u) => [u.id, u])), [uoms]);

  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [boqItemFilter, setBoqItemFilter] = useState<string | null>(null);

  const filteredMeasurements = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return (measurements ?? []).filter((m) => {
      if (boqItemFilter && m.boq_item_id !== boqItemFilter) return false;
      if (dateRange) {
        const d = dayjs(m.measurement_date);
        if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false;
      }
      if (q) {
        const item = boqById.get(m.boq_item_id);
        const hit =
          (item?.item_no ?? '').toLowerCase().includes(q) ||
          (item?.description ?? '').toLowerCase().includes(q) ||
          (m.chainage ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [measurements, boqById, searchText, boqItemFilter, dateRange]);

  const rows = useMemo(() => buildDateGroupedRows(filteredMeasurements), [filteredMeasurements]);

  // BOQ-item filter options (item no — description), sorted by item no.
  const boqItemOptions = useMemo(
    () =>
      [...(boqItems ?? [])]
        .sort((a, b) => a.item_no.localeCompare(b.item_no, undefined, { numeric: true }))
        .map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` })),
    [boqItems],
  );

  // ── Export / print (Date, Item, Specification, No, L, B, H, Qty, Unit, Remarks) ──
  const projectName = useMemo(
    () => (projects ?? []).find((p) => p.id === selectedProjectId)?.name ?? 'Project',
    [projects, selectedProjectId],
  );
  const preparedByName = user?.fullName ?? null;
  const rangeLabel = dateRange
    ? `${fmtDate(dateRange[0].format('YYYY-MM-DD'))} – ${fmtDate(dateRange[1].format('YYYY-MM-DD'))}`
    : 'All dates';
  const exportRows = useMemo(
    () => buildMeasurementExportRows(filteredMeasurements, boqById, uomById),
    [filteredMeasurements, boqById, uomById],
  );

  const handleExportExcel = () =>
    exportMeasurementsToExcel(exportRows, { projectName, rangeLabel, fmtDate });
  const handlePrint = () =>
    triggerPrint(buildMeasurementPrintableHTML(exportRows, { projectName, rangeLabel, fmtDate, preparedByName }));

  const handleEditSave = async () => {
    if (!editingMeasurement || !editWorkType || !editBoqItemId) return;
    try {
      const dimensionExpressions = Object.fromEntries(
        editWorkType.dimension_fields
          .filter((f) => f !== 'nos' && isArithmeticExpression(editDimensionText[f] ?? ''))
          .map((f) => [f, editDimensionText[f]]),
      );
      await updateMeasurement.mutateAsync({
        id: editingMeasurement.id,
        data: {
          boq_item_id: editBoqItemId,
          dimensions: Object.fromEntries(
            editWorkType.dimension_fields.map((f) => [f, String(editDimensions[f] ?? 0)]),
          ),
          dimension_expressions: Object.keys(dimensionExpressions).length > 0 ? dimensionExpressions : null,
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
      title: 'Photo',
      key: 'photo',
      width: 70,
      align: 'center' as const,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) =>
        row._type === 'item'
          ? (row.measurement.photos.length > 0
              ? <Tag color="cyan" style={{ margin: 0 }}>📷 {row.measurement.photos.length}</Tag>
              : <Typography.Text type="secondary">—</Typography.Text>)
          : null,
    },
    {
      title: 'Recorded By',
      key: 'recorded_by',
      width: 140,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.measurement.recorded_by_name : null),
    },
    {
      title: 'Notes',
      key: 'notes',
      width: 60,
      align: 'center' as const,
      onCell: (row) => (row._type === 'date-header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return (
          <Button
            size="small" type="text"
            icon={<FileTextOutlined style={row.measurement.notes ? { color: '#1677ff' } : undefined} />}
            title={row.measurement.notes ? 'View/edit notes' : 'Add notes'}
            onClick={() => openNotesModal(row.measurement)}
          />
        );
      },
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Measurement Book
        </Typography.Title>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportExcel} disabled={exportRows.length === 0}>
            Export
          </Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} disabled={exportRows.length === 0}>
            Print
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={handlePrint} disabled={exportRows.length === 0}>
            Export PDF
          </Button>
        </Space>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <ProjectSelector />
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
          format={dateFormat}
          allowClear
        />
        <Select
          style={{ width: 320 }}
          placeholder="All BOQ items"
          showSearch
          allowClear
          optionFilterProp="label"
          value={boqItemFilter ?? undefined}
          onChange={(v) => setBoqItemFilter(v ?? null)}
          options={boqItemOptions}
        />
        <Input.Search
          placeholder="Search by item no, description, or chainage"
          allowClear
          style={{ width: 280 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </Space>

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
        okButtonProps={{ disabled: editingIsSteel }}
        destroyOnHidden
      >
        {editingMeasurement && editingIsSteel && (
          <Alert
            type="info"
            showIcon
            message="Steel measurements are edited on the field Measurement screen"
            description="Re-pointing a steel measurement to a different BOQ item isn't supported here. Delete and re-add it on the Measurements (field) screen instead."
          />
        )}
        {editingMeasurement && !editingIsSteel && editWorkType && (
          <Form layout="vertical">
            <Form.Item label="BOQ Item">
              <Select
                showSearch
                optionFilterProp="label"
                value={editBoqItemId ?? undefined}
                onChange={handleEditBoqChange}
                options={boqChangeOptions}
              />
            </Form.Item>
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
                {field === 'nos' ? (
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    value={editDimensions[field] ?? 0}
                    onChange={(v) => setEditDimensions((prev) => ({ ...prev, [field]: v ?? 0 }))}
                  />
                ) : (
                  <Input
                    style={{ width: '100%' }}
                    placeholder="0 or e.g. (1+2.5)/2"
                    value={editDimensionText[field] ?? ''}
                    onChange={(e) => patchEditDimensionText(field, e.target.value)}
                  />
                )}
              </Form.Item>
            ))}
            <Statistic title="Computed Quantity" value={fmtQty(editComputedQty)} />
          </Form>
        )}
      </Modal>

      <Modal
        title="Measurement Notes"
        open={!!notesModalEntry}
        onCancel={() => setNotesModalEntry(null)}
        onOk={saveNotes}
        okText="Save"
        confirmLoading={notesSaving}
        okButtonProps={{ disabled: !!notesModalEntry && !canEditNotes(notesModalEntry) }}
        destroyOnHidden
      >
        <Input.TextArea
          rows={4}
          maxLength={1000}
          showCount
          placeholder="Add a note for this measurement…"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          disabled={!!notesModalEntry && !canEditNotes(notesModalEntry)}
        />
        {notesModalEntry && !canEditNotes(notesModalEntry) && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Only the recording engineer or an admin can edit notes.
          </Typography.Text>
        )}
      </Modal>
    </div>
  );
}
