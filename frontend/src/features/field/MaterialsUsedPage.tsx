import { useState } from 'react';
import { Alert, Button, Form, InputNumber, List, Modal, Popconfirm, Select, Skeleton, Typography, message } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useAddDprMaterial,
  useDeleteDprMaterial,
  useDprHeader,
  useUpdateDprMaterial,
  type DprMaterialRead,
} from '@/api/hooks/useDpr';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';
import { useTodayDprHeader } from '@/hooks/useTodayDprHeader';
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useDateFormat } from '@/utils/format';

interface AddMaterialValues {
  material_id: string;
  qty_consumed: number;
  uom_id: string;
  rate: number | null;
}

interface EditMaterialValues {
  qty_consumed: number;
  uom_id: string;
  rate: number | null;
}

export function MaterialsUsedPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const { fmtDate } = useDateFormat();
  const { headerId, isLoading, ensureHeader, creating } = useTodayDprHeader(selectedProjectId);
  const { data: header } = useDprHeader(headerId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const addMaterial = useAddDprMaterial();
  const updateMaterial = useUpdateDprMaterial();
  const deleteMaterial = useDeleteDprMaterial();
  const [form] = Form.useForm<AddMaterialValues>();
  const [editForm] = Form.useForm<EditMaterialValues>();
  const [editingItem, setEditingItem] = useState<DprMaterialRead | null>(null);

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const uomById = new Map((uoms ?? []).map((u) => [u.id, u]));
  const isDraft = header?.status === 'DRAFT';
  const isLocked = !!headerId && !isDraft;

  const handleMaterialSelect = (materialId: string) => {
    const mat = materialById.get(materialId);
    if (!mat) return;
    form.setFieldsValue({
      uom_id: mat.default_uom_id,
      rate: mat.cost_rate != null ? parseFloat(mat.cost_rate) : null,
    });
  };

  const handleAdd = async (values: AddMaterialValues) => {
    try {
      const id = headerId ?? (await ensureHeader());
      await addMaterial.mutateAsync({
        headerId: id,
        data: {
          material_id: values.material_id,
          qty_consumed: String(values.qty_consumed),
          uom_id: values.uom_id,
          rate: values.rate != null ? String(values.rate) : undefined,
        },
      });
      message.success('Material entry added');
      form.resetFields();
    } catch {
      message.error('Could not add entry');
    }
  };

  const openEdit = (item: DprMaterialRead) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      qty_consumed: parseFloat(item.qty_consumed),
      uom_id: item.uom_id,
      rate: item.rate != null ? parseFloat(item.rate) : null,
    });
  };

  const handleEditSave = async (values: EditMaterialValues) => {
    if (!editingItem) return;
    try {
      await updateMaterial.mutateAsync({
        itemId: editingItem.id,
        data: {
          qty_consumed: String(values.qty_consumed),
          uom_id: values.uom_id,
          rate: values.rate != null ? String(values.rate) : undefined,
        },
      });
      message.success('Entry updated');
      setEditingItem(null);
      editForm.resetFields();
    } catch {
      message.error('Could not update entry');
    }
  };

  const handleDelete = async (item: DprMaterialRead) => {
    if (!headerId) return;
    try {
      await deleteMaterial.mutateAsync({ itemId: item.id, headerId });
      message.success('Entry deleted');
    } catch {
      message.error('Could not delete entry');
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>Materials Used</Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Entry date: {fmtDate(selectedEntryDate)}
      </Typography.Text>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Alert type="warning" showIcon message="Select a project to continue" />}

      {isLocked && (
        <Alert
          type="info"
          showIcon
          message={`The DPR for ${fmtDate(selectedEntryDate)} has been ${header?.status?.toLowerCase()} and is locked. Material entries cannot be added or edited. The Project Manager can return the DPR to Draft if corrections are needed.`}
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedProjectId && isLoading && <Skeleton active />}

      {selectedProjectId && !isLoading && (
        <RequireAttendance projectId={selectedProjectId}>
          <Form form={form} layout="vertical" onFinish={handleAdd}>
            <Form.Item name="material_id" label="Material" rules={[{ required: true }]}>
              <Select
                size="large"
                showSearch
                optionFilterProp="label"
                options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))}
                onSelect={handleMaterialSelect}
              />
            </Form.Item>
            <Form.Item name="qty_consumed" label="Quantity" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} size="large" />
            </Form.Item>
            <Form.Item name="uom_id" label="Unit" rules={[{ required: true }]}>
              <Select size="large" showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))} />
            </Form.Item>
            <Form.Item name="rate" label="Rate (per unit)" rules={[{ required: false }]}>
              <InputNumber min={0} style={{ width: '100%' }} size="large" placeholder="Auto-filled from master, editable" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={addMaterial.isPending || creating} disabled={!isDraft && !!headerId}>
              Add Entry
            </Button>
          </Form>
          <List
            style={{ marginTop: 24 }}
            header="Entries for this date"
            dataSource={header?.materials ?? []}
            renderItem={(row) => {
              const matName = materialById.get(row.material_id)?.name ?? row.material_id;
              const uomCode = uomById.get(row.uom_id)?.code ?? '';
              const rateStr = row.rate != null ? ` @ ₹${parseFloat(row.rate).toLocaleString('en-IN')}/${uomCode}` : '';
              return (
                <List.Item
                  actions={
                    isDraft
                      ? [
                          <Button key="edit" onClick={() => openEdit(row)}>Edit</Button>,
                          <Popconfirm
                            key="delete"
                            title="Delete this material entry?"
                            onConfirm={() => handleDelete(row)}
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                          >
                            <Button danger loading={deleteMaterial.isPending}>Delete</Button>
                          </Popconfirm>,
                        ]
                      : []
                  }
                >
                  <span>
                    {matName} — {row.qty_consumed} {uomCode}{rateStr}
                  </span>
                </List.Item>
              );
            }}
          />
        </RequireAttendance>
      )}

      <Modal
        title="Edit Material Entry"
        open={!!editingItem}
        onCancel={() => { setEditingItem(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMaterial.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
          <Form.Item name="qty_consumed" label="Quantity" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="uom_id" label="Unit" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))} />
          </Form.Item>
          <Form.Item name="rate" label="Rate (per unit)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
