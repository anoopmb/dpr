import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Progress,
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
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useQueries } from '@tanstack/react-query';
import {
  AppstoreOutlined,
  AuditOutlined,
  ExclamationCircleOutlined,
  FundOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { useProjects, type ProjectSummaryRead } from '@/api/hooks/useProjects';
import { useProjectContextStore } from '@/store/project-context-store';
import { apiClient } from '@/api/client';
import { useNumberFormat } from '@/utils/format';
import { useThemeMode } from '@/theme/theme-context';

// ─── Palette ──────────────────────────────────────────────────────────────────
const P = {
  blue:   '#1677ff',
  green:  '#52c41a',
  amber:  '#faad14',
  red:    '#ff4d4f',
  purple: '#722ed1',
  cyan:   '#13c2c2',
};
const CHART_COLORS = Object.values(P);

const STATUS_TAG: Record<string, string> = { ACTIVE: 'blue', COMPLETED: 'green', SUSPENDED: 'red' };

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
  height: '100%',
};

// ─── Chart theme ──────────────────────────────────────────────────────────────
function useChartTheme() {
  const { token } = antTheme.useToken();
  const { resolvedMode } = useThemeMode();
  const dark = resolvedMode === 'dark';
  return {
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    tick: dark ? '#94a3b8' : '#8c8c8c',
    token,
  };
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
interface RPayload { name: string; value: number; color: string }

function ChartTooltip({
  active, payload, label, fmt,
}: {
  active?: boolean;
  payload?: RPayload[];
  label?: string;
  fmt?: (v: number, name: string) => string;
}) {
  const { token } = antTheme.useToken();
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
      minWidth: 150,
    }}>
      {label && (
        <div style={{ color: token.colorTextSecondary, fontSize: 12, marginBottom: 8, fontWeight: 500 }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < payload.length - 1 ? 5 : 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>{entry.name}</span>
          <span style={{ color: token.colorText, fontWeight: 600, fontSize: 12, marginLeft: 'auto', paddingLeft: 8 }}>
            {fmt ? fmt(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ label }: { label: string }) {
  const { token } = antTheme.useToken();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '28px 0 14px' }}>
      <div style={{ width: 3, height: 14, background: P.blue, borderRadius: 2 }} />
      <Typography.Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: token.colorTextSecondary, fontWeight: 600 }}>
        {label}
      </Typography.Text>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, icon, color = P.blue, subtitle, loading,
}: {
  title: string; value: string; icon: React.ReactNode;
  color?: string; subtitle?: string; loading?: boolean;
}) {
  const { token } = antTheme.useToken();
  return (
    <Card
      bordered={false}
      style={{ ...CARD_STYLE, borderLeft: `4px solid ${color}` }}
      styles={{ body: { padding: '18px 20px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: token.colorTextSecondary, fontWeight: 600, marginBottom: 8 }}>
            {title}
          </div>
          {loading ? (
            <Skeleton.Input active size="small" style={{ height: 28, width: 100 }} />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700, color: token.colorText, lineHeight: 1.15 }}>
              {value}
            </div>
          )}
          {subtitle && !loading && (
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 5 }}>{subtitle}</div>
          )}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, color, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Analytics page ───────────────────────────────────────────────────────────
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
      const sum         = summaryQueries[i]?.data;
      const contract    = parseFloat(p.contract_value);
      const billed      = parseFloat(sum?.total_billed ?? '0');
      const received    = parseFloat(sum?.total_received ?? '0');
      const outstanding = parseFloat(sum?.outstanding ?? '0');
      const billedPct   = contract > 0 ? (billed / contract) * 100 : 0;
      const collectedPct = billed > 0 ? (received / billed) * 100 : 0;
      return { id: p.id, name: p.name, status: p.status, contract, billed, received, outstanding, billedPct, collectedPct };
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

  const top10Bar = sorted.slice(0, 10).map((r) => ({
    name:     r.name.length > 13 ? r.name.substring(0, 11) + '…' : r.name,
    id:       r.id,
    Contract: r.contract,
    Billed:   r.billed,
    Received: r.received,
  }));

  const efficiencyData = sorted.map((r) => ({
    name:           r.name.length > 12 ? r.name.substring(0, 10) + '…' : r.name,
    'Billed %':     +r.billedPct.toFixed(1),
    'Collected %':  +r.collectedPct.toFixed(1),
  }));

  const [searchText, setSearchText] = useState('');
  const searchedRows = rows.filter((r) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q);
  });

  const columns = [
    {
      title: 'Project',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row: typeof rows[0]) => (
        <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 500 }} onClick={() => setSelectedProjectId(row.id)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <Tag color={STATUS_TAG[s] ?? 'default'} style={{ borderRadius: 6 }}>{s}</Tag>,
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
      dataIndex: 'billedPct',
      width: 190,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.billed - b.billed,
      render: (pct: number, row: typeof rows[0]) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <Typography.Text style={{ fontSize: 12 }}>{fmtAmt(row.billed)}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{pct.toFixed(0)}%</Typography.Text>
          </div>
          <Progress percent={+pct.toFixed(0)} size="small" showInfo={false} strokeColor={P.blue} trailColor="rgba(0,0,0,0.06)" />
        </div>
      ),
    },
    {
      title: 'Received',
      dataIndex: 'received',
      width: 140,
      align: 'right' as const,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.received - b.received,
      render: (v: number) => <span style={{ color: P.green, fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      width: 140,
      align: 'right' as const,
      sorter: (a: typeof rows[0], b: typeof rows[0]) => a.outstanding - b.outstanding,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? P.red : P.green, fontWeight: 600 }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: '',
      key: 'drill',
      width: 52,
      render: (_: unknown, row: typeof rows[0]) => (
        <Button size="small" type="text" icon={<FundOutlined />} onClick={() => setSelectedProjectId(row.id)} title="View dashboard" style={{ borderRadius: 6 }} />
      ),
    },
  ];

  const activeCount    = (projects ?? []).filter((p) => p.status === 'ACTIVE').length;
  const completedCount = (projects ?? []).filter((p) => p.status === 'COMPLETED').length;
  const overallBilledPct = totals.contract > 0 ? (totals.billed / totals.contract) * 100 : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Analytics — All Projects</Typography.Title>
        <Select
          size="small"
          value={metric}
          onChange={(v: 'contract' | 'outstanding' | 'billed') => setMetric(v)}
          style={{ width: 200, borderRadius: 8 }}
          options={[
            { value: 'contract',    label: 'Sort by contract value' },
            { value: 'billed',      label: 'Sort by billed' },
            { value: 'outstanding', label: 'Sort by outstanding' },
          ]}
        />
      </div>

      <SectionHeading label="Portfolio Overview" />
      <Row gutter={[16, 16]}>
        {[
          { title: 'Total Projects',       value: String(rows.length),       icon: <ProjectOutlined />,          color: P.blue   },
          { title: 'Active Projects',      value: String(activeCount),        icon: <AppstoreOutlined />,         color: P.green,
            subtitle: completedCount > 0 ? `${completedCount} completed` : undefined },
          { title: 'Portfolio Contract',   value: fmtAmt(totals.contract),   icon: <AuditOutlined />,             color: P.purple,
            subtitle: `Billed ${overallBilledPct.toFixed(1)}%` },
          { title: 'Total Outstanding',    value: fmtAmt(totals.outstanding), icon: <ExclamationCircleOutlined />, color: totals.outstanding > 0 ? P.red : P.green },
        ].map((k) => (
          <Col key={k.title} xs={12} md={6}>
            <KpiCard {...k} loading={loading} />
          </Col>
        ))}
      </Row>

      <SectionHeading label="Contract vs Billing" />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={15}>
          <Card
            title={<span style={{ fontWeight: 600 }}>Contract vs Billed vs Received (Top 10)</span>}
            bordered={false}
            style={CARD_STYLE}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top10Bar}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} angle={-16} textAnchor="end" height={48} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
                  <RTooltip content={<ChartTooltip fmt={(v) => fmtAmt(v)} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Contract" fill={P.cyan}   radius={[4, 4, 0, 0]} maxBarSize={22}
                    onClick={(d) => setSelectedProjectId((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                  <Bar dataKey="Billed"   fill={P.blue}   radius={[4, 4, 0, 0]} maxBarSize={22}
                    onClick={(d) => setSelectedProjectId((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                  <Bar dataKey="Received" fill={P.green}  radius={[4, 4, 0, 0]} maxBarSize={22}
                    onClick={(d) => setSelectedProjectId((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} md={9}>
          <Card
            title={<span style={{ fontWeight: 600 }}>Billing &amp; Collection Efficiency</span>}
            bordered={false}
            style={CARD_STYLE}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={efficiencyData}>
                  <defs>
                    <linearGradient id="gBilled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={P.blue} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={P.blue} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={P.green} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={P.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} angle={-16} textAnchor="end" height={48} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 11 }} domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <RTooltip content={<ChartTooltip fmt={(v) => `${v}%`} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Billed %" stroke={P.blue}  fill="url(#gBilled)"     strokeWidth={2} dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="Collected %" stroke={P.green} fill="url(#gCollected)" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <SectionHeading label="Project-wise Breakdown" />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {loading && [0, 1, 2].map((i) => (
          <Col key={i} xs={24} md={8}>
            <Card bordered={false} style={CARD_STYLE} styles={{ body: { padding: '16px 20px' } }}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          </Col>
        ))}
        {!loading && sorted.slice(0, 3).map((r) => {
          const pct = r.contract > 0 ? (r.billed / r.contract) * 100 : 0;
          return (
            <Col key={r.id} xs={24} md={8}>
              <Card
                bordered={false}
                style={{ ...CARD_STYLE, cursor: 'pointer' }}
                styles={{ body: { padding: '16px 20px' } }}
                onClick={() => setSelectedProjectId(r.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{r.name}</div>
                    <Tag color={STATUS_TAG[r.status] ?? 'default'} style={{ borderRadius: 6, fontSize: 11 }}>{r.status}</Tag>
                  </div>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, background: `${CHART_COLORS[sorted.indexOf(r) % CHART_COLORS.length]}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    color: CHART_COLORS[sorted.indexOf(r) % CHART_COLORS.length],
                  }}>
                    <FundOutlined />
                  </div>
                </div>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Contract</Typography.Text>
                    <Typography.Text style={{ fontSize: 12, fontWeight: 600 }}>{fmtAmt(r.contract)}</Typography.Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Billed</Typography.Text>
                    <Typography.Text style={{ fontSize: 12 }}>{fmtAmt(r.billed)}</Typography.Text>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>Progress</Typography.Text>
                      <Typography.Text style={{ fontSize: 11, fontWeight: 600 }}>{pct.toFixed(0)}%</Typography.Text>
                    </div>
                    <Progress percent={+pct.toFixed(0)} showInfo={false} size="small" strokeColor={CHART_COLORS[sorted.indexOf(r) % CHART_COLORS.length]} trailColor="rgba(0,0,0,0.06)" />
                  </div>
                  {r.outstanding > 0 && (
                    <Typography.Text type="danger" style={{ fontSize: 11 }}>
                      Outstanding: {fmtAmt(r.outstanding)}
                    </Typography.Text>
                  )}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        title={<span style={{ fontWeight: 600 }}>All Projects</span>}
        extra={
          <Input.Search
            placeholder="Search by project name"
            allowClear
            size="small"
            style={{ width: 220 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        }
        bordered={false}
        style={CARD_STYLE}
        styles={{ body: { padding: '0 0 8px' } }}
      >
        <Table
          rowKey="id"
          dataSource={searchedRows}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="small"
          scroll={{ x: 820 }}
          onRow={(row) => ({
            onClick: () => setSelectedProjectId(row.id),
            style: { cursor: 'pointer' },
          })}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><b>Total ({rows.length} projects)</b></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><b>{fmtAmt(totals.contract)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><b>{fmtAmt(totals.billed)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><b style={{ color: P.green }}>{fmtAmt(totals.received)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <b style={{ color: totals.outstanding > 0 ? P.red : P.green }}>{fmtAmt(totals.outstanding)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} />
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
}
