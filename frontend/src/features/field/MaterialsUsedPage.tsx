import { Alert, Button, Form, InputNumber, List, Select, Skeleton, Typography, message } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAddDprMaterial, useDprHeader } from '@/api/hooks/useDpr';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';
import { useTodayDprHeader } from '@/hooks/useTodayDprHeader';
import { RequireAttendance } from '@/components/field/RequireAttendance';

export function MaterialsUsedPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { headerId, isLoading, ensureHeader, creating } = useTodayDprHeader(selectedProjectId);
  const { data: header } = useDprHeader(headerId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const addMaterial = useAddDprMaterial();
  const [form] = Form.useForm();

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));

  const handleAdd = async (values: { material_id: string; qty_consumed: number; uom_id: string }) => {
    try {
      const id = headerId ?? (await ensureHeader());
      await addMaterial.mutateAsync({
        headerId: id,
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
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Alert type="warning" showIcon message="Select a project to continue" />}

      {selectedProjectId && isLoading && <Skeleton active />}

      {selectedProjectId && !isLoading && (
        <RequireAttendance projectId={selectedProjectId}>
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
            <Button type="primary" htmlType="submit" block size="large" loading={addMaterial.isPending || creating}>
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
        </RequireAttendance>
      )}
    </div>
  );
}
