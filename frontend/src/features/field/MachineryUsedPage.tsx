import { Alert, Button, Form, InputNumber, List, Select, Skeleton, Typography, message } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAddDprMachinery, useDprHeader } from '@/api/hooks/useDpr';
import { useMachinery } from '@/api/hooks/useMasters';
import { useTodayDprHeader } from '@/hooks/useTodayDprHeader';
import { useNumberFormat } from '@/utils/format';
import { RequireAttendance } from '@/components/field/RequireAttendance';

export function MachineryUsedPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { headerId, isLoading, ensureHeader, creating } = useTodayDprHeader(selectedProjectId);
  const { data: header } = useDprHeader(headerId);
  const { data: machinery } = useMachinery();
  const addMachinery = useAddDprMachinery();
  const [form] = Form.useForm();
  const { fmtAmt, symbol } = useNumberFormat();

  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m]));

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

  return (
    <div>
      <Typography.Title level={4}>Machinery Used Today</Typography.Title>
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
            <Form.Item
              name="hire_rate"
              label={`Hire Rate (${symbol}, today's rate — editable)`}
            >
              <InputNumber min={0} style={{ width: '100%' }} size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={addMachinery.isPending || creating}>
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
                {row.hire_rate ? ` @ ${fmtAmt(row.hire_rate)}/hr` : ''}
              </List.Item>
            )}
          />
        </RequireAttendance>
      )}
    </div>
  );
}
