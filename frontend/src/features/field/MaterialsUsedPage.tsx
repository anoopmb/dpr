import { Alert, Button, Form, InputNumber, List, Select, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAddDprMaterial, useDprHeader } from '@/api/hooks/useDpr';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';

export function MaterialsUsedPage() {
  const currentDprHeaderId = useProjectContextStore((s) => s.currentDprHeaderId);
  const { data: header } = useDprHeader(currentDprHeaderId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const addMaterial = useAddDprMaterial();
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

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));

  const handleAdd = async (values: { material_id: string; qty_consumed: number; uom_id: string }) => {
    try {
      await addMaterial.mutateAsync({
        headerId: currentDprHeaderId,
        data: { material_id: values.material_id, qty_consumed: String(values.qty_consumed), uom_id: values.uom_id },
      });
      message.success('Material entry added');
      form.resetFields();
    } catch {
      message.error('Could not add entry');
    }
  };

  return (
    <div>
      <Typography.Title level={4}>Materials Used Today</Typography.Title>
      <Form form={form} layout="vertical" onFinish={handleAdd}>
        <Form.Item name="material_id" label="Material" rules={[{ required: true }]}>
          <Select size="large" options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        </Form.Item>
        <Form.Item name="qty_consumed" label="Quantity" rules={[{ required: true }]}>
          <InputNumber min={0} style={{ width: '100%' }} size="large" />
        </Form.Item>
        <Form.Item name="uom_id" label="Unit" rules={[{ required: true }]}>
          <Select size="large" options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={addMaterial.isPending}>
          Add Entry
        </Button>
      </Form>
      <List
        style={{ marginTop: 24 }}
        header="Today's entries"
        dataSource={header?.materials ?? []}
        renderItem={(row) => (
          <List.Item>
            {materialById.get(row.material_id)?.name ?? row.material_id} — {row.qty_consumed}
          </List.Item>
        )}
      />
    </div>
  );
}
