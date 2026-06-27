import { useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useMeasurements } from '@/api/hooks/useMeasurements';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  useCreateRunningBill,
  useRecordPayment,
  useRunningBills,
  type RunningBillRead,
} from '@/api/hooks/useBilling';
import { useDateFormat, useNumberFormat } from '@/utils/format';

const BILL_STATUS_COLOR: Record<string, string> = { DRAFT: 'default', SUBMITTED: 'blue', APPROVED: 'gold', PAID: 'green' };

interface BillFormValues {
  bill_number: string;
  bill_date: Dayjs;
  from_date: Dayjs;
  to_date: Dayjs;
  measurement_ids: string[];
}

interface PaymentFormValues {
  amount_received: number;
  received_date: Dayjs;
  reference_no?: string;
}

export function BillingPage() {
  const isMobile = useIsMobile();
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: bills, isLoading } = useRunningBills(selectedProjectId);
  const { data: measurements } = useMeasurements(selectedProjectId);
  const createBill = useCreateRunningBill();
  const recordPayment = useRecordPayment();
  const { fmtDate, dateFormat } = useDateFormat();
  const { fmtAmt } = useNumberFormat();

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<BillFormValues>();
  const [paymentBill, setPaymentBill] = useState<RunningBillRead | null>(null);
  const [paymentForm] = Form.useForm<PaymentFormValues>();
  const [searchText, setSearchText] = useState('');

  const billableMeasurements = (measurements ?? []).filter((m) => !m.billed);

  const filteredBills = (bills ?? []).filter((b) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return b.bill_number.toLowerCase().includes(q);
  });

  const handleCreate = async (values: BillFormValues) => {
    if (!selectedProjectId) return;
    try {
      await createBill.mutateAsync({
        project_id: selectedProjectId,
        bill_number: values.bill_number,
        bill_date: values.bill_date.format('YYYY-MM-DD'),
        from_date: values.from_date.format('YYYY-MM-DD'),
        to_date: values.to_date.format('YYYY-MM-DD'),
        measurement_ids: values.measurement_ids,
      });
      message.success('Running bill generated');
      setModalOpen(false);
      form.resetFields();
    } catch {
      message.error('Could not generate bill');
    }
  };

  const handlePayment = async (values: PaymentFormValues) => {
    if (!paymentBill) return;
    try {
      await recordPayment.mutateAsync({
        billId: paymentBill.id,
        data: {
          amount_received: String(values.amount_received),
          received_date: values.received_date.format('YYYY-MM-DD'),
          reference_no: values.reference_no,
        },
      });
      message.success('Payment recorded');
      setPaymentBill(null);
      paymentForm.resetFields();
    } catch {
      message.error('Could not record payment — check it does not exceed the remaining balance');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Running Bills
        </Typography.Title>
        <Space>
          <ProjectSelector />
          <Input.Search
            placeholder="Search by bill number"
            allowClear
            style={{ width: 240 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button type="primary" icon={<PlusOutlined />} disabled={!selectedProjectId} onClick={() => setModalOpen(true)}>
            {!isMobile && 'New Bill'}
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={filteredBills}
        scroll={{ x: 700 }}
        columns={[
          { title: 'Bill No', dataIndex: 'bill_number' },
          { title: 'From', dataIndex: 'from_date', render: fmtDate },
          { title: 'To', dataIndex: 'to_date', render: fmtDate },
          { title: 'Total', dataIndex: 'total_amount', render: fmtAmt },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: string) => <Tag color={BILL_STATUS_COLOR[status]}>{status}</Tag>,
          },
          {
            title: 'Actions',
            key: 'actions',
            render: (_, bill) =>
              bill.status !== 'PAID' && (
                <Button size="small" onClick={() => setPaymentBill(bill)}>
                  Record Payment
                </Button>
              ),
          },
        ]}
      />

      <Modal
        title="Generate Running Bill"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createBill.isPending}
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ bill_date: dayjs(), to_date: dayjs() }}>
          <Form.Item name="bill_number" label="Bill Number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bill_date" label="Bill Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format={dateFormat} />
          </Form.Item>
          <Form.Item name="from_date" label="Period From" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format={dateFormat} />
          </Form.Item>
          <Form.Item name="to_date" label="Period To" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format={dateFormat} />
          </Form.Item>
          <Form.Item
            name="measurement_ids"
            label="Locked, unbilled measurements to include"
            rules={[{ required: true, message: 'Select at least one measurement' }]}
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={billableMeasurements}
              rowSelection={{
                type: 'checkbox',
                onChange: (selectedKeys) => form.setFieldValue('measurement_ids', selectedKeys),
              }}
              columns={[
                { title: 'Date', dataIndex: 'measurement_date', render: fmtDate },
                { title: 'Qty', dataIndex: 'computed_qty' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Record Payment — ${paymentBill?.bill_number ?? ''}`}
        open={!!paymentBill}
        onCancel={() => setPaymentBill(null)}
        onOk={() => paymentForm.submit()}
        confirmLoading={recordPayment.isPending}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Total: {fmtAmt(paymentBill?.total_amount)}
        </Typography.Paragraph>
        <Form form={paymentForm} layout="vertical" onFinish={handlePayment} initialValues={{ received_date: dayjs() }}>
          <Form.Item name="amount_received" label="Amount Received" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="received_date" label="Received Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format={dateFormat} />
          </Form.Item>
          <Form.Item name="reference_no" label="Reference No (cheque/UTR)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
