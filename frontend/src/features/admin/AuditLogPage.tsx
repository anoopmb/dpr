import { useState } from 'react';
import { Button, Card, DatePicker, Descriptions, Empty, Modal, Select, Space, Table, Tag, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { EyeOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useAuditEntityTypes, useAuditLogs, type AuditAction, type AuditLogRead } from '@/api/hooks/useAuditLogs';
import { useUsers } from '@/api/hooks/useUsers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDateFormat } from '@/utils/format';

const { RangePicker } = DatePicker;

const ACTION_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'STATUS_CHANGE', label: 'Status Change' },
];

const ACTION_COLOR: Record<AuditAction, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  STATUS_CHANGE: 'gold',
};

const PAGE_SIZE = 50;

function JsonBlock({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  const { token } = theme.useToken();
  return (
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      <pre
        style={{
          marginTop: 6,
          padding: 10,
          background: token.colorFillTertiary,
          borderRadius: token.borderRadiusLG,
          fontSize: 12,
          maxHeight: 300,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {data ? JSON.stringify(data, null, 2) : '—'}
      </pre>
    </div>
  );
}

export function AuditLogPage() {
  const isMobile = useIsMobile();
  const { dateFormat } = useDateFormat();
  const fmtDateTime = (v: string) => dayjs(v).format(`${dateFormat} HH:mm`);
  const { data: entityTypesData } = useAuditEntityTypes();
  const { data: users } = useUsers();

  const [entityType, setEntityType] = useState<string | undefined>(undefined);
  const [action, setAction] = useState<AuditAction | undefined>(undefined);
  const [actorId, setActorId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [offset, setOffset] = useState(0);
  const [viewing, setViewing] = useState<AuditLogRead | null>(null);

  const { data, isLoading } = useAuditLogs({
    entity_type: entityType,
    action,
    actor_id: actorId,
    from_date: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
    to_date: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const items = data?.items ?? [];

  const resetAndSet = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setOffset(0);
  };

  const columns: TableColumnsType<AuditLogRead> = [
    { title: 'When', dataIndex: 'created_at', width: 150, render: (v: string) => fmtDateTime(v) },
    {
      title: 'Actor',
      key: 'actor',
      width: 160,
      render: (_, row) => (
        <>
          <div>{row.actor_name}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.actor_login_id}</Typography.Text>
        </>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 120,
      render: (a: AuditAction) => <Tag color={ACTION_COLOR[a]}>{ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a}</Tag>,
    },
    { title: 'Entity Type', dataIndex: 'entity_type', width: 160 },
    {
      title: 'Entity ID',
      dataIndex: 'entity_id',
      width: 140,
      render: (id: string) => <Typography.Text code style={{ fontSize: 11 }}>{id.slice(0, 8)}…</Typography.Text>,
    },
    {
      title: 'Details',
      key: 'details',
      width: 90,
      render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(row)} />,
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Audit Logs</Typography.Title>

      <Card style={{ borderRadius: 14, marginBottom: 16 }}>
        <Space wrap size={[8, 8]}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Entity type"
            style={{ width: isMobile ? '100%' : 200 }}
            value={entityType}
            onChange={resetAndSet(setEntityType)}
            options={(entityTypesData?.entity_types ?? []).map((t) => ({ value: t, label: t }))}
          />
          <Select
            allowClear
            placeholder="Action"
            style={{ width: isMobile ? '100%' : 160 }}
            value={action}
            onChange={resetAndSet(setAction)}
            options={ACTION_OPTIONS}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Actor"
            style={{ width: isMobile ? '100%' : 200 }}
            value={actorId}
            onChange={resetAndSet(setActorId)}
            options={(users ?? []).map((u) => ({ value: u.id, label: `${u.full_name} (${u.login_id})` }))}
          />
          <RangePicker
            style={{ width: isMobile ? '100%' : undefined }}
            value={dateRange}
            onChange={(values) => {
              setDateRange(values && values[0] && values[1] ? [values[0], values[1]] : null);
              setOffset(0);
            }}
            format={dateFormat}
          />
        </Space>
      </Card>

      <Card style={{ borderRadius: 14 }} styles={{ body: items.length === 0 ? undefined : { padding: 0 } }}>
        {!isLoading && items.length === 0 ? (
          <Empty description="No audit log entries match these filters" style={{ padding: 24 }} />
        ) : (
          <Table
            rowKey="id"
            loading={isLoading}
            dataSource={items}
            columns={columns}
            pagination={false}
            scroll={{ x: 800 }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12 }}>
          <Button icon={<LeftOutlined />} disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            Previous
          </Button>
          <Button
            icon={<RightOutlined />}
            iconPosition="end"
            disabled={items.length < PAGE_SIZE}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </Card>

      <Modal
        title="Audit Log Entry"
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={null}
        width={isMobile ? '94vw' : 640}
      >
        {viewing && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="When">{fmtDateTime(viewing.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Actor">{viewing.actor_name} ({viewing.actor_login_id})</Descriptions.Item>
              <Descriptions.Item label="Action">
                <Tag color={ACTION_COLOR[viewing.action]}>{ACTION_OPTIONS.find((o) => o.value === viewing.action)?.label ?? viewing.action}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Entity Type">{viewing.entity_type}</Descriptions.Item>
              <Descriptions.Item label="Entity ID"><Typography.Text code>{viewing.entity_id}</Typography.Text></Descriptions.Item>
            </Descriptions>
            <JsonBlock title="Before" data={viewing.before_data} />
            <JsonBlock title="After" data={viewing.after_data} />
          </Space>
        )}
      </Modal>
    </div>
  );
}
