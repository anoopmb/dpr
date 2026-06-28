import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  List,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { CheckCircleFilled, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { useCreateMeasurement, useMaterialTemplatePreview, type SteelLineInput } from '@/api/hooks/useMeasurements';
import { useDprList } from '@/api/hooks/useDpr';
import { useAttachPhoto } from '@/api/hooks/usePhotos';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { getCurrentPosition } from '@/utils/geolocation';
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { CONSTRUCTION_TYPE_LABELS, useConstructionTemplates } from '@/api/hooks/useBoq';
import type { BoqConstructionType } from '@/api/hooks/useBoq';

const FIELD_LABELS: Record<string, string> = {
  length: 'Length (m)',
  width: 'Width (m)',
  depth: 'Depth (m)',
  breadth: 'Breadth (m)',
  height: 'Height (m)',
  thickness: 'Thickness (m)',
  diameter: 'Diameter (mm)',
};

const BITUMINOUS_TYPES = new Set(['PRIME_COAT', 'TACK_COAT', 'BM', 'DBM', 'BC']);

interface SteelRow {
  key: string;
  description: string;
  diameter_mm: number;
  bar_count: number | null;
  length_m: number | null;
}

let steelKeyCounter = 0;
const nextSteelKey = () => `s-${++steelKeyCounter}`;

function computeSteelWeight(rows: SteelRow[], coeffMap: Record<number, number>): number {
  return rows.reduce((sum, r) => {
    if (!r.bar_count || !r.length_m) return sum;
    return sum + r.bar_count * r.length_m * (coeffMap[r.diameter_mm] ?? 0);
  }, 0);
}

interface MaterialPreviewCardProps {
  constructionType: string;
  qty: number;
  constructionSubtype?: string | null;
}

function MaterialPreviewCard({ constructionType, qty, constructionSubtype }: MaterialPreviewCardProps) {
  const { data: preview } = useMaterialTemplatePreview(
    qty > 0 && constructionType !== 'GENERAL' && constructionType !== 'STEEL'
      ? { construction_type: constructionType, qty, construction_subtype: constructionSubtype }
      : null,
  );

  if (!preview || preview.length === 0) return null;

  return (
    <Card size="small" title="Auto-calculated Materials" style={{ marginBottom: 16 }}>
      <Descriptions size="small" column={1}>
        {preview.map((m) => (
          <Descriptions.Item key={m.material_id} label={m.material_name}>
            <Space size={4}>
              <Typography.Text strong>{parseFloat(m.computed_qty).toFixed(3)}</Typography.Text>
              <Typography.Text type="secondary">{m.uom_code}</Typography.Text>
              {m.rate && (
                <Typography.Text type="secondary">@ {m.rate}</Typography.Text>
              )}
            </Space>
          </Descriptions.Item>
        ))}
      </Descriptions>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        These materials will be auto-added to the DPR on save.
      </Typography.Text>
    </Card>
  );
}

export function MeasurementEntryPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const createMeasurement = useCreateMeasurement();
  const uploadPhoto = useUploadPhoto();
  const attachPhoto = useAttachPhoto();
  const { resolvedMode } = useThemeMode();
  const { fmtDate } = useDateFormat();
  const { fmtQty } = useNumberFormat();
  const RECORDED_BG = resolvedMode === 'dark' ? 'rgba(82, 196, 26, 0.12)' : '#f6ffed';

  const { data: dprList } = useDprList(selectedProjectId);
  const dprForDate = dprList?.find((d) => d.report_date === selectedEntryDate);
  const dprIsLocked = dprForDate && dprForDate.status !== 'DRAFT';

  const [boqItemId, setBoqItemId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Record<string, number>>({});
  const [concreteGrade, setConcreteGrade] = useState<string | null>(null);
  const [steelRows, setSteelRows] = useState<SteelRow[]>([{ key: nextSteelKey(), description: '', diameter_mm: 0, bar_count: null, length_m: null }]);
  const [chainage, setChainage] = useState<string>('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [recordedToday, setRecordedToday] = useState<{ id: string; label: string; qty: string }[]>([]);

  const boqItem = (boqItems ?? []).find((b) => b.id === boqItemId);
  const constructionType: BoqConstructionType = (boqItem?.construction_type ?? 'GENERAL') as BoqConstructionType;
  const workType = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
  const dimensionFields = useMemo(() => workType?.dimension_fields ?? [], [workType]);

  const { data: steelTemplates } = useConstructionTemplates('STEEL');
  const { data: concreteTemplates } = useConstructionTemplates('CONCRETE');

  const steelCoeffMap = useMemo<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    (steelTemplates ?? []).filter((t) => t.is_active && t.construction_subtype).forEach((t) => {
      map[parseInt(t.construction_subtype!)] = parseFloat(t.coefficient);
    });
    return map;
  }, [steelTemplates]);

  const steelDiameters = useMemo(
    () => Object.keys(steelCoeffMap).map(Number).sort((a, b) => a - b),
    [steelCoeffMap],
  );

  const concreteGrades = useMemo(() => {
    const grades = new Set<string>();
    (concreteTemplates ?? []).filter((t) => t.is_active && t.construction_subtype).forEach((t) => grades.add(t.construction_subtype!));
    return Array.from(grades).sort();
  }, [concreteTemplates]);

  const isSteel = constructionType === 'STEEL';
  const isConcrete = constructionType === 'CONCRETE';
  const isBituminous = BITUMINOUS_TYPES.has(constructionType);

  const regularQty = useMemo(
    () => (!isSteel && workType ? calculateQuantity(workType.formula, dimensionFields, dimensions) : 0),
    [isSteel, workType, dimensionFields, dimensions],
  );

  const steelWeightMt = useMemo(
    () => (isSteel ? computeSteelWeight(steelRows, steelCoeffMap) : 0),
    [isSteel, steelRows, steelCoeffMap],
  );

  const quantity = isSteel ? steelWeightMt : regularQty;

  const handleSelectBoq = (value: string) => {
    setBoqItemId(value);
    setDimensions({});
    setConcreteGrade(null);
    setSteelRows([{ key: nextSteelKey(), description: '', diameter_mm: 0, bar_count: null, length_m: null }]);
  };

  const patchSteelRow = (key: string, patch: Partial<SteelRow>) => {
    setSteelRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const steelTableColumns: TableColumnsType<SteelRow> = [
    {
      title: 'Description',
      key: 'desc',
      render: (_, row) => (
        <Input
          size="small"
          placeholder="Bar description (optional)"
          value={row.description}
          onChange={(e) => patchSteelRow(row.key, { description: e.target.value })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Dia (mm)',
      key: 'dia',
      width: 90,
      render: (_, row) => (
        <Select
          size="small"
          value={row.diameter_mm}
          onChange={(v) => patchSteelRow(row.key, { diameter_mm: v })}
          options={steelDiameters.map((d) => ({ value: d, label: `${d}mm` }))}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Nos',
      key: 'nos',
      width: 80,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={1}
          value={row.bar_count}
          onChange={(v) => patchSteelRow(row.key, { bar_count: v ?? null })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Length (m)',
      key: 'len',
      width: 90,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={0.001}
          step={0.001}
          value={row.length_m}
          onChange={(v) => patchSteelRow(row.key, { length_m: v ?? null })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Wt (MT)',
      key: 'wt',
      width: 80,
      align: 'right' as const,
      render: (_, row) => {
        if (!row.bar_count || !row.length_m) return <Typography.Text type="secondary">—</Typography.Text>;
        const coeff = steelCoeffMap[row.diameter_mm];
        if (coeff == null) return <Typography.Text type="secondary">—</Typography.Text>;
        const w = row.bar_count * row.length_m * coeff;
        return <Typography.Text>{w.toFixed(6)}</Typography.Text>;
      },
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_, row) =>
        steelRows.length > 1 ? (
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setSteelRows((prev) => prev.filter((r) => r.key !== row.key))}
          />
        ) : null,
    },
  ];

  const handleSubmit = async () => {
    if (!selectedProjectId) {
      message.warning('Select a project first');
      return;
    }
    if (!boqItemId) {
      message.warning('Select a BOQ item first');
      return;
    }
    if (isSteel) {
      const validRows = steelRows.filter((r) => r.bar_count && r.length_m);
      if (validRows.length === 0) {
        message.warning('Enter at least one complete bar entry (nos + length)');
        return;
      }
    } else if (!isSteel && dimensionFields.length === 0) {
      message.warning('No dimension fields available for this work type');
      return;
    }
    if (isConcrete && !concreteGrade) {
      message.warning('Select a concrete grade');
      return;
    }

    try {
      const steelLines: SteelLineInput[] = isSteel
        ? steelRows
            .filter((r) => r.bar_count && r.length_m)
            .map((r) => ({
              description: r.description || null,
              diameter_mm: r.diameter_mm,
              bar_count: r.bar_count!,
              length_m: r.length_m!,
            }))
        : [];

      const measurement = await createMeasurement.mutateAsync({
        project_id: selectedProjectId,
        boq_item_id: boqItemId,
        measurement_date: selectedEntryDate,
        dimensions: isSteel ? {} : Object.fromEntries(dimensionFields.map((f) => [f, String(dimensions[f] ?? 0)])),
        chainage: chainage.trim() || null,
        construction_subtype: isConcrete ? concreteGrade : null,
        steel_lines: isSteel ? steelLines : undefined,
      });

      if (photo) {
        try {
          const position = await getCurrentPosition();
          const photoUrl = await uploadPhoto.mutateAsync({ prefix: 'measurements', file: photo });
          await attachPhoto.mutateAsync({
            entity_type: 'MEASUREMENT',
            entity_id: measurement.id,
            photo_url: photoUrl,
            latitude: position.latitude,
            longitude: position.longitude,
            captured_at: new Date().toISOString(),
          });
        } catch {
          message.warning('Measurement saved, but the evidence photo could not be attached.');
        }
      }

      message.success(`Measurement recorded: ${measurement.computed_qty}`);
      setRecordedToday((prev) => [
        { id: measurement.id, label: boqItem ? `${boqItem.item_no} — ${boqItem.description}` : boqItemId, qty: measurement.computed_qty },
        ...prev,
      ]);
      setBoqItemId(null);
      setDimensions({});
      setConcreteGrade(null);
      setSteelRows([{ key: nextSteelKey(), description: '', diameter_mm: 0, bar_count: null, length_m: null }]);
      setChainage('');
      setPhoto(null);
    } catch {
      message.error('Could not save measurement — check it does not exceed the BOQ tolerance.');
    }
  };

  const showForm = boqItemId && (!isSteel ? true : true);
  const submitReady = boqItemId && (
    isSteel
      ? steelRows.some((r) => r.bar_count && r.length_m)
      : dimensionFields.length > 0 && (!isConcrete || !!concreteGrade)
  );

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        {recordedToday.length > 0 ? 'Add Another Measurement' : 'New Measurement'}
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Entry date: {fmtDate(selectedEntryDate)}
      </Typography.Text>

      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Alert type="warning" showIcon message="Select a project to continue" />}

      {selectedProjectId && dprIsLocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`DPR for ${fmtDate(selectedEntryDate)} is already ${dprForDate?.status?.toLowerCase()}`}
          description="This measurement will be saved to the Measurement Book but will NOT update the DPR production totals."
        />
      )}

      {selectedProjectId && recordedToday.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: RECORDED_BG }}>
          <Typography.Text strong>Recorded for this date ({recordedToday.length})</Typography.Text>
          <List
            size="small"
            dataSource={recordedToday}
            renderItem={(entry) => (
              <List.Item>
                <Space>
                  <CheckCircleFilled style={{ color: '#52c41a' }} />
                  <span>{entry.label}</span>
                  <Typography.Text type="secondary">qty: {entry.qty}</Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      {selectedProjectId && (
        <RequireAttendance projectId={selectedProjectId}>
          <Form layout="vertical">
            <Form.Item label="BOQ Item">
              <Select
                size="large"
                placeholder="Select BOQ item"
                value={boqItemId ?? undefined}
                onChange={handleSelectBoq}
                showSearch
                optionFilterProp="label"
                options={(boqItems ?? []).map((b) => ({
                  value: b.id,
                  label: (
                    <Space size={4}>
                      <span>{b.item_no} — {b.description}</span>
                      {b.construction_type && b.construction_type !== 'GENERAL' && (
                        <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                          {CONSTRUCTION_TYPE_LABELS[b.construction_type as BoqConstructionType] ?? b.construction_type}
                        </Tag>
                      )}
                    </Space>
                  ),
                }))}
              />
            </Form.Item>

            {boqItemId && constructionType !== 'GENERAL' && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  <Space size={4}>
                    <span>Construction type:</span>
                    <Tag color="blue">{CONSTRUCTION_TYPE_LABELS[constructionType] ?? constructionType}</Tag>
                    {isSteel && <span>— Enter bars below. Weights are computed automatically (IS:1200).</span>}
                    {isConcrete && <span>— Select concrete grade; material quantities will be auto-calculated.</span>}
                    {isBituminous && <span>— Material quantities will be calculated from configured templates.</span>}
                  </Space>
                }
              />
            )}

            <Form.Item label="Chainage / Location (optional)">
              <Input
                size="large"
                placeholder="e.g. 2/130–2/390"
                value={chainage}
                onChange={(e) => setChainage(e.target.value)}
              />
            </Form.Item>

            {/* STEEL: Bar entry table */}
            {showForm && isSteel && (
              <>
                <Form.Item label="Bar Entries">
                  <Table<SteelRow>
                    rowKey="key"
                    size="small"
                    dataSource={steelRows}
                    columns={steelTableColumns}
                    pagination={false}
                    scroll={{ x: 500 }}
                  />
                  <Button
                    icon={<PlusOutlined />}
                    size="small"
                    style={{ marginTop: 8 }}
                    onClick={() =>
                      setSteelRows((prev) => [...prev, { key: nextSteelKey(), description: '', diameter_mm: steelDiameters[0] ?? 0, bar_count: null, length_m: null }])
                    }
                  >
                    Add Row
                  </Button>
                </Form.Item>

                <Card style={{ marginBottom: 16, textAlign: 'center' }}>
                  <Statistic title="Total Weight (MT)" value={steelWeightMt.toFixed(4)} />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Formula: No × L × coefficient (IS:1200 / Kerala PWD standard)
                  </Typography.Text>
                </Card>
              </>
            )}

            {/* CONCRETE: Grade selector + dimension form */}
            {showForm && isConcrete && (
              <>
                <Form.Item label="Concrete Grade" required>
                  <Select
                    size="large"
                    placeholder="Select grade"
                    value={concreteGrade ?? undefined}
                    onChange={setConcreteGrade}
                    options={concreteGrades.map((g) => ({ value: g, label: g }))}
                    style={{ width: 200 }}
                  />
                </Form.Item>
                {dimensionFields.map((field) => (
                  <Form.Item key={field} label={FIELD_LABELS[field] ?? field}>
                    <InputNumber
                      size="large"
                      min={0}
                      style={{ width: '100%' }}
                      value={dimensions[field]}
                      onChange={(value) => setDimensions((prev) => ({ ...prev, [field]: value ?? 0 }))}
                    />
                  </Form.Item>
                ))}
                {dimensionFields.length > 0 && (
                  <Card style={{ marginBottom: 16, textAlign: 'center' }}>
                    <Statistic title="Computed Volume (m³)" value={fmtQty(regularQty)} />
                  </Card>
                )}
                {concreteGrade && regularQty > 0 && (
                  <MaterialPreviewCard
                    constructionType="CONCRETE"
                    qty={regularQty}
                    constructionSubtype={concreteGrade}
                  />
                )}
              </>
            )}

            {/* BITUMINOUS: Standard dimension form + material preview */}
            {showForm && isBituminous && (
              <>
                {dimensionFields.map((field) => (
                  <Form.Item key={field} label={FIELD_LABELS[field] ?? field}>
                    <InputNumber
                      size="large"
                      min={0}
                      style={{ width: '100%' }}
                      value={dimensions[field]}
                      onChange={(value) => setDimensions((prev) => ({ ...prev, [field]: value ?? 0 }))}
                    />
                  </Form.Item>
                ))}
                {dimensionFields.length > 0 && (
                  <Card style={{ marginBottom: 16, textAlign: 'center' }}>
                    <Statistic title="Computed Quantity" value={fmtQty(regularQty)} />
                  </Card>
                )}
                {regularQty > 0 && (
                  <MaterialPreviewCard constructionType={constructionType} qty={regularQty} />
                )}
              </>
            )}

            {/* GENERAL: Standard dimension form */}
            {showForm && !isSteel && !isConcrete && !isBituminous && (
              <>
                {dimensionFields.map((field) => (
                  <Form.Item key={field} label={FIELD_LABELS[field] ?? field}>
                    <InputNumber
                      size="large"
                      min={0}
                      style={{ width: '100%' }}
                      value={dimensions[field]}
                      onChange={(value) => setDimensions((prev) => ({ ...prev, [field]: value ?? 0 }))}
                    />
                  </Form.Item>
                ))}
                {dimensionFields.length > 0 && (
                  <Card style={{ marginBottom: 16, textAlign: 'center' }}>
                    <Statistic title="Computed Quantity" value={fmtQty(regularQty)} />
                  </Card>
                )}
              </>
            )}

            {showForm && (
              <Card style={{ marginBottom: 16 }}>
                <PhotoCapture label="Capture Evidence Photo (optional)" onCapture={setPhoto} />
              </Card>
            )}

            <Button
              type="primary"
              block
              size="large"
              disabled={!submitReady}
              loading={createMeasurement.isPending || uploadPhoto.isPending}
              onClick={handleSubmit}
            >
              {recordedToday.length > 0 ? 'Save & Add Another' : 'Submit Measurement'}
            </Button>
          </Form>
        </RequireAttendance>
      )}
    </div>
  );
}
