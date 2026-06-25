import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AimOutlined, CameraOutlined, CheckCircleOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { isAxiosError } from 'axios';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import {
  useBulkUpsertProduction,
  useCreateDprHeader,
  useDeleteDprHeader,
  useDprHeader,
  useDprList,
  useDprMeasurements,
  useDprProduction,
  useAddDprIssue,
  useSubmitDpr,
  useUpdateDprHeader,
  useAddDprMaterial,
  useUpdateDprMaterial,
  useDeleteDprMaterial,
  useAddDprMachinery,
  useUpdateDprMachinery,
  useDeleteDprMachinery,
  type IssueSeverity,
  type DprMaterialRead,
  type DprMachineryRead,
  type DprIssueRead,
} from '@/api/hooks/useDpr';
import {
  useDprLabour,
  useUpdateDprLabour,
  type DprLabourRead,
} from '@/api/hooks/useDprLabour';
import {
  useWorkers,
  useAttendanceRecords,
  useCheckIn,
  useMarkPresent,
  useDeleteAttendance,
  type AttendanceRecordRead,
} from '@/api/hooks/useAttendance';
import { useBoqSections, useBoqItems, type BoqItemRead, type BoqSectionRead } from '@/api/hooks/useBoq';
import { useMaterials, useMachinery, useUoms, useWorkTypes, MACHINERY_HIRE_UNIT_LABELS } from '@/api/hooks/useMasters';
import {
  useCreateMeasurement,
  useMeasurements,
  useSubmitMeasurement,
  useUpdateMeasurement,
  useDeleteMeasurement,
  useRecallMeasurement,
  type MeasurementRead,
  type MeasurementStatus,
} from '@/api/hooks/useMeasurements';
import { useEffectiveWorkflow, type WorkflowDefinitionRead } from '@/api/hooks/useWorkflowConfig';
import { useAttachPhoto } from '@/api/hooks/usePhotos';
import { useProjects } from '@/api/hooks/useProjects';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import {
  getCurrentPosition,
  reverseGeocode,
  haversineDistanceMeters,
  describeLocationError,
} from '@/utils/geolocation';

interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  locationName: string;
}

const NO_WORK_REASONS = ['Rain', 'Holiday', 'Sunday', 'Other'] as const;

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

function measurementStatusColor(status: MeasurementStatus, workflow: WorkflowDefinitionRead | undefined): string {
  if (FIXED_STATUS_COLOR[status]) return FIXED_STATUS_COLOR[status];
  const idx = workflow?.levels.findIndex((l) => l.status_code === status) ?? -1;
  return idx >= 0 ? LEVEL_COLOR_PALETTE[idx % LEVEL_COLOR_PALETTE.length] : 'default';
}

function measurementStatusLabel(status: MeasurementStatus, workflow: WorkflowDefinitionRead | undefined): string {
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

const ALL_DIM_FIELDS = ['length', 'width', 'depth', 'breadth', 'height', 'thickness', 'diameter'] as const;

const DIM_ABBREV: Record<string, string> = {
  length: 'L', width: 'W', depth: 'D', breadth: 'Br',
  height: 'H', thickness: 'T', diameter: 'Dia',
};

type ProductionRow =
  | { _type: 'header'; section: BoqSectionRead; key: string }
  | { _type: 'item'; item: BoqItemRead; key: string };

function buildProductionRows(sections: BoqSectionRead[]): ProductionRow[] {
  const rows: ProductionRow[] = [];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    rows.push({ _type: 'header', section, key: `hdr-${section.id}` });
    for (const item of section.items) {
      rows.push({ _type: 'item', item, key: item.id });
    }
  }
  return rows;
}

// ─── Attendance Tab ───────────────────────────────────────────────────────────

function AttendanceTab({
  projectId,
  entryDate,
  isSubmitted,
}: {
  projectId: string;
  entryDate: string;
  isSubmitted: boolean;
}) {
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === projectId);
  const photoRequired = project?.attendance_photo_required ?? true;
  const gpsRequired = project?.attendance_gps_required ?? true;
  const verificationRequired = photoRequired || gpsRequired;
  const { fmtDate } = useDateFormat();

  const { data: workers } = useWorkers(projectId);
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceRecords(projectId, entryDate);
  const checkIn = useCheckIn();
  const markPresent = useMarkPresent();
  const deleteAttendance = useDeleteAttendance();
  const uploadPhoto = useUploadPhoto();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locating, setLocating] = useState(true);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    const url = URL.createObjectURL(file);
    setPhoto(file);
    setPhotoPreviewUrl(url);
  };

  const siteLat = project?.site_latitude != null ? parseFloat(project.site_latitude) : null;
  const siteLng = project?.site_longitude != null ? parseFloat(project.site_longitude) : null;
  const siteRadius = project?.geofence_radius_meters ?? 500;

  const distanceMeters =
    location && siteLat != null && siteLng != null
      ? haversineDistanceMeters(location.latitude, location.longitude, siteLat, siteLng)
      : null;
  const outsideGeofence = distanceMeters != null && distanceMeters > siteRadius;

  // Standard fetch-on-mount pattern — intentionally calls setState once
  // resolved; see eslint-disable below.
  const doFetchLocation = async () => {
    try {
      const pos = await getCurrentPosition();
      const name = await reverseGeocode(pos.latitude, pos.longitude);
      setLocation({ ...pos, locationName: name });
    } catch (error) {
      message.error(describeLocationError(error));
    } finally {
      setLocating(false);
    }
  };

  const fetchLocation = async () => {
    setLocating(true);
    await doFetchLocation();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    doFetchLocation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const user = useAuthStore((s) => s.user);
  const myRecordsCount = (attendance ?? []).filter((a) => a.marked_by === user?.id).length;

  const checkedInIds = new Set((attendance ?? []).map((a) => a.worker_id));
  const availableWorkers = (workers ?? []).filter((w) => !checkedInIds.has(w.id));

  const handleVerifiedCheckIn = async () => {
    if (selectedWorkerIds.length === 0) { message.warning('Select at least one worker'); return; }
    if (photoRequired && !photo) { message.warning('Capture a photo first'); return; }
    try {
      let pos = location;
      if (gpsRequired && !pos) {
        const p = await getCurrentPosition();
        const name = await reverseGeocode(p.latitude, p.longitude);
        pos = { ...p, locationName: name };
        setLocation(pos);
      }
      const photoUrl = photo ? await uploadPhoto.mutateAsync({ prefix: 'attendance', file: photo }) : undefined;
      let success = 0;
      let alreadyIn = 0;
      for (const workerId of selectedWorkerIds) {
        try {
          await checkIn.mutateAsync({
            worker_id: workerId,
            project_id: projectId,
            latitude: pos?.latitude,
            longitude: pos?.longitude,
            gps_accuracy_meters: pos?.accuracy,
            location_name: pos?.locationName,
            photo_url: photoUrl,
          });
          success++;
        } catch (err) {
          if (isAxiosError(err) && err.response?.data?.code === 'ALREADY_CHECKED_IN') alreadyIn++;
          else message.error(`Check-in failed for one worker`);
        }
      }
      if (success > 0) message.success(`${success} worker(s) checked in successfully`);
      if (alreadyIn > 0) message.warning(`${alreadyIn} worker(s) were already checked in`);
      setSelectedWorkerIds([]);
      setPhoto(null);
      setPhotoPreviewUrl(null);
    } catch {
      message.error('Check-in failed');
    }
  };

  const handleBulkMarkPresent = async () => {
    if (selectedWorkerIds.length === 0) { message.warning('Select at least one worker'); return; }
    try {
      const result = await markPresent.mutateAsync({
        project_id: projectId,
        worker_ids: selectedWorkerIds,
        latitude: location?.latitude,
        longitude: location?.longitude,
        gps_accuracy_meters: location?.accuracy,
        location_name: location?.locationName,
      });
      message.success(`${result.length} worker(s) marked present`);
      setSelectedWorkerIds([]);
    } catch {
      message.error('Could not mark workers present');
    }
  };

  const verificationLabel = [photoRequired && 'Photo', gpsRequired && 'GPS'].filter(Boolean).join(' + ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Compact single card: location left + mark attendance right */}
      <Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>

          {/* LEFT: location panel */}
          <div style={{ width: 260, flexShrink: 0, paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Space size={6}>
                <AimOutlined style={{ color: location ? '#52c41a' : '#faad14', fontSize: 13 }} />
                <Typography.Text style={{ fontSize: 12, fontWeight: 600 }}>Your Location</Typography.Text>
              </Space>
              <Button size="small" icon={<AimOutlined />} loading={locating} onClick={fetchLocation}>
                Refresh
              </Button>
            </div>
            {locating && !location ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Getting location…</Typography.Text>
            ) : location ? (
              <Space direction="vertical" size={3} style={{ width: '100%' }}>
                <Typography.Text strong style={{ fontSize: 12 }}>{location.locationName}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · ±{Math.round(location.accuracy)} m
                </Typography.Text>
                {outsideGeofence ? (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={`${Math.round(distanceMeters!)} m outside boundary — will be flagged`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  />
                ) : siteLat != null ? (
                  <Alert
                    type="success"
                    showIcon
                    message={`Within boundary${distanceMeters != null ? ` · ${Math.round(distanceMeters)} m` : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  />
                ) : null}
              </Space>
            ) : (
              <Alert type="info" showIcon message="Tap Refresh to get location." style={{ fontSize: 11 }} />
            )}
          </div>

          {/* RIGHT: mark attendance — single row */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {verificationRequired
                ? `${verificationLabel} required`
                : 'Mark present'} · {availableWorkers.length} worker{availableWorkers.length !== 1 ? 's' : ''} available
            </Typography.Text>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                mode="multiple"
                style={{ flex: 1, minWidth: 0 }}
                placeholder="Select workers…"
                value={selectedWorkerIds}
                onChange={setSelectedWorkerIds}
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                options={availableWorkers.map((w) => ({ value: w.id, label: w.full_name }))}
                disabled={isSubmitted}
              />

              {verificationRequired && !isSubmitted && (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handlePhotoChange}
                  />
                  <Button
                    icon={photo ? <CheckCircleOutlined /> : <CameraOutlined />}
                    style={photo ? { color: '#52c41a', borderColor: '#52c41a' } : {}}
                    title={photo ? 'Photo captured — tap to retake' : photoRequired ? 'Capture photo (required)' : 'Capture photo (optional)'}
                    onClick={() => photoInputRef.current?.click()}
                  />
                </>
              )}

              {!isSubmitted && (
                <Button
                  type="primary"
                  disabled={selectedWorkerIds.length === 0 || (photoRequired && !photo)}
                  loading={checkIn.isPending || markPresent.isPending || uploadPhoto.isPending}
                  onClick={verificationRequired ? handleVerifiedCheckIn : handleBulkMarkPresent}
                >
                  {verificationRequired
                    ? `Check In${selectedWorkerIds.length > 0 ? ` (${selectedWorkerIds.length})` : ''}`
                    : `Mark Present${selectedWorkerIds.length > 0 ? ` (${selectedWorkerIds.length})` : ''}`}
                </Button>
              )}
            </div>

            {photoPreviewUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Image src={photoPreviewUrl} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} alt="Photo preview" />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>Photo ready · tap camera to retake</Typography.Text>
              </div>
            )}
          </div>

        </div>
      </Card>

      {/* Attendance list */}
      <Card
        size="small"
        title={`Attendance — ${fmtDate(entryDate)}`}
        extra={
          <Tag color={(attendance ?? []).length > 0 ? 'green' : 'default'}>
            {(attendance ?? []).length} present
          </Tag>
        }
        styles={{ header: { minHeight: 40 } }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={attendanceLoading}
          dataSource={attendance ?? []}
          pagination={false}
          locale={{ emptyText: 'No one marked present yet' }}
          columns={[
            {
              title: 'Worker',
              dataIndex: 'worker_id',
              render: (id: string) => (workers ?? []).find((w) => w.id === id)?.full_name ?? id,
            },
            {
              title: 'Status',
              dataIndex: 'photo_url',
              width: 140,
              render: (url: string | null, row: AttendanceRecordRead) =>
                url ? (
                  <Tag color={row.within_geofence ? 'green' : 'orange'}>
                    {row.within_geofence ? 'In boundary' : 'Out of boundary'}
                  </Tag>
                ) : (
                  <Tag>Auto-marked</Tag>
                ),
            },
            {
              title: 'Location',
              dataIndex: 'location_name',
              ellipsis: true,
              render: (v: string | null) =>
                v ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text> : '—',
            },
            ...(!isSubmitted ? [{
              title: '',
              key: 'del',
              width: 48,
              render: (_: unknown, row: AttendanceRecordRead) => (
                <Popconfirm
                  title="Remove this attendance record?"
                  onConfirm={async () => {
                    try {
                      await deleteAttendance.mutateAsync({ recordId: row.id, projectId: row.project_id });
                      message.success('Attendance record removed');
                    } catch {
                      message.error('Could not remove record');
                    }
                  }}
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                  disabled={row.marked_by === user?.id && myRecordsCount === 1}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={deleteAttendance.isPending}
                    disabled={row.marked_by === user?.id && myRecordsCount === 1}
                    title={row.marked_by === user?.id && myRecordsCount === 1 ? 'Cannot remove your only attendance record' : undefined}
                  />
                </Popconfirm>
              ),
            }] : []),
          ]}
        />
      </Card>
    </div>
  );
}

// ─── Labour Tab ───────────────────────────────────────────────────────────────

function LabourTab({
  headerId,
  isSubmitted,
}: {
  headerId: string;
  isSubmitted: boolean;
}) {
  const { data: entries, isLoading } = useDprLabour(headerId);
  const updateLabour = useUpdateDprLabour();
  const { fmtAmt } = useNumberFormat();

  const handleQtyChange = async (entry: DprLabourRead, qty: number | null) => {
    if (qty == null) return;
    try {
      await updateLabour.mutateAsync({ itemId: entry.id, data: { quantity: String(qty), rate: entry.rate } });
    } catch {
      message.error('Could not update');
    }
  };

  const handleRateChange = async (entry: DprLabourRead, rate: number | null) => {
    if (rate == null) return;
    try {
      await updateLabour.mutateAsync({ itemId: entry.id, data: { quantity: entry.quantity, rate: String(rate) } });
    } catch {
      message.error('Could not update rate');
    }
  };

  const totalAmount = (entries ?? []).reduce((s, e) => s + parseFloat(e.amount || '0'), 0);

  return (
    <div>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={entries ?? []}
        pagination={false}
        scroll={{ x: 600 }}
        locale={{ emptyText: 'No workers checked in yet — check in workers from the Attendance tab' }}
        columns={[
          { title: 'Worker', dataIndex: 'worker_name' },
          {
            title: 'Type',
            dataIndex: 'worker_type',
            width: 110,
            render: (t: string) => <Tag color={t === 'NORMAL' ? 'blue' : t === 'CONTRACTOR' ? 'orange' : 'purple'}>{t}</Tag>,
          },
          { title: 'Unit', dataIndex: 'wage_unit', width: 60, render: (v: string | null) => v ?? 'DAY' },
          {
            title: 'Qty',
            key: 'qty',
            width: 100,
            render: (_: unknown, entry: DprLabourRead) =>
              isSubmitted ? (
                <span>{entry.quantity}</span>
              ) : (
                <InputNumber
                  size="small" min={0} step={entry.wage_unit === 'HOUR' ? 0.5 : 1}
                  value={parseFloat(entry.quantity)} style={{ width: 80 }}
                  onChange={(v) => handleQtyChange(entry, v)}
                />
              ),
          },
          {
            title: 'Rate',
            key: 'rate',
            width: 110,
            align: 'right' as const,
            render: (_: unknown, entry: DprLabourRead) =>
              isSubmitted ? (
                <span>{fmtAmt(entry.rate)}</span>
              ) : (
                <InputNumber
                  size="small" min={0} precision={2} value={parseFloat(entry.rate)} style={{ width: 90 }}
                  onBlur={(e) => handleRateChange(entry, parseFloat(e.target.value))}
                  onPressEnter={(e) => handleRateChange(entry, parseFloat((e.target as HTMLInputElement).value))}
                />
              ),
          },
          {
            title: 'Amount',
            dataIndex: 'amount',
            width: 100,
            align: 'right' as const,
            render: fmtAmt,
          },
          {
            title: 'Their Workers',
            key: 'cw',
            width: 100,
            render: (_: unknown, e: DprLabourRead) =>
              isSubmitted ? (
                <span>{e.contractor_workers_count ?? '—'}</span>
              ) : (
                <InputNumber
                  size="small" min={0} value={e.contractor_workers_count ?? undefined}
                  style={{ width: 80 }} placeholder="0"
                  onChange={async (v) => {
                    try {
                      await updateLabour.mutateAsync({ itemId: e.id, data: { contractor_workers_count: v ?? null } });
                    } catch { /* silent */ }
                  }}
                />
              ),
          },
        ]}
        summary={() => (
          <Table.Summary>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={5}>Total Labour Cost</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{fmtAmt(totalAmount)}</Table.Summary.Cell>
              <Table.Summary.Cell index={6} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
}

// ─── Draft row types / key counters for inline editing ───────────────────────

let _matSeq = 0;
const nextMatKey = () => `mt-${++_matSeq}`;
let _machSeq = 0;
const nextMachKey = () => `mch-${++_machSeq}`;
let _measSeq = 0;
const nextMeasKey = () => `ms-${++_measSeq}`;
let _issueSeq = 0;
const nextIssueKey = () => `iss-${++_issueSeq}`;

interface MatDraftRow { key: string; material_id: string | null; qty: number | null; uom_id: string | null; rate: number | null; }
interface MachDraftRow { key: string; machinery_id: string | null; qty: number | null; hire_rate: number | null; hire_unit: string | null; }
interface MeasDraftRow { key: string; boq_item_id: string | null; dimensions: Record<string, number>; chainage: string; qty: number | null; rate: number | null; }
interface IssueDraftRow { key: string; description: string; severity: IssueSeverity | null; }
type MatRow = { _kind: 'existing'; entry: DprMaterialRead } | { _kind: 'draft'; draft: MatDraftRow };
type MachRow = { _kind: 'existing'; entry: DprMachineryRead } | { _kind: 'draft'; draft: MachDraftRow };
type MeasRow = { _kind: 'existing'; entry: MeasurementRead } | { _kind: 'draft'; draft: MeasDraftRow };
type IssueRow = { _kind: 'existing'; entry: DprIssueRead } | { _kind: 'draft'; draft: IssueDraftRow };

// ─── Materials Tab ────────────────────────────────────────────────────────────

function MaterialsTab({
  headerId,
  isSubmitted,
}: {
  headerId: string;
  isSubmitted: boolean;
}) {
  const { data: header } = useDprHeader(headerId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const addMaterial = useAddDprMaterial();
  const updateMaterial = useUpdateDprMaterial();
  const deleteMaterial = useDeleteDprMaterial();
  const { fmtAmt, symbol } = useNumberFormat();
  const { token } = theme.useToken();
  const [drafts, setDrafts] = useState<MatDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const entries = header?.materials ?? [];
  const totalCost = entries.reduce((s, e) => s + (e.rate ? parseFloat(e.rate) * parseFloat(e.qty_consumed) : 0), 0);

  const patchDraft = (key: string, patch: Partial<MatDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const saveDraft = async (draft: MatDraftRow) => {
    if (!draft.material_id || draft.qty == null || !draft.uom_id) { message.warning('Material, quantity and unit are required'); return; }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      await addMaterial.mutateAsync({ headerId, data: { material_id: draft.material_id, qty_consumed: String(draft.qty), uom_id: draft.uom_id, rate: draft.rate != null ? String(draft.rate) : undefined } });
      removeDraft(draft.key);
    } catch { message.error('Could not add entry'); }
    finally { setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; }); }
  };

  const saveQty = async (entry: DprMaterialRead, raw: string) => {
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty === parseFloat(entry.qty_consumed)) return;
    try { await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: String(qty), uom_id: entry.uom_id, rate: entry.rate ?? undefined } }); }
    catch { message.error('Could not update'); }
  };

  const saveRate = async (entry: DprMaterialRead, raw: string) => {
    const rate = raw ? parseFloat(raw) : null;
    if (rate === (entry.rate != null ? parseFloat(entry.rate) : null)) return;
    try { await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: entry.qty_consumed, uom_id: entry.uom_id, rate: rate != null ? String(rate) : undefined } }); }
    catch { message.error('Could not update'); }
  };

  const saveUom = async (entry: DprMaterialRead, uomId: string) => {
    if (uomId === entry.uom_id) return;
    try { await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: entry.qty_consumed, uom_id: uomId, rate: entry.rate ?? undefined } }); }
    catch { message.error('Could not update'); }
  };

  const handleDelete = async (entry: DprMaterialRead) => {
    try { await deleteMaterial.mutateAsync({ itemId: entry.id, headerId }); }
    catch { message.error('Could not delete'); }
  };

  const rows: MatRow[] = [
    ...entries.map((e): MatRow => ({ _kind: 'existing', entry: e })),
    ...drafts.map((d): MatRow => ({ _kind: 'draft', draft: d })),
  ];

  const inp = { width: '100%' };

  const columns: TableColumnsType<MatRow> = [
    {
      title: '#', key: 'idx', width: 40,
      render: (_: unknown, _r: MatRow, i: number) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Typography.Text>,
    },
    {
      title: 'Material', key: 'material',
      render: (_: unknown, row: MatRow) =>
        row._kind === 'existing' ? (
          <Typography.Text>{materialById.get(row.entry.material_id)?.name ?? row.entry.material_id}</Typography.Text>
        ) : (
          <Select size="small" showSearch optionFilterProp="label" style={inp} placeholder="Select material…" value={row.draft.material_id}
            onChange={(v) => { const m = materialById.get(v); patchDraft(row.draft.key, { material_id: v, uom_id: m?.default_uom_id ?? null, rate: m?.cost_rate != null ? parseFloat(m.cost_rate) : null }); }}
            options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        ),
    },
    {
      title: 'Qty', key: 'qty', width: 100,
      render: (_: unknown, row: MatRow) =>
        row._kind === 'existing' ? (
          <InputNumber key={`${row.entry.id}-q-${row.entry.qty_consumed}`} size="small" min={0} style={inp}
            defaultValue={parseFloat(row.entry.qty_consumed)} onBlur={(e) => saveQty(row.entry, e.target.value)} disabled={isSubmitted} />
        ) : (
          <InputNumber size="small" min={0} style={inp} placeholder="0" value={row.draft.qty} onChange={(v) => patchDraft(row.draft.key, { qty: v })} />
        ),
    },
    {
      title: 'Unit', key: 'uom', width: 90,
      render: (_: unknown, row: MatRow) =>
        row._kind === 'existing' ? (
          <Select key={`${row.entry.id}-u-${row.entry.uom_id}`} size="small" showSearch optionFilterProp="label" style={inp}
            defaultValue={row.entry.uom_id} onChange={(v) => saveUom(row.entry, v)}
            options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))} disabled={isSubmitted} />
        ) : (
          <Select size="small" showSearch optionFilterProp="label" style={inp} placeholder="Unit" value={row.draft.uom_id}
            onChange={(v) => patchDraft(row.draft.key, { uom_id: v })} options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))} />
        ),
    },
    {
      title: `Rate (${symbol})`, key: 'rate', width: 110, align: 'right' as const,
      render: (_: unknown, row: MatRow) =>
        row._kind === 'existing' ? (
          <InputNumber key={`${row.entry.id}-r-${row.entry.rate}`} size="small" min={0} precision={2} style={inp}
            defaultValue={row.entry.rate != null ? parseFloat(row.entry.rate) : undefined} placeholder="—"
            onBlur={(e) => saveRate(row.entry, e.target.value)} disabled={isSubmitted} />
        ) : (
          <InputNumber size="small" min={0} precision={2} style={inp} placeholder="Rate (auto)" value={row.draft.rate} onChange={(v) => patchDraft(row.draft.key, { rate: v })} />
        ),
    },
    {
      title: `Amount (${symbol})`, key: 'amount', width: 110, align: 'right' as const,
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'existing') {
          const amt = row.entry.rate != null ? parseFloat(row.entry.rate) * parseFloat(row.entry.qty_consumed) : null;
          return <Typography.Text strong>{amt != null ? fmtAmt(amt) : '—'}</Typography.Text>;
        }
        const amt = row.draft.rate != null && row.draft.qty != null ? row.draft.rate * row.draft.qty : null;
        return <Typography.Text type="secondary">{amt != null ? fmtAmt(amt) : '—'}</Typography.Text>;
      },
    },
    {
      title: '', key: 'actions', width: 68,
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'existing') {
          if (isSubmitted) return null;
          return (
            <Popconfirm title="Delete this entry?" onConfirm={() => handleDelete(row.entry)} okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={deleteMaterial.isPending} />
            </Popconfirm>
          );
        }
        return (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: token.colorSuccess }} loading={savingKeys.has(row.draft.key)} onClick={() => saveDraft(row.draft)} />
            <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => removeDraft(row.draft.key)} />
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: token.colorFillAlter, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>Line Items</Typography.Text>
          <Tag style={{ margin: 0, fontSize: 11 }}>{entries.length} item{entries.length !== 1 ? 's' : ''}</Tag>
        </span>
        {!isSubmitted && (
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => setDrafts((p) => [...p, { key: nextMatKey(), material_id: null, qty: null, uom_id: null, rate: null }])}>
            Add Material
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — material entries are locked." />}
      <Table<MatRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: 650 }}
        locale={{ emptyText: isSubmitted ? 'No material entries' : 'No entries yet — click "Add Material" above' }}
        summary={totalCost > 0 ? () => (
          <Table.Summary>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={5}>Total Material Cost</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{fmtAmt(totalCost)}</Table.Summary.Cell>
              {!isSubmitted && <Table.Summary.Cell index={6} />}
            </Table.Summary.Row>
          </Table.Summary>
        ) : undefined}
      />
    </div>
  );
}

// ─── Machinery Tab ────────────────────────────────────────────────────────────

function MachineryTab({
  headerId,
  isSubmitted,
}: {
  headerId: string;
  isSubmitted: boolean;
}) {
  const { data: header } = useDprHeader(headerId);
  const { data: machinery } = useMachinery();
  const addMachinery = useAddDprMachinery();
  const updateMachinery = useUpdateDprMachinery();
  const deleteMachinery = useDeleteDprMachinery();
  const { fmtAmt, symbol } = useNumberFormat();
  const { token } = theme.useToken();
  const [drafts, setDrafts] = useState<MachDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m]));
  const entries = header?.machinery_entries ?? [];
  const totalCost = entries.reduce((s, e) => s + (e.hire_rate ? parseFloat(e.hire_rate) * parseFloat(e.quantity_used) : 0), 0);

  const patchDraft = (key: string, patch: Partial<MachDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const saveDraft = async (draft: MachDraftRow) => {
    if (!draft.machinery_id || draft.qty == null) { message.warning('Machine and quantity are required'); return; }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      await addMachinery.mutateAsync({ headerId, data: { machinery_id: draft.machinery_id, quantity_used: String(draft.qty), hire_rate: draft.hire_unit !== 'OWNED' && draft.hire_rate != null ? String(draft.hire_rate) : undefined } });
      removeDraft(draft.key);
    } catch { message.error('Could not add entry'); }
    finally { setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; }); }
  };

  const saveQty = async (entry: DprMachineryRead, raw: string) => {
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty === parseFloat(entry.quantity_used)) return;
    try { await updateMachinery.mutateAsync({ itemId: entry.id, data: { quantity_used: String(qty), hire_rate: entry.hire_unit === 'OWNED' ? null : (entry.hire_rate ?? null) } }); }
    catch { message.error('Could not update'); }
  };

  const saveRate = async (entry: DprMachineryRead, raw: string) => {
    if (entry.hire_unit === 'OWNED') return;
    const rate = raw ? parseFloat(raw) : null;
    if (rate === (entry.hire_rate != null ? parseFloat(entry.hire_rate) : null)) return;
    try { await updateMachinery.mutateAsync({ itemId: entry.id, data: { quantity_used: entry.quantity_used, hire_rate: rate != null ? String(rate) : null } }); }
    catch { message.error('Could not update'); }
  };

  const handleDelete = async (entry: DprMachineryRead) => {
    try { await deleteMachinery.mutateAsync({ itemId: entry.id, headerId }); }
    catch { message.error('Could not delete'); }
  };

  const rows: MachRow[] = [
    ...entries.map((e): MachRow => ({ _kind: 'existing', entry: e })),
    ...drafts.map((d): MachRow => ({ _kind: 'draft', draft: d })),
  ];

  const inp = { width: '100%' };

  const columns: TableColumnsType<MachRow> = [
    {
      title: '#', key: 'idx', width: 40,
      render: (_: unknown, _r: MachRow, i: number) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Typography.Text>,
    },
    {
      title: 'Machine', key: 'machine',
      render: (_: unknown, row: MachRow) =>
        row._kind === 'existing' ? (
          <Typography.Text>{machineryById.get(row.entry.machinery_id)?.name ?? row.entry.machinery_id}</Typography.Text>
        ) : (
          <Select size="small" showSearch optionFilterProp="label" style={inp} placeholder="Select machine…" value={row.draft.machinery_id}
            onChange={(v) => {
              const m = machineryById.get(v);
              patchDraft(row.draft.key, { machinery_id: v, hire_unit: m?.hire_unit ?? null, qty: m?.hire_unit === 'OWNED' ? 1 : null, hire_rate: m?.hire_unit === 'OWNED' ? null : (m?.hire_rate ? parseFloat(m.hire_rate) : null) });
            }}
            options={(machinery ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        ),
    },
    {
      title: 'Billing Unit', key: 'unit', width: 110,
      render: (_: unknown, row: MachRow) => {
        const unit = row._kind === 'existing' ? row.entry.hire_unit : row.draft.hire_unit;
        if (!unit) return null;
        return <Tag color={unit === 'OWNED' ? 'purple' : 'blue'} style={{ margin: 0, fontSize: 11 }}>{MACHINERY_HIRE_UNIT_LABELS[unit as keyof typeof MACHINERY_HIRE_UNIT_LABELS] ?? unit}</Tag>;
      },
    },
    {
      title: 'Qty', key: 'qty', width: 90,
      render: (_: unknown, row: MachRow) =>
        row._kind === 'existing' ? (
          <InputNumber key={`${row.entry.id}-q-${row.entry.quantity_used}`} size="small" min={0} style={inp}
            defaultValue={parseFloat(row.entry.quantity_used)} onBlur={(e) => saveQty(row.entry, e.target.value)}
            disabled={isSubmitted || row.entry.hire_unit === 'OWNED'} />
        ) : (
          <InputNumber size="small" min={0} style={inp} placeholder="0" value={row.draft.qty}
            disabled={row.draft.hire_unit === 'OWNED'} onChange={(v) => patchDraft(row.draft.key, { qty: v })} />
        ),
    },
    {
      title: `Hire Rate (${symbol})`, key: 'rate', width: 130, align: 'right' as const,
      render: (_: unknown, row: MachRow) => {
        if (row._kind === 'existing') {
          if (row.entry.hire_unit === 'OWNED') return <Typography.Text type="secondary" style={{ fontSize: 12 }}>Owned — no cost</Typography.Text>;
          return <InputNumber key={`${row.entry.id}-r-${row.entry.hire_rate}`} size="small" min={0} precision={2} style={inp}
            defaultValue={row.entry.hire_rate != null ? parseFloat(row.entry.hire_rate) : undefined} placeholder="—"
            onBlur={(e) => saveRate(row.entry, e.target.value)} disabled={isSubmitted} />;
        }
        if (row.draft.hire_unit === 'OWNED') return <Typography.Text type="secondary" style={{ fontSize: 12 }}>Owned — no cost</Typography.Text>;
        return <InputNumber size="small" min={0} precision={2} style={inp} placeholder="Rate (auto)" value={row.draft.hire_rate} onChange={(v) => patchDraft(row.draft.key, { hire_rate: v })} />;
      },
    },
    {
      title: `Cost (${symbol})`, key: 'cost', width: 110, align: 'right' as const,
      render: (_: unknown, row: MachRow) => {
        if (row._kind === 'existing') {
          const cost = row.entry.hire_rate ? parseFloat(row.entry.hire_rate) * parseFloat(row.entry.quantity_used) : null;
          return <Typography.Text strong>{cost != null ? fmtAmt(cost) : '—'}</Typography.Text>;
        }
        const cost = row.draft.hire_rate != null && row.draft.qty != null ? row.draft.hire_rate * row.draft.qty : null;
        return <Typography.Text type="secondary">{cost != null ? fmtAmt(cost) : '—'}</Typography.Text>;
      },
    },
    {
      title: '', key: 'actions', width: 68,
      render: (_: unknown, row: MachRow) => {
        if (row._kind === 'existing') {
          if (isSubmitted) return null;
          return (
            <Popconfirm title="Delete this entry?" onConfirm={() => handleDelete(row.entry)} okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={deleteMachinery.isPending} />
            </Popconfirm>
          );
        }
        return (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: token.colorSuccess }} loading={savingKeys.has(row.draft.key)} onClick={() => saveDraft(row.draft)} />
            <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => removeDraft(row.draft.key)} />
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: token.colorFillAlter, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>Line Items</Typography.Text>
          <Tag style={{ margin: 0, fontSize: 11 }}>{entries.length} item{entries.length !== 1 ? 's' : ''}</Tag>
        </span>
        {!isSubmitted && (
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => setDrafts((p) => [...p, { key: nextMachKey(), machinery_id: null, qty: null, hire_rate: null, hire_unit: null }])}>
            Add Machine
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — machinery entries are locked." />}
      <Table<MachRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: 620 }}
        locale={{ emptyText: isSubmitted ? 'No machinery entries' : 'No entries yet — click "Add Machine" above' }}
        summary={totalCost > 0 ? () => (
          <Table.Summary>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={5}>Total Machinery Cost</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{fmtAmt(totalCost)}</Table.Summary.Cell>
              {!isSubmitted && <Table.Summary.Cell index={6} />}
            </Table.Summary.Row>
          </Table.Summary>
        ) : undefined}
      />
    </div>
  );
}

// ─── Issues Tab ───────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  LOW: 'default',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red',
};

function IssuesTab({
  headerId,
  isSubmitted,
}: {
  headerId: string;
  isSubmitted: boolean;
}) {
  const { data: header } = useDprHeader(headerId);
  const addIssue = useAddDprIssue();
  const uploadPhoto = useUploadPhoto();
  const { token } = theme.useToken();
  const [drafts, setDrafts] = useState<IssueDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const entries = header?.issues ?? [];

  const patchDraft = (key: string, patch: Partial<IssueDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const saveDraft = async (draft: IssueDraftRow) => {
    if (!draft.description.trim() || !draft.severity) {
      message.warning('Description and severity are required');
      return;
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      let photo_url: string | undefined;
      const photoFile = photoFiles[draft.key];
      if (photoFile) photo_url = await uploadPhoto.mutateAsync({ prefix: 'dpr-issues', file: photoFile });
      await addIssue.mutateAsync({
        headerId,
        data: { description: draft.description.trim(), severity: draft.severity, photo_url },
      });
      removeDraft(draft.key);
      setPhotoFiles((prev) => { const next = { ...prev }; delete next[draft.key]; return next; });
    } catch {
      message.error('Could not log issue');
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const rows: IssueRow[] = [
    ...entries.map((e): IssueRow => ({ _kind: 'existing', entry: e })),
    ...drafts.map((d): IssueRow => ({ _kind: 'draft', draft: d })),
  ];

  const inp = { width: '100%' };

  const columns: TableColumnsType<IssueRow> = [
    {
      title: '#', key: 'idx', width: 40,
      render: (_: unknown, _r: IssueRow, i: number) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Typography.Text>,
    },
    {
      title: 'Description', key: 'description',
      render: (_: unknown, row: IssueRow) =>
        row._kind === 'existing' ? (
          <Typography.Text>{row.entry.description}</Typography.Text>
        ) : (
          <Input.TextArea
            size="small" rows={1} autoSize={{ minRows: 1, maxRows: 3 }} style={inp}
            placeholder="Describe the issue or blocker…"
            value={row.draft.description}
            onChange={(e) => patchDraft(row.draft.key, { description: e.target.value })}
          />
        ),
    },
    {
      title: 'Severity', key: 'severity', width: 120,
      render: (_: unknown, row: IssueRow) =>
        row._kind === 'existing' ? (
          <Tag color={SEVERITY_COLOR[row.entry.severity]} style={{ margin: 0 }}>{row.entry.severity}</Tag>
        ) : (
          <Select
            size="small" style={inp} placeholder="Severity"
            value={row.draft.severity ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { severity: v })}
            options={[
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
          />
        ),
    },
    {
      title: 'Photo', key: 'photo', width: 90,
      render: (_: unknown, row: IssueRow) => {
        if (row._kind === 'existing') {
          return row.entry.photo_url ? (
            <a href={row.entry.photo_url} target="_blank" rel="noreferrer">View</a>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>
          );
        }
        return (
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              ref={(el) => { photoInputRefs.current[row.draft.key] = el; }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhotoFiles((prev) => ({ ...prev, [row.draft.key]: file }));
              }}
            />
            <Button
              size="small" type="text"
              icon={photoFiles[row.draft.key]
                ? <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                : <CameraOutlined />}
              title={photoFiles[row.draft.key] ? 'Photo ready — tap to change' : 'Attach photo'}
              onClick={() => photoInputRefs.current[row.draft.key]?.click()}
            />
          </span>
        );
      },
    },
    {
      title: 'Status', key: 'status', width: 90,
      render: (_: unknown, row: IssueRow) =>
        row._kind === 'existing'
          ? <Tag color={row.entry.status === 'RESOLVED' ? 'green' : 'blue'} style={{ margin: 0 }}>{row.entry.status}</Tag>
          : null,
    },
    {
      title: '', key: 'actions', width: 68,
      render: (_: unknown, row: IssueRow) => {
        if (row._kind === 'existing') return null;
        return (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: token.colorSuccess }}
              loading={savingKeys.has(row.draft.key) || addIssue.isPending} onClick={() => saveDraft(row.draft)} />
            <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => removeDraft(row.draft.key)} />
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: token.colorFillAlter, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>Line Items</Typography.Text>
          <Tag style={{ margin: 0, fontSize: 11 }}>{entries.length} item{entries.length !== 1 ? 's' : ''}</Tag>
        </span>
        {!isSubmitted && (
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => setDrafts((p) => [...p, { key: nextIssueKey(), description: '', severity: null }])}>
            Add Issue
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — issues are locked." />}
      <Table<IssueRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: 620 }}
        locale={{ emptyText: isSubmitted ? 'No issues logged' : 'No entries yet — click "Add Issue" above' }}
      />
    </div>
  );
}

// ─── Measurements Tab ─────────────────────────────────────────────────────────

function MeasurementsTab({
  projectId,
  entryDate,
  isSubmitted,
}: {
  projectId: string;
  entryDate: string;
  isSubmitted: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: measurements, isLoading } = useMeasurements(projectId);
  const { data: boqItems } = useBoqItems(projectId);
  const { data: workTypes } = useWorkTypes();
  const { data: measurementWorkflow } = useEffectiveWorkflow('MEASUREMENT', projectId);
  const createMeasurement = useCreateMeasurement();
  const submitMeasurement = useSubmitMeasurement();
  const updateMeasurement = useUpdateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();
  const recallMeasurement = useRecallMeasurement();
  const uploadPhoto = useUploadPhoto();
  const attachPhoto = useAttachPhoto();
  const { fmtDate } = useDateFormat();
  const { fmtAmt, symbol } = useNumberFormat();
  const { token } = theme.useToken();

  const [drafts, setDrafts] = useState<MeasDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRead | null>(null);
  const [editDimensions, setEditDimensions] = useState<Record<string, number>>({});
  const [editChainage, setEditChainage] = useState('');
  const [editRate, setEditRate] = useState<number | null>(null);

  const boqById = useMemo(() => new Map((boqItems ?? []).map((b) => [b.id, b])), [boqItems]);

  const editWorkType = useMemo(
    () => (editingMeasurement ? (workTypes ?? []).find((w) => w.id === editingMeasurement.work_type_id) : undefined),
    [editingMeasurement, workTypes],
  );
  const editComputedQty = useMemo(() => {
    if (!editWorkType) return 0;
    return calculateQuantity(editWorkType.formula, editWorkType.dimension_fields, editDimensions);
  }, [editWorkType, editDimensions]);

  const forDate = useMemo(
    () => (measurements ?? []).filter((m) => m.measurement_date === entryDate),
    [measurements, entryDate],
  );

  const patchDraft = (key: string, patch: Partial<MeasDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  // Patch a single dimension field AND recalculate qty from the formula
  const patchDimension = (draftKey: string, field: string, value: number | null) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d;
      const newDims = { ...d.dimensions, [field]: value ?? 0 };
      const boqItem = boqById.get(d.boq_item_id ?? '');
      const wt = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
      const newQty = wt ? calculateQuantity(wt.formula, wt.dimension_fields, newDims) : d.qty;
      return { ...d, dimensions: newDims, qty: newQty };
    }));
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setPhotoFiles((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const saveDraft = async (draft: MeasDraftRow) => {
    if (!draft.boq_item_id) { message.warning('Select a BOQ item'); return; }
    const boqItem = boqById.get(draft.boq_item_id);
    const workType = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
    if (!workType || workType.dimension_fields.length === 0) {
      message.warning('No dimension fields configured for this BOQ item');
      return;
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      const created = await createMeasurement.mutateAsync({
        project_id: projectId,
        boq_item_id: draft.boq_item_id,
        measurement_date: entryDate,
        dimensions: Object.fromEntries(workType.dimension_fields.map((f) => [f, String(draft.dimensions[f] ?? 0)])),
        chainage: draft.chainage.trim() || null,
        rate: draft.rate != null ? String(draft.rate) : null,
      });
      const photoFile = photoFiles[draft.key];
      if (photoFile) {
        try {
          const pos = await getCurrentPosition();
          const url = await uploadPhoto.mutateAsync({ prefix: 'measurements', file: photoFile });
          await attachPhoto.mutateAsync({
            entity_type: 'MEASUREMENT',
            entity_id: created.id,
            photo_url: url,
            latitude: pos.latitude,
            longitude: pos.longitude,
            captured_at: new Date().toISOString(),
          });
        } catch {
          message.warning('Measurement saved but photo could not be attached.');
        }
      }
      message.success(`Saved — qty: ${created.computed_qty}`);
      removeDraft(draft.key);
    } catch {
      message.error('Could not save — check BOQ tolerance');
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const handleSubmit = async (id: string) => {
    try { await submitMeasurement.mutateAsync({ id }); message.success('Submitted for approval'); }
    catch { message.error('Could not submit'); }
  };

  const handleEditSave = async () => {
    if (!editingMeasurement || !editWorkType) return;
    try {
      await updateMeasurement.mutateAsync({
        id: editingMeasurement.id,
        data: {
          dimensions: Object.fromEntries(editWorkType.dimension_fields.map((f) => [f, String(editDimensions[f] ?? 0)])),
          chainage: editChainage.trim() || null,
          rate: editRate != null ? String(editRate) : null,
        },
      });
      message.success('Updated');
      setEditingMeasurement(null);
    } catch { message.error('Could not update — check tolerance'); }
  };

  const openEditModal = (record: MeasurementRead) => {
    setEditDimensions(Object.fromEntries(Object.entries(record.dimensions).map(([k, v]) => [k, parseFloat(v) || 0])));
    setEditChainage(record.chainage ?? '');
    setEditRate(record.rate != null ? parseFloat(record.rate) : null);
    setEditingMeasurement(record);
  };

  const handleRecall = async (record: MeasurementRead) => {
    try { await recallMeasurement.mutateAsync({ id: record.id }); message.success('Recalled to Draft'); }
    catch { message.error('Could not recall'); }
  };

  const handleDelete = async (record: MeasurementRead) => {
    try { await deleteMeasurement.mutateAsync({ id: record.id, projectId: record.project_id }); message.success('Deleted'); }
    catch { message.error('Could not delete'); }
  };

  const rows: MeasRow[] = [
    ...forDate.map((e): MeasRow => ({ _kind: 'existing', entry: e })),
    ...drafts.map((d): MeasRow => ({ _kind: 'draft', draft: d })),
  ];

  const totalQty = forDate.reduce((s, m) => s + parseFloat(m.computed_qty || '0'), 0);
  const totalAmount = forDate.reduce((s, m) => {
    const item = boqById.get(m.boq_item_id);
    const rate = m.rate != null ? parseFloat(m.rate) : item?.rate ? parseFloat(item.rate) : 0;
    return s + parseFloat(m.computed_qty || '0') * rate;
  }, 0);

  const inp = { width: '100%' };

  const columns: TableColumnsType<MeasRow> = [
    {
      title: 'BOQ Item',
      key: 'boq',
      width: 200,
      ellipsis: true,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing' ? (
          (() => { const item = boqById.get(row.entry.boq_item_id); return item ? `${item.item_no} — ${item.description}` : row.entry.boq_item_id; })()
        ) : (
          <Select
            size="small" showSearch optionFilterProp="label" style={inp}
            placeholder="Select BOQ item…"
            value={row.draft.boq_item_id ?? undefined}
            onChange={(v) => {
              const boqItem = boqById.get(v);
              const wt = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
              patchDraft(row.draft.key, {
                boq_item_id: v,
                dimensions: {},
                qty: 0,
                rate: boqItem?.rate != null ? parseFloat(boqItem.rate) : null,
              });
              // recalculate qty with empty dims (will be 0)
              void wt;
            }}
            options={(boqItems ?? []).map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` }))}
          />
        ),
    },
    // All 7 dimension columns; inactive ones dimmed with placeholder
    ...ALL_DIM_FIELDS.map((field) => ({
      title: DIM_ABBREV[field],
      key: field,
      width: 62,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          const val = row.entry.dimensions[field];
          return val
            ? <Typography.Text style={{ fontSize: 12 }}>{parseFloat(val).toFixed(2)}</Typography.Text>
            : <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        }
        const boqItem = row.draft.boq_item_id ? boqById.get(row.draft.boq_item_id) : undefined;
        const wt = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
        const active = (wt?.dimension_fields ?? []).includes(field);
        return (
          <div style={{ opacity: active ? 1 : 0.28 }}>
            <InputNumber
              size="small" style={inp} min={0}
              disabled={!active || !row.draft.boq_item_id}
              placeholder={active ? '0' : '—'}
              value={active ? (row.draft.dimensions[field] ?? null) : null}
              onChange={(v) => { if (active) patchDimension(row.draft.key, field, v); }}
            />
          </div>
        );
      },
    })),
    {
      title: 'Chainage',
      key: 'chainage',
      width: 90,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing' ? (
          <Typography.Text style={{ fontSize: 12 }}>{row.entry.chainage ?? '—'}</Typography.Text>
        ) : (
          <Input size="small" placeholder="—" value={row.draft.chainage}
            onChange={(e) => patchDraft(row.draft.key, { chainage: e.target.value })} />
        ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 78,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing' ? (
          <Typography.Text strong style={{ fontSize: 12 }}>{parseFloat(row.entry.computed_qty).toFixed(3)}</Typography.Text>
        ) : (
          <InputNumber
            size="small" style={inp} min={0} precision={3}
            placeholder="auto"
            value={row.draft.qty ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { qty: v })}
          />
        ),
    },
    {
      title: `Rate (${symbol})`,
      key: 'rate',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          const item = boqById.get(row.entry.boq_item_id);
          const rate = row.entry.rate != null ? parseFloat(row.entry.rate) : item?.rate != null ? parseFloat(item.rate) : null;
          const isOverride = row.entry.rate != null && item?.rate != null && parseFloat(row.entry.rate) !== parseFloat(item.rate);
          return rate != null
            ? (
              <Typography.Text style={{ fontSize: 12 }} title={isOverride ? `BOQ rate: ${fmtAmt(parseFloat(item!.rate))}` : undefined}>
                {fmtAmt(rate)}{isOverride && ' *'}
              </Typography.Text>
            )
            : <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        }
        return (
          <InputNumber
            size="small" style={inp} min={0} precision={2}
            placeholder="—"
            value={row.draft.rate ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { rate: v })}
          />
        );
      },
    },
    {
      title: `Amount (${symbol})`,
      key: 'amount',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          const item = boqById.get(row.entry.boq_item_id);
          const rate = row.entry.rate != null ? parseFloat(row.entry.rate) : item?.rate != null ? parseFloat(item.rate) : null;
          const qty = parseFloat(row.entry.computed_qty || '0');
          return rate != null
            ? <Typography.Text strong style={{ fontSize: 12 }}>{fmtAmt(qty * rate)}</Typography.Text>
            : <Typography.Text type="secondary">—</Typography.Text>;
        }
        const amt = (row.draft.qty ?? 0) * (row.draft.rate ?? 0);
        return (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.draft.qty != null && row.draft.rate != null ? fmtAmt(amt) : '—'}
          </Typography.Text>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing'
          ? (
            <Tag color={measurementStatusColor(row.entry.status, measurementWorkflow)}>
              {measurementStatusLabel(row.entry.status, measurementWorkflow)}
            </Tag>
          )
          : null,
    },
    {
      title: '',
      key: 'actions',
      width: 185,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          return (
            <Space size={4}>
              {row.entry.status === 'DRAFT' && row.entry.recorded_by === user?.id && (
                <>
                  <Button size="small" type="primary" loading={submitMeasurement.isPending} onClick={() => handleSubmit(row.entry.id)}>Submit</Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(row.entry)} />
                  <Popconfirm
                    title="Delete measurement?"
                    description="Removes its contribution from DPR production."
                    onConfirm={() => handleDelete(row.entry)}
                    okText="Delete" okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMeasurement.isPending} />
                  </Popconfirm>
                </>
              )}
              {row.entry.status === 'REJECTED' && row.entry.recorded_by === user?.id && (
                <Popconfirm title="Recall to Draft?" description="You can edit and resubmit." onConfirm={() => handleRecall(row.entry)} okText="Recall">
                  <Button size="small" loading={recallMeasurement.isPending}>Recall</Button>
                </Popconfirm>
              )}
            </Space>
          );
        }
        return (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              ref={(el) => { photoInputRefs.current[row.draft.key] = el; }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhotoFiles((prev) => ({ ...prev, [row.draft.key]: file }));
              }}
            />
            <Button
              size="small" type="text"
              icon={photoFiles[row.draft.key]
                ? <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                : <CameraOutlined />}
              title={photoFiles[row.draft.key] ? 'Photo ready — tap to change' : 'Attach evidence photo'}
              onClick={() => photoInputRefs.current[row.draft.key]?.click()}
            />
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: token.colorSuccess }}
              loading={savingKeys.has(row.draft.key)} onClick={() => saveDraft(row.draft)} />
            <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => removeDraft(row.draft.key)} />
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: 'hidden' }}>
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: token.colorFillAlter, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Typography.Text strong style={{ fontSize: 14 }}>Measurements</Typography.Text>
            <Tag style={{ margin: 0, fontSize: 11 }}>{forDate.length} record{forDate.length !== 1 ? 's' : ''}</Tag>
          </span>
          {!isSubmitted && (
            <Button
              size="small" icon={<PlusOutlined />}
              onClick={() => setDrafts((p) => [...p, { key: nextMeasKey(), boq_item_id: null, dimensions: {}, chainage: '', qty: null, rate: null }])}
            >
              Add Measurement
            </Button>
          )}
        </div>
        {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — new measurements cannot be added here." />}

        <Table<MeasRow>
          rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
          size="small"
          loading={isLoading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: 200 + ALL_DIM_FIELDS.length * 62 + 90 + 78 + 90 + 100 + 100 + 185 }}
          locale={{ emptyText: `No measurements for ${fmtDate(entryDate)}` }}
          summary={totalQty > 0 ? () => (
            <Table.Summary>
              <Table.Summary.Row style={{ fontWeight: 700 }}>
                <Table.Summary.Cell index={0} colSpan={9}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">{totalQty.toFixed(3)}</Table.Summary.Cell>
                <Table.Summary.Cell index={10} />
                <Table.Summary.Cell index={11} align="right">{fmtAmt(totalAmount)}</Table.Summary.Cell>
                <Table.Summary.Cell index={12} />
                <Table.Summary.Cell index={13} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : undefined}
        />
      </div>

      {/* Edit modal */}
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
              <Input value={editChainage} onChange={(e) => setEditChainage(e.target.value)} placeholder="e.g. 2/130–2/390" />
            </Form.Item>
            <Form.Item label="Rate (optional override)">
              <InputNumber
                style={{ width: '100%' }} min={0} precision={2}
                value={editRate}
                placeholder="BOQ item rate"
                onChange={(v) => setEditRate(v)}
              />
            </Form.Item>
            {editWorkType.dimension_fields.map((field) => (
              <Form.Item key={field} label={FIELD_LABELS[field] ?? field}>
                <InputNumber
                  style={{ width: '100%' }} min={0}
                  value={editDimensions[field] ?? 0}
                  onChange={(v) => setEditDimensions((prev) => ({ ...prev, [field]: v ?? 0 }))}
                />
              </Form.Item>
            ))}
            <Statistic title="Computed Quantity" value={editComputedQty.toFixed(3)} />
          </Form>
        )}
      </Modal>
    </>
  );
}

// ─── Production Tab ───────────────────────────────────────────────────────────

interface ProductionState {
  qty: string;
  chainage: string;
}

function ProductionTab({
  headerId,
  isSubmitted,
}: {
  headerId: string;
  isSubmitted: boolean;
}) {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: sections, isLoading: sectionsLoading } = useBoqSections(selectedProjectId);
  const { data: existingEntries } = useDprProduction(headerId);
  const { data: dprMeasurements } = useDprMeasurements(headerId);
  const bulkUpsert = useBulkUpsertProduction();

  // Once a measurement exists for a BOQ item on this date — in any status —
  // that item's quantity is owned by the Measurement Book, not manual entry.
  // The displayed qty/amount still only reflect approved measurements (see
  // sum_qty_and_amount_for_item_date), so a pending/rejected-only item shows
  // 0 here rather than letting the engineer type a number that competes with
  // whatever the MB eventually settles on.
  const lockedByMeasurement = new Set((dprMeasurements ?? []).map((m) => m.boq_item_id));
  const entryByBoq = new Map((existingEntries ?? []).map((e) => [e.boq_item_id, e]));
  const { resolvedMode } = useThemeMode();
  const { fmtAmt, fmtQty, symbol } = useNumberFormat();

  const HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';

  const [activitySummary, setActivitySummary] = useState('');
  const [production, setProduction] = useState<Record<string, ProductionState>>({});
  const touchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!existingEntries) return;
    setProduction((prev) => {
      const next = { ...prev };
      for (const e of existingEntries) {
        if (!touchedRef.current.has(e.boq_item_id)) {
          next[e.boq_item_id] = { qty: e.qty_today, chainage: e.chainage ?? '' };
        }
      }
      return next;
    });
  }, [existingEntries]);

  const handleSave = async () => {
    const entries = Object.entries(production)
      .filter(([boq_item_id, v]) => v.qty !== '' && v.qty !== '0' && !lockedByMeasurement.has(boq_item_id))
      .map(([boq_item_id, v]) => ({ boq_item_id, qty_today: v.qty, chainage: v.chainage.trim() || null }));
    try {
      await bulkUpsert.mutateAsync({ headerId, data: { daily_work_summary: activitySummary.trim() || null, entries } });
      touchedRef.current.clear();
      message.success('Production entries saved');
    } catch {
      message.error('Could not save production entries');
    }
  };

  const setQty = (boqItemId: string, qty: string) => {
    touchedRef.current.add(boqItemId);
    setProduction((prev) => ({ ...prev, [boqItemId]: { ...prev[boqItemId], qty } }));
  };

  const setChainage = (boqItemId: string, chainage: string) => {
    touchedRef.current.add(boqItemId);
    setProduction((prev) => ({ ...prev, [boqItemId]: { ...prev[boqItemId], chainage } }));
  };

  const rows = buildProductionRows(sections ?? []);

  const computeAmount = (item: BoqItemRead, qty: string) => {
    const q = parseFloat(qty || '0');
    const r = parseFloat(item.rate);
    if (isNaN(q) || isNaN(r)) return '—';
    return fmtAmt(q * r);
  };

  const columns: TableColumnsType<ProductionRow> = [
    {
      title: 'Item No',
      key: 'item_no',
      width: 80,
      onCell: (row) => row._type === 'header' ? { colSpan: 6, style: { background: HDR_BG, fontWeight: 600, padding: '6px 12px' } } : {},
      render: (_, row) => {
        if (row._type === 'header') return `${row.section.section_no}. ${row.section.section_name.toUpperCase()}`;
        return row.item.item_no;
      },
    },
    {
      title: 'Description',
      key: 'description',
      width: 200,
      ellipsis: true,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.item.description : null),
    },
    {
      title: `BOQ Rate (${symbol})`,
      key: 'rate',
      width: 90,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? fmtQty(row.item.rate, 2) : null),
    },
    {
      title: `Rate Used in MB (${symbol})`,
      key: 'mb_rate',
      width: 130,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const fromMeasurement = lockedByMeasurement.has(row.item.id);
        const entry = entryByBoq.get(row.item.id);
        if (!fromMeasurement || !entry || parseFloat(entry.qty_today) <= 0) {
          return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        }
        const effectiveRate = parseFloat(entry.amount_today) / parseFloat(entry.qty_today);
        const isOverride = Math.abs(effectiveRate - parseFloat(row.item.rate)) > 0.005;
        return (
          <span title={isOverride ? `BOQ rate is ${fmtQty(row.item.rate, 2)} — this rate was overridden in the measurement entry` : 'Matches BOQ rate'}>
            {fmtQty(String(effectiveRate), 2)}{isOverride && ' *'}
          </span>
        );
      },
    },
    {
      title: "Today's Qty",
      key: 'qty_today',
      width: 130,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const val = production[row.item.id]?.qty ?? '';
        const fromMeasurement = lockedByMeasurement.has(row.item.id);
        if (fromMeasurement) {
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 500 }}>{val || '0'}</span>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>← MB</Typography.Text>
            </span>
          );
        }
        return (
          <InputNumber
            size="small"
            value={val === '' ? undefined : parseFloat(val)}
            onChange={(v) => setQty(row.item.id, v === null || v === undefined ? '' : String(v))}
            disabled={isSubmitted}
            style={{ width: '100%' }}
            placeholder="0"
          />
        );
      },
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 110,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const fromMeasurement = lockedByMeasurement.has(row.item.id);
        const entry = entryByBoq.get(row.item.id);
        if (fromMeasurement && entry) return fmtAmt(parseFloat(entry.amount_today));
        return computeAmount(row.item, production[row.item.id]?.qty ?? '');
      },
    },
    {
      title: 'Chainage',
      key: 'chainage',
      width: 130,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const fromMeasurement = lockedByMeasurement.has(row.item.id);
        return (
          <Input
            size="small"
            value={production[row.item.id]?.chainage ?? ''}
            onChange={(e) => setChainage(row.item.id, e.target.value)}
            disabled={isSubmitted || fromMeasurement}
            placeholder={fromMeasurement ? 'Set in Measurement Book' : 'e.g. 2/130–2/390'}
          />
        );
      },
    },
  ];

  if (sectionsLoading) return <Skeleton active paragraph={{ rows: 4 }} />;
  if ((sections ?? []).length === 0) return <Empty description="No BOQ sections set up yet." />;

  return (
    <div>
      <Form.Item label="Today's Activity (optional)" style={{ marginBottom: 12 }}>
        <Input
          placeholder="e.g. Earthwork and Clearing grass"
          value={activitySummary}
          onChange={(e) => setActivitySummary(e.target.value)}
          disabled={isSubmitted}
          maxLength={500}
        />
      </Form.Item>

      <Table
        rowKey="key"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 870 }}
        onRow={(row) => ({ style: { background: row._type === 'header' ? HDR_BG : undefined } })}
      />

      {!isSubmitted && (
        <Button type="primary" block style={{ marginTop: 12 }} loading={bulkUpsert.isPending} onClick={handleSave}>
          Save Production Entries
        </Button>
      )}
      {isSubmitted && (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
          DPR submitted — production entries are locked.
        </Typography.Text>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DprTodayPage() {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const currentDprHeaderId = useProjectContextStore((s) => s.currentDprHeaderId);
  const setCurrentDprHeaderId = useProjectContextStore((s) => s.setCurrentDprHeaderId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const setSelectedEntryDate = useProjectContextStore((s) => s.setSelectedEntryDate);
  const authUser = useAuthStore((s) => s.user);

  const entryDate = dayjs(selectedEntryDate);
  const entryDateStr = selectedEntryDate;
  const isToday = entryDateStr === dayjs().format('YYYY-MM-DD');
  const { fmtDate, dateFormat } = useDateFormat();
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === selectedProjectId);
  const { data: dprList, isLoading: listLoading } = useDprList(selectedProjectId);
  const { data: header } = useDprHeader(currentDprHeaderId);
  const createHeader = useCreateDprHeader();
  const updateHeader = useUpdateDprHeader();
  const deleteHeader = useDeleteDprHeader();
  const submitDpr = useSubmitDpr();
  const [supervisorName, setSupervisorName] = useState('');
  const initializedForHeaderId = useRef<string | null>(null);
  const [noWork, setNoWork] = useState(false);
  const [noWorkReasonKind, setNoWorkReasonKind] = useState<string>('Rain');
  const [noWorkReasonCustom, setNoWorkReasonCustom] = useState('');

  const selectedDateHeader = dprList?.find((d) => d.report_date === entryDateStr);

  useEffect(() => {
    if (listLoading) return;
    if (selectedDateHeader) {
      if (selectedDateHeader.id !== currentDprHeaderId) setCurrentDprHeaderId(selectedDateHeader.id);
    } else if (currentDprHeaderId) {
      setCurrentDprHeaderId(null);
    }
  }, [selectedDateHeader, currentDprHeaderId, setCurrentDprHeaderId, listLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentDprHeaderId === null) {
        if (initializedForHeaderId.current !== null) {
          initializedForHeaderId.current = null;
          setSupervisorName(authUser?.fullName ?? '');
          setNoWork(false);
          setNoWorkReasonKind('Rain');
          setNoWorkReasonCustom('');
        }
        return;
      }
      if (!header || header.id !== currentDprHeaderId) return;
      if (initializedForHeaderId.current === currentDprHeaderId) return;
      initializedForHeaderId.current = currentDprHeaderId;
      setSupervisorName(header.supervisor_name ?? authUser?.fullName ?? '');
      setNoWork(header.no_work);
      if (header.no_work_reason) {
        if ((NO_WORK_REASONS as readonly string[]).includes(header.no_work_reason)) {
          setNoWorkReasonKind(header.no_work_reason);
        } else {
          setNoWorkReasonKind('Other');
          setNoWorkReasonCustom(header.no_work_reason);
        }
      } else {
        setNoWorkReasonKind('Rain');
        setNoWorkReasonCustom('');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [currentDprHeaderId, header, authUser]);

  const computedNoWorkReason = noWorkReasonKind === 'Other' ? noWorkReasonCustom.trim() : noWorkReasonKind;

  const handleStart = async () => {
    if (!selectedProjectId) return;
    if (noWork && !computedNoWorkReason) { message.error('Please provide a reason for the no-work day'); return; }
    try {
      const created = await createHeader.mutateAsync({
        project_id: selectedProjectId,
        report_date: entryDateStr,
        supervisor_name: supervisorName.trim() || undefined,
        no_work: noWork,
        no_work_reason: noWork ? computedNoWorkReason : null,
      });
      setCurrentDprHeaderId(created.id);
    } catch {
      message.error(`Could not start the DPR for ${fmtDate(entryDateStr)}`);
    }
  };

  const handleMarkNoWork = async (checked: boolean) => {
    if (!currentDprHeaderId) return;
    if (checked && !computedNoWorkReason) { message.error('Please select a reason for the no-work day'); return; }
    try {
      await updateHeader.mutateAsync({ headerId: currentDprHeaderId, data: { no_work: checked, no_work_reason: checked ? computedNoWorkReason : null } });
    } catch {
      message.error(checked ? 'Cannot mark as no-work: DPR has production/material/machinery entries.' : 'Could not update');
    }
  };

  const handleSupervisorBlur = async () => {
    if (!currentDprHeaderId || !header || header.status !== 'DRAFT') return;
    const trimmed = supervisorName.trim() || null;
    if (trimmed === header.supervisor_name) return;
    try {
      await updateHeader.mutateAsync({ headerId: currentDprHeaderId, data: { supervisor_name: trimmed } });
    } catch {
      message.error('Could not update supervisor name');
    }
  };

  const handleSubmit = async () => {
    if (!currentDprHeaderId) return;
    try {
      await submitDpr.mutateAsync(currentDprHeaderId);
      message.success("Today's DPR submitted");
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.message : null;
      message.error(detail ?? 'Could not submit DPR');
    }
  };

  const handleDeleteDpr = async () => {
    if (!currentDprHeaderId || !selectedProjectId) return;
    try {
      await deleteHeader.mutateAsync({ headerId: currentDprHeaderId, projectId: selectedProjectId });
      setCurrentDprHeaderId(null);
      message.success('DPR deleted');
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.message : null;
      message.error(detail ?? 'Could not delete DPR');
    }
  };

  if (!selectedProjectId) {
    return (
      <div>
        <Typography.Title level={4}>Today's DPR</Typography.Title>
        <Empty description="Select a project to begin"><ProjectSelector /></Empty>
      </div>
    );
  }

  if (listLoading) return <Skeleton active paragraph={{ rows: 4 }} />;

  const minDate = project ? dayjs(project.start_date) : undefined;
  const disabledEntryDate = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day') || (minDate ? d.isBefore(minDate, 'day') : false);
  const entryDatePicker = (
    <DatePicker
      value={entryDate}
      onChange={(d) => { if (d) setSelectedEntryDate(d.format('YYYY-MM-DD')); }}
      disabledDate={disabledEntryDate}
      format={dateFormat}
      allowClear={false}
    />
  );

  if (!selectedDateHeader && !header) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>{isToday ? "Today's DPR" : 'DPR Entry'}</Typography.Title>
          {entryDatePicker}
        </div>
        <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />
        <RequireAttendance projectId={selectedProjectId}>
          <Card>
            <Form.Item label="Supervisor Name" style={{ marginBottom: 16 }}>
              <Input size="large" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Name of supervisor" />
            </Form.Item>
            <Form.Item label="No work today (rain / holiday / shutdown)" style={{ marginBottom: 16 }}>
              <Switch checked={noWork} onChange={setNoWork} />
            </Form.Item>
            {noWork && (
              <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
                <Select
                  style={{ width: '100%' }}
                  value={noWorkReasonKind}
                  onChange={setNoWorkReasonKind}
                  options={NO_WORK_REASONS.map((r) => ({ value: r, label: r }))}
                />
                {noWorkReasonKind === 'Other' && (
                  <Input placeholder="Reason for no work" value={noWorkReasonCustom} onChange={(e) => setNoWorkReasonCustom(e.target.value)} />
                )}
              </Space>
            )}
            <Empty description={`No DPR started for ${fmtDate(entryDateStr)} yet`}>
              <Button type="primary" size="large" loading={createHeader.isPending} onClick={handleStart}>
                {isToday ? "Start Today's DPR" : `Start DPR for ${fmtDate(entryDateStr)}`}
              </Button>
            </Empty>
          </Card>
        </RequireAttendance>
      </div>
    );
  }

  const isSubmitted = header?.status !== 'DRAFT';

  const tabItems = [
    {
      key: 'production',
      label: 'Production',
      children: currentDprHeaderId ? <ProductionTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} /> : null,
    },
    {
      key: 'attendance',
      label: 'Attendance',
      children: selectedProjectId ? <AttendanceTab projectId={selectedProjectId} entryDate={entryDateStr} isSubmitted={isSubmitted} /> : null,
    },
    {
      key: 'labour',
      label: 'Labour',
      children: currentDprHeaderId && selectedProjectId
        ? <LabourTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} />
        : null,
    },
    {
      key: 'materials',
      label: 'Materials',
      children: currentDprHeaderId ? <MaterialsTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} /> : null,
    },
    {
      key: 'machinery',
      label: 'Machinery',
      children: currentDprHeaderId ? <MachineryTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} /> : null,
    },
    {
      key: 'measurements',
      label: 'Measurements',
      children: selectedProjectId ? <MeasurementsTab projectId={selectedProjectId} entryDate={entryDateStr} isSubmitted={isSubmitted} /> : null,
    },
    {
      key: 'issues',
      label: 'Issues',
      children: currentDprHeaderId ? <IssuesTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} /> : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {isToday ? "Today's DPR" : 'DPR'} — {fmtDate(entryDateStr)}
        </Typography.Title>
        <Space>
          {entryDatePicker}
          <Tag color={header?.status === 'APPROVED' ? 'green' : header?.status === 'SUBMITTED' ? 'blue' : 'default'}>
            {header?.status ?? 'DRAFT'}
          </Tag>
        </Space>
      </div>
      <ProjectSelector style={{ marginBottom: 12, width: '100%' }} />

      <Form.Item label="Supervisor Name" style={{ marginBottom: 12 }}>
        <Input
          value={supervisorName}
          onChange={(e) => setSupervisorName(e.target.value)}
          onBlur={handleSupervisorBlur}
          disabled={isSubmitted}
          placeholder="Name of supervisor"
        />
      </Form.Item>

      <Form.Item label="No work today (rain / holiday / shutdown)" style={{ marginBottom: 12 }}>
        <Switch checked={noWork} onChange={handleMarkNoWork} disabled={isSubmitted || updateHeader.isPending} />
      </Form.Item>

      {noWork && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Select
            style={{ width: '100%' }}
            value={noWorkReasonKind}
            onChange={(v) => {
              setNoWorkReasonKind(v);
              if (currentDprHeaderId && !isSubmitted) {
                updateHeader.mutate({ headerId: currentDprHeaderId, data: { no_work: true, no_work_reason: v === 'Other' ? noWorkReasonCustom.trim() || v : v } });
              }
            }}
            options={NO_WORK_REASONS.map((r) => ({ value: r, label: r }))}
            disabled={isSubmitted}
          />
          {noWorkReasonKind === 'Other' && (
            <Input
              placeholder="Reason for no work"
              value={noWorkReasonCustom}
              onChange={(e) => setNoWorkReasonCustom(e.target.value)}
              onBlur={() => {
                if (currentDprHeaderId && !isSubmitted) {
                  updateHeader.mutate({ headerId: currentDprHeaderId, data: { no_work: true, no_work_reason: noWorkReasonCustom.trim() || 'Other' } });
                }
              }}
              disabled={isSubmitted}
            />
          )}
        </Space>
      )}

      {noWork ? (
        <Card>
          <Typography.Text>
            No work was carried out on this date. Reason: <strong>{header?.no_work_reason ?? computedNoWorkReason}</strong>
          </Typography.Text>
        </Card>
      ) : (
        <Tabs
          defaultActiveKey="production"
          onChange={(key) => {
            if (currentDprHeaderId && (key === 'production' || key === 'measurements')) {
              queryClient.invalidateQueries({ queryKey: ['dpr-production', currentDprHeaderId] });
              queryClient.invalidateQueries({ queryKey: ['dpr-measurements', currentDprHeaderId] });
            }
          }}
          items={tabItems.map((tab) =>
            tab.key === 'attendance'
              ? tab
              : {
                  ...tab,
                  children: tab.children ? (
                    <RequireAttendance projectId={selectedProjectId}>{tab.children}</RequireAttendance>
                  ) : null,
                },
          )}
        />
      )}

      {!isSubmitted && (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Button danger block size="large" loading={submitDpr.isPending} onClick={handleSubmit}>
            Submit Today's DPR
          </Button>
          <Popconfirm
            title="Delete this DPR?"
            description="All entries for this date will be permanently deleted."
            onConfirm={handleDeleteDpr}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button block size="large" loading={deleteHeader.isPending}>
              Delete this DPR
            </Button>
          </Popconfirm>
        </Space>
      )}
    </div>
  );
}
