import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  theme as antTheme,
} from 'antd';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
} from 'recharts';
import { useQueries } from '@tanstack/react-query';
import { FundOutlined } from '@ant-design/icons';
import { useProjects, type ProjectSummaryRead } from '@/api/hooks/useProjects';
import { useProjectContextStore } from '@/store/project-context-store';
import { apiClient } from '@/api/client';
import { useNumberFormat } from '@/utils/format';
import { useThemeMode } from '@/theme/theme-context';

const C = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#fa8c16', '#eb2f96'];
const STATUS_COLOR: Record<string, string> = { ACTIVE: 'blue', COMPLETED: 'green', SUSPENDED: 'red' };

function useChartTheme() {
  const { token } = antTheme.useToken();
  const { resolvedMode } = useThemeMode();
  return {
    grid: resolvedMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
    tick: resolvedMode === 'dark' ? '#94a3b8' : '#64748b',
    tooltipStyle: {
      backgroundColor: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: token.borderRadius,
      color: token.colorText,
    } as React.CSSProperties,
  };
}

export function AnalyticsPage() {
  const { data: projects, isLoading: projLoading } = useProjects();
  const setSelectedProjectId = useProjectContextStore((s) => s.setSelectedProjectId);
  const { fmtAmt } = useNumberFormat();
  const ct = useChartTheme();
  const [metric, setMetric] = useState<'contract' | 'outstanding' | 'billed'>('contract');

  const summaryQueries = useQueries({
    queries: (projects ?? []).map((p) => ({
      queryKey: ['project-summary', p.id],
      queryFn: async () =>
        (await apiClient.get<ProjectSummaryRead>(`/projects/${p.id}/summary`)).data,
      enabled: !!projects,
    })),
  });

  const loading = projLoading || summaryQueries.some((q) => q.isLoading);

  const rows = useMemo(() => {
    return (projects ?? []).map((p, i) => {
      const sum = summaryQueries[i]?.data;
      const contract    = parseFloat(p.contract_value);
      const billed      = parseFloat(sum?.total_billed ?? '0');
      const received    = parseFloat(sum?.total_received ?? '0');
      const outstanding = parseFloat(sum?.outstanding ?? '0');
      const billedPct   = contract > 0 ? (billed / contract) * 100 : 0;
      return { id: p.id, name: p.name, status: p.status, contract, billed, received, outstanding, billedPct };
    });
  }, [projects, summaryQueries]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (metric === 'contract')    copy.sort((a, b) => b.contract    - a.contract);
    if (metric === 'outstanding') copy.sort((a, b) => b.outstanding - a.outstanding);
    if (metric === 'billed')      copy.sort((a, b) => b.billed      - a.billed);
    return copy;
  }, [rows, metric]);

  const totals = useMemo(() => ({
    contract:    rows.reduce((s, r) => s + r.contract,    0),
    billed:      rows.reduce((s, r) => s + r.billed,      0),
    received:    rows.reduce((s, r) => s + r.received,    0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows]);

  // Billed % trend per project (sorted top 10 by contract)
  const top10 = sorted.slice(0, 10).map((r) => ({
    name: r.name.length > 16 ? r.name.substring(0, 14) + '…' : r.name,
    id: r.id,
    Contract:    r.contract,
    Billed:      r.billed,
    Received:    r.received,
    Outstanding: r.outstanding,
  }));

  // Accumulate billed over projects by date (not available without extra API) →
  // Instead show a "billed vs received" ladder chart across projects
  const ladderData = sorted.map((r) => ({
    name: r.name.length > 12 ? r.name.substring(0, 10) + '…' : r.name,
    'Billed %': parseFloat(r.billedPct.toFixed(1)),
    'Collected %': r.billed > 0 ? parseFloat(((r.received / r.billed) * 100).toFixed(1)) : 0,
  }));

  const columns = [
    {
      title: 'Project',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row: typeof rows[0]) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setSelectedProjectId(row.id)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
    },
    {
      title: 'Contract Value',
      dataIndex: 'contract',
      width: 150,
      align: 'right' as const,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.contract - b.contract,
      render: (v: number) => fmtAmt(v),
    },
    {
      title: 'Billed',
      dataIndex: 'billed',
      width: 150,
      align: 'right' as const,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.billed - b.billed,
      render: (v: number, row: typeof rows[0]) => (
        <Space direction="vertical" size={0}>
          <span>{fmtAmt(v)}</span>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {row.billedPct.toFixed(1)}% of contract
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Received',
      dataIndex: 'received',
      width: 140,
      align: 'right' as const,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.received - b.received,
      render: (v: number) => <span style={{ color: '#52c41a' }}>{fmtAmt(v)}</span>,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      width: 140,
      align: 'right' as const,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.outstanding - b.outstanding,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#cf1322' : undefined }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 56,
      render: (_: unknown, row: typeof rows[0]) => (
        <Button
          size="small"
          icon={<FundOutlined />}
          onClick={() => setSelectedProjectId(row.id)}
          title="View dashboard"
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Analytics — All Projects
        </Typography.Title>
        <Select
          size="small"
          value={metric}
          onChange={(v: 'contract' | 'outstanding' | 'billed') => setMetric(v)}
          style={{ width: 180 }}
          options={[
            { value: 'contract',    label: 'Sort by contract value' },
            { value: 'billed',      label: 'Sort by billed' },
            { value: 'outstanding', label: 'Sort by outstanding' },
          ]}
        />
      </div>

      {/* Portfolio KPI row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Projects',         value: String(rows.length) },
          { label: 'Portfolio Contract',      value: fmtAmt(totals.contract) },
          { label: 'Total Billed',            value: fmtAmt(totals.billed) },
          { label: 'Total Outstanding',       value: fmtAmt(totals.outstanding), danger: totals.outstanding > 0 },
        ].map((k) => (
          <Col key={k.label} xs={12} md={6}>
            <Card size="small">
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{k.label}</Typography.Text>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, color: k.danger ? '#cf1322' : undefined }}>
                {loading ? <Skeleton.Input active size="small" /> : k.value}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}>
          <Card title="Contract vs Billed vs Received (Top 10)">
            {loading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={top10}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} angle={-18} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 11 }} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
                  <RTooltip contentStyle={ct.tooltipStyle} formatter={(v: number) => fmtAmt(v)} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="Contract"    fill={C[5]} radius={[4, 4, 0, 0]} onClick={(d) => setSelectedProjectId((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                  <Bar dataKey="Billed"      fill={C[0]} radius={[4, 4, 0, 0]} onClick={(d) => setSelectedProjectId((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                  <Bar dataKey="Received"    fill={C[1]} radius={[4, 4, 0, 0]} onClick={(d) => setSelectedProjectId((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Billing & Collection Efficiency (%)">
            {loading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ladderData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} angle={-18} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <RTooltip contentStyle={ct.tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Legend iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="Billed %" stroke={C[0]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Collected %" stroke={C[1]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Detail table */}
      <Card title="Project-wise Breakdown">
        <Table
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="small"
          scroll={{ x: 800 }}
          onRow={(row) => ({
            onClick: () => setSelectedProjectId(row.id),
            style: { cursor: 'pointer' },
          })}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><b>Total ({rows.length} projects)</b></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><b>{fmtAmt(totals.contract)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><b>{fmtAmt(totals.billed)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><b style={{ color: '#52c41a' }}>{fmtAmt(totals.received)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <b style={{ color: totals.outstanding > 0 ? '#cf1322' : undefined }}>{fmtAmt(totals.outstanding)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} />
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
}
