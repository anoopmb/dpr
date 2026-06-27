import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Popover,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme as antTheme,
} from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DollarCircleOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  FundOutlined,
  ProjectOutlined,
  RollbackOutlined,
  SafetyOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs, { type Dayjs } from 'dayjs';
import { useQueries } from '@tanstack/react-query';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useSession } from '@/api/hooks/useSession';
import { useProjects, useProjectSummary, type ProjectSummaryRead } from '@/api/hooks/useProjects';
import { useProfitability } from '@/api/hooks/useProfitability';
import { useBoqSections } from '@/api/hooks/useBoq';
import { useMeasurements } from '@/api/hooks/useMeasurements';
import { useAttendanceRecords } from '@/api/hooks/useAttendance';
import { useDprList } from '@/api/hooks/useDpr';
import { useRunningBills } from '@/api/hooks/useBilling';
import { useMaterialIndents } from '@/api/hooks/useMaterialIndents';
import { useProductionProgress } from '@/api/hooks/useDpr';
import { apiClient } from '@/api/client';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { useThemeMode } from '@/theme/theme-context';
import type { UserRole } from '@/store/auth-store';

const { RangePicker } = DatePicker;

// ─── Palette ─────────────────────────────────────────────────────────────────
const P = {
  blue:   '#1677ff',
  green:  '#52c41a',
  amber:  '#faad14',
  red:    '#ff4d4f',
  purple: '#722ed1',
  cyan:   '#13c2c2',
  orange: '#fa8c16',
  pink:   '#eb2f96',
};
const CHART_COLORS = Object.values(P);

const STATUS_TAG: Record<string, string> = {
  ACTIVE: 'blue', COMPLETED: 'green', SUSPENDED: 'red',
  DRAFT: 'default', SUBMITTED: 'processing', PM_APPROVED: 'blue',
  QS_APPROVED: 'cyan', LOCKED: 'green', REJECTED: 'red',
  APPROVED: 'green', PAID: 'success',
  ISSUED: 'blue', PARTIALLY_RECEIVED: 'orange', RECEIVED: 'success', CANCELLED: 'default',
  LOW: 'green', MEDIUM: 'gold', HIGH: 'orange', CRITICAL: 'red',
  OPEN: 'error', RESOLVED: 'success',
};

const M_STATUS_COLOR: Record<string, string> = {
  DRAFT: '#94a3b8', SUBMITTED: P.blue, PM_APPROVED: P.cyan,
  QS_APPROVED: P.purple, LOCKED: P.green, REJECTED: P.red,
};

// ─── Shared card style ────────────────────────────────────────────────────────
const CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
  height: '100%',
};

// ─── Recharts theme ───────────────────────────────────────────────────────────
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

// ─── Custom recharts tooltip ──────────────────────────────────────────────────
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
      minWidth: 140,
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
            <div style={{ fontSize: 22, fontWeight: 700, color: token.colorText, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

// ─── Filter popover button ────────────────────────────────────────────────────
function FilterBtn({ content }: { content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { token } = antTheme.useToken();
  return (
    <Popover
      content={<div style={{ minWidth: 210, padding: 4 }}>{content}</div>}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Tooltip title="Filters">
        <Button
          type={open ? 'primary' : 'text'}
          size="small"
          icon={<FilterOutlined />}
          style={{
            borderRadius: 8,
            fontSize: 12,
            color: open ? undefined : token.colorTextSecondary,
          }}
        />
      </Tooltip>
    </Popover>
  );
}

// ─── Date range filter content ────────────────────────────────────────────────
function DateRangeFilter({
  value, onChange, projectStart,
}: { value: [Dayjs, Dayjs]; onChange: (r: [Dayjs, Dayjs]) => void; projectStart?: string }) {
  const { dateFormat } = useDateFormat();
  const presets: [string, () => [Dayjs, Dayjs]][] = [
    ['7 days',    () => [dayjs().subtract(6, 'day'), dayjs()]],
    ['30 days',   () => [dayjs().subtract(29, 'day'), dayjs()]],
    ['This month',() => [dayjs().startOf('month'), dayjs()]],
    ['YTD',       () => [dayjs().startOf('year'), dayjs()]],
    ...(projectStart ? [['Project to date', () => [dayjs(projectStart), dayjs()]] as [string, () => [Dayjs, Dayjs]]] : []),
  ];
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Date range</Typography.Text>
      <Space wrap size={4}>
        {presets.map(([label, fn]) => (
          <Button key={label} size="small" style={{ fontSize: 11, borderRadius: 6 }} onClick={() => onChange(fn())}>
            {label}
          </Button>
        ))}
      </Space>
      <RangePicker
        size="small"
        value={value}
        allowClear={false}
        style={{ width: '100%', borderRadius: 8 }}
        onChange={(v) => { if (v?.[0] && v[1]) onChange([v[0], v[1]]); }}
        format={dateFormat}
      />
    </Space>
  );
}

// ─── Chart 1: Daily P&L Trend (AreaChart + gradients) ────────────────────────
function DailyTrendChart({ projectId, projectStart }: { projectId: string; projectStart?: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const { data, isLoading } = useProfitability(
    projectId, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'),
  );
  const ct = useChartTheme();
  const { fmtAmt, symbol } = useNumberFormat();

  const chartData = (data?.daily ?? []).map((d) => ({
    date: dayjs(d.date).format('DD MMM'),
    Production: parseFloat(d.production_value),
    Cost:        parseFloat(d.total_cost),
    'Net P&L':  parseFloat(d.net_profit),
  }));

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Daily P&amp;L Trend</span>}
      extra={<FilterBtn content={<DateRangeFilter value={range} onChange={setRange} projectStart={projectStart} />} />}
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : chartData.length === 0 ? (
        <Empty description="No DPR data in selected range" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={P.blue}  stopOpacity={0.2} />
                <stop offset="95%" stopColor={P.blue}  stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={P.red}   stopOpacity={0.15} />
                <stop offset="95%" stopColor={P.red}   stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={P.green} stopOpacity={0.2} />
                <stop offset="95%" stopColor={P.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: ct.tick, fontSize: 11 }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`}
            />
            <RTooltip
              content={<ChartTooltip fmt={(v) => fmtAmt(Math.round(v))} />}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Area type="monotone" dataKey="Production" stroke={P.blue}  fill="url(#gProd)"   strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Cost"        stroke={P.red}   fill="url(#gCost)"   strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Net P&L"    stroke={P.green} fill="url(#gProfit)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Chart 2: Cost Breakdown Donut ───────────────────────────────────────────
function CostDonutChart({ projectId, projectStart }: { projectId: string; projectStart?: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const { data, isLoading } = useProfitability(
    projectId, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'),
  );
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

  const slices = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Machinery',   value: parseFloat(data.machinery_cost), color: P.orange },
      { name: 'Materials',   value: parseFloat(data.material_cost),  color: P.blue },
      { name: 'Expenses',    value: parseFloat(data.expense_cost),   color: P.purple },
      { name: 'Net Profit',  value: parseFloat(data.net_profit),     color: P.green },
    ].filter((s) => s.value > 0);
  }, [data]);

  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Cost Breakdown</span>}
      extra={<FilterBtn content={<DateRangeFilter value={range} onChange={setRange} projectStart={projectStart} />} />}
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : slices.length === 0 ? (
        <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={slices} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                {slices.map((s, i) => <Cell key={i} fill={s.color} strokeWidth={0} />)}
              </Pie>
              <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle">
                <tspan fill={ct.token.colorText} fontSize={16} fontWeight={700}>{fmtAmt(total)}</tspan>
              </text>
              <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle">
                <tspan fill={ct.token.colorTextSecondary} fontSize={11}>Production</tspan>
              </text>
              <RTooltip content={<ChartTooltip fmt={(v) => fmtAmt(v)} />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
            {slices.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <Typography.Text style={{ fontSize: 12 }}>{s.name}</Typography.Text>
                <Typography.Text strong style={{ fontSize: 12 }}>{fmtAmt(s.value)}</Typography.Text>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Chart 3: Expense by Category ────────────────────────────────────────────
function ExpenseCategoryChart({ projectId, projectStart }: { projectId: string; projectStart?: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const { data, isLoading } = useProfitability(
    projectId, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'),
  );
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

  const chartData = (data?.expense_by_category ?? [])
    .map((c) => ({ name: c.category_name, Amount: parseFloat(c.amount) }))
    .filter((c) => c.Amount > 0)
    .sort((a, b) => b.Amount - a.Amount);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Expenses by Category</span>}
      extra={<FilterBtn content={<DateRangeFilter value={range} onChange={setRange} projectStart={projectStart} />} />}
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : chartData.length === 0 ? (
        <Empty description="No expenses in range" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 38)}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis dataKey="name" type="category" tick={{ fill: ct.tick, fontSize: 11 }} width={88} axisLine={false} tickLine={false} />
            <RTooltip content={<ChartTooltip fmt={(v) => fmtAmt(v)} />} />
            <Bar dataKey="Amount" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Chart 4: Measurement Status Donut ───────────────────────────────────────
const ALL_M_STATUSES = ['DRAFT', 'SUBMITTED', 'PM_APPROVED', 'QS_APPROVED', 'LOCKED', 'REJECTED'];

function MeasurementStatusChart({ projectId }: { projectId: string }) {
  const [visible, setVisible] = useState<string[]>(ALL_M_STATUSES);
  const { data, isLoading } = useMeasurements(projectId);
  const ct = useChartTheme();

  const slices = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const m of data) counts[m.status] = (counts[m.status] ?? 0) + 1;
    return ALL_M_STATUSES
      .filter((s) => visible.includes(s) && (counts[s] ?? 0) > 0)
      .map((s) => ({ name: s.replace('_', ' '), value: counts[s] ?? 0, color: M_STATUS_COLOR[s] }));
  }, [data, visible]);

  const total = slices.reduce((a, b) => a + b.value, 0);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Measurement Status</span>}
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Toggle statuses</Typography.Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ALL_M_STATUSES.map((s) => (
                  <Tag
                    key={s}
                    color={visible.includes(s) ? (STATUS_TAG[s] ?? 'default') : undefined}
                    style={{ cursor: 'pointer', fontSize: 11, userSelect: 'none' }}
                    onClick={() => setVisible((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                  >
                    {s}
                  </Tag>
                ))}
              </div>
            </Space>
          }
        />
      }
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : total === 0 ? (
        <Empty description="No measurements" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={slices} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                {slices.map((s, i) => <Cell key={i} fill={s.color} strokeWidth={0} />)}
              </Pie>
              <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle">
                <tspan fill={ct.token.colorText} fontSize={22} fontWeight={700}>{total}</tspan>
              </text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle">
                <tspan fill={ct.token.colorTextSecondary} fontSize={11}>measurements</tspan>
              </text>
              <RTooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            {slices.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <Typography.Text style={{ fontSize: 11 }}>{s.name}: <strong>{s.value}</strong></Typography.Text>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Chart 5: BOQ Progress by Section ────────────────────────────────────────
function BoqProgressChart({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<'pct' | 'value'>('pct');
  const { data: sections, isLoading } = useBoqSections(projectId);
  const ct = useChartTheme();
  const { fmtAmt, symbol } = useNumberFormat();

  const chartData = useMemo(() => {
    if (!sections) return [];
    return sections.map((s) => {
      const tendered = s.items.reduce((a, i) => a + parseFloat(i.tendered_qty) * parseFloat(i.rate), 0);
      const consumed = s.items.reduce((a, i) => a + parseFloat(i.consumed_qty) * parseFloat(i.rate), 0);
      const pct = tendered > 0 ? Math.min(100, (consumed / tendered) * 100) : 0;
      const label = s.section_name.length > 22 ? s.section_name.substring(0, 20) + '…' : s.section_name;
      return mode === 'pct'
        ? { name: label, '% Done': +pct.toFixed(1), Remaining: +(100 - pct).toFixed(1) }
        : { name: label, Consumed: +consumed.toFixed(0), Tendered: +tendered.toFixed(0) };
    });
  }, [sections, mode]);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>BOQ Progress by Section</span>}
      extra={
        <FilterBtn
          content={
            <Select
              size="small"
              value={mode}
              style={{ width: 150 }}
              onChange={(v: 'pct' | 'value') => setMode(v)}
              options={[
                { value: 'pct',   label: '% Complete' },
                { value: 'value', label: `Value (${symbol})` },
              ]}
            />
          }
        />
      }
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : chartData.length === 0 ? (
        <Empty description="No BOQ sections" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 38)}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false}
              domain={mode === 'pct' ? [0, 100] : undefined}
              tickFormatter={(v) => mode === 'pct' ? `${v}%` : `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis dataKey="name" type="category" tick={{ fill: ct.tick, fontSize: 11 }} width={116} axisLine={false} tickLine={false} />
            <RTooltip content={<ChartTooltip fmt={(v) => mode === 'pct' ? `${v}%` : fmtAmt(v)} />} />
            {mode === 'pct' ? (
              <>
                <Bar dataKey="% Done"    stackId="a" fill={P.blue}  radius={[0, 0, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Remaining" stackId="a" fill={ct.token.colorFillTertiary} radius={[0, 6, 6, 0]} maxBarSize={22} />
              </>
            ) : (
              <>
                <Bar dataKey="Consumed" fill={P.blue}  radius={[0, 6, 6, 0]} maxBarSize={22} />
                <Bar dataKey="Tendered" fill={ct.token.colorFillSecondary} radius={[0, 6, 6, 0]} maxBarSize={22} />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Chart 6: Attendance Trend ────────────────────────────────────────────────
function AttendanceTrendChart({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(14);
  const { data, isLoading } = useAttendanceRecords(projectId);
  const ct = useChartTheme();

  const chartData = useMemo(() => {
    if (!data) return [];
    const cutoff = dayjs().subtract(days - 1, 'day').startOf('day');
    const counts: Record<string, { Present: number; Geofenced: number }> = {};
    for (const r of data) {
      if (dayjs(r.attendance_date).isBefore(cutoff)) continue;
      const d = dayjs(r.attendance_date).format('DD MMM');
      if (!counts[d]) counts[d] = { Present: 0, Geofenced: 0 };
      counts[d].Present += 1;
      if (r.within_geofence) counts[d].Geofenced += 1;
    }
    const start = dayjs().subtract(days - 1, 'day');
    return Array.from({ length: days }, (_, i) => {
      const d = start.add(i, 'day').format('DD MMM');
      return { date: d, ...(counts[d] ?? { Present: 0, Geofenced: 0 }) };
    });
  }, [data, days]);

  const peak = chartData.reduce((m, d) => Math.max(m, d.Present), 0);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Attendance Trend</span>}
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Show last</Typography.Text>
              <Select size="small" value={days} onChange={setDays} style={{ width: 120 }}
                options={[
                  { value: 7,  label: '7 days' },
                  { value: 14, label: '14 days' },
                  { value: 30, label: '30 days' },
                ]}
              />
            </Space>
          }
        />
      }
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : (
        <>
          {peak > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Peak: <strong>{peak}</strong> workers/day
            </Typography.Text>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: ct.tick, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(days / 7) - 1)}
              />
              <YAxis tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <RTooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Present"  fill={P.blue}  radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Geofenced" fill={P.green} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}

// ─── Chart 7: DPR Issues by Severity ─────────────────────────────────────────
const SEV_COLOR: Record<string, string> = { LOW: P.green, MEDIUM: P.amber, HIGH: P.orange, CRITICAL: P.red };

function DprIssuesChart({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<'OPEN' | 'ALL'>('OPEN');
  const { data: dprs, isLoading } = useDprList(projectId);
  const ct = useChartTheme();

  const chartData = useMemo(() => {
    if (!dprs) return [];
    const issues = dprs.flatMap((d) => d.issues).filter((i) => filter === 'ALL' || i.status === 'OPEN');
    const counts = Object.fromEntries(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => [s, 0]));
    for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1;
    return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => ({ Severity: s, Count: counts[s] }));
  }, [dprs, filter]);

  const total = chartData.reduce((a, b) => a + b.Count, 0);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Issues by Severity</span>}
      extra={
        <FilterBtn
          content={
            <Select size="small" value={filter} onChange={(v: 'OPEN' | 'ALL') => setFilter(v)} style={{ width: 130 }}
              options={[{ value: 'OPEN', label: 'Open only' }, { value: 'ALL', label: 'All issues' }]}
            />
          }
        />
      }
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <>
          {total === 0 && (
            <Typography.Text type="success" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              <CheckCircleOutlined /> No {filter === 'OPEN' ? 'open ' : ''}issues
            </Typography.Text>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey="Severity" tick={{ fill: ct.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <RTooltip content={<ChartTooltip />} />
              <Bar dataKey="Count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chartData.map((d) => <Cell key={d.Severity} fill={SEV_COLOR[d.Severity] ?? P.blue} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}

// ─── Chart 8: Material Indent Status ─────────────────────────────────────────
const INDENT_STATUSES = ['SUBMITTED', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'DRAFT', 'REJECTED', 'CANCELLED'];

function IndentStatusChart({ projectId }: { projectId: string }) {
  const [visible, setVisible] = useState<string[]>(['SUBMITTED', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED']);
  const { data, isLoading } = useMaterialIndents(projectId);
  const ct = useChartTheme();

  const slices = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const m of data) counts[m.status] = (counts[m.status] ?? 0) + 1;
    return INDENT_STATUSES
      .filter((s) => visible.includes(s) && (counts[s] ?? 0) > 0)
      .map((s, i) => ({ name: s, value: counts[s] ?? 0, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [data, visible]);

  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Material Indents</span>}
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Show statuses</Typography.Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {INDENT_STATUSES.map((s) => (
                  <Tag key={s} color={visible.includes(s) ? (STATUS_TAG[s] ?? 'default') : undefined}
                    style={{ cursor: 'pointer', fontSize: 11 }}
                    onClick={() => setVisible((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                  >
                    {s}
                  </Tag>
                ))}
              </div>
            </Space>
          }
        />
      }
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : total === 0 ? (
        <Empty description="No indents" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                {slices.map((s, i) => <Cell key={i} fill={s.color} strokeWidth={0} />)}
              </Pie>
              <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle">
                <tspan fill={ct.token.colorText} fontSize={20} fontWeight={700}>{total}</tspan>
              </text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle">
                <tspan fill={ct.token.colorTextSecondary} fontSize={11}>indents</tspan>
              </text>
              <RTooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4 }}>
            {slices.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <Typography.Text style={{ fontSize: 11 }}>{s.name}: <strong>{s.value}</strong></Typography.Text>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Chart 9: Running Bills Pipeline ─────────────────────────────────────────
function BillsPipelineChart({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<'amount' | 'count'>('amount');
  const { data, isLoading } = useRunningBills(projectId);
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

  const BILL_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'];
  const BILL_COLORS   = [P.amber, P.blue, P.green, P.purple];

  const chartData = useMemo(() => {
    if (!data) return [];
    const agg: Record<string, { count: number; amount: number }> = {};
    for (const b of data) {
      if (!agg[b.status]) agg[b.status] = { count: 0, amount: 0 };
      agg[b.status].count  += 1;
      agg[b.status].amount += parseFloat(b.total_amount);
    }
    return BILL_STATUSES.map((s, i) => ({
      Status: s,
      Value:  mode === 'count' ? (agg[s]?.count ?? 0) : (agg[s]?.amount ?? 0),
      color:  BILL_COLORS[i],
    }));
  }, [data, mode]);

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Bills Pipeline</span>}
      extra={
        <FilterBtn
          content={
            <Select size="small" value={mode} onChange={(v: 'amount' | 'count') => setMode(v)} style={{ width: 130 }}
              options={[{ value: 'amount', label: 'By amount' }, { value: 'count', label: 'By count' }]}
            />
          }
        />
      }
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '8px 16px 16px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
            <XAxis dataKey="Status" tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(v) => mode === 'amount' ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
            <RTooltip content={<ChartTooltip fmt={(v) => mode === 'amount' ? fmtAmt(v) : `${v} bills`} />} />
            <Bar dataKey="Value" radius={[6, 6, 0, 0]} maxBarSize={52}>
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Production Progress (SE view) ────────────────────────────────────────────
function ProductionProgressCard({ projectId }: { projectId: string }) {
  const { data: progress, isLoading } = useProductionProgress(projectId);
  const { fmtAmt } = useNumberFormat();

  if (isLoading) return <Card bordered={false} style={CARD_STYLE}><Skeleton active /></Card>;

  const overall = progress
    ? Math.min(100, parseFloat(progress.total_executed_amount) / Math.max(1, parseFloat(progress.total_agreed_amount)) * 100)
    : 0;

  return (
    <Card
      title={<span style={{ fontWeight: 600 }}>Production Progress</span>}
      bordered={false}
      style={CARD_STYLE}
      styles={{ body: { padding: '12px 20px 20px' } }}
    >
      {!progress ? (
        <Empty description="No production data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Typography.Text strong>Overall</Typography.Text>
              <Typography.Text strong style={{ color: P.blue }}>{overall.toFixed(1)}%</Typography.Text>
            </div>
            <Progress percent={+overall.toFixed(1)} strokeColor={P.blue} trailColor="rgba(0,0,0,0.06)" showInfo={false} />
          </div>
          {progress.sections.map((s) => {
            const pct = parseFloat(s.section_agreed_amount) > 0
              ? Math.min(100, parseFloat(s.section_executed_amount) / parseFloat(s.section_agreed_amount) * 100)
              : 0;
            return (
              <div key={s.section_id ?? s.section_name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Typography.Text style={{ fontSize: 12 }}>
                    {s.section_no ? `${s.section_no}. ` : ''}{s.section_name}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {fmtAmt(s.section_executed_amount)} / {fmtAmt(s.section_agreed_amount)}
                  </Typography.Text>
                </div>
                <Progress
                  percent={+pct.toFixed(1)}
                  size="small"
                  strokeColor={pct >= 100 ? P.green : P.blue}
                  trailColor="rgba(0,0,0,0.06)"
                  showInfo={false}
                />
              </div>
            );
          })}
        </Space>
      )}
    </Card>
  );
}

// ─── Admin Portfolio View ─────────────────────────────────────────────────────
function AdminPortfolioView({ onSelectProject }: { onSelectProject: (id: string) => void }) {
  const { data: projects, isLoading: projLoading } = useProjects();
  const [sortBy, setSortBy] = useState<'contract' | 'outstanding' | 'name'>('contract');
  const [searchText, setSearchText] = useState('');
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

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
    const raw = (projects ?? []).map((p, i) => {
      const sum = summaryQueries[i]?.data;
      const contract    = parseFloat(p.contract_value);
      const billed      = parseFloat(sum?.total_billed ?? '0');
      const received    = parseFloat(sum?.total_received ?? '0');
      const outstanding = parseFloat(sum?.outstanding ?? '0');
      const billedPct   = contract > 0 ? (billed / contract) * 100 : 0;
      return { id: p.id, name: p.name, status: p.status, contract, billed, received, outstanding, billedPct };
    });
    if (sortBy === 'contract')    raw.sort((a, b) => b.contract    - a.contract);
    if (sortBy === 'outstanding') raw.sort((a, b) => b.outstanding - a.outstanding);
    if (sortBy === 'name')        raw.sort((a, b) => a.name.localeCompare(b.name));
    return raw;
  }, [projects, summaryQueries, sortBy]);

  const totals = useMemo(() => ({
    contract:    rows.reduce((s, r) => s + r.contract, 0),
    billed:      rows.reduce((s, r) => s + r.billed, 0),
    received:    rows.reduce((s, r) => s + r.received, 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows]);

  const searchedRows = rows.filter((r) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q);
  });

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { ACTIVE: 0, COMPLETED: 0, SUSPENDED: 0 };
    for (const p of projects ?? []) m[p.status] = (m[p.status] ?? 0) + 1;
    return [
      { name: 'Active',    value: m.ACTIVE,    color: P.blue },
      { name: 'Completed', value: m.COMPLETED, color: P.green },
      { name: 'Suspended', value: m.SUSPENDED, color: P.red },
    ].filter((x) => x.value > 0);
  }, [projects]);

  const top10Bar = rows.slice(0, 10).map((r) => ({
    name:     r.name.length > 13 ? r.name.substring(0, 11) + '…' : r.name,
    id:       r.id,
    Contract: r.contract,
    Billed:   r.billed,
    Received: r.received,
  }));

  const tableColumns = [
    {
      title: 'Project',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row: typeof rows[0]) => (
        <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 500 }} onClick={() => onSelectProject(row.id)}>
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
      render: (v: number) => fmtAmt(v),
    },
    {
      title: 'Billed',
      dataIndex: 'billedPct',
      width: 170,
      render: (pct: number, row: typeof rows[0]) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <Typography.Text style={{ fontSize: 11 }}>{fmtAmt(row.billed)}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{pct.toFixed(0)}%</Typography.Text>
          </div>
          <Progress percent={+pct.toFixed(0)} size="small" showInfo={false} strokeColor={P.blue} trailColor="rgba(0,0,0,0.06)" />
        </div>
      ),
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      width: 130,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? P.red : P.green, fontWeight: 600 }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: '',
      key: 'drill',
      width: 50,
      render: (_: unknown, row: typeof rows[0]) => (
        <Button size="small" type="text" icon={<FundOutlined />} onClick={() => onSelectProject(row.id)} />
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total Projects',       value: String(rows.length),                       icon: <ProjectOutlined />,         color: P.blue   },
          { title: 'Active Projects',      value: String(rows.filter((r) => r.status === 'ACTIVE').length), icon: <AppstoreOutlined />, color: P.green  },
          { title: 'Portfolio Contract',   value: fmtAmt(totals.contract),                   icon: <AuditOutlined />,            color: P.purple },
          { title: 'Total Outstanding',    value: fmtAmt(totals.outstanding),                icon: <ExclamationCircleOutlined />, color: totals.outstanding > 0 ? P.red : P.green },
        ].map((k) => (
          <Col key={k.title} xs={12} md={6}>
            {loading ? <Card bordered={false} style={CARD_STYLE}><Skeleton active paragraph={{ rows: 1 }} /></Card>
              : <KpiCard {...k} />}
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={7}>
          <Card title={<span style={{ fontWeight: 600 }}>Project Status</span>} bordered={false} style={CARD_STYLE} styles={{ body: { padding: '8px 16px 20px' } }}>
            {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusCounts} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    {statusCounts.map((s, i) => <Cell key={i} fill={s.color} strokeWidth={0} />)}
                  </Pie>
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle">
                    <tspan fill={ct.token.colorText} fontSize={22} fontWeight={700}>{rows.length}</tspan>
                  </text>
                  <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle">
                    <tspan fill={ct.token.colorTextSecondary} fontSize={11}>projects</tspan>
                  </text>
                  <RTooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} md={17}>
          <Card
            title={<span style={{ fontWeight: 600 }}>Contract vs Billed vs Received (Top 10)</span>}
            extra={
              <FilterBtn
                content={
                  <Select size="small" value={sortBy} onChange={(v: typeof sortBy) => setSortBy(v)} style={{ width: 170 }}
                    options={[
                      { value: 'contract',    label: 'Sort by contract value' },
                      { value: 'outstanding', label: 'Sort by outstanding' },
                      { value: 'name',        label: 'Sort by name' },
                    ]}
                  />
                }
              />
            }
            bordered={false}
            style={CARD_STYLE}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={top10Bar}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} angle={-16} textAnchor="end" height={44} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
                  <RTooltip content={<ChartTooltip fmt={(v) => fmtAmt(v)} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Contract" fill={P.cyan}   radius={[4, 4, 0, 0]} maxBarSize={20} onClick={(d) => onSelectProject((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                  <Bar dataKey="Billed"   fill={P.blue}   radius={[4, 4, 0, 0]} maxBarSize={20} onClick={(d) => onSelectProject((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                  <Bar dataKey="Received" fill={P.green}  radius={[4, 4, 0, 0]} maxBarSize={20} onClick={(d) => onSelectProject((d as { id: string }).id)} style={{ cursor: 'pointer' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={<span style={{ fontWeight: 600 }}>All Projects</span>}
        extra={
          <Space size={8}>
            <Input.Search
              placeholder="Search by project name"
              allowClear
              size="small"
              style={{ width: 200 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <FilterBtn
              content={
                <Select size="small" value={sortBy} onChange={(v: typeof sortBy) => setSortBy(v)} style={{ width: 170 }}
                  options={[
                    { value: 'contract',    label: 'By contract value' },
                    { value: 'outstanding', label: 'By outstanding' },
                    { value: 'name',        label: 'By name' },
                  ]}
                />
              }
            />
          </Space>
        }
        bordered={false}
        style={CARD_STYLE}
        styles={{ body: { padding: '0 0 8px' } }}
      >
        <Table
          rowKey="id"
          dataSource={searchedRows}
          columns={tableColumns}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 750 }}
          onRow={(row) => ({ onClick: () => onSelectProject(row.id), style: { cursor: 'pointer' } })}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><b>Total ({rows.length} projects)</b></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><b>{fmtAmt(totals.contract)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><b>{fmtAmt(totals.billed)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <b style={{ color: totals.outstanding > 0 ? P.red : P.green }}>{fmtAmt(totals.outstanding)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
}

// ─── Project Dashboard ────────────────────────────────────────────────────────
function ProjectDashboard({ projectId, role }: { projectId: string; role: UserRole }) {
  const { data: projects }  = useProjects();
  const { data: summary, isLoading: summaryLoading } = useProjectSummary(projectId);
  const { fmtAmt }          = useNumberFormat();
  const project             = projects?.find((p) => p.id === projectId);

  const isAdminOrPm = role === 'ADMIN' || role === 'PROJECT_MANAGER';
  const isQs        = role === 'QUANTITY_SURVEYOR';
  const isSe        = role === 'SITE_ENGINEER';
  const isStore     = role === 'STORE_KEEPER';

  const { data: sections, isLoading: sectionsLoading } = useBoqSections(isQs || isAdminOrPm ? projectId : null);
  const { data: meas,     isLoading: measLoading }     = useMeasurements(isQs || isAdminOrPm ? projectId : null);
  const { data: dprs,     isLoading: dprsLoading }     = useDprList(isSe || isAdminOrPm ? projectId : null);
  const { data: indents,  isLoading: indentsLoading }  = useMaterialIndents(isStore || isAdminOrPm ? projectId : null);

  const boqKpisLoading = sectionsLoading || measLoading;

  const boqKpis = useMemo(() => {
    if (!sections || !meas) return null;
    const allItems  = sections.flatMap((s) => s.items);
    const tendered  = allItems.reduce((a, i) => a + parseFloat(i.tendered_qty) * parseFloat(i.rate), 0);
    const consumed  = allItems.reduce((a, i) => a + parseFloat(i.consumed_qty) * parseFloat(i.rate), 0);
    const pct       = tendered > 0 ? (consumed / tendered) * 100 : 0;
    const unbilled  = meas.filter((m) => m.status === 'LOCKED' && !m.billed).length;
    return { tendered, consumed, pct, unbilled };
  }, [sections, meas]);

  const seKpis = useMemo(() => {
    if (!dprs) return null;
    return {
      total:     dprs.length,
      submitted: dprs.filter((d) => d.status === 'SUBMITTED').length,
      noWork:    dprs.filter((d) => d.no_work).length,
      workDays:  dprs.filter((d) => !d.no_work).length,
      openIssues:dprs.flatMap((d) => d.issues).filter((i) => i.status === 'OPEN').length,
    };
  }, [dprs]);

  const storeKpis = useMemo(() => {
    if (!indents) return null;
    return {
      total:   indents.length,
      pending: indents.filter((i) => i.status === 'SUBMITTED').length,
      issued:  indents.filter((i) => ['ISSUED', 'PARTIALLY_RECEIVED'].includes(i.status)).length,
      received:indents.filter((i) => i.status === 'RECEIVED').length,
    };
  }, [indents]);

  return (
    <div>
      {/* ── Admin/PM KPI row ─────────────────────────────── */}
      {isAdminOrPm && (
        <>
          <SectionHeading label="Financial Overview" />
          <Row gutter={[16, 16]}>
            {[
              { title: 'Contract Value',    value: fmtAmt(summary?.contract_value), icon: <AuditOutlined />,              color: P.blue   },
              { title: 'Total Billed',      value: fmtAmt(summary?.total_billed),   icon: <DollarCircleOutlined />,        color: P.purple,
                subtitle: summary ? `${((parseFloat(summary.total_billed) / Math.max(1, parseFloat(summary.contract_value))) * 100).toFixed(1)}% of contract` : undefined },
              { title: 'Payment Received',  value: fmtAmt(summary?.total_received), icon: <CheckCircleOutlined />,         color: P.green  },
              { title: 'Outstanding',       value: fmtAmt(summary?.outstanding),    icon: <ExclamationCircleOutlined />,   color: parseFloat(summary?.outstanding ?? '0') > 0 ? P.red : P.green },
            ].map((k) => (
              <Col key={k.title} xs={12} md={6}><KpiCard {...k} loading={summaryLoading} /></Col>
            ))}
          </Row>
        </>
      )}

      {/* ── QS KPI row ────────────────────────────────────── */}
      {isQs && (
        <>
          <SectionHeading label="BOQ & Billing Overview" />
          <Row gutter={[16, 16]}>
            {[
              { title: 'Tendered Value',       value: fmtAmt(boqKpis?.tendered), icon: <AuditOutlined />,        color: P.blue  },
              { title: 'Consumed Value',        value: fmtAmt(boqKpis?.consumed), icon: <SafetyOutlined />,       color: P.purple },
              { title: 'BOQ Completion',        value: `${(boqKpis?.pct ?? 0).toFixed(1)}%`, icon: <FundOutlined />,    color: P.green },
              { title: 'Unbilled Measurements', value: String(boqKpis?.unbilled ?? 0), icon: <WarningOutlined />,      color: (boqKpis?.unbilled ?? 0) > 0 ? P.amber : P.green },
            ].map((k) => (
              <Col key={k.title} xs={12} md={6}><KpiCard {...k} loading={boqKpisLoading} /></Col>
            ))}
          </Row>
        </>
      )}

      {/* ── Site Engineer KPI row ─────────────────────────── */}
      {isSe && (
        <>
          <SectionHeading label="Field Activity" />
          <Row gutter={[16, 16]}>
            {[
              { title: 'DPR Entries',   value: String(seKpis?.total ?? 0),     icon: <CalendarOutlined />,           color: P.blue   },
              { title: 'Work Days',     value: String(seKpis?.workDays ?? 0),  icon: <CheckCircleOutlined />,        color: P.green  },
              { title: 'No-Work Days',  value: String(seKpis?.noWork ?? 0),    icon: <WarningOutlined />,            color: (seKpis?.noWork ?? 0) > 0 ? P.amber : P.green },
              { title: 'Open Issues',   value: String(seKpis?.openIssues ?? 0),icon: <AlertOutlined />,              color: (seKpis?.openIssues ?? 0) > 0 ? P.red : P.green },
            ].map((k) => (
              <Col key={k.title} xs={12} md={6}><KpiCard {...k} loading={dprsLoading} /></Col>
            ))}
          </Row>
        </>
      )}

      {/* ── Store Keeper KPI row ──────────────────────────── */}
      {isStore && (
        <>
          <SectionHeading label="Material Indents" />
          <Row gutter={[16, 16]}>
            {[
              { title: 'Total Indents',     value: String(storeKpis?.total ?? 0),    icon: <AppstoreOutlined />,       color: P.blue   },
              { title: 'Pending Approval',  value: String(storeKpis?.pending ?? 0),  icon: <ExclamationCircleOutlined />, color: (storeKpis?.pending ?? 0) > 0 ? P.amber : P.green },
              { title: 'Issued',            value: String(storeKpis?.issued ?? 0),   icon: <ToolOutlined />,           color: P.purple },
              { title: 'Received',          value: String(storeKpis?.received ?? 0), icon: <CheckCircleOutlined />,    color: P.green  },
            ].map((k) => (
              <Col key={k.title} xs={12} md={6}><KpiCard {...k} loading={indentsLoading} /></Col>
            ))}
          </Row>
        </>
      )}

      {/* ── Admin/PM charts ───────────────────────────────── */}
      {isAdminOrPm && (
        <>
          <SectionHeading label="P&L Analysis" />
          <Row gutter={[16, 16]}>
            <Col xs={24}><DailyTrendChart projectId={projectId} projectStart={project?.start_date} /></Col>
          </Row>

          <SectionHeading label="Cost & Measurement Breakdown" />
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><CostDonutChart       projectId={projectId} projectStart={project?.start_date} /></Col>
            <Col xs={24} md={8}><ExpenseCategoryChart  projectId={projectId} projectStart={project?.start_date} /></Col>
            <Col xs={24} md={8}><MeasurementStatusChart projectId={projectId} /></Col>
          </Row>

          <SectionHeading label="Progress & Attendance" />
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}><BoqProgressChart    projectId={projectId} /></Col>
            <Col xs={24} md={12}><AttendanceTrendChart projectId={projectId} /></Col>
          </Row>

          <SectionHeading label="Issues, Indents & Billing" />
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><DprIssuesChart    projectId={projectId} /></Col>
            <Col xs={24} md={8}><IndentStatusChart  projectId={projectId} /></Col>
            <Col xs={24} md={8}><BillsPipelineChart  projectId={projectId} /></Col>
          </Row>
        </>
      )}

      {/* ── QS charts ─────────────────────────────────────── */}
      {isQs && (
        <>
          <SectionHeading label="BOQ Progress" />
          <Row gutter={[16, 16]}>
            <Col xs={24}><BoqProgressChart projectId={projectId} /></Col>
          </Row>
          <SectionHeading label="Measurements & Billing" />
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}><MeasurementStatusChart projectId={projectId} /></Col>
            <Col xs={24} md={12}><BillsPipelineChart     projectId={projectId} /></Col>
          </Row>
        </>
      )}

      {/* ── Site Engineer charts ───────────────────────────── */}
      {isSe && (
        <>
          <SectionHeading label="Site Activity" />
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}><DprIssuesChart      projectId={projectId} /></Col>
            <Col xs={24} md={12}><AttendanceTrendChart projectId={projectId} /></Col>
          </Row>
          <SectionHeading label="Work Progress" />
          <Row gutter={[16, 16]}>
            <Col xs={24}><ProductionProgressCard projectId={projectId} /></Col>
          </Row>
        </>
      )}

      {/* ── Store Keeper charts ────────────────────────────── */}
      {isStore && (
        <>
          <SectionHeading label="Indent Status" />
          <Row gutter={[16, 16]}>
            <Col xs={24} md={10}><IndentStatusChart projectId={projectId} /></Col>
            <Col xs={24} md={14}>
              <Card title={<span style={{ fontWeight: 600 }}>Pending Approvals</span>} bordered={false} style={CARD_STYLE} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id"
                  dataSource={(indents ?? []).filter((i) => i.status === 'SUBMITTED')}
                  size="small"
                  pagination={false}
                  scroll={{ x: 400 }}
                  locale={{ emptyText: <Empty description="No pending indents" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  columns={[
                    { title: 'Source', dataIndex: 'source_type', width: 140, render: (v: string) => <Tag style={{ borderRadius: 6 }}>{v.replace('_', ' ')}</Tag> },
                    { title: 'Items',  dataIndex: 'items', width: 70, render: (items: unknown[]) => items.length },
                    { title: 'Needed by', dataIndex: 'needed_by_date', render: (v: string | null) => v ?? '—' },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { data: session }        = useSession();
  const role                     = session?.role ?? 'SITE_ENGINEER';
  const selectedProjectId        = useProjectContextStore((s) => s.selectedProjectId);
  const setSelectedProjectId     = useProjectContextStore((s) => s.setSelectedProjectId);
  const { data: projects }       = useProjects();
  const project                  = projects?.find((p) => p.id === selectedProjectId);
  const { token }                = antTheme.useToken();

  const isAdmin = role === 'ADMIN';

  return (
    <div>
      {/* ── Top bar ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        <Space align="center" wrap size={10}>
          {selectedProjectId && isAdmin && (
            <Button icon={<RollbackOutlined />} size="small" style={{ borderRadius: 8 }} onClick={() => setSelectedProjectId(null)}>
              All Projects
            </Button>
          )}
          <Typography.Title level={3} style={{ margin: 0 }}>
            {selectedProjectId && project
              ? project.name
              : isAdmin
                ? 'Portfolio Overview'
                : 'Dashboard'}
          </Typography.Title>
          {selectedProjectId && project && (
            <Tag
              color={STATUS_TAG[project.status] ?? 'default'}
              style={{ borderRadius: 6, fontSize: 12 }}
            >
              {project.status}
            </Tag>
          )}
        </Space>
        <ProjectSelector style={{ minWidth: 220 }} />
      </div>

      {/* ── Admin no-project → portfolio ───────────────────── */}
      {isAdmin && !selectedProjectId && (
        <AdminPortfolioView onSelectProject={setSelectedProjectId} />
      )}

      {/* ── Non-admin no-project ────────────────────────────── */}
      {!isAdmin && !selectedProjectId && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 320, gap: 12,
        }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: `${token.colorPrimary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: token.colorPrimary }}>
            <FundOutlined />
          </div>
          <Typography.Title level={4} style={{ margin: 0 }}>Select a project</Typography.Title>
          <Typography.Text type="secondary">Choose a project from the selector above to view analytics</Typography.Text>
        </div>
      )}

      {/* ── Project selected ────────────────────────────────── */}
      {selectedProjectId && (
        <ProjectDashboard projectId={selectedProjectId} role={role} />
      )}
    </div>
  );
}
