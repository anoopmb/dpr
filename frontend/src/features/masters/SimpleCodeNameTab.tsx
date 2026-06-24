import { useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Space, Table, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useCreateMaster, useDeleteMaster, useUpdateMaster, type MasterRow } from '@/api/hooks/useMasters';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

interface SimpleCodeNameTabProps {
  apiPath: string;
  query: UseQueryResult<MasterRow[]>;
  label: string;
}

export function SimpleCodeNameTab({ apiPath, query, label }: SimpleCodeNameTabProps) {
  const { data, isLoading } = query;
  const createMaster = useCreateMaster<MasterRow, { code: string; name: string }>(apiPath);
  const updateMaster = useUpdateMaster<MasterRow, { code?: string; name?: string }>(apiPath);
  const deleteMaster = useDeleteMaster(apiPath);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [form] = Form.useForm<{ code: string; name: string }>();

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (row: MasterRow) => {
    setEditing(row);
    form.setFieldsValue({ code: row.code, name: row.name });
    setModalOpen(true);
  };

  const handleSave = async (values: { code: string; name: string }) => {
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
        columns={[
          { title: 'Code', dataIndex: 'code', sorter: (a: MasterRow, b: MasterRow) => a.code.localeCompare(b.code), defaultSortOrder: 'ascend' as const },
          { title: 'Name', dataIndex: 'name', sorter: (a: MasterRow, b: MasterRow) => a.name.localeCompare(b.name) },
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
        </Form>
      </Modal>
    </div>
  );
}
