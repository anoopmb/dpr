import { useState } from 'react';
import { Alert, Button, Form, InputNumber, List, Modal, Popconfirm, Select, Skeleton, Typography, message } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useAddDprMachinery,
  useDeleteDprMachinery,
  useDprHeader,
  useUpdateDprMachinery,
  type DprMachineryRead,
} from '@/api/hooks/useDpr';
import { useMachinery } from '@/api/hooks/useMasters';
import { useTodayDprHeader } from '@/hooks/useTodayDprHeader';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { RequireAttendance } from '@/components/field/RequireAttendance';

interface EditMachineryValues {
  hours_used: number;
  hire_rate?: number;
}

export function MachineryUsedPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const { fmtDate } = useDateFormat();
  const { headerId, isLoading, ensureHeader, creating } = useTodayDprHeader(selectedProjectId);
  const { data: header } = useDprHeader(headerId);
  const { data: machinery } = useMachinery();
  const addMachinery = useAddDprMachinery();
  const updateMachinery = useUpdateDprMachinery();
  const deleteMachinery = useDeleteDprMachinery();
  const [form] = Form.useForm();
  const [editForm] = Form.useForm<EditMachineryValues>();
  const { fmtAmt, symbol } = useNumberFormat();
  const [editingItem, setEditingItem] = useState<DprMachineryRead | null>(null);

  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m]));
  const isDraft = header?.status === 'DRAFT';

  const handleAdd = async (values: { machinery_id: string; hours_used: number; hire_rate?: number }) => {
    try {
      const id = headerId ?? (await ensureHeader());
      await addMachinery.mutateAsync({
        headerId: id,
        data: {
          machinery_id: values.machinery_id,
          hours_used: String(values.hours_used),
          hire_rate: values.hire_rate !== undefined ? String(values.hire_rate) : undefined,
        },
      });
      message.success('Machinery entry added');
      form.resetFields();
    } catch {
      message.error('Could not add entry');
    }
  };

  const openEdit = (item: DprMachineryRead) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      hours_used: parseFloat(item.hours_used),
      hire_rate: item.hire_rate ? parseFloat(item.hire_rate) : undefined,
    });
  };

  const handleEditSave = async (values: EditMachineryValues) => {
    if (!editingItem) return;
    try {
      await updateMachinery.mutateAsync({
        itemId: editingItem.id,
        data: {
          hours_used: String(values.hours_used),
          hire_rate: values.hire_rate !== undefined ? String(values.hire_rate) : null,
        },
      });
      message.success('Entry updated');
      setEditingItem(null);
      editForm.resetFields();
    } catch {
      message.error('Could not update entry');
    }
  };

  const handleDelete = async (item: DprMachineryRead) => {
    if (!headerId) return;
    try {
      await deleteMachinery.mutateAsync({ itemId: item.id, headerId });
      message.success('Entry deleted');
    } catch {
      message.error('Could not delete entry');
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>Machinery Used</Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Entry date: {fmtDate(selectedEntryDate)}
      </Typography.Text>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Alert type="warning" showIcon message="Select a project to continue" />}

      {selectedProjectId && isLoading && <Skeleton active />}

      {selectedProjectId && !isLoading && (
        <RequireAttendance projectId={selectedProjectId}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleAdd}
            onValuesChange={(changed) => {
              if (changed.machinery_id) {
                const master = machineryById.get(changed.machinery_id);
                form.setFieldValue('hire_rate', master?.hire_rate ? parseFloat(master.hire_rate) : undefined);
              }
            }}
          >
            <Form.Item name="machinery_id" label="Machine" rules={[{ required: true }]}>
              <Select size="large" options={(machinery ?? []).map((m) => ({ value: m.id, label: m.name }))} />
            </Form.Item>
            <Form.Item name="hours_used" label="Hours Used" rules={[{ required: true }]}>
              <InputNumber min={0} max={24} style={{ width: '100%' }} size="large" />
            </Form.Item>
            <Form.Item name="hire_rate" label={`Hire Rate (${symbol}, today's rate — editable)`}>
              <InputNumber min={0} style={{ width: '100%' }} size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={addMachinery.isPending || creating} disabled={!isDraft && !!headerId}>
              Add Entry
            </Button>
          </Form>
          <List
            style={{ marginTop: 24 }}
            header="Entries for this date"
            dataSource={header?.machinery_entries ?? []}
            renderItem={(row) => (
              <List.Item
                actions={
                  isDraft
                    ? [
                        <Button key="edit" size="small" onClick={() => openEdit(row)}>Edit</Button>,
                        <Popconfirm
                          key="delete"
                          title="Delete this machinery entry?"
                          onConfirm={() => handleDelete(row)}
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger loading={deleteMachinery.isPending}>Delete</Button>
                        </Popconfirm>,
                      ]
                    : []
                }
              >
                <span>
                  {machineryById.get(row.machinery_id)?.name ?? row.machinery_id} — {row.hours_used} hrs
                  {row.hire_rate ? ` @ ${fmtAmt(row.hire_rate)}/hr` : ''}
                </span>
              </List.Item>
            )}
          />
        </RequireAttendance>
      )}

      <Modal
        title="Edit Machinery Entry"
        open={!!editingItem}
        onCancel={() => { setEditingItem(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMachinery.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
          <Form.Item name="hours_used" label="Hours Used" rules={[{ required: true }]}>
            <InputNumber min={0} max={24} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="hire_rate" label={`Hire Rate (${symbol})`}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
