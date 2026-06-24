import { useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useWorkerCategories } from '@/api/hooks/useMasters';
import { useAttendanceRecords, useCreateWorker, useUpdateWorker, useWorkers, type WorkerRead } from '@/api/hooks/useAttendance';
import { useDateFormat } from '@/utils/format';
import { useIsMobile } from '@/hooks/useIsMobile';

interface WorkerCreateFormValues {
  full_name: string;
  worker_category_id: string;
  phone?: string;
  contractor_name?: string;
}

interface WorkerEditFormValues {
  full_name: string;
  worker_category_id: string;
  phone?: string;
  contractor_name?: string;
  is_active: boolean;
}

export function WorkersPage() {
  const isMobile = useIsMobile();
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: workers, isLoading: workersLoading } = useWorkers(selectedProjectId);
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceRecords(selectedProjectId);
  const { data: categories } = useWorkerCategories();
  const createWorker = useCreateWorker();
  const updateWorker = useUpdateWorker();
  const { fmtDate } = useDateFormat();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerRead | null>(null);
  const [createForm] = Form.useForm<WorkerCreateFormValues>();
  const [editForm] = Form.useForm<WorkerEditFormValues>();
  const [workerSearch, setWorkerSearch] = useState('');
  const [attendanceSearch, setAttendanceSearch] = useState('');

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const workerById = new Map((workers ?? []).map((w) => [w.id, w.full_name]));

  const filteredWorkers = (workers ?? []).filter((w) => {
    const q = workerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      w.full_name.toLowerCase().includes(q) ||
      (w.phone ?? '').toLowerCase().includes(q) ||
      (w.contractor_name ?? '').toLowerCase().includes(q)
    );
  });

  const filteredAttendance = (attendance ?? []).filter((a) => {
    const q = attendanceSearch.trim().toLowerCase();
    if (!q) return true;
    return (workerById.get(a.worker_id) ?? '').toLowerCase().includes(q);
  });

  const handleCreate = async (values: WorkerCreateFormValues) => {
    if (!selectedProjectId) return;
    try {
      await createWorker.mutateAsync({ project_id: selectedProjectId, ...values });
      message.success('Worker added');
      setCreateModalOpen(false);
      createForm.resetFields();
    } catch {
      message.error('Could not add worker');
    }
  };

  const openEdit = (worker: WorkerRead) => {
    setEditingWorker(worker);
    editForm.setFieldsValue({
      full_name: worker.full_name,
      worker_category_id: worker.worker_category_id,
      phone: worker.phone ?? undefined,
      contractor_name: worker.contractor_name ?? undefined,
      is_active: worker.is_active,
    });
  };

  const handleEdit = async (values: WorkerEditFormValues) => {
    if (!editingWorker) return;
    try {
      await updateWorker.mutateAsync({ id: editingWorker.id, data: values });
      message.success('Worker updated');
      setEditingWorker(null);
      editForm.resetFields();
    } catch {
      message.error('Could not update worker');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Workers & Attendance
        </Typography.Title>
        <Space>
          <ProjectSelector />
          <Button type="primary" icon={<PlusOutlined />} disabled={!selectedProjectId} onClick={() => setCreateModalOpen(true)}>
            {!isMobile && 'Add Worker'}
          </Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'workers',
            label: 'Worker Master',
            children: (
              <>
                <Input.Search
                  placeholder="Search by name, phone, or contractor"
                  allowClear
                  style={{ width: 280, marginBottom: 12 }}
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                />
                <Table
                rowKey="id"
                loading={workersLoading}
                dataSource={filteredWorkers}
                pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} workers` }}
                scroll={{ x: 750 }}
                columns={[
                  { title: 'Name', dataIndex: 'full_name', sorter: (a: WorkerRead, b: WorkerRead) => a.full_name.localeCompare(b.full_name) },
                  { title: 'Category', dataIndex: 'worker_category_id', render: (id: string) => categoryById.get(id) ?? id },
                  { title: 'Phone', dataIndex: 'phone' },
                  { title: 'Contractor', dataIndex: 'contractor_name', sorter: (a: WorkerRead, b: WorkerRead) => (a.contractor_name ?? '').localeCompare(b.contractor_name ?? '') },
                  {
                    title: 'Active',
                    dataIndex: 'is_active',
                    sorter: (a: WorkerRead, b: WorkerRead) => Number(b.is_active) - Number(a.is_active),
                    render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>,
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    render: (_, worker) => (
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(worker)} />
                    ),
                  },
                ]}
                />
              </>
            ),
          },
          {
            key: 'attendance',
            label: 'Attendance Log',
            children: (
              <>
                <Input.Search
                  placeholder="Search by worker name"
                  allowClear
                  style={{ width: 280, marginBottom: 12 }}
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                />
                <Table
                rowKey="id"
                loading={attendanceLoading}
                dataSource={filteredAttendance}
                pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
                scroll={{ x: 650 }}
                columns={[
                  { title: 'Date', dataIndex: 'attendance_date', sorter: (a, b) => a.attendance_date.localeCompare(b.attendance_date), render: fmtDate },
                  { title: 'Worker', dataIndex: 'worker_id', render: (id: string) => workerById.get(id) ?? id },
                  { title: 'Check-in Time', dataIndex: 'check_in_time', sorter: (a, b) => a.check_in_time.localeCompare(b.check_in_time) },
                  {
                    title: 'Geofence',
                    dataIndex: 'within_geofence',
                    render: (within: boolean) => <Tag color={within ? 'green' : 'red'}>{within ? 'Within' : 'Outside'}</Tag>,
                  },
                ]}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title="Add Worker"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createWorker.isPending}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="worker_category_id" label="Category" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="contractor_name" label="Contractor (reference only)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Worker"
        open={!!editingWorker}
        onCancel={() => setEditingWorker(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateWorker.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="worker_category_id" label="Category" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="contractor_name" label="Contractor">
            <Input />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
