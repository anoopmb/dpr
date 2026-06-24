import { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useCreateMaster, useDeleteMaster, useUpdateMaster, type MasterRow } from '@/api/hooks/useMasters';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

interface ExtraNumberField {
  name: string;
  label: string;
  min?: number;
  max?: number;
  defaultValue?: number;
}

interface SimpleCodeNameTabProps<TRow extends MasterRow = MasterRow> {
  apiPath: string;
  query: UseQueryResult<TRow[]>;
  label: string;
  extraField?: ExtraNumberField;
}

export function SimpleCodeNameTab<TRow extends MasterRow = MasterRow>({
  apiPath,
  query,
  label,
  extraField,
}: SimpleCodeNameTabProps<TRow>) {
  const { data, isLoading } = query;
  type FormValues = { code: string; name: string } & Partial<Record<string, number>>;
  const createMaster = useCreateMaster<TRow, FormValues>(apiPath);
  const updateMaster = useUpdateMaster<TRow, Partial<FormValues>>(apiPath);
  const deleteMaster = useDeleteMaster(apiPath);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TRow | null>(null);
  const [form] = Form.useForm<FormValues>();

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    if (extraField && extraField.defaultValue !== undefined) {
      form.setFieldsValue({ [extraField.name]: extraField.defaultValue } as Partial<FormValues>);
    }
    setModalOpen(true);
  };

  const openEdit = (row: TRow) => {
    setEditing(row);
    form.setFieldsValue({
      code: row.code,
      name: row.name,
      ...(extraField ? { [extraField.name]: row[extraField.name as keyof TRow] } : {}),
    } as FormValues);
    setModalOpen(true);
  };

  const handleSave = async (values: FormValues) => {
    try {
      if (editing) {
        await updateMaster.mutateAsync({ id: editing.id, data: values });
        message.success(`${label} updated`);
      } else {
        await createMaster.mutateAsync(values);
        message.success(`${label} added`);
      }
      setModalOpen(false);
      form.resetFields();
    } catch {
      message.error(`Could not save ${label.toLowerCase()}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMaster.mutateAsync(id);
      message.success(`${label} deleted`);
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 409) {
        message.error(`Cannot delete — this ${label.toLowerCase()} is referenced by existing data.`);
      } else {
        message.error(`Could not delete ${label.toLowerCase()}`);
      }
    }
  };

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={openAdd}>
        Add {label}
      </Button>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
        scroll={{ x: 500 }}
        columns={[
          {
            title: 'Code',
            dataIndex: 'code',
            sorter: (a: TRow, b: TRow) => a.code.localeCompare(b.code),
          },
          {
            title: 'Name',
            dataIndex: 'name',
            sorter: (a: TRow, b: TRow) => a.name.localeCompare(b.name),
          },
          ...(extraField
            ? [
                {
                  title: extraField.label,
                  dataIndex: extraField.name,
                  width: 140,
                  sorter: (a: TRow, b: TRow) =>
                    Number(a[extraField.name as keyof TRow]) - Number(b[extraField.name as keyof TRow]),
                },
              ]
            : []),
          {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm
                  title={`Delete this ${label.toLowerCase()}?`}
                  description="This cannot be undone."
                  onConfirm={() => handleDelete(row.id)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? `Edit ${label}` : `Add ${label}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMaster.isPending || updateMaster.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {extraField && (
            <Form.Item
              name={extraField.name}
              label={extraField.label}
              rules={[{ required: true }]}
            >
              <InputNumber min={extraField.min} max={extraField.max} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
