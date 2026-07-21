import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AimOutlined, CameraOutlined, CheckCircleOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, EyeOutlined, FileTextOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
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
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { getApiErrorMessage } from '@/utils/api-error';
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
  useUpdateDprMaterialRates,
  useDeleteDprMaterial,
  useAddDprMachinery,
  useUpdateDprMachinery,
  useDeleteDprMachinery,
  type IssueSeverity,
  type DprMaterialRead,
  type DprMachineryRead,
  type DprIssueRead,
  type DprHeaderRead,
} from '@/api/hooks/useDpr';
import {
  useDprLabour,
  useAddDprLabour,
  useUpdateDprLabour,
  useDeleteDprLabour,
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
import { useBoqSections, useBoqItems, useConstructionTemplates, type BoqItemRead, type BoqSectionRead } from '@/api/hooks/useBoq';
import { useMaterials, useMachinery, useUoms, useWorkTypes, useExpenseCategories, MACHINERY_HIRE_UNIT_LABELS } from '@/api/hooks/useMasters';
import {
  useExpensesByHeader,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  type ExpenseRead,
} from '@/api/hooks/useExpenses';
import {
  useCreateMeasurement,
  useMeasurements,
  useUpdateMeasurement,
  useUpdateMeasurementNotes,
  useDeleteMeasurement,
  type MeasurementRead,
} from '@/api/hooks/useMeasurements';
import { useAttachPhoto } from '@/api/hooks/usePhotos';
import { useProjects } from '@/api/hooks/useProjects';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { useUserDirectory } from '@/api/hooks/useUsers';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { calculateQuantity, evaluateExpression, isArithmeticExpression, ExpressionError } from '@/features/measurements/formulaEngine';
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

const ALL_DIM_FIELDS = ['nos', 'l', 'b', 'd'] as const;

const DIM_ABBREV: Record<string, string> = {
  nos: 'No', l: 'L', b: 'B', d: 'D',
};

// Table `components.table` overrides MUST be referentially stable across
// renders — antd/@rc-component/table keys its internal `TableComponent` off
// this object's identity (see Table.js: `getComponent(['table'], 'table')`,
// memoized on `[components]`). An inline `components={{ table: fn }}` object
// gets a new identity every render, which makes the library unmount and
// remount the entire <table> DOM subtree on every keystroke — dropping
// focus, discarding in-flight input, and adding visible typing lag. Module
// scope keeps identity fixed for the component's lifetime.
function makeFixedTableComponents(minWidth: number) {
  return {
    table: ({ style, ...rest }: React.HTMLAttributes<HTMLTableElement>) => (
      <table {...rest} style={{ ...style, tableLayout: 'fixed' as const, width: '100%', minWidth }} />
    ),
  };
}
const LABOUR_TABLE_COMPONENTS = makeFixedTableComponents(968);
const MATERIALS_TABLE_COMPONENTS = makeFixedTableComponents(710);
const MACHINERY_TABLE_COMPONENTS = makeFixedTableComponents(728);
const ISSUES_TABLE_COMPONENTS = makeFixedTableComponents(648);
const EXPENSES_TABLE_COMPONENTS = makeFixedTableComponents(750);
const MEASUREMENTS_TABLE_COMPONENTS = makeFixedTableComponents(946);
const PRODUCTION_TABLE_COMPONENTS = makeFixedTableComponents(1000);

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
  isActive,
}: {
  projectId: string;
  entryDate: string;
  isSubmitted: boolean;
  isActive: boolean;
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
  const workerSelectRef = useRef<{ focus?: () => void } | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    if (!isActive || isSubmitted) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        workerSelectRef.current?.focus?.();
      });
    });
  }, [isActive, isSubmitted]);

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
  }, []);  

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
          message.error(getApiErrorMessage(err, 'Check-in failed for one worker'));
        }
      }
      if (success > 0) message.success(`${success} worker(s) checked in successfully`);
      setSelectedWorkerIds([]);
      setPhoto(null);
      setPhotoPreviewUrl(null);
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Check-in failed'));
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
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not mark workers present'));
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
                ref={(el) => { workerSelectRef.current = el; }}
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
                    } catch (err) {
                      message.error(getApiErrorMessage(err, 'Could not remove record'));
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
  projectId,
  isSubmitted,
  isActive,
}: {
  headerId: string;
  projectId: string;
  isSubmitted: boolean;
  isActive: boolean;
}) {
  const { data: entries, isLoading } = useDprLabour(headerId);
  const { data: workers } = useWorkers(projectId);
  const updateLabour = useUpdateDprLabour();
  const addLabour = useAddDprLabour();
  const deleteLabour = useDeleteDprLabour();
  const { fmtAmt, symbol } = useNumberFormat();
  const { fmtDateTime } = useDateFormat();
  const { token } = theme.useToken();

  const [drafts, setDrafts] = useState<LabourDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const fieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  // StrictMode double-invokes effects in dev; without this guard the
  // "auto-create if empty" branch fires twice before `drafts` state from
  // the first invocation is visible to the second, adding two blank rows.
  const autoCreatedForActivationRef = useRef(false);
  const dropdownOpenRef = useRef<Record<string, boolean>>({});

  const focusField = (key: string, field: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fieldRefs.current[`${key}:${field}`]?.focus?.();
      });
    });
  };

  const existingWorkerIds = new Set((entries ?? []).map((e) => e.worker_id));
  const workerById = new Map((workers ?? []).map((w) => [w.id, w]));
  const availableWorkers = (workers ?? []).filter((w) => !existingWorkerIds.has(w.id));

  const totalAmount = (entries ?? []).reduce(
    (s, e) => s + parseFloat(e.amount || '0') + parseFloat(e.overtime_amount || '0'), 0,
  );

  const patchDraft = (key: string, patch: Partial<LabourDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addBlankDraft = () => {
    const key = nextLabourKey();
    setDrafts((p) => [...p, { key, worker_id: null, quantity: null, rate: null, overtime_amount: null }]);
    return key;
  };

  const addBlankDraftAndFocus = () => {
    const key = addBlankDraft();
    focusField(key, 'worker');
    return key;
  };

  const saveDraft = async (draft: LabourDraftRow): Promise<boolean> => {
    if (!draft.worker_id || draft.quantity == null || draft.rate == null) {
      message.warning('Worker, quantity and rate are required');
      return false;
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      await addLabour.mutateAsync({
        headerId,
        data: {
          worker_id: draft.worker_id,
          quantity: String(draft.quantity),
          rate: String(draft.rate),
          ...(draft.overtime_amount != null ? { overtime_amount: String(draft.overtime_amount) } : {}),
        },
      });
      removeDraft(draft.key);
      return true;
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not add labour entry'));
      return false;
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const saveDraftAndAdvance = async (draft: LabourDraftRow) => {
    const ok = await saveDraft(draft);
    if (ok) {
      addBlankDraftAndFocus();
    }
  };

  const LABOUR_FIELD_ORDER = ['worker', 'qty', 'rate', 'overtime_amount'];
  const handleDraftKeyDown = (e: React.KeyboardEvent, draft: LabourDraftRow, field: string) => {
    if (e.key !== 'Enter') return;
    if (dropdownOpenRef.current[`${draft.key}:${field}`]) return; // let Select confirm its highlighted option first
    e.preventDefault();
    const idx = LABOUR_FIELD_ORDER.indexOf(field);
    if (idx < LABOUR_FIELD_ORDER.length - 1) {
      fieldRefs.current[`${draft.key}:${LABOUR_FIELD_ORDER[idx + 1]}`]?.focus?.();
    } else {
      saveDraftAndAdvance(draft);
    }
  };

  useEffect(() => {
    if (!isActive || isSubmitted) { autoCreatedForActivationRef.current = false; return; }
    if (drafts.length === 0) {
      if (!autoCreatedForActivationRef.current) {
        autoCreatedForActivationRef.current = true;
         
        addBlankDraftAndFocus();
      }
    } else {
      autoCreatedForActivationRef.current = true;
      focusField(drafts[0].key, 'worker');
    }
    // Only react to this tab becoming active, not to every drafts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted]);

  const handleQtyChange = async (entry: DprLabourRead, qty: number | null) => {
    if (qty == null) return;
    try {
      await updateLabour.mutateAsync({ itemId: entry.id, data: { quantity: String(qty), rate: entry.rate } });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const handleRateChange = async (entry: DprLabourRead, rate: number | null) => {
    if (rate == null) return;
    try {
      await updateLabour.mutateAsync({ itemId: entry.id, data: { quantity: entry.quantity, rate: String(rate) } });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update rate')); }
  };

  const handleDelete = async (entry: DprLabourRead) => {
    try { await deleteLabour.mutateAsync({ itemId: entry.id, headerId }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not delete labour entry')); }
  };

  const rows: LabourRow[] = [
    ...(entries ?? []).map((e): LabourRow => ({ _kind: 'existing', entry: e })),
    ...drafts.map((d): LabourRow => ({ _kind: 'draft', draft: d })),
  ];

  const inp = { width: '100%' };

  const columns: TableColumnsType<LabourRow> = [
    {
      title: 'Worker', key: 'worker', width: 160,
      render: (_: unknown, row: LabourRow) =>
        row._kind === 'existing' ? (
          <Space size={4}>
            <Typography.Text>{row.entry.worker_name}</Typography.Text>
            {row.entry.edited_by && (
              <Tooltip title={`Edited by ${row.entry.edited_by_name ?? 'Unknown'}${row.entry.edited_at ? ` on ${fmtDateTime(row.entry.edited_at)}` : ''}`}>
                <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Edited</Tag>
              </Tooltip>
            )}
          </Space>
        ) : (
          <Select
            ref={(el) => { fieldRefs.current[`${row.draft.key}:worker`] = el; }}
            size="small" showSearch optionFilterProp="label" style={inp}
            placeholder="Select worker…"
            value={row.draft.worker_id ?? undefined}
            onChange={(v) => {
              const w = workerById.get(v);
              patchDraft(row.draft.key, {
                worker_id: v,
                quantity: row.draft.quantity ?? 1,
                rate: w?.default_rate != null ? parseFloat(w.default_rate) : row.draft.rate,
              });
            }}
            onDropdownVisibleChange={(open) => { dropdownOpenRef.current[`${row.draft.key}:worker`] = open; }}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'worker')}
            options={availableWorkers.map((w) => ({ value: w.id, label: w.full_name }))}
          />
        ),
    },
    {
      title: 'Type', key: 'type', width: 110,
      render: (_: unknown, row: LabourRow) => {
        const t = row._kind === 'existing'
          ? row.entry.worker_type
          : (row.draft.worker_id ? workerById.get(row.draft.worker_id)?.worker_type : null);
        return t
          ? <Tag color={t === 'NORMAL' ? 'blue' : t === 'CONTRACTOR' ? 'orange' : 'purple'}>{t}</Tag>
          : null;
      },
    },
    {
      title: 'Unit', key: 'unit', width: 60,
      render: (_: unknown, row: LabourRow) =>
        row._kind === 'existing'
          ? (row.entry.wage_unit ?? 'DAY')
          : (row.draft.worker_id ? (workerById.get(row.draft.worker_id)?.wage_unit ?? 'DAY') : null),
    },
    {
      title: 'Qty', key: 'qty', width: 100,
      render: (_: unknown, row: LabourRow) =>
        row._kind === 'existing' ? (
          isSubmitted ? (
            <span>{row.entry.quantity}</span>
          ) : (
            <InputNumber
              size="small" min={0} step={row.entry.wage_unit === 'HOUR' ? 0.5 : 1}
              value={parseFloat(row.entry.quantity)} style={{ width: 80 }}
              onChange={(v) => handleQtyChange(row.entry, v)}
            />
          )
        ) : (
          <InputNumber
            ref={(el) => { fieldRefs.current[`${row.draft.key}:qty`] = el; }}
            size="small" min={0} step={1} style={inp} placeholder="1"
            value={row.draft.quantity ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { quantity: v })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'qty')}
          />
        ),
    },
    {
      title: `Rate (${symbol})`, key: 'rate', width: 110, align: 'right' as const,
      render: (_: unknown, row: LabourRow) =>
        row._kind === 'existing' ? (
          isSubmitted ? (
            <span>{fmtAmt(row.entry.rate)}</span>
          ) : (
            <InputNumber
              size="small" min={0} precision={2} value={parseFloat(row.entry.rate)} style={{ width: 90 }}
              onBlur={(e) => handleRateChange(row.entry, parseFloat(e.target.value))}
              onPressEnter={(e) => handleRateChange(row.entry, parseFloat((e.target as HTMLInputElement).value))}
            />
          )
        ) : (
          <InputNumber
            ref={(el) => { fieldRefs.current[`${row.draft.key}:rate`] = el; }}
            size="small" min={0} precision={2} style={inp} placeholder="Rate"
            value={row.draft.rate ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { rate: v })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'rate')}
          />
        ),
    },
    {
      title: `Amount (${symbol})`, key: 'amount', width: 110, align: 'right' as const,
      render: (_: unknown, row: LabourRow) => {
        if (row._kind === 'existing') return fmtAmt(row.entry.amount);
        const amt = (row.draft.quantity ?? 0) * (row.draft.rate ?? 0);
        return row.draft.quantity != null && row.draft.rate != null
          ? <Typography.Text type="secondary">{fmtAmt(amt)}</Typography.Text>
          : <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      title: `OT Amount (${symbol})`, key: 'overtime_amount', width: 120, align: 'right' as const,
      render: (_: unknown, row: LabourRow) =>
        row._kind === 'existing' ? (
          isSubmitted ? (
            <span>{row.entry.overtime_amount != null ? fmtAmt(parseFloat(row.entry.overtime_amount)) : '—'}</span>
          ) : (
            <InputNumber
              size="small" min={0} precision={2}
              value={row.entry.overtime_amount != null ? parseFloat(row.entry.overtime_amount) : undefined}
              style={{ width: 90 }} placeholder="0.00"
              onChange={async (v) => {
                try {
                  await updateLabour.mutateAsync({
                    itemId: row.entry.id,
                    data: { overtime_amount: v != null ? String(v) : null },
                  });
                } catch (err) { message.error(getApiErrorMessage(err, 'Could not update overtime')); }
              }}
            />
          )
        ) : (
          <InputNumber
            ref={(el) => { fieldRefs.current[`${row.draft.key}:overtime_amount`] = el; }}
            size="small" min={0} precision={2} style={inp} placeholder="0.00"
            value={row.draft.overtime_amount ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { overtime_amount: v })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'overtime_amount')}
          />
        ),
    },
    {
      title: 'Contractor Workers', key: 'cw', width: 130,
      render: (_: unknown, row: LabourRow) => {
        if (row._kind === 'draft') return null;
        return isSubmitted ? (
          <span>{row.entry.contractor_workers_count ?? '—'}</span>
        ) : (
          <InputNumber
            size="small" min={0} value={row.entry.contractor_workers_count ?? undefined}
            style={{ width: 80 }} placeholder="0"
            onChange={async (v) => {
              try {
                await updateLabour.mutateAsync({ itemId: row.entry.id, data: { contractor_workers_count: v ?? null } });
              } catch { /* silent */ }
            }}
          />
        );
      },
    },
    {
      title: '', key: 'actions', width: 68,
      render: (_: unknown, row: LabourRow) => {
        if (row._kind === 'existing') {
          if (isSubmitted) return null;
          return (
            <Popconfirm
              title="Delete this labour entry?"
              onConfirm={() => handleDelete(row.entry)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={deleteLabour.isPending} />
            </Popconfirm>
          );
        }
        return (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: token.colorSuccess }}
              loading={savingKeys.has(row.draft.key)} onClick={() => saveDraft(row.draft)} />
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
          <Typography.Text strong style={{ fontSize: 14 }}>Labour</Typography.Text>
          <Tag style={{ margin: 0, fontSize: 11 }}>{(entries ?? []).length} worker{(entries ?? []).length !== 1 ? 's' : ''}</Tag>
        </span>
        {!isSubmitted && (
          <Button
            size="small" icon={<PlusOutlined />}
            onClick={() => addBlankDraftAndFocus()}>
            Add Labour
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — labour entries are locked." />}
      <Table<LabourRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: true }}
        components={LABOUR_TABLE_COMPONENTS}
        locale={{ emptyText: 'No entries yet — check in workers from the Attendance tab or click "Add Labour" above' }}
        summary={totalAmount > 0 ? () => (
          <Table.Summary>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={5}>Total Labour Cost</Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
              <Table.Summary.Cell index={6} align="right">{fmtAmt(totalAmount)}</Table.Summary.Cell>
              <Table.Summary.Cell index={7} />
              {!isSubmitted && <Table.Summary.Cell index={8} />}
            </Table.Summary.Row>
          </Table.Summary>
        ) : undefined}
      />
    </div>
  );
}

// ─── Draft row types / key counters for inline editing ───────────────────────

let _labourSeq = 0;
const nextLabourKey = () => `lab-${++_labourSeq}`;
let _matSeq = 0;
const nextMatKey = () => `mt-${++_matSeq}`;
let _machSeq = 0;
const nextMachKey = () => `mch-${++_machSeq}`;
let _measSeq = 0;
const nextMeasKey = () => `ms-${++_measSeq}`;
let _issueSeq = 0;
const nextIssueKey = () => `iss-${++_issueSeq}`;

interface LabourDraftRow { key: string; worker_id: string | null; quantity: number | null; rate: number | null; overtime_amount: number | null; }
interface MatDraftRow { key: string; material_id: string | null; qty: number | null; uom_id: string | null; rate: number | null; }
interface MachDraftRow { key: string; machinery_id: string | null; qty: number | null; hire_rate: number | null; hire_unit: string | null; }
interface SteelLineDraft { key: string; description: string; diameter_mm: number | null; bar_count: number | null; length_m: number | null; }
let steelDraftKeyCounter = 0;
const nextSteelDraftKey = () => `sl-${++steelDraftKeyCounter}`;
function computeSteelTotalMt(lines: SteelLineDraft[], coeffMap: Record<number, number>): number {
  return lines.reduce((sum, l) => {
    if (!l.diameter_mm || !l.bar_count || !l.length_m) return sum;
    return sum + l.bar_count * l.length_m * (coeffMap[l.diameter_mm] ?? 0);
  }, 0);
}
interface MeasDraftRow { key: string; boq_item_id: string | null; boq_template_id: string | null; dimensions: Record<string, number>; dimensionText: Record<string, string>; steel_lines: SteelLineDraft[]; chainage: string; qty: number | null; rate: number | null; }
interface IssueDraftRow { key: string; description: string; severity: IssueSeverity | null; }
type LabourRow = { _kind: 'existing'; entry: DprLabourRead } | { _kind: 'draft'; draft: LabourDraftRow };
interface AutoMaterialGroupSummary {
  key: string;
  materialId: string;
  uomId: string;
  name: string;
  uomCode: string;
  totalQty: number;
  totalAmount: number;
  hasRate: boolean;
  // The underlying DprMaterial rows this summary aggregates, plus their shared
  // cost rate (null when the group's rows disagree) — used to make the cost
  // editable across the whole group in one shot.
  entryIds: string[];
  rate: number | null;
  mixedRate: boolean;
}
type MatRow =
  | { _kind: 'existing'; entry: DprMaterialRead }
  | { _kind: 'draft'; draft: MatDraftRow }
  | { _kind: 'group-header'; key: string; label: string }
  | { _kind: 'auto-summary'; key: string; summary: AutoMaterialGroupSummary };
type MachRow = { _kind: 'existing'; entry: DprMachineryRead } | { _kind: 'draft'; draft: MachDraftRow };
type MeasRow = { _kind: 'existing'; entry: MeasurementRead } | { _kind: 'draft'; draft: MeasDraftRow };
type IssueRow = { _kind: 'existing'; entry: DprIssueRead } | { _kind: 'draft'; draft: IssueDraftRow };

// ─── Materials Tab ────────────────────────────────────────────────────────────

function MaterialsTab({
  headerId,
  isSubmitted,
  isActive,
}: {
  headerId: string;
  isSubmitted: boolean;
  isActive: boolean;
}) {
  const { data: header } = useDprHeader(headerId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const { data: measurements } = useMeasurements(header?.project_id ?? null);
  const { data: boqItems } = useBoqItems(header?.project_id ?? null);
  const { data: userDirectory } = useUserDirectory();
  const addMaterial = useAddDprMaterial();
  const updateMaterial = useUpdateDprMaterial();
  const updateMaterialRates = useUpdateDprMaterialRates();
  const deleteMaterial = useDeleteDprMaterial();
  const { fmtAmt, symbol } = useNumberFormat();
  const { fmtDateTime } = useDateFormat();
  const { token } = theme.useToken();
  const [drafts, setDrafts] = useState<MatDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const fieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  // StrictMode double-invokes effects in dev; without this guard the
  // "auto-create if empty" branch fires twice before `drafts` state from
  // the first invocation is visible to the second, adding two blank rows.
  const autoCreatedForActivationRef = useRef(false);
  const dropdownOpenRef = useRef<Record<string, boolean>>({});

  const focusField = (key: string, field: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fieldRefs.current[`${key}:${field}`]?.focus?.();
      });
    });
  };

  const existingQtyRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  const focusExistingQty = (entryId: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        existingQtyRefs.current[entryId]?.focus?.();
      });
    });
  };

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const boqById = new Map((boqItems ?? []).map((b) => [b.id, b]));
  const measurementById = new Map((measurements ?? []).map((m) => [m.id, m]));
  const uomCodeById = new Map((uoms ?? []).map((u) => [u.id, u.code]));
  const userById = new Map((userDirectory ?? []).map((u) => [u.id, u.full_name]));
  const entries = header?.materials ?? [];
  const totalCost = entries.reduce((s, e) => s + (e.rate ? parseFloat(e.rate) * parseFloat(e.qty_consumed) : 0), 0);

  const isAutoEntry = (e: DprMaterialRead) => !e.manually_edited && !!e.source_measurement_id;
  const manualEntries = entries.filter((e) => !isAutoEntry(e));
  const autoEntries = entries.filter(isAutoEntry);

  // Auto-populated materials are grouped by (BOQ item, template used) — the
  // source measurement carries both — then summed per material within each
  // group, so the same material added across several measurements of the
  // same BOQ+template shows as one row instead of repeating.
  const autoGroups = new Map<string, { boqLabel: string; templateLabel: string; materials: Map<string, AutoMaterialGroupSummary> }>();
  for (const e of autoEntries) {
    const measurement = e.source_measurement_id ? measurementById.get(e.source_measurement_id) : undefined;
    const boqItem = measurement ? boqById.get(measurement.boq_item_id) : undefined;
    const groupKey = measurement ? `${measurement.boq_item_id}:${measurement.boq_template_id ?? 'none'}` : 'unknown';
    let group = autoGroups.get(groupKey);
    if (!group) {
      group = {
        boqLabel: boqItem ? `${boqItem.item_no} — ${boqItem.description}` : 'Unknown BOQ item',
        templateLabel: measurement?.boq_template_name ?? '',
        materials: new Map(),
      };
      autoGroups.set(groupKey, group);
    }
    const matKey = `${e.material_id}:${e.uom_id}`;
    const qty = parseFloat(e.qty_consumed) || 0;
    const rate = e.rate != null ? parseFloat(e.rate) : null;
    const existingSummary = group.materials.get(matKey);
    if (existingSummary) {
      existingSummary.totalQty += qty;
      existingSummary.totalAmount += rate != null ? qty * rate : 0;
      existingSummary.hasRate = existingSummary.hasRate || rate != null;
      existingSummary.entryIds.push(e.id);
      if (existingSummary.rate !== rate) existingSummary.mixedRate = true;
    } else {
      group.materials.set(matKey, {
        key: `${groupKey}:${matKey}`,
        materialId: e.material_id,
        uomId: e.uom_id,
        name: materialById.get(e.material_id)?.name ?? e.material_id,
        uomCode: uomCodeById.get(e.uom_id) ?? '',
        totalQty: qty,
        totalAmount: rate != null ? qty * rate : 0,
        hasRate: rate != null,
        entryIds: [e.id],
        rate,
        mixedRate: false,
      });
    }
  }

  const autoGroupRows: MatRow[] = [];
  const sortedGroups = [...autoGroups.entries()].sort((a, b) => a[1].boqLabel.localeCompare(b[1].boqLabel));
  for (const [groupKey, group] of sortedGroups) {
    const label = group.templateLabel ? `${group.boqLabel} · Template: ${group.templateLabel}` : group.boqLabel;
    autoGroupRows.push({ _kind: 'group-header', key: `grp-${groupKey}`, label });
    const summaries = [...group.materials.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const s of summaries) {
      autoGroupRows.push({ _kind: 'auto-summary', key: s.key, summary: s });
    }
  }

  const patchDraft = (key: string, patch: Partial<MatDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addBlankDraft = () => {
    const key = nextMatKey();
    setDrafts((p) => [...p, { key, material_id: null, qty: null, uom_id: null, rate: null }]);
    return key;
  };

  const addBlankDraftAndFocus = () => {
    const key = addBlankDraft();
    focusField(key, 'material');
    return key;
  };

  const saveDraft = async (draft: MatDraftRow): Promise<boolean> => {
    if (!draft.material_id || draft.qty == null || !draft.uom_id) { message.warning('Material, quantity and unit are required'); return false; }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      await addMaterial.mutateAsync({ headerId, data: { material_id: draft.material_id, qty_consumed: String(draft.qty), uom_id: draft.uom_id, rate: draft.rate != null ? String(draft.rate) : undefined } });
      removeDraft(draft.key);
      return true;
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not add entry')); return false; }
    finally { setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; }); }
  };

  const saveDraftAndAdvance = async (draft: MatDraftRow) => {
    const ok = await saveDraft(draft);
    if (ok) { addBlankDraftAndFocus(); }
  };

  const MATERIAL_FIELD_ORDER = ['material', 'qty', 'rate'];
  const handleDraftKeyDown = (e: React.KeyboardEvent, draft: MatDraftRow, field: string) => {
    if (e.key !== 'Enter') return;
    if (dropdownOpenRef.current[`${draft.key}:${field}`]) return; // let Select confirm its highlighted option first
    e.preventDefault();
    const idx = MATERIAL_FIELD_ORDER.indexOf(field);
    if (idx < MATERIAL_FIELD_ORDER.length - 1) {
      fieldRefs.current[`${draft.key}:${MATERIAL_FIELD_ORDER[idx + 1]}`]?.focus?.();
    } else {
      saveDraftAndAdvance(draft);
    }
  };

  useEffect(() => {
    if (!isActive || isSubmitted) { autoCreatedForActivationRef.current = false; return; }
    if (drafts.length === 0) {
      if (!autoCreatedForActivationRef.current) {
        autoCreatedForActivationRef.current = true;
         
        addBlankDraftAndFocus();
      }
    } else {
      autoCreatedForActivationRef.current = true;
      focusField(drafts[0].key, 'material');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted]);

  const saveQty = async (entry: DprMaterialRead, raw: string) => {
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty === parseFloat(entry.qty_consumed)) return;
    try { await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: String(qty), uom_id: entry.uom_id, rate: entry.rate ?? undefined } }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const saveRate = async (entry: DprMaterialRead, raw: string) => {
    const rate = raw ? parseFloat(raw) : null;
    if (rate === (entry.rate != null ? parseFloat(entry.rate) : null)) return;
    try { await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: entry.qty_consumed, uom_id: entry.uom_id, rate: rate != null ? String(rate) : undefined } }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  // Cost edit on an aggregated auto-material row — applies the one rate to
  // every underlying DprMaterial row in the group (marks them manually edited
  // so a plain dimensions re-sync keeps it; a template/item change still wipes).
  const saveAutoRate = async (summary: AutoMaterialGroupSummary, raw: string) => {
    const rate = raw !== '' ? parseFloat(raw) : null;
    if (!summary.mixedRate && rate === summary.rate) return;
    try {
      await updateMaterialRates.mutateAsync({
        headerId,
        ids: summary.entryIds,
        rate: rate != null ? String(rate) : null,
      });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update cost')); }
  };

  const handleDelete = async (entry: DprMaterialRead) => {
    try { await deleteMaterial.mutateAsync({ itemId: entry.id, headerId }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not delete')); }
  };

  const rows: MatRow[] = [
    ...manualEntries.map((e): MatRow => ({ _kind: 'existing', entry: e })),
    ...autoGroupRows,
    ...drafts.map((d): MatRow => ({ _kind: 'draft', draft: d })),
  ];

  const inp = { width: '100%' };

  const columns: TableColumnsType<MatRow> = [
    {
      title: '#', key: 'idx', width: 40,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 7 } : {},
      render: (_: unknown, row: MatRow, i: number) => {
        if (row._kind === 'group-header') return <Typography.Text strong style={{ fontSize: 12 }}>{row.label}</Typography.Text>;
        if (row._kind === 'auto-summary') return null;
        return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Typography.Text>;
      },
    },
    {
      title: 'Material', key: 'material', width: 180,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 0 } : {},
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'group-header') return null;
        if (row._kind === 'auto-summary') return (
          <Space size={4}>
            <Typography.Text>{row.summary.name}</Typography.Text>
            <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>Auto</Tag>
          </Space>
        );
        if (row._kind === 'existing') return (
          <Space size={4}>
            <Typography.Text>{materialById.get(row.entry.material_id)?.name ?? row.entry.material_id}</Typography.Text>
            {row.entry.edited_by && (
              <Tooltip title={`Edited by ${userById.get(row.entry.edited_by) ?? 'Unknown'}${row.entry.edited_at ? ` on ${fmtDateTime(row.entry.edited_at)}` : ''}`}>
                <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Edited</Tag>
              </Tooltip>
            )}
          </Space>
        );
        return (
          <Select
            ref={(el) => { fieldRefs.current[`${row.draft.key}:material`] = el; }}
            size="small" showSearch optionFilterProp="label" style={inp} placeholder="Select material…" value={row.draft.material_id}
            onChange={(v) => { const m = materialById.get(v); patchDraft(row.draft.key, { material_id: v, uom_id: m?.default_uom_id ?? null, rate: m?.cost_rate != null ? parseFloat(m.cost_rate) : null }); }}
            onDropdownVisibleChange={(open) => { dropdownOpenRef.current[`${row.draft.key}:material`] = open; }}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'material')}
            options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        );
      },
    },
    {
      title: 'Qty', key: 'qty', width: 100,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 0 } : {},
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'group-header') return null;
        if (row._kind === 'auto-summary') return <Typography.Text style={{ fontSize: 12 }}>{row.summary.totalQty.toFixed(3)}</Typography.Text>;
        if (row._kind === 'existing') {
          if (isSubmitted) return <Typography.Text style={{ fontSize: 12 }}>{parseFloat(row.entry.qty_consumed)}</Typography.Text>;
          return <InputNumber
            ref={(el) => { existingQtyRefs.current[row.entry.id] = el; }}
            key={`${row.entry.id}-q-${row.entry.qty_consumed}`} size="small" min={0} style={inp}
            defaultValue={parseFloat(row.entry.qty_consumed)} onBlur={(e) => saveQty(row.entry, e.target.value)} />;
        }
        return <InputNumber
          ref={(el) => { fieldRefs.current[`${row.draft.key}:qty`] = el; }}
          size="small" min={0} style={inp} placeholder="0" value={row.draft.qty} onChange={(v) => patchDraft(row.draft.key, { qty: v })}
          onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'qty')} />;
      },
    },
    {
      title: 'Unit', key: 'uom', width: 90,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 0 } : {},
      render: (_: unknown, row: MatRow) => {
        // Unit is always owned by the material master's default UOM — never
        // user-selectable, for manual or auto entries alike.
        if (row._kind === 'group-header') return null;
        if (row._kind === 'auto-summary') return <Typography.Text style={{ fontSize: 12 }}>{row.summary.uomCode}</Typography.Text>;
        if (row._kind === 'existing') {
          const uomCode = (uoms ?? []).find((u) => u.id === row.entry.uom_id)?.code ?? row.entry.uom_id;
          return <Typography.Text style={{ fontSize: 12 }}>{uomCode}</Typography.Text>;
        }
        const material = row.draft.material_id ? materialById.get(row.draft.material_id) : undefined;
        const uomCode = row.draft.uom_id ? (uoms ?? []).find((u) => u.id === row.draft.uom_id)?.code : undefined;
        return uomCode
          ? <Typography.Text style={{ fontSize: 12 }}>{uomCode}</Typography.Text>
          : <Typography.Text type="secondary" style={{ fontSize: 11 }}>{material ? '—' : 'Select material first'}</Typography.Text>;
      },
    },
    {
      title: `Rate (${symbol})`, key: 'rate', width: 110, align: 'right' as const,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 0 } : {},
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'group-header') return null;
        if (row._kind === 'auto-summary') {
          if (isSubmitted) {
            return <Typography.Text style={{ fontSize: 12 }}>{row.summary.mixedRate ? '—' : (row.summary.rate ?? '—')}</Typography.Text>;
          }
          return <InputNumber
            key={`${row.summary.key}-r-${row.summary.rate}-${row.summary.mixedRate}`}
            size="small" min={0} precision={2} style={inp}
            defaultValue={row.summary.mixedRate ? undefined : (row.summary.rate ?? undefined)}
            placeholder={row.summary.mixedRate ? 'mixed' : '—'}
            onBlur={(e) => saveAutoRate(row.summary, e.target.value)} />;
        }
        if (row._kind === 'existing') {
          if (isSubmitted) {
            const rateVal = row.entry.rate != null ? parseFloat(row.entry.rate) : null;
            return <Typography.Text style={{ fontSize: 12 }}>{rateVal != null ? rateVal : '—'}</Typography.Text>;
          }
          return <InputNumber key={`${row.entry.id}-r-${row.entry.rate}`} size="small" min={0} precision={2} style={inp}
            defaultValue={row.entry.rate != null ? parseFloat(row.entry.rate) : undefined} placeholder="—"
            onBlur={(e) => saveRate(row.entry, e.target.value)} />;
        }
        return <InputNumber
          ref={(el) => { fieldRefs.current[`${row.draft.key}:rate`] = el; }}
          size="small" min={0} precision={2} style={inp} placeholder="Rate (auto)" value={row.draft.rate} onChange={(v) => patchDraft(row.draft.key, { rate: v })}
          onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'rate')} />;
      },
    },
    {
      title: `Amount (${symbol})`, key: 'amount', width: 110, align: 'right' as const,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 0 } : {},
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'group-header') return null;
        if (row._kind === 'auto-summary') return <Typography.Text strong>{row.summary.hasRate ? fmtAmt(row.summary.totalAmount) : '—'}</Typography.Text>;
        if (row._kind === 'existing') {
          const amt = row.entry.rate != null ? parseFloat(row.entry.rate) * parseFloat(row.entry.qty_consumed) : null;
          return <Typography.Text strong>{amt != null ? fmtAmt(amt) : '—'}</Typography.Text>;
        }
        const amt = row.draft.rate != null && row.draft.qty != null ? row.draft.rate * row.draft.qty : null;
        return <Typography.Text type="secondary">{amt != null ? fmtAmt(amt) : '—'}</Typography.Text>;
      },
    },
    {
      title: '', key: 'actions', width: 80,
      onCell: (row) => row._kind === 'group-header' ? { colSpan: 0 } : {},
      render: (_: unknown, row: MatRow) => {
        if (row._kind === 'group-header' || row._kind === 'auto-summary') return null;
        if (row._kind === 'existing') {
          if (isSubmitted) return null;
          return (
            <Space size={4}>
              <Button size="small" type="text" icon={<EditOutlined />}
                title="Edit quantity"
                onClick={() => focusExistingQty(row.entry.id)} />
              <Popconfirm title="Delete this entry?" onConfirm={() => handleDelete(row.entry)} okText="Delete" okButtonProps={{ danger: true }}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={deleteMaterial.isPending} />
              </Popconfirm>
            </Space>
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
            onClick={() => addBlankDraftAndFocus()}>
            Add Material
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — material entries are locked." />}
      <Table<MatRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row._kind === 'draft' ? row.draft.key : row.key}
        size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: true }}
        components={MATERIALS_TABLE_COMPONENTS}
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
  isActive,
}: {
  headerId: string;
  isSubmitted: boolean;
  isActive: boolean;
}) {
  const { data: header } = useDprHeader(headerId);
  const { data: machinery } = useMachinery();
  const { data: userDirectory } = useUserDirectory();
  const addMachinery = useAddDprMachinery();
  const updateMachinery = useUpdateDprMachinery();
  const deleteMachinery = useDeleteDprMachinery();
  const { fmtAmt, symbol } = useNumberFormat();
  const { fmtDateTime } = useDateFormat();
  const { token } = theme.useToken();
  const [drafts, setDrafts] = useState<MachDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const fieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  // StrictMode double-invokes effects in dev; without this guard the
  // "auto-create if empty" branch fires twice before `drafts` state from
  // the first invocation is visible to the second, adding two blank rows.
  const autoCreatedForActivationRef = useRef(false);
  const dropdownOpenRef = useRef<Record<string, boolean>>({});

  const focusField = (key: string, field: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fieldRefs.current[`${key}:${field}`]?.focus?.();
      });
    });
  };

  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m]));
  const userById = new Map((userDirectory ?? []).map((u) => [u.id, u.full_name]));
  const entries = header?.machinery_entries ?? [];
  const totalCost = entries.reduce((s, e) => s + (e.hire_rate ? parseFloat(e.hire_rate) * parseFloat(e.quantity_used) : 0), 0);

  const patchDraft = (key: string, patch: Partial<MachDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addBlankDraft = () => {
    const key = nextMachKey();
    setDrafts((p) => [...p, { key, machinery_id: null, qty: null, hire_rate: null, hire_unit: null }]);
    return key;
  };

  const addBlankDraftAndFocus = () => {
    const key = addBlankDraft();
    focusField(key, 'machine');
    return key;
  };

  const saveDraft = async (draft: MachDraftRow): Promise<boolean> => {
    if (!draft.machinery_id || draft.qty == null) { message.warning('Machine and quantity are required'); return false; }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      await addMachinery.mutateAsync({ headerId, data: { machinery_id: draft.machinery_id, quantity_used: String(draft.qty), hire_rate: draft.hire_unit !== 'OWNED' && draft.hire_rate != null ? String(draft.hire_rate) : undefined } });
      removeDraft(draft.key);
      return true;
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not add entry')); return false; }
    finally { setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; }); }
  };

  const saveDraftAndAdvance = async (draft: MachDraftRow) => {
    const ok = await saveDraft(draft);
    if (ok) { addBlankDraftAndFocus(); }
  };

  const machineryFieldOrder = (draft: MachDraftRow) =>
    draft.hire_unit === 'OWNED' ? ['machine'] : ['machine', 'qty', 'hire_rate'];
  const handleDraftKeyDown = (e: React.KeyboardEvent, draft: MachDraftRow, field: string) => {
    if (e.key !== 'Enter') return;
    if (dropdownOpenRef.current[`${draft.key}:${field}`]) return; // let Select confirm its highlighted option first
    e.preventDefault();
    const order = machineryFieldOrder(draft);
    const idx = order.indexOf(field);
    if (idx < 0) return;
    if (idx < order.length - 1) {
      fieldRefs.current[`${draft.key}:${order[idx + 1]}`]?.focus?.();
    } else {
      saveDraftAndAdvance(draft);
    }
  };

  useEffect(() => {
    if (!isActive || isSubmitted) { autoCreatedForActivationRef.current = false; return; }
    if (drafts.length === 0) {
      if (!autoCreatedForActivationRef.current) {
        autoCreatedForActivationRef.current = true;
         
        addBlankDraftAndFocus();
      }
    } else {
      autoCreatedForActivationRef.current = true;
      focusField(drafts[0].key, 'machine');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted]);

  const saveQty = async (entry: DprMachineryRead, raw: string) => {
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty === parseFloat(entry.quantity_used)) return;
    try { await updateMachinery.mutateAsync({ itemId: entry.id, data: { quantity_used: String(qty), hire_rate: entry.hire_unit === 'OWNED' ? null : (entry.hire_rate ?? null) } }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const saveRate = async (entry: DprMachineryRead, raw: string) => {
    if (entry.hire_unit === 'OWNED') return;
    const rate = raw ? parseFloat(raw) : null;
    if (rate === (entry.hire_rate != null ? parseFloat(entry.hire_rate) : null)) return;
    try { await updateMachinery.mutateAsync({ itemId: entry.id, data: { quantity_used: entry.quantity_used, hire_rate: rate != null ? String(rate) : null } }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const handleDelete = async (entry: DprMachineryRead) => {
    try { await deleteMachinery.mutateAsync({ itemId: entry.id, headerId }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not delete')); }
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
      title: 'Machine', key: 'machine', width: 180,
      render: (_: unknown, row: MachRow) =>
        row._kind === 'existing' ? (
          <Space size={4}>
            <Typography.Text>{machineryById.get(row.entry.machinery_id)?.name ?? row.entry.machinery_id}</Typography.Text>
            {row.entry.edited_by && (
              <Tooltip title={`Edited by ${userById.get(row.entry.edited_by) ?? 'Unknown'}${row.entry.edited_at ? ` on ${fmtDateTime(row.entry.edited_at)}` : ''}`}>
                <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Edited</Tag>
              </Tooltip>
            )}
          </Space>
        ) : (
          <Select
            ref={(el) => { fieldRefs.current[`${row.draft.key}:machine`] = el; }}
            size="small" showSearch optionFilterProp="label" style={inp} placeholder="Select machine…" value={row.draft.machinery_id}
            onChange={(v) => {
              const m = machineryById.get(v);
              patchDraft(row.draft.key, { machinery_id: v, hire_unit: m?.hire_unit ?? null, qty: m?.hire_unit === 'OWNED' ? 1 : null, hire_rate: m?.hire_unit === 'OWNED' ? null : (m?.hire_rate ? parseFloat(m.hire_rate) : null) });
            }}
            onDropdownVisibleChange={(open) => { dropdownOpenRef.current[`${row.draft.key}:machine`] = open; }}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'machine')}
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
          <InputNumber
            ref={(el) => { fieldRefs.current[`${row.draft.key}:qty`] = el; }}
            size="small" min={0} style={inp} placeholder="0" value={row.draft.qty}
            disabled={row.draft.hire_unit === 'OWNED'} onChange={(v) => patchDraft(row.draft.key, { qty: v })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'qty')} />
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
        return <InputNumber
          ref={(el) => { fieldRefs.current[`${row.draft.key}:hire_rate`] = el; }}
          size="small" min={0} precision={2} style={inp} placeholder="Rate (auto)" value={row.draft.hire_rate} onChange={(v) => patchDraft(row.draft.key, { hire_rate: v })}
          onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'hire_rate')} />;
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
            onClick={() => addBlankDraftAndFocus()}>
            Add Machine
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — machinery entries are locked." />}
      <Table<MachRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: true }}
        components={MACHINERY_TABLE_COMPONENTS}
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
  isActive,
}: {
  headerId: string;
  isSubmitted: boolean;
  isActive: boolean;
}) {
  const { data: header } = useDprHeader(headerId);
  const addIssue = useAddDprIssue();
  const uploadPhoto = useUploadPhoto();
  const { token } = theme.useToken();
  const [drafts, setDrafts] = useState<IssueDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  // StrictMode double-invokes effects in dev; without this guard the
  // "auto-create if empty" branch fires twice before `drafts` state from
  // the first invocation is visible to the second, adding two blank rows.
  const autoCreatedForActivationRef = useRef(false);
  const dropdownOpenRef = useRef<Record<string, boolean>>({});

  const focusField = (key: string, field: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fieldRefs.current[`${key}:${field}`]?.focus?.();
      });
    });
  };

  const entries = header?.issues ?? [];

  const patchDraft = (key: string, patch: Partial<IssueDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addBlankDraft = () => {
    const key = nextIssueKey();
    setDrafts((p) => [...p, { key, description: '', severity: null }]);
    return key;
  };

  const addBlankDraftAndFocus = () => {
    const key = addBlankDraft();
    focusField(key, 'description');
    return key;
  };

  const saveDraft = async (draft: IssueDraftRow): Promise<boolean> => {
    if (!draft.description.trim() || !draft.severity) {
      message.warning('Description and severity are required');
      return false;
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
      return true;
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not log issue'));
      return false;
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const saveDraftAndAdvance = async (draft: IssueDraftRow) => {
    const ok = await saveDraft(draft);
    if (ok) { addBlankDraftAndFocus(); }
  };

  const ISSUE_FIELD_ORDER = ['description', 'severity'];
  const handleDraftKeyDown = (e: React.KeyboardEvent, draft: IssueDraftRow, field: string) => {
    if (e.key !== 'Enter') return;
    if (dropdownOpenRef.current[`${draft.key}:${field}`]) return; // let Select confirm its highlighted option first
    e.preventDefault();
    const idx = ISSUE_FIELD_ORDER.indexOf(field);
    if (idx < ISSUE_FIELD_ORDER.length - 1) {
      fieldRefs.current[`${draft.key}:${ISSUE_FIELD_ORDER[idx + 1]}`]?.focus?.();
    } else {
      saveDraftAndAdvance(draft);
    }
  };

  useEffect(() => {
    if (!isActive || isSubmitted) { autoCreatedForActivationRef.current = false; return; }
    if (drafts.length === 0) {
      if (!autoCreatedForActivationRef.current) {
        autoCreatedForActivationRef.current = true;
         
        addBlankDraftAndFocus();
      }
    } else {
      autoCreatedForActivationRef.current = true;
      focusField(drafts[0].key, 'description');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted]);

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
      title: 'Description', key: 'description', width: 240,
      render: (_: unknown, row: IssueRow) =>
        row._kind === 'existing' ? (
          <Typography.Text>{row.entry.description}</Typography.Text>
        ) : (
          <Input.TextArea
            ref={(el) => { fieldRefs.current[`${row.draft.key}:description`] = el; }}
            size="small" rows={1} autoSize={{ minRows: 1, maxRows: 3 }} style={inp}
            placeholder="Describe the issue or blocker…"
            value={row.draft.description}
            onChange={(e) => patchDraft(row.draft.key, { description: e.target.value })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'description')}
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
            ref={(el) => { fieldRefs.current[`${row.draft.key}:severity`] = el; }}
            size="small" style={inp} placeholder="Severity"
            value={row.draft.severity ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { severity: v })}
            onDropdownVisibleChange={(open) => { dropdownOpenRef.current[`${row.draft.key}:severity`] = open; }}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'severity')}
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
            onClick={() => addBlankDraftAndFocus()}>
            Add Issue
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — issues are locked." />}
      <Table<IssueRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: true }}
        components={ISSUES_TABLE_COMPONENTS}
        locale={{ emptyText: isSubmitted ? 'No issues logged' : 'No entries yet — click "Add Issue" above' }}
      />
    </div>
  );
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

let _expenseSeq = 0;
const nextExpenseKey = () => `exp-${++_expenseSeq}`;

interface ExpenseDraft {
  key: string;
  expense_category_id: string | null;
  amount: number | null;
  vendor_name: string;
  remarks: string;
}

type ExpRow =
  | { _kind: 'existing'; entry: ExpenseRead }
  | { _kind: 'draft'; draft: ExpenseDraft };

function ExpensesTab({ projectId, headerId, entryDate, isSubmitted, isActive }: { projectId: string; headerId: string; entryDate: string; isSubmitted: boolean; isActive: boolean }) {
  const { token } = theme.useToken();
  const { data: expenses, isLoading } = useExpensesByHeader(headerId);
  const { data: categories } = useExpenseCategories();
  const { data: userDirectory } = useUserDirectory();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const { fmtAmt, symbol } = useNumberFormat();
  const { fmtDateTime } = useDateFormat();

  const [drafts, setDrafts] = useState<ExpenseDraft[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpRow, setEditExpRow] = useState<{ expense_category_id: string | null; amount: number | null; vendor_name: string; remarks: string; }>({ expense_category_id: null, amount: null, vendor_name: '', remarks: '' });
  const [editExpSaving, setEditExpSaving] = useState(false);
  const fieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  // StrictMode double-invokes effects in dev; without this guard the
  // "auto-create if empty" branch fires twice before `drafts` state from
  // the first invocation is visible to the second, adding two blank rows.
  const autoCreatedForActivationRef = useRef(false);
  const dropdownOpenRef = useRef<Record<string, boolean>>({});

  const focusField = (key: string, field: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fieldRefs.current[`${key}:${field}`]?.focus?.();
      });
    });
  };

  const forDate = expenses ?? [];
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const userById = new Map((userDirectory ?? []).map((u) => [u.id, u.full_name]));
  const totalAmount = forDate.reduce((s, e) => s + parseFloat(e.amount || '0'), 0);

  const patchDraft = (key: string, patch: Partial<ExpenseDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addBlankDraft = () => {
    const key = nextExpenseKey();
    setDrafts((p) => [...p, { key, expense_category_id: null, amount: null, vendor_name: '', remarks: '' }]);
    return key;
  };

  const addBlankDraftAndFocus = () => {
    const key = addBlankDraft();
    focusField(key, 'category');
    return key;
  };

  const saveDraft = async (draft: ExpenseDraft): Promise<boolean> => {
    if (!draft.expense_category_id || draft.amount == null) {
      message.warning('Category and amount are required');
      return false;
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      await createExpense.mutateAsync({
        project_id: projectId,
        expense_category_id: draft.expense_category_id,
        amount: String(draft.amount),
        expense_date: entryDate,
        dpr_header_id: headerId,
        vendor_name: draft.vendor_name.trim() || undefined,
        remarks: draft.remarks.trim() || undefined,
      });
      removeDraft(draft.key);
      return true;
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not save expense'));
      return false;
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const saveDraftAndAdvance = async (draft: ExpenseDraft) => {
    const ok = await saveDraft(draft);
    if (ok) { addBlankDraftAndFocus(); }
  };

  const EXPENSE_FIELD_ORDER = ['category', 'amount', 'vendor', 'remarks'];
  const handleDraftKeyDown = (e: React.KeyboardEvent, draft: ExpenseDraft, field: string) => {
    if (e.key !== 'Enter') return;
    if (dropdownOpenRef.current[`${draft.key}:${field}`]) return; // let Select confirm its highlighted option first
    e.preventDefault();
    const idx = EXPENSE_FIELD_ORDER.indexOf(field);
    if (idx < EXPENSE_FIELD_ORDER.length - 1) {
      fieldRefs.current[`${draft.key}:${EXPENSE_FIELD_ORDER[idx + 1]}`]?.focus?.();
    } else {
      saveDraftAndAdvance(draft);
    }
  };

  useEffect(() => {
    if (!isActive || isSubmitted) { autoCreatedForActivationRef.current = false; return; }
    if (drafts.length === 0) {
      if (!autoCreatedForActivationRef.current) {
        autoCreatedForActivationRef.current = true;

        addBlankDraftAndFocus();
      }
    } else {
      autoCreatedForActivationRef.current = true;
      focusField(drafts[0].key, 'category');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted]);

  const startEditExpense = (expense: ExpenseRead) => {
    setEditingExpenseId(expense.id);
    setEditExpRow({
      expense_category_id: expense.expense_category_id,
      amount: parseFloat(expense.amount),
      vendor_name: expense.vendor_name ?? '',
      remarks: expense.remarks ?? '',
    });
  };

  const saveEditExpense = async (expense: ExpenseRead) => {
    if (!editExpRow.expense_category_id || editExpRow.amount == null) {
      message.warning('Category and amount are required');
      return;
    }
    setEditExpSaving(true);
    try {
      await updateExpense.mutateAsync({
        id: expense.id,
        data: {
          expense_category_id: editExpRow.expense_category_id,
          amount: String(editExpRow.amount),
          vendor_name: editExpRow.vendor_name.trim() || undefined,
          remarks: editExpRow.remarks.trim() || undefined,
        },
      });
      message.success('Updated');
      setEditingExpenseId(null);
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not update expense'));
    } finally {
      setEditExpSaving(false);
    }
  };

  const handleDelete = async (expense: ExpenseRead) => {
    try {
      await deleteExpense.mutateAsync({ id: expense.id, projectId: expense.project_id, headerId });
      message.success('Deleted');
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not delete expense'));
    }
  };

  const rows: ExpRow[] = [
    ...forDate.map((e): ExpRow => ({ _kind: 'existing', entry: e })),
    ...drafts.map((d): ExpRow => ({ _kind: 'draft', draft: d })),
  ];

  const inp = { width: '100%' };

  const columns: TableColumnsType<ExpRow> = [
    {
      title: 'Category',
      key: 'category',
      width: 180,
      render: (_: unknown, row: ExpRow) => {
        if (row._kind === 'existing') {
          if (editingExpenseId === row.entry.id) {
            return (
              <Select size="small" style={inp} showSearch optionFilterProp="label" placeholder="Select category…"
                value={editExpRow.expense_category_id ?? undefined}
                onChange={(v) => setEditExpRow((p) => ({ ...p, expense_category_id: v }))}
                options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            );
          }
          return (
            <Space size={4}>
              <Typography.Text>{categoryById.get(row.entry.expense_category_id) ?? row.entry.expense_category_id}</Typography.Text>
              {row.entry.edited_by && (
                <Tooltip title={`Edited by ${userById.get(row.entry.edited_by) ?? 'Unknown'}${row.entry.edited_at ? ` on ${fmtDateTime(row.entry.edited_at)}` : ''}`}>
                  <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Edited</Tag>
                </Tooltip>
              )}
            </Space>
          );
        }
        return (
          <Select
            ref={(el) => { fieldRefs.current[`${row.draft.key}:category`] = el; }}
            size="small" style={inp} showSearch optionFilterProp="label" placeholder="Select category…"
            value={row.draft.expense_category_id ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { expense_category_id: v })}
            onDropdownVisibleChange={(open) => { dropdownOpenRef.current[`${row.draft.key}:category`] = open; }}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'category')}
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        );
      },
    },
    {
      title: `Amount (${symbol})`,
      key: 'amount',
      width: 130,
      align: 'right' as const,
      render: (_: unknown, row: ExpRow) => {
        if (row._kind === 'existing') {
          if (editingExpenseId === row.entry.id) {
            return <InputNumber size="small" style={inp} min={0} precision={2} placeholder="0.00"
              value={editExpRow.amount ?? undefined}
              onChange={(v) => setEditExpRow((p) => ({ ...p, amount: v }))} />;
          }
          return <Typography.Text strong style={{ fontSize: 12 }}>{fmtAmt(parseFloat(row.entry.amount))}</Typography.Text>;
        }
        return (
          <InputNumber
            ref={(el) => { fieldRefs.current[`${row.draft.key}:amount`] = el; }}
            size="small" style={inp} min={0} precision={2} placeholder="0.00"
            value={row.draft.amount ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { amount: v })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'amount')} />
        );
      },
    },
    {
      title: 'Vendor',
      key: 'vendor',
      width: 160,
      render: (_: unknown, row: ExpRow) => {
        if (row._kind === 'existing') {
          if (editingExpenseId === row.entry.id) {
            return <Input size="small" style={inp} placeholder="Vendor (optional)"
              value={editExpRow.vendor_name}
              onChange={(e) => setEditExpRow((p) => ({ ...p, vendor_name: e.target.value }))} />;
          }
          return <Typography.Text style={{ fontSize: 12 }}>{row.entry.vendor_name || '—'}</Typography.Text>;
        }
        return (
          <Input
            ref={(el) => { fieldRefs.current[`${row.draft.key}:vendor`] = el; }}
            size="small" style={inp} placeholder="Vendor (optional)"
            value={row.draft.vendor_name}
            onChange={(e) => patchDraft(row.draft.key, { vendor_name: e.target.value })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'vendor')} />
        );
      },
    },
    {
      title: 'Remarks',
      key: 'remarks',
      width: 200,
      render: (_: unknown, row: ExpRow) => {
        if (row._kind === 'existing') {
          if (editingExpenseId === row.entry.id) {
            return <Input size="small" style={inp} placeholder="Remarks (optional)"
              value={editExpRow.remarks}
              onChange={(e) => setEditExpRow((p) => ({ ...p, remarks: e.target.value }))} />;
          }
          return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.entry.remarks || '—'}</Typography.Text>;
        }
        return (
          <Input
            ref={(el) => { fieldRefs.current[`${row.draft.key}:remarks`] = el; }}
            size="small" style={inp} placeholder="Remarks (optional)"
            value={row.draft.remarks}
            onChange={(e) => patchDraft(row.draft.key, { remarks: e.target.value })}
            onKeyDown={(e) => handleDraftKeyDown(e, row.draft, 'remarks')} />
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, row: ExpRow) => {
        if (row._kind === 'existing') {
          if (isSubmitted) return null;
          if (editingExpenseId === row.entry.id) {
            return (
              <Space size={4}>
                <Button size="small" type="primary" icon={<CheckOutlined />}
                  loading={editExpSaving} onClick={() => saveEditExpense(row.entry)} />
                <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingExpenseId(null)} />
              </Space>
            );
          }
          return (
            <Space size={4}>
              <Button size="small" icon={<EditOutlined />} onClick={() => startEditExpense(row.entry)} />
              <Popconfirm
                title="Delete this expense?"
                onConfirm={() => handleDelete(row.entry)}
                okText="Delete" okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} loading={deleteExpense.isPending} />
              </Popconfirm>
            </Space>
          );
        }
        return (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: token.colorSuccess }}
              loading={savingKeys.has(row.draft.key)} onClick={() => saveDraft(row.draft)} />
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
          <Typography.Text strong style={{ fontSize: 14 }}>Expenses</Typography.Text>
          <Tag style={{ margin: 0, fontSize: 11 }}>{forDate.length} item{forDate.length !== 1 ? 's' : ''}</Tag>
        </span>
        {!isSubmitted && (
          <Button
            size="small" icon={<PlusOutlined />}
            onClick={() => addBlankDraftAndFocus()}
          >
            Add Expense
          </Button>
        )}
      </div>
      {isSubmitted && <Alert type="info" showIcon style={{ margin: 12 }} message="DPR is submitted — expense entries are locked." />}
      <Table<ExpRow>
        rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
        size="small"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: true }}
        components={EXPENSES_TABLE_COMPONENTS}
        locale={{ emptyText: 'No expenses recorded for this DPR' }}
        summary={totalAmount > 0 ? () => (
          <Table.Summary>
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">{fmtAmt(totalAmount)}</Table.Summary.Cell>
              <Table.Summary.Cell index={2} />
              <Table.Summary.Cell index={3} />
              <Table.Summary.Cell index={4} />
            </Table.Summary.Row>
          </Table.Summary>
        ) : undefined}
      />
    </div>
  );
}

// ─── Measurements Tab ─────────────────────────────────────────────────────────

function MeasurementsTab({
  projectId,
  entryDate,
  isSubmitted,
  isActive,
}: {
  projectId: string;
  entryDate: string;
  isSubmitted: boolean;
  isActive: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: measurements, isLoading } = useMeasurements(projectId);
  const { data: boqItems } = useBoqItems(projectId);
  const { data: workTypes } = useWorkTypes();
  const { data: allTemplates } = useConstructionTemplates();
  const createMeasurement = useCreateMeasurement();
  const updateMeasurement = useUpdateMeasurement();
  const updateMeasurementNotes = useUpdateMeasurementNotes();
  const deleteMeasurement = useDeleteMeasurement();
  const uploadPhoto = useUploadPhoto();
  const attachPhoto = useAttachPhoto();
  const { fmtDate, fmtDateTime } = useDateFormat();
  const { fmtAmt, fmtQty, symbol } = useNumberFormat();
  const { token } = theme.useToken();

  const [drafts, setDrafts] = useState<MeasDraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  // StrictMode double-invokes effects in dev; without this guard the
  // "auto-create if empty" branch fires twice before `drafts` state from
  // the first invocation is visible to the second, adding two blank rows.
  const autoCreatedForActivationRef = useRef(false);

  const focusField = (key: string, field: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fieldRefs.current[`${key}:${field}`]?.focus?.();
      });
    });
  };

  const [steelModalDraftKey, setSteelModalDraftKey] = useState<string | null>(null);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<{ chainage: string; rate: number | null; dimensions: Record<string, number>; dimensionText: Record<string, string>; steel_lines: SteelLineDraft[]; boq_template_id: string | null; boq_item_id: string | null; work_type_id: string | null; }>({ chainage: '', rate: null, dimensions: {}, dimensionText: {}, steel_lines: [], boq_template_id: null, boq_item_id: null, work_type_id: null });
  const [editSteelModalOpen, setEditSteelModalOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [viewSteelEntryId, setViewSteelEntryId] = useState<string | null>(null);

  const [notesModalEntry, setNotesModalEntry] = useState<MeasurementRead | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const openNotesModal = (entry: MeasurementRead) => {
    setNotesModalEntry(entry);
    setNotesDraft(entry.notes ?? '');
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

  const boqById = useMemo(() => new Map((boqItems ?? []).map((b) => [b.id, b])), [boqItems]);

  const editWorkType = useMemo(
    () => editRow.work_type_id ? (workTypes ?? []).find((w) => w.id === editRow.work_type_id) : undefined,
    [editRow.work_type_id, workTypes],
  );
  const editTemplateCoeffMap = useMemo(() => {
    const tmpl = (allTemplates ?? []).find((t) => t.id === editRow.boq_template_id);
    const m: Record<number, number> = {};
    (tmpl?.items ?? []).forEach((i) => { if (i.bar_diameter_mm != null) m[i.bar_diameter_mm] = parseFloat(i.coefficient); });
    return m;
  }, [allTemplates, editRow.boq_template_id]);
  const editSteelDiameters = useMemo(() => Object.keys(editTemplateCoeffMap).map(Number).sort((a, b) => a - b), [editTemplateCoeffMap]);

  const forDate = useMemo(
    () => (measurements ?? []).filter((m) => m.measurement_date === entryDate),
    [measurements, entryDate],
  );

  const patchDraft = (key: string, patch: Partial<MeasDraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const addBlankDraft = () => {
    const key = nextMeasKey();
    setDrafts((p) => [...p, { key, boq_item_id: null, boq_template_id: null, dimensions: {}, dimensionText: {}, steel_lines: [], chainage: '', qty: null, rate: null }]);
    return key;
  };

  const addBlankDraftAndFocus = () => {
    const key = addBlankDraft();
    focusField(key, 'boq');
    return key;
  };

  useEffect(() => {
    if (!isActive || isSubmitted) { autoCreatedForActivationRef.current = false; return; }
    if (drafts.length === 0) {
      if (!autoCreatedForActivationRef.current) {
        autoCreatedForActivationRef.current = true;
         
        addBlankDraftAndFocus();
      }
    } else {
      autoCreatedForActivationRef.current = true;
      focusField(drafts[0].key, 'boq');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted]);

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

  // l/b/d fields accept either a plain number or a basic arithmetic
  // expression (e.g. "(1+2.5)/2") — raw text is kept for display/re-editing,
  // the parsed/evaluated number drives the live qty preview. An invalid
  // expression is left as typed (text updates) without touching the
  // computed dims/qty, so the user sees their in-progress typing without a
  // stale or wrong quantity being silently accepted.
  const patchDimensionText = (draftKey: string, field: string, text: string) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d;
      const newDimensionText = { ...d.dimensionText, [field]: text };
      let parsed: number | null;
      try {
        parsed = isArithmeticExpression(text) ? evaluateExpression(text) : (text.trim() === '' ? 0 : parseFloat(text));
      } catch (err) {
        if (err instanceof ExpressionError) return { ...d, dimensionText: newDimensionText };
        throw err;
      }
      if (parsed == null || Number.isNaN(parsed)) return { ...d, dimensionText: newDimensionText };
      const newDims = { ...d.dimensions, [field]: parsed };
      const boqItem = boqById.get(d.boq_item_id ?? '');
      const wt = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
      const newQty = wt ? calculateQuantity(wt.formula, wt.dimension_fields, newDims) : d.qty;
      return { ...d, dimensions: newDims, dimensionText: newDimensionText, qty: newQty };
    }));
  };

  const patchSteelLine = (draftKey: string, lineKey: string, patch: Partial<SteelLineDraft>) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d;
      const newLines = d.steel_lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l));
      const boqItem = boqById.get(d.boq_item_id ?? '');
      const tmpl = (allTemplates ?? []).find((t) => t.id === d.boq_template_id);
      const coeffMap: Record<number, number> = {};
      (tmpl?.items ?? []).forEach((i) => { if (i.bar_diameter_mm != null) coeffMap[i.bar_diameter_mm] = parseFloat(i.coefficient); });
      void boqItem;
      return { ...d, steel_lines: newLines, qty: computeSteelTotalMt(newLines, coeffMap) };
    }));
  };

  const addSteelLine = (draftKey: string, defaultDia: number | null) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d;
      return { ...d, steel_lines: [...d.steel_lines, { key: nextSteelDraftKey(), description: '', diameter_mm: defaultDia, bar_count: null, length_m: null }] };
    }));
  };

  const removeSteelLine = (draftKey: string, lineKey: string) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== draftKey) return d;
      const newLines = d.steel_lines.filter((l) => l.key !== lineKey);
      const tmpl = (allTemplates ?? []).find((t) => t.id === d.boq_template_id);
      const coeffMap: Record<number, number> = {};
      (tmpl?.items ?? []).forEach((i) => { if (i.bar_diameter_mm != null) coeffMap[i.bar_diameter_mm] = parseFloat(i.coefficient); });
      return { ...d, steel_lines: newLines, qty: computeSteelTotalMt(newLines, coeffMap) };
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
    const isSteel = boqItem?.construction_type === 'STEEL';
    if (!isSteel && (!workType || workType.dimension_fields.length === 0)) {
      message.warning('No dimension fields configured for this BOQ item');
      return;
    }
    if (boqItem && boqItem.construction_type !== 'GENERAL' && !draft.boq_template_id) {
      message.warning('Select a construction template for this measurement');
      return;
    }
    if (isSteel) {
      const validLines = draft.steel_lines.filter((l) => l.diameter_mm != null && l.bar_count && l.length_m);
      if (validLines.length === 0) {
        message.warning('Add at least one bar entry via the steel lines button');
        return;
      }
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      let created;
      if (isSteel) {
        const validLines = draft.steel_lines.filter((l) => l.diameter_mm != null && l.bar_count && l.length_m);
        created = await createMeasurement.mutateAsync({
          project_id: projectId,
          boq_item_id: draft.boq_item_id,
          measurement_date: entryDate,
          dimensions: {},
          chainage: draft.chainage.trim() || null,
          rate: draft.rate != null ? String(draft.rate) : null,
          boq_template_id: draft.boq_template_id ?? null,
          steel_lines: validLines.map((l) => ({
            diameter_mm: l.diameter_mm!,
            bar_count: l.bar_count!,
            length_m: l.length_m!,
            description: l.description || null,
          })),
        });
      } else {
        const activeFields = workType!.dimension_fields;
        const dimensionExpressions = Object.fromEntries(
          activeFields
            .filter((f) => f !== 'nos' && isArithmeticExpression(draft.dimensionText[f] ?? ''))
            .map((f) => [f, draft.dimensionText[f]]),
        );
        created = await createMeasurement.mutateAsync({
          project_id: projectId,
          boq_item_id: draft.boq_item_id,
          measurement_date: entryDate,
          dimensions: Object.fromEntries(activeFields.map((f) => [f, String(draft.dimensions[f] ?? 0)])),
          dimension_expressions: Object.keys(dimensionExpressions).length > 0 ? dimensionExpressions : null,
          chainage: draft.chainage.trim() || null,
          rate: draft.rate != null ? String(draft.rate) : null,
          boq_template_id: draft.boq_template_id ?? null,
        });
      }
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
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not save measurement'));
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const startEditRow = (entry: MeasurementRead) => {
    setEditingRowId(entry.id);
    setEditRow({
      chainage: entry.chainage ?? '',
      rate: entry.rate != null ? parseFloat(String(entry.rate)) : null,
      dimensions: Object.fromEntries(Object.entries(entry.dimensions).map(([k, v]) => [k, parseFloat(String(v))])),
      // Re-show the original expression text if this field was entered as
      // one ("save and show same"), otherwise the plain computed number.
      dimensionText: Object.fromEntries(
        Object.entries(entry.dimensions).map(([k, v]) => [k, entry.dimension_expressions?.[k] ?? String(v)]),
      ),
      steel_lines: entry.steel_lines.map((l) => ({
        key: nextSteelDraftKey(),
        description: l.description ?? '',
        diameter_mm: l.diameter_mm,
        bar_count: parseFloat(String(l.bar_count)),
        length_m: parseFloat(String(l.length_m)),
      })),
      boq_template_id: entry.boq_template_id ?? null,
      boq_item_id: entry.boq_item_id,
      work_type_id: entry.work_type_id,
    });
  };

  // Re-point the row at a different BOQ item mid-edit. Options are limited to
  // the same construction type (see boqChangeOptions below), so the steel vs
  // dimension rendering stays consistent; reset dims/steel/template to match.
  const handleEditRowBoqChange = (value: string) => {
    const item = boqById.get(value);
    const wt = (workTypes ?? []).find((w) => w.id === item?.work_type_id);
    const hasNos = wt?.dimension_fields.includes('nos') ?? false;
    const dimensions: Record<string, number> = hasNos ? { nos: 1 } : {};
    const dimensionText: Record<string, string> = hasNos ? { nos: '1' } : {};
    setEditRow((prev) => ({
      ...prev,
      boq_item_id: value,
      work_type_id: item?.work_type_id ?? null,
      boq_template_id: null,
      dimensions,
      dimensionText,
      steel_lines: [],
    }));
  };

  const saveEditRow = async (entry: MeasurementRead) => {
    const targetBoqItemId = editRow.boq_item_id ?? entry.boq_item_id;
    const isSteel = boqById.get(targetBoqItemId)?.construction_type === 'STEEL';
    setEditSaving(true);
    try {
      if (isSteel) {
        const validLines = editRow.steel_lines.filter((l) => l.diameter_mm != null && l.bar_count && l.length_m);
        await updateMeasurement.mutateAsync({
          id: entry.id,
          data: {
            boq_item_id: targetBoqItemId,
            dimensions: {},
            chainage: editRow.chainage.trim() || null,
            rate: editRow.rate != null ? String(editRow.rate) : null,
            boq_template_id: editRow.boq_template_id ?? null,
            steel_lines: validLines.map((l) => ({
              diameter_mm: l.diameter_mm!,
              bar_count: l.bar_count!,
              length_m: l.length_m!,
              description: l.description || null,
            })),
          },
        });
      } else {
        const activeFields = editWorkType?.dimension_fields ?? [];
        const dimensionExpressions = Object.fromEntries(
          activeFields
            .filter((f) => f !== 'nos' && isArithmeticExpression(editRow.dimensionText[f] ?? ''))
            .map((f) => [f, editRow.dimensionText[f]]),
        );
        await updateMeasurement.mutateAsync({
          id: entry.id,
          data: {
            boq_item_id: targetBoqItemId,
            dimensions: Object.fromEntries(activeFields.map((f) => [f, String(editRow.dimensions[f] ?? 0)])),
            dimension_expressions: Object.keys(dimensionExpressions).length > 0 ? dimensionExpressions : null,
            chainage: editRow.chainage.trim() || null,
            rate: editRow.rate != null ? String(editRow.rate) : null,
            boq_template_id: editRow.boq_template_id ?? null,
          },
        });
      }
      message.success('Updated');
      setEditingRowId(null);
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update measurement')); }
    finally { setEditSaving(false); }
  };

  const patchEditSteelLine = (lineKey: string, patch: Partial<SteelLineDraft>) => {
    setEditRow((prev) => ({ ...prev, steel_lines: prev.steel_lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) }));
  };
  const addEditSteelLine = (defaultDia: number | null) => {
    setEditRow((prev) => ({ ...prev, steel_lines: [...prev.steel_lines, { key: nextSteelDraftKey(), description: '', diameter_mm: defaultDia, bar_count: null, length_m: null }] }));
  };
  const removeEditSteelLine = (lineKey: string) => {
    setEditRow((prev) => ({ ...prev, steel_lines: prev.steel_lines.filter((l) => l.key !== lineKey) }));
  };

  // Edit-row counterpart of patchDimensionText — same expression-or-number
  // handling, applied to editRow state instead of a draft.
  const patchEditDimensionText = (field: string, text: string) => {
    setEditRow((prev) => {
      const newDimensionText = { ...prev.dimensionText, [field]: text };
      let parsed: number | null;
      try {
        parsed = isArithmeticExpression(text) ? evaluateExpression(text) : (text.trim() === '' ? 0 : parseFloat(text));
      } catch (err) {
        if (err instanceof ExpressionError) return { ...prev, dimensionText: newDimensionText };
        throw err;
      }
      if (parsed == null || Number.isNaN(parsed)) return { ...prev, dimensionText: newDimensionText };
      return { ...prev, dimensions: { ...prev.dimensions, [field]: parsed }, dimensionText: newDimensionText };
    });
  };

  const handleDelete = async (record: MeasurementRead) => {
    try { await deleteMeasurement.mutateAsync({ id: record.id, projectId: record.project_id }); message.success('Deleted'); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not delete')); }
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
      width: 160,
      ellipsis: true,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing' ? (
          editingRowId === row.entry.id ? (
            (() => {
              // Re-point among items of the same construction type only, so the
              // steel/dimension editing mode below stays consistent.
              const cType = boqById.get(row.entry.boq_item_id)?.construction_type;
              return (
                <Select
                  size="small" showSearch optionFilterProp="label" style={inp}
                  placeholder="BOQ item…"
                  value={editRow.boq_item_id ?? undefined}
                  onChange={handleEditRowBoqChange}
                  options={(boqItems ?? [])
                    .filter((b) => b.construction_type === cType)
                    .map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` }))}
                />
              );
            })()
          ) : (
            <Space size={4}>
              <span>{(() => { const item = boqById.get(row.entry.boq_item_id); return item ? `${item.item_no} — ${item.description}` : row.entry.boq_item_id; })()}</span>
              {row.entry.edited_by && (
                <Tooltip title={`Edited by ${row.entry.edited_by_name ?? 'Unknown'}${row.entry.edited_at ? ` on ${fmtDateTime(row.entry.edited_at)}` : ''}`}>
                  <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Edited</Tag>
                </Tooltip>
              )}
            </Space>
          )
        ) : (
          <Select
            ref={(el) => { fieldRefs.current[`${row.draft.key}:boq`] = el; }}
            size="small" showSearch optionFilterProp="label" style={inp}
            placeholder="Select BOQ item…"
            value={row.draft.boq_item_id ?? undefined}
            onChange={(v) => {
              const boqItem = boqById.get(v);
              const wt = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
              // 'nos' defaults to 1 (not 0) since it's a multiplicand — a
              // fresh draft with dims still unset should read as "1 unit",
              // not silently zero out the whole product once others are filled.
              const dimensions: Record<string, number> = wt?.dimension_fields.includes('nos') ? { nos: 1 } : {};
              patchDraft(row.draft.key, {
                boq_item_id: v,
                boq_template_id: null,
                dimensions,
                steel_lines: [],
                qty: 0,
                rate: boqItem?.rate != null ? parseFloat(boqItem.rate) : null,
              });
            }}
            options={(boqItems ?? []).map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` }))}
          />
        ),
    },
    {
      title: 'Template',
      key: 'template',
      width: 120,
      ellipsis: true,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          const isEditing = editingRowId === row.entry.id;
          const cType2 = boqById.get(row.entry.boq_item_id)?.construction_type;
          if (isEditing && cType2 && cType2 !== 'GENERAL') {
            const opts2 = (allTemplates ?? []).filter((t) => t.construction_type === cType2 && t.is_active);
            return (
              <Select size="small" style={inp} value={editRow.boq_template_id ?? undefined}
                onChange={(v) => setEditRow((p) => ({ ...p, boq_template_id: v }))}
                options={opts2.map((t) => ({ value: t.id, label: t.name }))} />
            );
          }
          return row.entry.boq_template_name
            ? <Typography.Text style={{ fontSize: 12 }}>{row.entry.boq_template_name}</Typography.Text>
            : <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        }
        const boqItem = row.draft.boq_item_id ? boqById.get(row.draft.boq_item_id) : undefined;
        const cType = boqItem?.construction_type;
        if (!cType || cType === 'GENERAL') {
          return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        }
        const opts = (allTemplates ?? []).filter((t) => t.construction_type === cType && t.is_active);
        return (
          <Select
            size="small" style={inp}
            placeholder="Select template…"
            value={row.draft.boq_template_id ?? undefined}
            onChange={(v) => patchDraft(row.draft.key, { boq_template_id: v })}
            options={opts.map((t) => ({ value: t.id, label: t.name }))}
          />
        );
      },
    },
    // All 4 dimension columns; inactive ones dimmed with placeholder
    ...ALL_DIM_FIELDS.map((field) => ({
      title: DIM_ABBREV[field],
      key: field,
      width: 50,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          const isEditing = editingRowId === row.entry.id;
          if (isEditing) {
            const isSteel2 = boqById.get(row.entry.boq_item_id)?.construction_type === 'STEEL';
            if (isSteel2) {
              if (field === 'nos') {
                const cnt = editRow.steel_lines.filter((l) => l.bar_count && l.length_m).length;
                return (
                  <Button size="small" type={cnt > 0 ? 'default' : 'dashed'}
                    onClick={() => setEditSteelModalOpen(true)}>
                    {cnt > 0 ? `${cnt}lns/+` : '+ bars'}
                  </Button>
                );
              }
              return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
            }
            const active2 = (editWorkType?.dimension_fields ?? []).includes(field);
            if (field !== 'nos') {
              // l/b/d accept a plain number or a "(1+2.5)/2"-style expression.
              return (
                <div style={{ opacity: active2 ? 1 : 0.28 }}>
                  <Input size="small" style={inp}
                    disabled={!active2}
                    placeholder={active2 ? '0' : '—'}
                    value={active2 ? (editRow.dimensionText[field] ?? '') : ''}
                    onChange={(e) => { if (active2) patchEditDimensionText(field, e.target.value); }}
                  />
                </div>
              );
            }
            return (
              <div style={{ opacity: active2 ? 1 : 0.28 }}>
                <InputNumber size="small" style={inp} min={0}
                  disabled={!active2}
                  placeholder={active2 ? '0' : '—'}
                  value={active2 ? (editRow.dimensions[field] ?? null) : null}
                  onChange={(v) => { if (active2) setEditRow((p) => ({ ...p, dimensions: { ...p.dimensions, [field]: v ?? 0 } })); }}
                />
              </div>
            );
          }
          const boqItem2 = boqById.get(row.entry.boq_item_id);
          if (boqItem2?.construction_type === 'STEEL' && field === 'nos') {
            const cnt2 = row.entry.steel_lines.length;
            return cnt2 > 0
              ? <Typography.Text style={{ fontSize: 11 }}>{cnt2}</Typography.Text>
              : <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
          }
          const val = row.entry.dimensions[field];
          if (!val) return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
          // Show the original expression text ("save and show same") rather
          // than just the computed number, for l/b/d fields that used one.
          const displayExpr = row.entry.dimension_expressions?.[field];
          return (
            <Typography.Text style={{ fontSize: 12 }} title={displayExpr ? `= ${parseFloat(val).toFixed(3)}` : undefined}>
              {displayExpr ?? parseFloat(val).toFixed(2)}
            </Typography.Text>
          );
        }
        const boqItem = row.draft.boq_item_id ? boqById.get(row.draft.boq_item_id) : undefined;
        const wt = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
        const isSteel = boqItem?.construction_type === 'STEEL';
        if (isSteel) {
          if (field === 'nos') {
            const count = row.draft.steel_lines.filter((l) => l.bar_count && l.length_m).length;
            const hasTemplate = !!row.draft.boq_template_id;
            return (
              <Button size="small" type={count > 0 ? 'default' : 'dashed'}
                disabled={!hasTemplate}
                title={hasTemplate ? undefined : 'Select a template first'}
                onClick={() => {
                  if (!hasTemplate) { message.warning('Select a construction template first'); return; }
                  setSteelModalDraftKey(row.draft.key);
                }}>
                {count > 0 ? `${count} line${count !== 1 ? 's' : ''}` : '+ bars'}
              </Button>
            );
          }
          return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        }
        const active = (wt?.dimension_fields ?? []).includes(field);
        if (field !== 'nos') {
          return (
            <div style={{ opacity: active ? 1 : 0.28 }}>
              <Input
                size="small" style={inp}
                disabled={!active || !row.draft.boq_item_id}
                placeholder={active ? '0' : '—'}
                value={active ? (row.draft.dimensionText[field] ?? '') : ''}
                onChange={(e) => { if (active) patchDimensionText(row.draft.key, field, e.target.value); }}
              />
            </div>
          );
        }
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
      width: 72,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing' ? (
          editingRowId === row.entry.id
            ? <Input size="small" placeholder="—" value={editRow.chainage} onChange={(e) => setEditRow((p) => ({ ...p, chainage: e.target.value }))} />
            : <Typography.Text style={{ fontSize: 12 }}>{row.entry.chainage ?? '—'}</Typography.Text>
        ) : (
          <Input size="small" placeholder="—" value={row.draft.chainage}
            onChange={(e) => patchDraft(row.draft.key, { chainage: e.target.value })} />
        ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 70,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) =>
        row._kind === 'existing' ? (
          <Typography.Text strong style={{ fontSize: 12 }}>{fmtQty(row.entry.computed_qty)}</Typography.Text>
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
      width: 84,
      align: 'right' as const,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          if (editingRowId === row.entry.id) {
            return <InputNumber size="small" style={inp} min={0} precision={2} placeholder="—"
              value={editRow.rate ?? undefined}
              onChange={(v) => setEditRow((p) => ({ ...p, rate: v }))} />;
          }
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
      width: 90,
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
      title: '',
      key: 'actions',
      width: 150,
      render: (_: unknown, row: MeasRow) => {
        if (row._kind === 'existing') {
          if (editingRowId === row.entry.id) {
            return (
              <Space size={4}>
                <Button size="small" type="primary" icon={<CheckOutlined />}
                  loading={editSaving} onClick={() => saveEditRow(row.entry)} />
                <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingRowId(null)} />
              </Space>
            );
          }
          const isSteelEntry = boqById.get(row.entry.boq_item_id)?.construction_type === 'STEEL';
          return (
            <Space size={4}>
              {isSteelEntry && (
                <Button size="small" onClick={() => setViewSteelEntryId(row.entry.id)}>Bars</Button>
              )}
              <Button
                size="small" type="text"
                icon={<FileTextOutlined style={row.entry.notes ? { color: token.colorPrimary } : undefined} />}
                title={row.entry.notes ? 'View/edit notes' : 'Add notes'}
                onClick={() => openNotesModal(row.entry)}
              />
              {row.entry.recorded_by === user?.id && (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => startEditRow(row.entry)} />
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
    <div style={{ width: '100%' }}>
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
              onClick={() => addBlankDraftAndFocus()}
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
          scroll={{ x: true }}
          components={MEASUREMENTS_TABLE_COMPONENTS}
          locale={{ emptyText: `No measurements for ${fmtDate(entryDate)}` }}
          summary={totalQty > 0 ? () => (
            <Table.Summary>
              <Table.Summary.Row style={{ fontWeight: 700 }}>
                <Table.Summary.Cell index={0} colSpan={7}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">{fmtQty(totalQty)}</Table.Summary.Cell>
                <Table.Summary.Cell index={8} />
                <Table.Summary.Cell index={9} align="right">{fmtAmt(totalAmount)}</Table.Summary.Cell>
                <Table.Summary.Cell index={10} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : undefined}
        />
      </div>

      {/* Steel lines modal for draft rows */}
      {(() => {
        const steelDraft = drafts.find((d) => d.key === steelModalDraftKey);
        const boqItem = steelDraft?.boq_item_id ? boqById.get(steelDraft.boq_item_id) : undefined;
        const tmpl = (allTemplates ?? []).find((t) => t.id === steelDraft?.boq_template_id);
        const coeffMap: Record<number, number> = {};
        (tmpl?.items ?? []).forEach((i) => { if (i.bar_diameter_mm != null) coeffMap[i.bar_diameter_mm] = parseFloat(i.coefficient); });
        const diameters = Object.keys(coeffMap).map(Number).sort((a, b) => a - b);
        const totalMt = steelDraft ? computeSteelTotalMt(steelDraft.steel_lines, coeffMap) : 0;
        const steelLines = steelDraft?.steel_lines ?? [];
        return (
          <Modal
            title={boqItem ? `Steel Bar Entries — ${boqItem.item_no} ${boqItem.description}` : 'Steel Bar Entries'}
            open={steelModalDraftKey != null}
            onCancel={() => setSteelModalDraftKey(null)}
            onOk={() => setSteelModalDraftKey(null)}
            okText="Done"
            width={680}
            destroyOnHidden
          >
            <Table<SteelLineDraft>
              rowKey="key"
              size="small"
              dataSource={steelLines}
              pagination={false}
              locale={{ emptyText: 'No bar entries yet — click Add Row below' }}
              columns={[
                {
                  title: 'Description / Mark',
                  key: 'description',
                  render: (_, row) => (
                    <Input
                      size="small" placeholder="e.g. Main Bar, Dist. Bar"
                      value={row.description}
                      onChange={(e) => patchSteelLine(steelModalDraftKey!, row.key, { description: e.target.value })}
                    />
                  ),
                },
                {
                  title: 'Dia (mm)',
                  key: 'diameter_mm',
                  width: 100,
                  render: (_, row) => (
                    <Select
                      size="small" style={{ width: '100%' }}
                      placeholder="Dia"
                      value={row.diameter_mm ?? undefined}
                      onChange={(v) => patchSteelLine(steelModalDraftKey!, row.key, { diameter_mm: v })}
                      options={diameters.map((d) => ({ value: d, label: `${d} mm` }))}
                    />
                  ),
                },
                {
                  title: 'Nos',
                  key: 'bar_count',
                  width: 80,
                  render: (_, row) => (
                    <InputNumber
                      size="small" style={{ width: '100%' }} min={1} precision={0}
                      placeholder="0"
                      value={row.bar_count ?? undefined}
                      onChange={(v) => patchSteelLine(steelModalDraftKey!, row.key, { bar_count: v ?? null })}
                    />
                  ),
                },
                {
                  title: 'L (m)',
                  key: 'length_m',
                  width: 90,
                  render: (_, row) => (
                    <InputNumber
                      size="small" style={{ width: '100%' }} min={0} precision={3}
                      placeholder="0.000"
                      value={row.length_m ?? undefined}
                      onChange={(v) => patchSteelLine(steelModalDraftKey!, row.key, { length_m: v ?? null })}
                    />
                  ),
                },
                {
                  title: 'Wt (MT)',
                  key: 'weight',
                  width: 90,
                  align: 'right' as const,
                  render: (_, row) => {
                    if (!row.bar_count || !row.length_m || !row.diameter_mm) return <Typography.Text type="secondary">—</Typography.Text>;
                    const w = row.bar_count * row.length_m * (coeffMap[row.diameter_mm] ?? 0);
                    return <Typography.Text strong style={{ fontSize: 12 }}>{w.toFixed(4)}</Typography.Text>;
                  },
                },
                {
                  title: '',
                  key: 'del',
                  width: 36,
                  render: (_, row) => steelLines.length > 1 ? (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={() => removeSteelLine(steelModalDraftKey!, row.key)} />
                  ) : null,
                },
              ]}
              footer={() => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button size="small" icon={<PlusOutlined />}
                    onClick={() => addSteelLine(steelModalDraftKey!, diameters[0] ?? null)}>
                    Add Row
                  </Button>
                  <Statistic title="Total Weight" value={`${totalMt.toFixed(4)} MT`} valueStyle={{ fontSize: 16 }} />
                </div>
              )}
            />
          </Modal>
        );
      })()}

      {/* Steel lines modal for edit rows */}
      {(() => {
        if (!editSteelModalOpen || !editingRowId) return null;
        const editEntry = forDate.find((m) => m.id === editingRowId);
        const editBoqItem2 = editEntry ? boqById.get(editEntry.boq_item_id) : undefined;
        const editTotalMt = computeSteelTotalMt(editRow.steel_lines, editTemplateCoeffMap);
        return (
          <Modal
            title={editBoqItem2 ? `Steel Bar Entries — ${editBoqItem2.item_no} ${editBoqItem2.description}` : 'Steel Bar Entries'}
            open={editSteelModalOpen}
            onCancel={() => setEditSteelModalOpen(false)}
            onOk={() => setEditSteelModalOpen(false)}
            okText="Done"
            width={680}
            destroyOnHidden
          >
            <Table<SteelLineDraft>
              rowKey="key"
              size="small"
              dataSource={editRow.steel_lines}
              pagination={false}
              locale={{ emptyText: 'No bar entries yet — click Add Row below' }}
              columns={[
                {
                  title: 'Description / Mark',
                  key: 'description',
                  render: (_, row) => (
                    <Input size="small" placeholder="e.g. Main Bar, Dist. Bar"
                      value={row.description}
                      onChange={(e) => patchEditSteelLine(row.key, { description: e.target.value })} />
                  ),
                },
                {
                  title: 'Dia (mm)',
                  key: 'diameter_mm',
                  width: 100,
                  render: (_, row) => (
                    <Select size="small" style={{ width: '100%' }} placeholder="Dia"
                      value={row.diameter_mm ?? undefined}
                      onChange={(v) => patchEditSteelLine(row.key, { diameter_mm: v })}
                      options={editSteelDiameters.map((d) => ({ value: d, label: `${d} mm` }))} />
                  ),
                },
                {
                  title: 'Nos',
                  key: 'bar_count',
                  width: 80,
                  render: (_, row) => (
                    <InputNumber size="small" style={{ width: '100%' }} min={1} precision={0} placeholder="0"
                      value={row.bar_count ?? undefined}
                      onChange={(v) => patchEditSteelLine(row.key, { bar_count: v ?? null })} />
                  ),
                },
                {
                  title: 'L (m)',
                  key: 'length_m',
                  width: 90,
                  render: (_, row) => (
                    <InputNumber size="small" style={{ width: '100%' }} min={0} precision={3} placeholder="0.000"
                      value={row.length_m ?? undefined}
                      onChange={(v) => patchEditSteelLine(row.key, { length_m: v ?? null })} />
                  ),
                },
                {
                  title: 'Wt (MT)',
                  key: 'weight',
                  width: 90,
                  align: 'right' as const,
                  render: (_, row) => {
                    if (!row.bar_count || !row.length_m || !row.diameter_mm) return <Typography.Text type="secondary">—</Typography.Text>;
                    const w = row.bar_count * row.length_m * (editTemplateCoeffMap[row.diameter_mm] ?? 0);
                    return <Typography.Text strong style={{ fontSize: 12 }}>{w.toFixed(4)}</Typography.Text>;
                  },
                },
                {
                  title: '',
                  key: 'del',
                  width: 36,
                  render: (_, row) => editRow.steel_lines.length > 1 ? (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={() => removeEditSteelLine(row.key)} />
                  ) : null,
                },
              ]}
              footer={() => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button size="small" icon={<PlusOutlined />}
                    onClick={() => addEditSteelLine(editSteelDiameters[0] ?? null)}>
                    Add Row
                  </Button>
                  <Statistic title="Total Weight" value={`${editTotalMt.toFixed(4)} MT`} valueStyle={{ fontSize: 16 }} />
                </div>
              )}
            />
          </Modal>
        );
      })()}

      {/* Read-only steel bar detail view */}
      {(() => {
        const viewEntry = viewSteelEntryId ? forDate.find((m) => m.id === viewSteelEntryId) : null;
        if (!viewEntry) return null;
        const viewBoqItem = boqById.get(viewEntry.boq_item_id);
        const totalMtView = viewEntry.steel_lines.reduce((s, l) => s + parseFloat(String(l.computed_weight_mt)), 0);
        return (
          <Modal
            title={viewBoqItem ? `Steel Bars — ${viewBoqItem.item_no} ${viewBoqItem.description}` : 'Steel Bars'}
            open={!!viewSteelEntryId}
            onCancel={() => setViewSteelEntryId(null)}
            footer={<Button onClick={() => setViewSteelEntryId(null)}>Close</Button>}
            width={620}
            destroyOnHidden
          >
            <Table<(typeof viewEntry.steel_lines)[number]>
              rowKey="id"
              size="small"
              dataSource={viewEntry.steel_lines}
              pagination={false}
              columns={[
                { title: 'Description', dataIndex: 'description', key: 'desc', render: (v) => v ?? <Typography.Text type="secondary">—</Typography.Text> },
                { title: 'Dia (mm)', dataIndex: 'diameter_mm', key: 'dia', width: 80, align: 'right' as const },
                { title: 'Nos', dataIndex: 'bar_count', key: 'nos', width: 70, align: 'right' as const },
                { title: 'L (m)', dataIndex: 'length_m', key: 'len', width: 80, align: 'right' as const, render: (v) => parseFloat(String(v)).toFixed(3) },
                { title: 'Wt (MT)', dataIndex: 'computed_weight_mt', key: 'wt', width: 90, align: 'right' as const, render: (v) => <Typography.Text strong>{parseFloat(String(v)).toFixed(4)}</Typography.Text> },
              ]}
              footer={() => (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Statistic title="Total Weight" value={`${totalMtView.toFixed(4)} MT`} valueStyle={{ fontSize: 15 }} />
                </div>
              )}
            />
          </Modal>
        );
      })()}

      <Modal
        title="Measurement Notes"
        open={!!notesModalEntry}
        onCancel={() => setNotesModalEntry(null)}
        onOk={saveNotes}
        okText="Save"
        confirmLoading={notesSaving}
        okButtonProps={{
          disabled: !!notesModalEntry && notesModalEntry.recorded_by !== user?.id && user?.role !== 'ADMIN',
        }}
        destroyOnHidden
      >
        <Input.TextArea
          rows={4}
          maxLength={1000}
          showCount
          placeholder="Add a note for this measurement…"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          disabled={!!notesModalEntry && notesModalEntry.recorded_by !== user?.id && user?.role !== 'ADMIN'}
        />
        {notesModalEntry && notesModalEntry.recorded_by !== user?.id && user?.role !== 'ADMIN' && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Only the recording engineer or an admin can edit notes.
          </Typography.Text>
        )}
      </Modal>
    </div>
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
  isActive,
}: {
  headerId: string;
  isSubmitted: boolean;
  isActive: boolean;
}) {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: sections, isLoading: sectionsLoading } = useBoqSections(selectedProjectId);
  const { data: existingEntries } = useDprProduction(headerId);
  const { data: dprMeasurements } = useDprMeasurements(headerId);
  const bulkUpsert = useBulkUpsertProduction();

  // Once a measurement exists for a BOQ item on this date the item's qty
  // is owned by the Measurement Book, not manual entry.
  const lockedByMeasurement = new Set((dprMeasurements ?? []).map((m) => m.boq_item_id));
  const entryByBoq = new Map((existingEntries ?? []).map((e) => [e.boq_item_id, e]));
  const { resolvedMode } = useThemeMode();
  const { fmtAmt, fmtQty, symbol } = useNumberFormat();

  const HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';

  const [activitySummary, setActivitySummary] = useState('');
  const [production, setProduction] = useState<Record<string, ProductionState>>({});
  const touchedRef = useRef<Set<string>>(new Set());
  const qtyFieldRefs = useRef<Record<string, { focus?: () => void } | null>>({});

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
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not save production entries'));
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

  // Qty column only — items locked by a Measurement Book entry have no
  // input here (qty is owned by MB), so they're skipped when navigating.
  const navigableQtyItemIds = rows
    .filter((r) => r._type === 'item' && !lockedByMeasurement.has(r.item.id))
    .map((r) => (r as Extract<ProductionRow, { _type: 'item' }>).item.id);

  const handleQtyKeyDown = (e: React.KeyboardEvent, boqItemId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const idx = navigableQtyItemIds.indexOf(boqItemId);
    if (idx >= 0 && idx < navigableQtyItemIds.length - 1) {
      qtyFieldRefs.current[navigableQtyItemIds[idx + 1]]?.focus?.();
    }
  };

  useEffect(() => {
    if (!isActive) return;
    const firstId = navigableQtyItemIds[0];
    if (!firstId) return; // BOQ sections still loading, or nothing navigable — nothing to focus yet
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        qtyFieldRefs.current[firstId]?.focus?.();
      });
    });
    // Re-run once `sections` finishes loading (navigableQtyItemIds derives
    // from it) in addition to on tab activation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, sections]);

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
      title: `Contract Rate (${symbol})`,
      key: 'rate',
      width: 100,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? fmtQty(row.item.rate, 2) : null),
    },
    {
      title: `Effective Rate (${symbol})`,
      key: 'current_rate',
      width: 120,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const isRevised = row.item.current_rate !== row.item.rate;
        if (!isRevised) return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>;
        return (
          <Space size={4}>
            <Tag color="orange" style={{ marginRight: 0, fontSize: 10 }}>Revised</Tag>
            {fmtQty(row.item.current_rate, 2)}
          </Space>
        );
      },
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
          <span title={isOverride ? `Contract rate is ${fmtQty(row.item.rate, 2)} — this rate was overridden in the measurement entry` : 'Matches contract rate'}>
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
            ref={(el) => { qtyFieldRefs.current[row.item.id] = el; }}
            size="small"
            value={val === '' ? undefined : parseFloat(val)}
            onChange={(v) => setQty(row.item.id, v === null || v === undefined ? '' : String(v))}
            onKeyDown={(e) => handleQtyKeyDown(e, row.item.id)}
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
        scroll={{ x: true }}
        components={PRODUCTION_TABLE_COMPONENTS}
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

// ─── DPR Preview Modal ────────────────────────────────────────────────────────

function DprPreviewModal({
  open,
  onClose,
  onSubmit,
  onDelete,
  projectId,
  headerId,
  entryDate,
  header,
  isSubmitted,
  submitLoading,
  deleteLoading,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  projectId: string;
  headerId: string;
  entryDate: string;
  header: DprHeaderRead | undefined;
  isSubmitted: boolean;
  submitLoading: boolean;
  deleteLoading: boolean;
  projectName: string;
}) {
  const { fmtDate } = useDateFormat();
  const { fmtAmt, fmtQty: fmtQtyPreview, symbol } = useNumberFormat();
  const { token } = theme.useToken();
  const { resolvedMode } = useThemeMode();

  const { data: labour } = useDprLabour(headerId);
  const { data: attendance } = useAttendanceRecords(projectId, entryDate);
  const { data: workers } = useWorkers(projectId);
  const { data: expenses } = useExpensesByHeader(headerId);
  const { data: production } = useDprProduction(headerId);
  const { data: boqItems } = useBoqItems(projectId);
  const { data: measurements } = useMeasurements(projectId);
  const { data: materials } = useMaterials();
  const { data: machinery } = useMachinery();
  const { data: uoms } = useUoms();
  const { data: categories } = useExpenseCategories();

  const workerById = new Map((workers ?? []).map((w) => [w.id, w.full_name]));
  const materialById = new Map((materials ?? []).map((m) => [m.id, m.name]));
  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m.name]));
  const uomById = new Map((uoms ?? []).map((u) => [u.id, u.code]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const boqById = new Map((boqItems ?? []).map((b) => [b.id, b]));

  const forDateMeasurements = (measurements ?? []).filter((m) => m.measurement_date === entryDate);
  const productionWithQty = (production ?? []).filter((p) => parseFloat(p.qty_today) > 0);

  const totalLabour = (labour ?? []).reduce(
    (s, e) => s + parseFloat(e.amount || '0') + parseFloat(e.overtime_amount || '0'), 0,
  );
  const totalMaterial = (header?.materials ?? []).reduce(
    (s, e) => s + (e.rate ? parseFloat(e.rate) * parseFloat(e.qty_consumed) : 0), 0,
  );
  const totalMachinery = (header?.machinery_entries ?? []).reduce(
    (s, e) => s + (e.hire_rate ? parseFloat(e.hire_rate) * parseFloat(e.quantity_used) : 0), 0,
  );
  const totalExpense = (expenses ?? []).reduce((s, e) => s + parseFloat(e.amount || '0'), 0);
  const grandTotal = totalLabour + totalMaterial + totalMachinery + totalExpense;

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const modalFooter = !isSubmitted ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
      <Popconfirm
        title="Delete this DPR?"
        description="All entries for this date will be permanently deleted."
        open={deleteConfirmOpen}
        onConfirm={() => { setDeleteConfirmOpen(false); onClose(); onDelete(); }}
        onCancel={() => setDeleteConfirmOpen(false)}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <Button danger loading={deleteLoading} onClick={() => setDeleteConfirmOpen(true)}>
          Delete DPR
        </Button>
      </Popconfirm>
      <Space>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" loading={submitLoading} onClick={onSubmit}>
          Submit DPR
        </Button>
      </Space>
    </div>
  ) : (
    <div style={{ textAlign: 'right' }}>
      <Button onClick={onClose}>Close</Button>
    </div>
  );

  const isDark = resolvedMode === 'dark';
  const thumbColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)';
  const thumbHover = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.38)';
  const trackColor = token.colorFillSecondary;

  return (
    <>
      <style>{`
        .dpr-preview-modal-body::-webkit-scrollbar { width: 6px; }
        .dpr-preview-modal-body::-webkit-scrollbar-track { background: ${trackColor}; border-radius: 3px; }
        .dpr-preview-modal-body::-webkit-scrollbar-thumb { background: ${thumbColor}; border-radius: 3px; }
        .dpr-preview-modal-body::-webkit-scrollbar-thumb:hover { background: ${thumbHover}; }
        .dpr-preview-modal-body { scrollbar-width: thin; scrollbar-color: ${thumbColor} ${trackColor}; }
      `}</style>
      <Modal
        title={`DPR Preview — ${fmtDate(entryDate)}`}
        open={open}
        onCancel={onClose}
        footer={modalFooter}
        width="min(1200px, 95vw)"
        destroyOnHidden
        classNames={{ body: 'dpr-preview-modal-body' }}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto', padding: '16px 24px' } }}
      >
      {/* Report Info */}
      <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Project">{projectName}</Descriptions.Item>
        <Descriptions.Item label="Date">{fmtDate(entryDate)}</Descriptions.Item>
        <Descriptions.Item label="Supervisor">{header?.supervisor_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={header?.status === 'APPROVED' ? 'green' : header?.status === 'SUBMITTED' ? 'blue' : 'default'}>
            {header?.status ?? 'DRAFT'}
          </Tag>
        </Descriptions.Item>
        {header?.no_work && (
          <Descriptions.Item label="No Work" span={2}>
            <Tag color="orange">NO WORK — {header.no_work_reason}</Tag>
          </Descriptions.Item>
        )}
        {header?.daily_work_summary && (
          <Descriptions.Item label="Activity Summary" span={2}>{header.daily_work_summary}</Descriptions.Item>
        )}
      </Descriptions>

      {/* Cost Summary */}
      <Descriptions size="small" bordered column={2} title="Cost Summary" style={{ marginBottom: 16 }}>
        <Descriptions.Item label={`Labour (${symbol})`}>{fmtAmt(totalLabour)}</Descriptions.Item>
        <Descriptions.Item label={`Materials (${symbol})`}>{fmtAmt(totalMaterial)}</Descriptions.Item>
        <Descriptions.Item label={`Machinery (${symbol})`}>{fmtAmt(totalMachinery)}</Descriptions.Item>
        <Descriptions.Item label={`Expenses (${symbol})`}>{fmtAmt(totalExpense)}</Descriptions.Item>
        <Descriptions.Item label={`Grand Total (${symbol})`} span={2}>
          <Typography.Text strong style={{ fontSize: 15 }}>{fmtAmt(grandTotal)}</Typography.Text>
        </Descriptions.Item>
      </Descriptions>

      {/* Attendance */}
      {(attendance ?? []).length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>
            Attendance — {(attendance ?? []).length} present
          </Divider>
          <Table
            size="small" rowKey="id" dataSource={attendance ?? []} pagination={false}
            columns={[
              {
                title: 'Worker', dataIndex: 'worker_id',
                render: (id: string) => workerById.get(id) ?? id,
              },
              {
                title: 'Status', width: 140,
                render: (_: unknown, row: AttendanceRecordRead) =>
                  row.photo_url
                    ? <Tag color={row.within_geofence ? 'green' : 'orange'}>{row.within_geofence ? 'In boundary' : 'Out of boundary'}</Tag>
                    : <Tag>Auto-marked</Tag>,
              },
              {
                title: 'Location', dataIndex: 'location_name', ellipsis: true,
                render: (v: string | null) => v
                  ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>
                  : '—',
              },
            ]}
          />
        </>
      )}

      {/* Labour */}
      {(labour ?? []).length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>Labour</Divider>
          <Table
            size="small" rowKey="id" dataSource={labour ?? []} pagination={false} scroll={{ x: 660 }}
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}>Total Labour</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                  <Table.Summary.Cell index={5} align="right">{fmtAmt(totalLabour)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
            columns={[
              { title: 'Worker', dataIndex: 'worker_name' },
              {
                title: 'Type', dataIndex: 'worker_type', width: 110,
                render: (t: string) => <Tag color={t === 'NORMAL' ? 'blue' : t === 'CONTRACTOR' ? 'orange' : 'purple'}>{t}</Tag>,
              },
              { title: 'Unit', dataIndex: 'wage_unit', width: 60, render: (v: string | null) => v ?? 'DAY' },
              { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' as const },
              {
                title: `Amount (${symbol})`, dataIndex: 'amount', width: 110, align: 'right' as const,
                render: (v: string) => fmtAmt(parseFloat(v || '0')),
              },
              {
                title: `OT Amount (${symbol})`, dataIndex: 'overtime_amount', width: 110, align: 'right' as const,
                render: (v: string | null) => v != null ? fmtAmt(parseFloat(v)) : '—',
              },
              {
                title: 'Contractor Workers', dataIndex: 'contractor_workers_count', width: 140, align: 'right' as const,
                render: (v: number | null) => v ?? '—',
              },
            ]}
          />
        </>
      )}

      {/* Materials */}
      {(header?.materials ?? []).length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>Materials</Divider>
          <Table
            size="small" rowKey="id" dataSource={header?.materials ?? []} pagination={false} scroll={{ x: 500 }}
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}>Total Materials</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{fmtAmt(totalMaterial)}</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
            columns={[
              { title: 'Material', dataIndex: 'material_id', render: (id: string) => materialById.get(id) ?? id },
              { title: 'Qty', dataIndex: 'qty_consumed', width: 80, align: 'right' as const },
              { title: 'Unit', dataIndex: 'uom_id', width: 80, render: (id: string) => uomById.get(id) ?? id },
              {
                title: `Rate (${symbol})`, dataIndex: 'rate', width: 100, align: 'right' as const,
                render: (v: string | null) => v ? fmtAmt(parseFloat(v)) : '—',
              },
              {
                title: `Amount (${symbol})`, key: 'amount', width: 110, align: 'right' as const,
                render: (_: unknown, e: DprMaterialRead) => e.rate ? fmtAmt(parseFloat(e.rate) * parseFloat(e.qty_consumed)) : '—',
              },
            ]}
          />
        </>
      )}

      {/* Machinery */}
      {(header?.machinery_entries ?? []).length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>Machinery</Divider>
          <Table
            size="small" rowKey="id" dataSource={header?.machinery_entries ?? []} pagination={false} scroll={{ x: 520 }}
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}>Total Machinery</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{fmtAmt(totalMachinery)}</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
            columns={[
              { title: 'Machine', dataIndex: 'machinery_id', render: (id: string) => machineryById.get(id) ?? id },
              {
                title: 'Billing Unit', dataIndex: 'hire_unit', width: 110,
                render: (u: string) => (
                  <Tag color={u === 'OWNED' ? 'purple' : 'blue'} style={{ margin: 0 }}>
                    {MACHINERY_HIRE_UNIT_LABELS[u as keyof typeof MACHINERY_HIRE_UNIT_LABELS] ?? u}
                  </Tag>
                ),
              },
              { title: 'Qty', dataIndex: 'quantity_used', width: 70, align: 'right' as const },
              {
                title: `Hire Rate (${symbol})`, dataIndex: 'hire_rate', width: 120, align: 'right' as const,
                render: (v: string | null, e: DprMachineryRead) =>
                  e.hire_unit === 'OWNED'
                    ? <Typography.Text type="secondary">Owned</Typography.Text>
                    : (v ? fmtAmt(parseFloat(v)) : '—'),
              },
              {
                title: `Cost (${symbol})`, key: 'cost', width: 110, align: 'right' as const,
                render: (_: unknown, e: DprMachineryRead) =>
                  e.hire_rate ? fmtAmt(parseFloat(e.hire_rate) * parseFloat(e.quantity_used)) : '—',
              },
            ]}
          />
        </>
      )}

      {/* Measurements */}
      {forDateMeasurements.length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>
            Measurements — {forDateMeasurements.length} record{forDateMeasurements.length !== 1 ? 's' : ''}
          </Divider>
          <Table
            size="small" rowKey="id" dataSource={forDateMeasurements} pagination={false} scroll={{ x: 600 }}
            columns={[
              {
                title: 'BOQ Item', key: 'boq', ellipsis: true,
                render: (_: unknown, m: MeasurementRead) => {
                  const b = boqById.get(m.boq_item_id);
                  return b ? `${b.item_no} — ${b.description}` : m.boq_item_id;
                },
              },
              {
                title: 'Qty', dataIndex: 'computed_qty', width: 90, align: 'right' as const,
                render: (v: string) => fmtQtyPreview(v),
              },
              {
                title: `Amount (${symbol})`, key: 'amount', width: 110, align: 'right' as const,
                render: (_: unknown, m: MeasurementRead) => {
                  const b = boqById.get(m.boq_item_id);
                  const rate = m.rate != null ? parseFloat(m.rate) : (b?.rate != null ? parseFloat(b.rate) : null);
                  return rate != null ? fmtAmt(parseFloat(m.computed_qty) * rate) : '—';
                },
              },
              { title: 'Chainage', dataIndex: 'chainage', width: 120, render: (v: string | null) => v ?? '—' },
              {
                title: 'Status', dataIndex: 'status', width: 90,
                render: (v: string) => (
                  <Tag color={v === 'APPROVED' ? 'green' : v === 'SUBMITTED' ? 'blue' : 'default'} style={{ margin: 0 }}>{v}</Tag>
                ),
              },
              {
                title: 'Notes', dataIndex: 'notes', width: 60, align: 'center' as const,
                render: (v: string | null) => v
                  ? <Tooltip title={v}><FileTextOutlined /></Tooltip>
                  : <Typography.Text type="secondary">—</Typography.Text>,
              },
            ]}
          />
        </>
      )}

      {/* Expenses */}
      {(expenses ?? []).length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>Expenses</Divider>
          <Table
            size="small" rowKey="id" dataSource={expenses ?? []} pagination={false}
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                  <Table.Summary.Cell index={0}>Total Expenses</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">{fmtAmt(totalExpense)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
            columns={[
              { title: 'Category', dataIndex: 'expense_category_id', render: (id: string) => categoryById.get(id) ?? id },
              {
                title: `Amount (${symbol})`, dataIndex: 'amount', width: 120, align: 'right' as const,
                render: (v: string) => fmtAmt(parseFloat(v)),
              },
              { title: 'Vendor', dataIndex: 'vendor_name', width: 160, render: (v: string | null) => v ?? '—' },
              { title: 'Remarks', dataIndex: 'remarks', render: (v: string | null) => v ?? '—' },
            ]}
          />
        </>
      )}

      {/* Issues */}
      {(header?.issues ?? []).length > 0 && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>Issues</Divider>
          <Table
            size="small" rowKey="id" dataSource={header?.issues ?? []} pagination={false}
            columns={[
              { title: 'Description', dataIndex: 'description' },
              {
                title: 'Severity', dataIndex: 'severity', width: 100,
                render: (v: IssueSeverity) => <Tag color={SEVERITY_COLOR[v]} style={{ margin: 0 }}>{v}</Tag>,
              },
              {
                title: 'Status', dataIndex: 'status', width: 90,
                render: (v: string) => <Tag color={v === 'RESOLVED' ? 'green' : 'blue'} style={{ margin: 0 }}>{v}</Tag>,
              },
            ]}
          />
        </>
      )}

      {/* Production */}
      {(productionWithQty.length > 0 || header?.daily_work_summary) && (
        <>
          <Divider titlePlacement="left" style={{ margin: '12px 0 8px' }}>Production</Divider>
          {header?.daily_work_summary && (
            <Descriptions size="small" bordered column={1} style={{ marginBottom: 8 }}>
              <Descriptions.Item label="Daily Work Summary">{header.daily_work_summary}</Descriptions.Item>
            </Descriptions>
          )}
          {productionWithQty.length > 0 && (
            <Table
              size="small" rowKey="id" dataSource={productionWithQty} pagination={false} scroll={{ x: 680 }}
              columns={[
                {
                  title: 'BOQ Item', dataIndex: 'boq_item_id', ellipsis: true,
                  render: (id: string) => { const b = boqById.get(id); return b ? `${b.item_no} — ${b.description}` : id; },
                },
                { title: "Today's Qty", dataIndex: 'qty_today', width: 110, align: 'right' as const },
                {
                  title: `Rate Used (${symbol})`, dataIndex: 'rate_snapshot', width: 110, align: 'right' as const,
                  render: (v: string) => {
                    const val = parseFloat(v);
                    return val > 0 ? v : '—';
                  },
                },
                {
                  title: `Amount (${symbol})`, dataIndex: 'amount_today', width: 110, align: 'right' as const,
                  render: (v: string) => fmtAmt(parseFloat(v)),
                },
                { title: 'Chainage', dataIndex: 'chainage', width: 130, render: (v: string | null) => v ?? '—' },
              ]}
            />
          )}
        </>
      )}
      </Modal>
    </>
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const initializedForHeaderId = useRef<string | null>(null);
  const [noWork, setNoWork] = useState(false);
  const [noWorkReasonKind, setNoWorkReasonKind] = useState<string>('Rain');
  const [noWorkReasonCustom, setNoWorkReasonCustom] = useState('');
  const [activeTabKey, setActiveTabKey] = useState('production');

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
    } catch (err) {
      message.error(getApiErrorMessage(err, `Could not start the DPR for ${fmtDate(entryDateStr)}`));
    }
  };

  const handleMarkNoWork = async (checked: boolean) => {
    if (!currentDprHeaderId) return;
    if (checked && !computedNoWorkReason) { message.error('Please select a reason for the no-work day'); return; }
    try {
      await updateHeader.mutateAsync({ headerId: currentDprHeaderId, data: { no_work: checked, no_work_reason: checked ? computedNoWorkReason : null } });
    } catch (err) {
      message.error(getApiErrorMessage(err, checked ? 'Cannot mark as no-work' : 'Could not update'));
    }
  };

  const handleSupervisorBlur = async () => {
    if (!currentDprHeaderId || !header || header.status !== 'DRAFT') return;
    const trimmed = supervisorName.trim() || null;
    if (trimmed === header.supervisor_name) return;
    try {
      await updateHeader.mutateAsync({ headerId: currentDprHeaderId, data: { supervisor_name: trimmed } });
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not update supervisor name'));
    }
  };

  const handleSubmit = async () => {
    if (!currentDprHeaderId) return;
    try {
      await submitDpr.mutateAsync(currentDprHeaderId);
      message.success("Today's DPR submitted");
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not submit DPR'));
    }
  };

  const handleDeleteDpr = async () => {
    if (!currentDprHeaderId || !selectedProjectId) return;
    try {
      await deleteHeader.mutateAsync({ headerId: currentDprHeaderId, projectId: selectedProjectId });
      setCurrentDprHeaderId(null);
      message.success('DPR deleted');
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not delete DPR'));
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
      </div>
    );
  }

  const isSubmitted = header?.status !== 'DRAFT';
  // A Project Manager or Admin may still edit entries after submission (for
  // review-time corrections) — everyone else is locked out the moment the
  // DPR leaves DRAFT. This mirrors the backend's assert_dpr_editable rule
  // exactly. Production and Issues have no update/delete API at all, so
  // they keep the plain isSubmitted gate below, unaffected by this.
  const canBypassLock = authUser?.role === 'PROJECT_MANAGER' || authUser?.role === 'ADMIN';
  const isLocked = isSubmitted && !canBypassLock;

  const tabItems = [
    {
      key: 'production',
      label: 'Production',
      children: currentDprHeaderId ? <ProductionTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} isActive={activeTabKey === 'production'} /> : null,
    },
    {
      key: 'attendance',
      label: 'Attendance',
      children: selectedProjectId ? <AttendanceTab projectId={selectedProjectId} entryDate={entryDateStr} isSubmitted={isLocked} isActive={activeTabKey === 'attendance'} /> : null,
    },
    {
      key: 'labour',
      label: 'Labour',
      children: currentDprHeaderId && selectedProjectId
        ? <LabourTab headerId={currentDprHeaderId} projectId={selectedProjectId} isSubmitted={isLocked} isActive={activeTabKey === 'labour'} />
        : null,
    },
    {
      key: 'materials',
      label: 'Materials',
      children: currentDprHeaderId ? <MaterialsTab headerId={currentDprHeaderId} isSubmitted={isLocked} isActive={activeTabKey === 'materials'} /> : null,
    },
    {
      key: 'machinery',
      label: 'Machinery',
      children: currentDprHeaderId ? <MachineryTab headerId={currentDprHeaderId} isSubmitted={isLocked} isActive={activeTabKey === 'machinery'} /> : null,
    },
    {
      key: 'measurements',
      label: 'Measurements',
      children: selectedProjectId ? <MeasurementsTab projectId={selectedProjectId} entryDate={entryDateStr} isSubmitted={isLocked} isActive={activeTabKey === 'measurements'} /> : null,
    },
    {
      key: 'expenses',
      label: 'Expenses',
      children: selectedProjectId && currentDprHeaderId
        ? <ExpensesTab projectId={selectedProjectId} headerId={currentDprHeaderId} entryDate={entryDateStr} isSubmitted={isLocked} isActive={activeTabKey === 'expenses'} />
        : null,
    },
    {
      key: 'issues',
      label: 'Issues',
      children: currentDprHeaderId ? <IssuesTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} isActive={activeTabKey === 'issues'} /> : null,
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
          <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>Preview</Button>
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
          activeKey={activeTabKey}
          onChange={(key) => {
            setActiveTabKey(key);
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
                    <RequireAttendance projectId={selectedProjectId} date={entryDateStr}>{tab.children}</RequireAttendance>
                  ) : null,
                },
          )}
        />
      )}

      <DprPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onSubmit={handleSubmit}
        onDelete={handleDeleteDpr}
        projectId={selectedProjectId}
        headerId={currentDprHeaderId ?? ''}
        entryDate={entryDateStr}
        header={header}
        isSubmitted={isSubmitted}
        submitLoading={submitDpr.isPending}
        deleteLoading={deleteHeader.isPending}
        projectName={project?.name ?? selectedProjectId}
      />
    </div>
  );
}
