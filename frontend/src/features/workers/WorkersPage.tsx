import { useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { EditOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import { useWorkerCategories } from '@/api/hooks/useMasters';
import {
  useAttendanceRecords,
  useCreateWorker,
  useUpdateWorker,
  useWorkers,
  type WorkerRead,
  type WorkerType,
} from '@/api/hooks/useAttendance';
import {
  useWorkerLedger,
  useWorkerLedgerSummary,
  useAddWorkerPayment,
  useDeleteWorkerPayment,
  type WorkerLedgerSummaryRow,
  type WorkerPaymentRead,
} from '@/api/hooks/useWorkerLedger';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { useIsMobile } from '@/hooks/useIsMobile';

const WORKER_TYPE_LABEL: Record<WorkerType, string> = {
  NORMAL: 'Normal Worker',
  CONTRACTOR: 'Contractor',
  SUBCONTRACTOR: 'Subcontractor',
};

const WORKER_TYPE_COLOR: Record<WorkerType, string> = {
  NORMAL: 'blue',
  CONTRACTOR: 'orange',
  SUBCONTRACTOR: 'purple',
};

const NORMAL_WAGE_UNITS = [
  { value: 'DAY', label: 'Per Day' },
  { value: 'HOUR', label: 'Per Hour' },
];

const CONTRACTOR_UNITS = ['CUM', 'SQM', 'RM', 'NOS', 'KG', 'MT', 'LM'].map((u) => ({ value: u, label: u }));

function LedgerTab({ projectId }: { projectId: string }) {
  const user = useAuthStore((s) => s.user);
  const canManagePayments = user?.role === 'PROJECT_MANAGER' || user?.role === 'ADMIN';
  const { data: summary, isLoading } = useWorkerLedgerSummary(projectId);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const { data: ledger, isLoading: ledgerLoading } = useWorkerLedger(projectId, selectedWorkerId);
  const addPayment = useAddWorkerPayment();
  const deletePayment = useDeleteWorkerPayment();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payForm] = Form.useForm();
  const { fmtDate } = useDateFormat();
  const { fmtAmt } = useNumberFormat();
  const [search, setSearch] = useState('');

  const filtered = (summary ?? []).filter((r) =>
    r.worker_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const handleAddPayment = async (values: {
    payment_date: dayjs.Dayjs;
    payment_type: string;
    amount: number;
    remarks?: string;
  }) => {
    if (!selectedWorkerId) return;
    try {
      await addPayment.mutateAsync({
        worker_id: selectedWorkerId,
        project_id: projectId,
        payment_date: values.payment_date.format('YYYY-MM-DD'),
        payment_type: values.payment_type as 'ADVANCE' | 'PAYMENT' | 'DEDUCTION',
        amount: String(values.amount),
        remarks: values.remarks?.trim() || undefined,
      });
      message.success('Transaction recorded');
      setPaymentModalOpen(false);
      payForm.resetFields();
    } catch {
      message.error('Could not record transaction');
    }
  };

  const handleDeletePayment = async (p: WorkerPaymentRead) => {
    try {
      await deletePayment.mutateAsync({ paymentId: p.id, projectId, workerId: p.worker_id });
      message.success('Transaction deleted');
    } catch {
      message.error('Could not delete transaction');
    }
  };

  const summaryColumns: TableColumnsType<WorkerLedgerSummaryRow> = [
    { title: 'Worker', dataIndex: 'worker_name', sorter: (a, b) => a.worker_name.localeCompare(b.worker_name) },
    {
      title: 'Type',
      dataIndex: 'worker_type',
      width: 120,
      render: (t: WorkerType) => <Tag color={WORKER_TYPE_COLOR[t]}>{WORKER_TYPE_LABEL[t]}</Tag>,
    },
    { title: 'Unit', dataIndex: 'wage_unit', width: 70, render: (v: string | null) => v ?? '—' },
    { title: 'Earned (Approved)', dataIndex: 'total_earned', align: 'right' as const, render: fmtAmt },
    { title: 'Paid', dataIndex: 'total_paid', align: 'right' as const, render: fmtAmt },
    { title: 'Deducted', dataIndex: 'total_deducted', align: 'right' as const, render: fmtAmt },
    {
      title: 'Balance Pending',
      dataIndex: 'balance_pending',
      align: 'right' as const,
      render: (v: string) => (
        <span style={{ color: parseFloat(v) > 0 ? '#fa8c16' : parseFloat(v) < 0 ? '#52c41a' : undefined, fontWeight: 600 }}>
          {fmtAmt(v)}
        </span>
      ),
    },
    {
      title: '',
      key: 'open',
      width: 60,
      render: (_: unknown, row: WorkerLedgerSummaryRow) => (
        <Button size="small" icon={<WalletOutlined />} onClick={() => setSelectedWorkerId(row.worker_id)} />
      ),
    },
  ];

  return (
    <>
      <Input.Search
        placeholder="Search by worker name"
        allowClear
        style={{ width: 280, marginBottom: 12 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Table
        rowKey="worker_id"
        loading={isLoading}
        dataSource={filtered}
        columns={summaryColumns}
        size="small"
        scroll={{ x: 750 }}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'] }}
      />

      <Drawer
        title={ledger ? `Ledger — ${ledger.worker_name}` : 'Worker Ledger'}
        open={!!selectedWorkerId}
        onClose={() => setSelectedWorkerId(null)}
        width={520}
        extra={
          canManagePayments ? (
            <Button type="primary" size="small" onClick={() => setPaymentModalOpen(true)}>
              Record Transaction
            </Button>
          ) : null
        }
      >
        {ledgerLoading && <Typography.Text type="secondary">Loading…</Typography.Text>}
        {ledger && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
              <Statistic title="Total Earned" value={fmtAmt(ledger.total_earned)} />
              <Statistic title="Total Paid" value={fmtAmt(ledger.total_paid)} />
              <Statistic title="Deducted" value={fmtAmt(ledger.total_deducted)} />
              <Statistic
                title="Balance Pending"
                value={fmtAmt(ledger.balance_pending)}
                valueStyle={{ color: parseFloat(ledger.balance_pending) > 0 ? '#fa8c16' : '#52c41a' }}
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Earned = sum of amounts from approved DPR labour entries for this worker.
            </Typography.Text>
            <Table
              style={{ marginTop: 16 }}
              rowKey="id"
              size="small"
              dataSource={ledger.payments}
              pagination={false}
              columns={[
                { title: 'Date', dataIndex: 'payment_date', render: fmtDate, width: 90 },
                {
                  title: 'Type',
                  dataIndex: 'payment_type',
                  width: 90,
                  render: (t: string) => (
                    <Tag color={t === 'ADVANCE' ? 'orange' : t === 'PAYMENT' ? 'green' : 'red'}>{t}</Tag>
                  ),
                },
                { title: 'Amount', dataIndex: 'amount', align: 'right' as const, render: fmtAmt },
                { title: 'Remarks', dataIndex: 'remarks', render: (v: string | null) => v ?? '—' },
                canManagePayments
                  ? {
                      title: '',
                      key: 'del',
                      width: 50,
                      render: (_: unknown, p: WorkerPaymentRead) => (
                        <Popconfirm
                          title="Delete this transaction?"
                          onConfirm={() => handleDeletePayment(p)}
                          okButtonProps={{ danger: true }}
                          okText="Delete"
                        >
                          <Button size="small" danger loading={deletePayment.isPending} />
                        </Popconfirm>
                      ),
                    }
                  : { key: 'noop', width: 0, render: () => null },
              ]}
            />
          </>
        )}
      </Drawer>

      <Modal
        title="Record Transaction"
        open={paymentModalOpen}
        onCancel={() => { setPaymentModalOpen(false); payForm.resetFields(); }}
        onOk={() => payForm.submit()}
        confirmLoading={addPayment.isPending}
        destroyOnHidden
      >
        <Form form={payForm} layout="vertical" onFinish={handleAddPayment}>
          <Form.Item name="payment_date" label="Date" rules={[{ required: true }]} initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="payment_type" label="Type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ADVANCE', label: 'Advance' },
                { value: 'PAYMENT', label: 'Final Payment' },
                { value: 'DEDUCTION', label: 'Deduction' },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function WorkersPage() {
  const isMobile = useIsMobile();
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: workers, isLoading: workersLoading } = useWorkers(selectedProjectId);
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceRecords(selectedProjectId);
  const { data: categories } = useWorkerCategories();
  const createWorker = useCreateWorker();
  const updateWorker = useUpdateWorker();
  const { fmtDate, fmtDateTime } = useDateFormat();
  const { fmtAmt } = useNumberFormat();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerRead | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [createType, setCreateType] = useState<WorkerType>('NORMAL');
  const [editType, setEditType] = useState<WorkerType>('NORMAL');
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

  const handleCreate = async (values: Record<string, unknown>) => {
    if (!selectedProjectId) return;
    try {
      await createWorker.mutateAsync({
        project_id: selectedProjectId,
        worker_category_id: values.worker_category_id as string,
        full_name: values.full_name as string,
        phone: values.phone as string | undefined,
        contractor_name: values.contractor_name as string | undefined,
        worker_type: values.worker_type as WorkerType,
        wage_unit: values.wage_unit as string | undefined,
        default_rate: values.default_rate != null ? String(values.default_rate) : undefined,
      });
      message.success('Worker added');
      setCreateModalOpen(false);
      createForm.resetFields();
      setCreateType('NORMAL');
    } catch {
      message.error('Could not add worker');
    }
  };

  const openEdit = (worker: WorkerRead) => {
    setEditingWorker(worker);
    setEditType((worker.worker_type as WorkerType) || 'NORMAL');
    editForm.setFieldsValue({
      full_name: worker.full_name,
      worker_category_id: worker.worker_category_id,
      phone: worker.phone ?? undefined,
      contractor_name: worker.contractor_name ?? undefined,
      is_active: worker.is_active,
      worker_type: worker.worker_type || 'NORMAL',
      wage_unit: worker.wage_unit ?? undefined,
      default_rate: worker.default_rate ? parseFloat(worker.default_rate) : undefined,
    });
  };

  const handleEdit = async (values: Record<string, unknown>) => {
    if (!editingWorker) return;
    try {
      await updateWorker.mutateAsync({
        id: editingWorker.id,
        data: {
          full_name: values.full_name as string,
          worker_category_id: values.worker_category_id as string,
          phone: values.phone as string | undefined,
          contractor_name: values.contractor_name as string | undefined,
          is_active: values.is_active as boolean,
          worker_type: values.worker_type as WorkerType,
          wage_unit: values.wage_unit as string | undefined,
          default_rate: values.default_rate != null ? String(values.default_rate) : null,
        },
      });
      message.success('Worker updated');
      setEditingWorker(null);
      editForm.resetFields();
    } catch {
      message.error('Could not update worker');
    }
  };

  const workerColumns: TableColumnsType<WorkerRead> = [
    { title: 'Name', dataIndex: 'full_name', sorter: (a, b) => a.full_name.localeCompare(b.full_name) },
    { title: 'Category', dataIndex: 'worker_category_id', render: (id: string) => categoryById.get(id) ?? id },
    {
      title: 'Type',
      dataIndex: 'worker_type',
      width: 120,
      render: (t: WorkerType) => <Tag color={WORKER_TYPE_COLOR[t ?? 'NORMAL']}>{WORKER_TYPE_LABEL[t ?? 'NORMAL']}</Tag>,
    },
    { title: 'Unit', dataIndex: 'wage_unit', width: 70, render: (v: string | null) => v ?? '—' },
    { title: 'Rate', dataIndex: 'default_rate', width: 100, align: 'right' as const, render: (v: string | null) => v ? fmtAmt(v) : '—' },
    { title: 'Phone', dataIndex: 'phone', width: 110 },
    { title: 'Contractor', dataIndex: 'contractor_name' },
    {
      title: 'Active',
      dataIndex: 'is_active',
      width: 70,
      render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 60,
      render: (_: unknown, worker: WorkerRead) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(worker)} />
      ),
    },
  ];

  const workerTypeUnitField = (workerType: WorkerType) => {
    if (workerType === 'NORMAL') {
      return (
        <Form.Item name="wage_unit" label="Wage Unit">
          <Radio.Group options={NORMAL_WAGE_UNITS} optionType="button" />
        </Form.Item>
      );
    }
    return (
      <Form.Item name="wage_unit" label="Work Unit (what you pay per)">
        <Select showSearch placeholder="e.g. CUM, SQM…" options={CONTRACTOR_UNITS} />
      </Form.Item>
    );
  };

  const workerFormBody = (workerType: WorkerType, onTypeChange: (t: WorkerType) => void) => (
    <>
      <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="worker_category_id" label="Category" rules={[{ required: true }]}>
        <Select showSearch optionFilterProp="label" options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      </Form.Item>
      <Form.Item name="worker_type" label="Worker Type" initialValue="NORMAL">
        <Select
          options={Object.entries(WORKER_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
          onChange={(v) => onTypeChange(v as WorkerType)}
        />
      </Form.Item>
      {workerTypeUnitField(workerType)}
      <Form.Item name="default_rate" label="Rate (overrides category rate if set)">
        <InputNumber min={0} style={{ width: '100%' }} precision={2} />
      </Form.Item>
      <Form.Item name="phone" label="Phone">
        <Input />
      </Form.Item>
      {(workerType === 'CONTRACTOR' || workerType === 'SUBCONTRACTOR') && (
        <Form.Item name="contractor_name" label="Firm / Company Name">
          <Input />
        </Form.Item>
      )}
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Workers & Attendance
        </Typography.Title>
        <Space>
          <ProjectSelector />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selectedProjectId}
            onClick={() => setCreateModalOpen(true)}
          >
            {!isMobile && 'Add Worker'}
          </Button>
        </Space>
      </div>

      {!selectedProjectId && <Alert type="warning" showIcon message="Select a project to view workers." />}

      {selectedProjectId && (
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
                    size="small"
                    loading={workersLoading}
                    dataSource={filteredWorkers}
                    columns={workerColumns}
                    pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (t) => `${t} workers` }}
                    scroll={{ x: 900 }}
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
                    size="small"
                    loading={attendanceLoading}
                    dataSource={filteredAttendance}
                    pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (t) => `${t} records` }}
                    scroll={{ x: 650 }}
                    columns={[
                      { title: 'Date', dataIndex: 'attendance_date', sorter: (a, b) => a.attendance_date.localeCompare(b.attendance_date), render: fmtDate },
                      { title: 'Worker', dataIndex: 'worker_id', render: (id: string) => workerById.get(id) ?? id },
                      { title: 'Check-in Time', dataIndex: 'check_in_time', sorter: (a, b) => a.check_in_time.localeCompare(b.check_in_time), render: fmtDateTime },
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
            {
              key: 'ledger',
              label: 'Worker Ledger',
              children: <LedgerTab projectId={selectedProjectId} />,
            },
          ]}
        />
      )}

      <Modal
        title="Add Worker"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); setCreateType('NORMAL'); }}
        onOk={() => createForm.submit()}
        confirmLoading={createWorker.isPending}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          {workerFormBody(createType, setCreateType)}
        </Form>
      </Modal>

      <Modal
        title="Edit Worker"
        open={!!editingWorker}
        onCancel={() => { setEditingWorker(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateWorker.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          {workerFormBody(editType, setEditType)}
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
