import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import {
  useCreateMeasurement,
  useDeleteMeasurement,
  useMeasurements,
  useRecallMeasurement,
  useSubmitMeasurement,
  useUpdateMeasurement,
  type MeasurementRead,
  type MeasurementStatus,
} from '@/api/hooks/useMeasurements';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { useDprList } from '@/api/hooks/useDpr';
import { useAttachPhoto } from '@/api/hooks/usePhotos';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import { getCurrentPosition } from '@/utils/geolocation';
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
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const user = useAuthStore((s) => s.user);
  const { fmtDate } = useDateFormat();
  const { token } = theme.useToken();

  // data hooks
  const { data: measurements, isLoading } = useMeasurements(selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const { data: dprList } = useDprList(selectedProjectId);

  // mutation hooks
  const createMeasurement = useCreateMeasurement();
  const submitMeasurement = useSubmitMeasurement();
  const updateMeasurement = useUpdateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();
  const recallMeasurement = useRecallMeasurement();
  const uploadPhoto = useUploadPhoto();
  const attachPhoto = useAttachPhoto();

  // add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBoqItemId, setAddBoqItemId] = useState<string | null>(null);
  const [addDimensions, setAddDimensions] = useState<Record<string, number>>({});
  const [addChainage, setAddChainage] = useState('');
  const [addPhoto, setAddPhoto] = useState<File | null>(null);

  // edit modal state
  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRead | null>(null);
  const [editDimensions, setEditDimensions] = useState<Record<string, number>>({});
  const [editChainage, setEditChainage] = useState('');

  // search
  const [searchText, setSearchText] = useState('');

  // derived
  const boqById = useMemo(() => new Map((boqItems ?? []).map((b) => [b.id, b])), [boqItems]);

  const addBoqItem = addBoqItemId ? boqById.get(addBoqItemId) : undefined;
  const addWorkType = (workTypes ?? []).find((w) => w.id === addBoqItem?.work_type_id);
  const addDimFields = addWorkType?.dimension_fields ?? [];
  const addComputedQty = addWorkType
    ? calculateQuantity(addWorkType.formula, addDimFields, addDimensions)
    : 0;

  const editWorkType = useMemo(
    () => (editingMeasurement ? (workTypes ?? []).find((w) => w.id === editingMeasurement.work_type_id) : undefined),
    [editingMeasurement, workTypes],
  );
  const editComputedQty = useMemo(() => {
    if (!editWorkType) return 0;
    return calculateQuantity(editWorkType.formula, editWorkType.dimension_fields, editDimensions);
  }, [editWorkType, editDimensions]);

  const dprForDate = dprList?.find((d) => d.report_date === selectedEntryDate);
  const dprIsLocked = dprForDate && dprForDate.status !== 'DRAFT';

  const mine = useMemo(
    () => (measurements ?? []).filter((m) => m.recorded_by === user?.id),
    [measurements, user?.id],
  );

  const filteredMine = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter((m) => {
      const item = boqById.get(m.boq_item_id);
      return (
        (item?.item_no ?? '').toLowerCase().includes(q) ||
        (item?.description ?? '').toLowerCase().includes(q) ||
        (m.chainage ?? '').toLowerCase().includes(q)
      );
    });
  }, [mine, boqById, searchText]);

  // ── handlers ──────────────────────────────────────────────────────────────

  const resetAddForm = () => {
    setAddBoqItemId(null);
    setAddDimensions({});
    setAddChainage('');
    setAddPhoto(null);
  };

  const handleAdd = async () => {
    if (!selectedProjectId || !addBoqItemId) {
      message.warning('Select a BOQ item first');
      return;
    }
    if (addDimFields.length === 0) {
      message.warning('No dimension fields configured for this work type');
      return;
    }
    try {
      const measurement = await createMeasurement.mutateAsync({
        project_id: selectedProjectId,
        boq_item_id: addBoqItemId,
        measurement_date: selectedEntryDate,
        dimensions: Object.fromEntries(addDimFields.map((f) => [f, String(addDimensions[f] ?? 0)])),
        chainage: addChainage.trim() || null,
      });
      if (addPhoto) {
        try {
          const pos = await getCurrentPosition();
          const url = await uploadPhoto.mutateAsync({ prefix: 'measurements', file: addPhoto });
          await attachPhoto.mutateAsync({
            entity_type: 'MEASUREMENT',
            entity_id: measurement.id,
            photo_url: url,
            latitude: pos.latitude,
            longitude: pos.longitude,
            captured_at: new Date().toISOString(),
          });
        } catch {
          message.warning('Measurement saved but photo could not be attached.');
        }
      }
      message.success(`Measurement recorded — qty: ${measurement.computed_qty}`);
      resetAddForm();
    } catch {
      message.error('Could not save — check it does not exceed the BOQ tolerance.');
    }
  };

  const handleSubmit = async (id: string) => {
    try { await submitMeasurement.mutateAsync({ id }); message.success('Submitted for approval'); }
    catch { message.error('Could not submit'); }
  };

  const handleEditOpen = (record: MeasurementRead) => {
    setEditDimensions(Object.fromEntries(Object.entries(record.dimensions).map(([k, v]) => [k, parseFloat(v) || 0])));
    setEditChainage(record.chainage ?? '');
    setEditingMeasurement(record);
  };

  const handleEditSave = async () => {
    if (!editingMeasurement || !editWorkType) return;
    try {
      await updateMeasurement.mutateAsync({
        id: editingMeasurement.id,
        data: {
          dimensions: Object.fromEntries(editWorkType.dimension_fields.map((f) => [f, String(editDimensions[f] ?? 0)])),
          chainage: editChainage.trim() || null,
        },
      });
      message.success('Updated');
      setEditingMeasurement(null);
    } catch { message.error('Could not update — check it does not exceed the BOQ tolerance.'); }
  };

  const handleRecall = async (record: MeasurementRead) => {
    try { await recallMeasurement.mutateAsync({ id: record.id }); message.success('Recalled to Draft'); }
    catch { message.error('Could not recall'); }
  };

  const handleDelete = async (record: MeasurementRead) => {
    try { await deleteMeasurement.mutateAsync({ id: record.id, projectId: record.project_id }); message.success('Deleted'); }
    catch { message.error('Could not delete'); }
  };

  // ── columns ───────────────────────────────────────────────────────────────

  const columns: TableColumnsType<MeasurementRead> = [
    { title: 'Date', dataIndex: 'measurement_date', width: 100, render: fmtDate },
    {
      title: 'BOQ Item',
      dataIndex: 'boq_item_id',
      ellipsis: true,
      render: (id: string) => {
        const item = boqById.get(id);
        return item ? `${item.item_no} — ${item.description}` : id;
      },
    },
    { title: 'Chainage', dataIndex: 'chainage', width: 120, render: (v: string | null) => v ?? '—' },
    { title: 'Qty', dataIndex: 'computed_qty', width: 80, align: 'right' as const },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: MeasurementStatus) => <Tag color={STATUS_COLOR[s]}>{s.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: MeasurementRead) => (
        <Space size={4}>
          {record.status === 'DRAFT' && (
            <>
              <Button
                size="small"
                type="primary"
                loading={submitMeasurement.isPending}
                onClick={() => handleSubmit(record.id)}
              >
                Submit
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => handleEditOpen(record)} />
              <Popconfirm
                title="Delete this measurement?"
                description="Removes its contribution from DPR production."
                onConfirm={() => handleDelete(record)}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={deleteMeasurement.isPending} />
              </Popconfirm>
            </>
          )}
          {record.status === 'REJECTED' && (
            <Popconfirm
              title="Recall to Draft?"
              description="You can then edit and resubmit."
              onConfirm={() => handleRecall(record)}
              okText="Recall"
            >
              <Button size="small" loading={recallMeasurement.isPending}>Recall</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>My Measurements</Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Entry date: {fmtDate(selectedEntryDate)}
      </Typography.Text>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && (
        <Typography.Text type="secondary">Select a project to view your measurements.</Typography.Text>
      )}

      {selectedProjectId && isLoading && <Skeleton active />}

      {selectedProjectId && !isLoading && (
        <div style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          overflow: 'hidden',
        }}>
          {/* Header bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: token.colorFillAlter,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>Measurements</Typography.Text>
              <Tag style={{ margin: 0, fontSize: 11 }}>
                {mine.length} record{mine.length !== 1 ? 's' : ''}
              </Tag>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Input.Search
                placeholder="Search item, chainage…"
                allowClear
                size="small"
                style={{ width: 220 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <Button
                size="small"
                icon={<PlusOutlined />}
                type={showAddForm ? 'default' : 'default'}
                onClick={() => { setShowAddForm((v) => !v); if (showAddForm) resetAddForm(); }}
              >
                {showAddForm ? 'Cancel' : 'Add Measurement'}
              </Button>
            </span>
          </div>

          {/* Inline add form */}
          {showAddForm && (
            <RequireAttendance projectId={selectedProjectId}>
              <div style={{ padding: '16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}>

                {dprIsLocked && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={`DPR for ${fmtDate(selectedEntryDate)} is ${dprForDate?.status?.toLowerCase()} — measurement will be saved but won't update production totals until the DPR returns to Draft.`}
                  />
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: '2 1 260px' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>BOQ Item</Typography.Text>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                      placeholder="Select BOQ item"
                      value={addBoqItemId ?? undefined}
                      onChange={(v) => { setAddBoqItemId(v); setAddDimensions({}); }}
                      options={(boqItems ?? []).map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` }))}
                    />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Chainage / Location (optional)</Typography.Text>
                    <Input
                      placeholder="e.g. 2/130–2/390"
                      value={addChainage}
                      onChange={(e) => setAddChainage(e.target.value)}
                    />
                  </div>
                </div>

                {addDimFields.length > 0 && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      {addDimFields.map((field) => (
                        <div key={field} style={{ flex: '1 1 140px', minWidth: 120 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            {FIELD_LABELS[field] ?? field}
                          </Typography.Text>
                          <InputNumber
                            min={0}
                            style={{ width: '100%' }}
                            value={addDimensions[field]}
                            onChange={(v) => setAddDimensions((prev) => ({ ...prev, [field]: v ?? 0 }))}
                          />
                        </div>
                      ))}
                      <div style={{ flex: '1 1 120px', display: 'flex', alignItems: 'flex-end' }}>
                        <Statistic
                          title="Computed Qty"
                          value={addComputedQty.toFixed(3)}
                          valueStyle={{ fontSize: 20, fontWeight: 700, color: token.colorPrimary }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <PhotoCapture label="Evidence Photo (optional)" onCapture={setAddPhoto} />
                    </div>
                  </>
                )}

                {!addBoqItemId && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Select a BOQ item to see dimension fields.
                  </Typography.Text>
                )}

                <Divider style={{ margin: '12px 0' }} />
                <Space>
                  <Button
                    type="primary"
                    loading={createMeasurement.isPending || uploadPhoto.isPending}
                    disabled={!addBoqItemId || addDimFields.length === 0}
                    onClick={handleAdd}
                  >
                    Save Measurement
                  </Button>
                  <Button onClick={() => { setShowAddForm(false); resetAddForm(); }}>Cancel</Button>
                </Space>
              </div>
            </RequireAttendance>
          )}

          {/* Measurements table */}
          <Table<MeasurementRead>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={filteredMine}
            columns={columns}
            pagination={{ pageSize: 25, showSizeChanger: false, showTotal: (t) => `${t} records` }}
            scroll={{ x: 700 }}
            locale={{ emptyText: 'No measurements recorded yet' }}
          />
        </div>
      )}

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
