import { Alert, Button, Form, InputNumber, List, Select, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAddDprMachinery, useDprHeader } from '@/api/hooks/useDpr';
import { useMachinery } from '@/api/hooks/useMasters';

export function MachineryUsedPage() {
  const currentDprHeaderId = useProjectContextStore((s) => s.currentDprHeaderId);
  const { data: header } = useDprHeader(currentDprHeaderId);
  const { data: machinery } = useMachinery();
  const addMachinery = useAddDprMachinery();
  const [form] = Form.useForm();

  if (!currentDprHeaderId) {
    return (
      <Alert
        type="warning"
        showIcon
        message="No DPR started for today"
        description={<Link to="/field/dpr-today">Go to Today's DPR to start one first</Link>}
      />
    );
  }

  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m]));

  const handleAdd = async (values: { machinery_id: string; hours_used: number }) => {
    try {
      await addMachinery.mutateAsync({
        headerId: currentDprHeaderId,
        data: { machinery_id: values.machinery_id, hours_used: String(values.hours_used) },
      });
      message.success('Machinery entry added');
      form.resetFields();
    } catch {
      message.error('Could not add entry');
    }
  };

  return (
    <div>
      <Typography.Title level={4}>Machinery Used Today</Typography.Title>
      <Form form={form} layout="vertical" onFinish={handleAdd}>
        <Form.Item name="machinery_id" label="Machine" rules={[{ required: true }]}>
          <Select size="large" options={(machinery ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        </Form.Item>
        <Form.Item name="hours_used" label="Hours Used" rules={[{ required: true }]}>
          <InputNumber min={0} max={24} style={{ width: '100%' }} size="large" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={addMachinery.isPending}>
          Add Entry
        </Button>
      </Form>
      <List
        style={{ marginTop: 24 }}
        header="Today's entries"
        dataSource={header?.machinery_entries ?? []}
        renderItem={(row) => (
          <List.Item>
            {machineryById.get(row.machinery_id)?.name ?? row.machinery_id} — {row.hours_used} hrs
          </List.Item>
        )}
      />
    </div>
  );
}
