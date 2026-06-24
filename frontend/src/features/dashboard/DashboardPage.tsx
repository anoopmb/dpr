import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Popover,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme as antTheme,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  FilterOutlined,
  FundOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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
import { useNumberFormat } from '@/utils/format';
import { useThemeMode } from '@/theme/theme-context';
import type { UserRole } from '@/store/auth-store';

const { RangePicker } = DatePicker;

// ─── Colour palette used across all charts ───────────────────────────────────
const C = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#fa8c16', '#eb2f96'];
const STATUS_TAG: Record<string, string> = {
  ACTIVE: 'blue', COMPLETED: 'green', SUSPENDED: 'red',
  DRAFT: 'default', SUBMITTED: 'processing', PM_APPROVED: 'blue',
  QS_APPROVED: 'cyan', LOCKED: 'green', REJECTED: 'red',
  APPROVED: 'green', PAID: 'success',
  ISSUED: 'blue', PARTIALLY_RECEIVED: 'orange', RECEIVED: 'success', CANCELLED: 'default',
  LOW: 'green', MEDIUM: 'gold', HIGH: 'orange', CRITICAL: 'red',
  OPEN: 'error', RESOLVED: 'success',
};

// ─── Recharts theme helpers ───────────────────────────────────────────────────
function useChartTheme() {
  const { token } = antTheme.useToken();
  const { resolvedMode } = useThemeMode();
  const dark = resolvedMode === 'dark';
  return {
    grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
    tick: dark ? '#94a3b8' : '#64748b',
    tooltipStyle: {
      backgroundColor: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: token.borderRadius,
      color: token.colorText,
    } as React.CSSProperties,
    labelStyle: { color: token.colorTextSecondary, fontSize: 11 },
  };
}

// ─── Reusable filter-popover button ──────────────────────────────────────────
function FilterBtn({ content }: { content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      content={<div style={{ minWidth: 200 }}>{content}</div>}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Tooltip title="Filters">
        <Button
          type="text"
          size="small"
          icon={<FilterOutlined />}
          style={{ color: open ? '#1677ff' : undefined }}
        />
      </Tooltip>
    </Popover>
  );
}

// ─── Quick date-range presets ─────────────────────────────────────────────────
function DateRangeFilter({
  value,
  onChange,
  projectStart,
}: {
  value: [Dayjs, Dayjs];
  onChange: (r: [Dayjs, Dayjs]) => void;
  projectStart?: string;
}) {
  return (
    <Space direction="vertical" size={6} style={{ width: 230 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Date range</Typography.Text>
      <Space wrap size="small">
        {(['7d', '30d', 'month', 'ytd'] as const).map((p) => (
          <Button
            key={p}
            size="small"
            onClick={() => {
              if (p === '7d')   onChange([dayjs().subtract(6, 'day'), dayjs()]);
              if (p === '30d')  onChange([dayjs().subtract(29, 'day'), dayjs()]);
              if (p === 'month') onChange([dayjs().startOf('month'), dayjs()]);
              if (p === 'ytd')  onChange([dayjs().startOf('year'), dayjs()]);
            }}
          >
            {p === '7d' ? 'Last 7d' : p === '30d' ? 'Last 30d' : p === 'month' ? 'This month' : 'YTD'}
          </Button>
        ))}
        {projectStart && (
          <Button size="small" onClick={() => onChange([dayjs(projectStart), dayjs()])}>
            Project to date
          </Button>
        )}
      </Space>
      <RangePicker
        size="small"
        value={value}
        allowClear={false}
        style={{ width: '100%' }}
        onChange={(v) => { if (v?.[0] && v[1]) onChange([v[0], v[1]]); }}
      />
    </Space>
  );
}

// ─── KPI card with optional trend ────────────────────────────────────────────
function KpiCard({
  title, value, prev, suffix, color,
}: {
  title: string; value: string; prev?: number; suffix?: string; color?: string;
}) {
  const delta = prev !== undefined ? parseFloat(value.replace(/[^0-9.-]/g, '')) - prev : undefined;
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        valueStyle={{ fontSize: 18, color }}
      />
      {delta !== undefined && !isNaN(delta) && (
        <Typography.Text
          type={delta >= 0 ? 'success' : 'danger'}
          style={{ fontSize: 12 }}
        >
          {delta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {Math.abs(delta).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
          {suffix}
        </Typography.Text>
      )}
    </Card>
  );
}

// ─── 1. Daily P&L Trend ───────────────────────────────────────────────────────
function DailyTrendChart({
  projectId, projectStart,
}: { projectId: string; projectStart?: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const { data, isLoading } = useProfitability(
    projectId, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'),
  );
  const ct = useChartTheme();
  const { symbol } = useNumberFormat();

  const chartData = (data?.daily ?? []).map((d) => ({
    date: dayjs(d.date).format('DD MMM'),
    Production: parseFloat(d.production_value),
    Cost: parseFloat(d.total_cost),
    'Net P&L': parseFloat(d.net_profit),
  }));

  return (
    <Card
      title="Daily P&L Trend"
      extra={
        <FilterBtn
          content={
            <DateRangeFilter value={range} onChange={setRange} projectStart={projectStart} />
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : chartData.length === 0 ? (
        <Empty description="No DPR data in range" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
            <XAxis dataKey="date" tick={{ fill: ct.tick, fontSize: 11 }} />
            <YAxis
              tick={{ fill: ct.tick, fontSize: 11 }}
              tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`}
            />
            <RTooltip contentStyle={ct.tooltipStyle} />
            <Legend iconType="circle" iconSize={8} />
            <Line type="monotone" dataKey="Production" stroke={C[0]} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Cost" stroke={C[3]} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Net P&L" stroke={C[1]} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 2. Cost Breakdown Donut ──────────────────────────────────────────────────
function CostDonutChart({
  projectId, projectStart,
}: { projectId: string; projectStart?: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const { data, isLoading } = useProfitability(
    projectId, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'),
  );
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

  const slices = useMemo(() => {
    if (!data) return [];
    const items: { name: string; value: number }[] = [];
    const mach = parseFloat(data.machinery_cost);
    const mat  = parseFloat(data.material_cost);
    const exp  = parseFloat(data.expense_cost);
    const prof = parseFloat(data.net_profit);
    if (mach > 0) items.push({ name: 'Machinery', value: mach });
    if (mat  > 0) items.push({ name: 'Materials', value: mat });
    if (exp  > 0) items.push({ name: 'Expenses',  value: exp });
    if (prof > 0) items.push({ name: 'Net Profit', value: prof });
    return items;
  }, [data]);

  return (
    <Card
      title="Cost Breakdown"
      extra={
        <FilterBtn
          content={
            <DateRangeFilter value={range} onChange={setRange} projectStart={projectStart} />
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : slices.length === 0 ? (
        <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {slices.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
            </Pie>
            <RTooltip
              contentStyle={ct.tooltipStyle}
              formatter={(v: number) => fmtAmt(v)}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 3. Expense by Category ───────────────────────────────────────────────────
function ExpenseCategoryChart({
  projectId, projectStart,
}: { projectId: string; projectStart?: string }) {
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
      title="Expenses by Category"
      extra={
        <FilterBtn
          content={
            <DateRangeFilter value={range} onChange={setRange} projectStart={projectStart} />
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : chartData.length === 0 ? (
        <Empty description="No expenses in range" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: ct.tick, fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis dataKey="name" type="category" tick={{ fill: ct.tick, fontSize: 11 }} width={90} />
            <RTooltip contentStyle={ct.tooltipStyle} formatter={(v: number) => fmtAmt(v)} />
            <Bar dataKey="Amount" radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 4. Measurement Status Donut ──────────────────────────────────────────────
const ALL_M_STATUSES = ['DRAFT', 'SUBMITTED', 'PM_APPROVED', 'QS_APPROVED', 'LOCKED', 'REJECTED'];
const M_STATUS_COLOR: Record<string, string> = {
  DRAFT: '#94a3b8', SUBMITTED: '#1677ff', PM_APPROVED: '#13c2c2',
  QS_APPROVED: '#722ed1', LOCKED: '#52c41a', REJECTED: '#ff4d4f',
};

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
      .map((s) => ({ name: s.replace('_', ' '), value: counts[s] ?? 0, status: s }));
  }, [data, visible]);

  const total = slices.reduce((a, b) => a + b.value, 0);

  return (
    <Card
      title="Measurement Status"
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Show statuses</Typography.Text>
              {ALL_M_STATUSES.map((s) => (
                <Button
                  key={s}
                  size="small"
                  type={visible.includes(s) ? 'primary' : 'default'}
                  style={{ fontSize: 11 }}
                  onClick={() =>
                    setVisible((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                >
                  <Tag color={STATUS_TAG[s]} style={{ margin: 0, fontSize: 11 }}>{s}</Tag>
                </Button>
              ))}
            </Space>
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : total === 0 ? (
        <Empty description="No measurements" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              label={({ value }) => value}
            >
              {slices.map((s, i) => (
                <Cell key={i} fill={M_STATUS_COLOR[s.status] ?? C[i % C.length]} />
              ))}
            </Pie>
            <RTooltip contentStyle={ct.tooltipStyle} />
            <Legend iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 5. BOQ Completion by Section ────────────────────────────────────────────
function BoqProgressChart({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<'pct' | 'value'>('pct');
  const { data: sections, isLoading } = useBoqSections(projectId);
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

  const chartData = useMemo(() => {
    if (!sections) return [];
    return sections.map((s) => {
      const tendered = s.items.reduce((a, i) => a + parseFloat(i.tendered_qty) * parseFloat(i.rate), 0);
      const consumed = s.items.reduce((a, i) => a + parseFloat(i.consumed_qty) * parseFloat(i.rate), 0);
      const pct = tendered > 0 ? Math.min(100, (consumed / tendered) * 100) : 0;
      const name = s.section_name.length > 20 ? s.section_name.substring(0, 18) + '…' : s.section_name;
      return mode === 'pct'
        ? { name, '% Complete': parseFloat(pct.toFixed(1)), Remaining: parseFloat((100 - pct).toFixed(1)) }
        : { name, Consumed: parseFloat(consumed.toFixed(0)), Tendered: parseFloat(tendered.toFixed(0)) };
    });
  }, [sections, mode]);

  return (
    <Card
      title="BOQ Progress by Section"
      extra={
        <FilterBtn
          content={
            <Select
              size="small"
              value={mode}
              style={{ width: 140 }}
              onChange={(v: 'pct' | 'value') => setMode(v)}
              options={[
                { value: 'pct', label: '% Complete' },
                { value: 'value', label: 'Value (₹)' },
              ]}
            />
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : chartData.length === 0 ? (
        <Empty description="No BOQ sections" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={mode === 'pct' ? [0, 100] : undefined}
              tick={{ fill: ct.tick, fontSize: 11 }}
              tickFormatter={(v) =>
                mode === 'pct' ? `${v}%` : `${(v / 1000).toFixed(0)}k`
              }
            />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fill: ct.tick, fontSize: 11 }}
              width={110}
            />
            <RTooltip
              contentStyle={ct.tooltipStyle}
              formatter={(v: number) =>
                mode === 'pct' ? `${v}%` : fmtAmt(v)
              }
            />
            {mode === 'pct' ? (
              <>
                <Bar dataKey="% Complete" stackId="a" fill={C[0]} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Remaining" stackId="a" fill="rgba(128,128,128,0.15)" radius={[0, 4, 4, 0]} />
              </>
            ) : (
              <>
                <Bar dataKey="Consumed" fill={C[0]} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Tendered" fill="rgba(128,128,128,0.3)" radius={[0, 4, 4, 0]} />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 6. Attendance Trend ──────────────────────────────────────────────────────
function AttendanceTrendChart({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(14);
  const { data, isLoading } = useAttendanceRecords(projectId);
  const ct = useChartTheme();

  const chartData = useMemo(() => {
    if (!data) return [];
    const cutoff = dayjs().subtract(days - 1, 'day').startOf('day');
    const counts: Record<string, { Present: number; 'In Geofence': number }> = {};
    for (const r of data) {
      if (dayjs(r.attendance_date).isBefore(cutoff)) continue;
      const d = dayjs(r.attendance_date).format('DD MMM');
      if (!counts[d]) counts[d] = { Present: 0, 'In Geofence': 0 };
      counts[d].Present += 1;
      if (r.within_geofence) counts[d]['In Geofence'] += 1;
    }
    const start = dayjs().subtract(days - 1, 'day');
    return Array.from({ length: days }, (_, i) => {
      const d = start.add(i, 'day').format('DD MMM');
      return { date: d, ...(counts[d] ?? { Present: 0, 'In Geofence': 0 }) };
    });
  }, [data, days]);

  return (
    <Card
      title="Attendance Trend"
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Show last</Typography.Text>
              <Select
                size="small"
                value={days}
                onChange={setDays}
                style={{ width: 120 }}
                options={[
                  { value: 7, label: '7 days' },
                  { value: 14, label: '14 days' },
                  { value: 30, label: '30 days' },
                ]}
              />
            </Space>
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
            <XAxis dataKey="date" tick={{ fill: ct.tick, fontSize: 10 }} interval={Math.floor(days / 7)} />
            <YAxis tick={{ fill: ct.tick, fontSize: 11 }} allowDecimals={false} />
            <RTooltip contentStyle={ct.tooltipStyle} />
            <Legend iconType="circle" iconSize={8} />
            <Bar dataKey="Present" fill={C[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="In Geofence" fill={C[1]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 7. DPR Issues by Severity ───────────────────────────────────────────────
function DprIssuesChart({ projectId }: { projectId: string }) {
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'ALL'>('OPEN');
  const { data: dprs, isLoading } = useDprList(projectId);
  const ct = useChartTheme();

  const chartData = useMemo(() => {
    if (!dprs) return [];
    const issues = dprs.flatMap((d) => d.issues).filter(
      (i) => statusFilter === 'ALL' || i.status === 'OPEN',
    );
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const counts = Object.fromEntries(severities.map((s) => [s, 0]));
    for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1;
    return severities.map((s) => ({ Severity: s, Count: counts[s] }));
  }, [dprs, statusFilter]);

  const SEV_COLOR: Record<string, string> = {
    LOW: C[1], MEDIUM: C[2], HIGH: C[6], CRITICAL: C[3],
  };

  return (
    <Card
      title="DPR Issues by Severity"
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Status</Typography.Text>
              <Select
                size="small"
                value={statusFilter}
                onChange={(v: 'OPEN' | 'ALL') => setStatusFilter(v)}
                style={{ width: 120 }}
                options={[
                  { value: 'OPEN', label: 'Open only' },
                  { value: 'ALL', label: 'All issues' },
                ]}
              />
            </Space>
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
            <XAxis dataKey="Severity" tick={{ fill: ct.tick, fontSize: 12 }} />
            <YAxis tick={{ fill: ct.tick, fontSize: 11 }} allowDecimals={false} />
            <RTooltip contentStyle={ct.tooltipStyle} />
            <Bar dataKey="Count" radius={[4, 4, 0, 0]}>
              {chartData.map((d) => (
                <Cell key={d.Severity} fill={SEV_COLOR[d.Severity] ?? C[0]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 8. Material Indent Status ────────────────────────────────────────────────
const INDENT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'CANCELLED'];

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
      .map((s, i) => ({ name: s, value: counts[s] ?? 0, fill: C[i % C.length] }));
  }, [data, visible]);

  return (
    <Card
      title="Material Indent Status"
      extra={
        <FilterBtn
          content={
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Show statuses</Typography.Text>
              {INDENT_STATUSES.map((s) => (
                <Button
                  key={s}
                  size="small"
                  type={visible.includes(s) ? 'primary' : 'default'}
                  onClick={() =>
                    setVisible((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                >
                  <Tag color={STATUS_TAG[s]} style={{ margin: 0, fontSize: 11 }}>{s}</Tag>
                </Button>
              ))}
            </Space>
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : slices.length === 0 ? (
        <Empty description="No indents" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value" label={({ name }) => name}>
              {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
            </Pie>
            <RTooltip contentStyle={ct.tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 9. Running Bills Pipeline ────────────────────────────────────────────────
function BillsPipelineChart({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<'count' | 'amount'>('amount');
  const { data, isLoading } = useRunningBills(projectId);
  const ct = useChartTheme();
  const { fmtAmt } = useNumberFormat();

  const BILL_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'];
  const chartData = useMemo(() => {
    if (!data) return [];
    const agg: Record<string, { count: number; amount: number }> = {};
    for (const b of data) {
      if (!agg[b.status]) agg[b.status] = { count: 0, amount: 0 };
      agg[b.status].count += 1;
      agg[b.status].amount += parseFloat(b.total_amount);
    }
    return BILL_STATUSES.map((s) => ({
      Status: s,
      Value: mode === 'count' ? (agg[s]?.count ?? 0) : (agg[s]?.amount ?? 0),
    }));
  }, [data, mode]);

  return (
    <Card
      title="Running Bills Pipeline"
      extra={
        <FilterBtn
          content={
            <Select
              size="small"
              value={mode}
              onChange={(v: 'count' | 'amount') => setMode(v)}
              style={{ width: 120 }}
              options={[
                { value: 'amount', label: 'By amount' },
                { value: 'count', label: 'By count' },
              ]}
            />
          }
        />
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
            <XAxis dataKey="Status" tick={{ fill: ct.tick, fontSize: 11 }} />
            <YAxis
              tick={{ fill: ct.tick, fontSize: 11 }}
              tickFormatter={(v) =>
                mode === 'amount' ? `${(v / 1000).toFixed(0)}k` : `${v}`
              }
            />
            <RTooltip
              contentStyle={ct.tooltipStyle}
              formatter={(v: number) => mode === 'amount' ? fmtAmt(v) : `${v} bills`}
            />
            <Bar dataKey="Value" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── 10. Production Progress Overview (SE/simplified) ─────────────────────────
function ProductionProgressOverview({ projectId }: { projectId: string }) {
  const { data: progress, isLoading } = useProductionProgress(projectId);
  const { fmtAmt } = useNumberFormat();

  if (isLoading) return <Skeleton active />;
  if (!progress) return <Empty description="No production data" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const overall = progress.total_agreed_amount
    ? Math.min(100, (parseFloat(progress.total_executed_amount) / parseFloat(progress.total_agreed_amount)) * 100)
    : 0;

  return (
    <Card title="Production Progress">
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Typography.Text strong>Overall: {overall.toFixed(1)}%</Typography.Text>
          <Progress percent={parseFloat(overall.toFixed(1))} strokeColor={C[0]} />
        </div>
        {progress.sections.map((s) => {
          const pct =
            parseFloat(s.section_agreed_amount) > 0
              ? Math.min(100, (parseFloat(s.section_executed_amount) / parseFloat(s.section_agreed_amount)) * 100)
              : 0;
          return (
            <div key={s.section_id ?? s.section_name}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Typography.Text style={{ fontSize: 12 }}>
                  {s.section_no ? `${s.section_no}. ` : ''}{s.section_name}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {fmtAmt(s.section_executed_amount)} / {fmtAmt(s.section_agreed_amount)}
                </Typography.Text>
              </Space>
              <Progress percent={parseFloat(pct.toFixed(1))} size="small" strokeColor={C[0]} />
            </div>
          );
        })}
      </Space>
    </Card>
  );
}

// ─── Admin Portfolio — All Projects Overview ──────────────────────────────────
function AdminPortfolioView({ onSelectProject }: { onSelectProject: (id: string) => void }) {
  const { data: projects, isLoading: projLoading } = useProjects();
  const [sortBy, setSortBy] = useState<'contract' | 'outstanding' | 'name'>('contract');
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
    const raw = (projects ?? []).map((p, i) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      contract: parseFloat(p.contract_value),
      billed: parseFloat(summaryQueries[i]?.data?.total_billed ?? '0'),
      received: parseFloat(summaryQueries[i]?.data?.total_received ?? '0'),
      outstanding: parseFloat(summaryQueries[i]?.data?.outstanding ?? '0'),
      billedPct:
        parseFloat(p.contract_value) > 0
          ? (parseFloat(summaryQueries[i]?.data?.total_billed ?? '0') /
              parseFloat(p.contract_value)) *
            100
          : 0,
    }));
    if (sortBy === 'contract') raw.sort((a, b) => b.contract - a.contract);
    if (sortBy === 'outstanding') raw.sort((a, b) => b.outstanding - a.outstanding);
    if (sortBy === 'name') raw.sort((a, b) => a.name.localeCompare(b.name));
    return raw;
  }, [projects, summaryQueries, sortBy]);

  const totals = useMemo(() => ({
    contract: rows.reduce((s, r) => s + r.contract, 0),
    billed: rows.reduce((s, r) => s + r.billed, 0),
    received: rows.reduce((s, r) => s + r.received, 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ACTIVE: 0, COMPLETED: 0, SUSPENDED: 0 };
    for (const p of projects ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [projects]);

  const chartProjects = rows.slice(0, 10);

  const columns = [
    {
      title: 'Project',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row: typeof rows[0]) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onSelectProject(row.id)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <Tag color={STATUS_TAG[s] ?? 'default'}>{s}</Tag>,
    },
    {
      title: 'Contract Value',
      dataIndex: 'contract',
      width: 140,
      align: 'right' as const,
      render: (v: number) => fmtAmt(v),
    },
    {
      title: 'Billed',
      dataIndex: 'billedPct',
      width: 160,
      render: (pct: number, row: typeof rows[0]) => (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <Progress percent={parseFloat(pct.toFixed(1))} size="small" strokeColor={C[0]} />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{fmtAmt(row.billed)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      width: 130,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#cf1322' : undefined }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: unknown, row: typeof rows[0]) => (
        <Button size="small" icon={<FundOutlined />} onClick={() => onSelectProject(row.id)} />
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total Projects', value: String(rows.length), color: undefined },
          { title: 'Active Projects', value: String(rows.filter((r) => r.status === 'ACTIVE').length), color: '#1677ff' },
          { title: 'Portfolio Contract Value', value: fmtAmt(totals.contract), color: undefined },
          { title: 'Total Outstanding', value: fmtAmt(totals.outstanding), color: totals.outstanding > 0 ? '#cf1322' : undefined },
        ].map((k) => (
          <Col key={k.title} xs={12} sm={12} md={6}>
            <KpiCard title={k.title} value={k.value} color={k.color} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card title="Project Status Distribution">
            {loading ? (
              <Skeleton active />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusCounts}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {statusCounts.map((s) => (
                      <Cell
                        key={s.name}
                        fill={s.name === 'ACTIVE' ? C[0] : s.name === 'COMPLETED' ? C[1] : C[3]}
                      />
                    ))}
                  </Pie>
                  <RTooltip contentStyle={ct.tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card
            title="Contract vs Billed vs Received (Top 10)"
            extra={
              <FilterBtn
                content={
                  <Select
                    size="small"
                    value={sortBy}
                    onChange={(v: 'contract' | 'outstanding' | 'name') => setSortBy(v)}
                    style={{ width: 150 }}
                    options={[
                      { value: 'contract', label: 'Sort by contract value' },
                      { value: 'outstanding', label: 'Sort by outstanding' },
                      { value: 'name', label: 'Sort by name' },
                    ]}
                  />
                }
              />
            }
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={chartProjects.map((r) => ({
                    name: r.name.length > 14 ? r.name.substring(0, 12) + '…' : r.name,
                    id: r.id,
                    Contract: r.contract,
                    Billed: r.billed,
                    Received: r.received,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} angle={-20} textAnchor="end" height={45} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 11 }} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
                  <RTooltip
                    contentStyle={ct.tooltipStyle}
                    formatter={(v: number) => fmtAmt(v)}
                  />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="Contract" fill={C[5]} radius={[4, 4, 0, 0]}
                    onClick={(d) => onSelectProject((d as { id: string }).id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <Bar dataKey="Billed" fill={C[0]} radius={[4, 4, 0, 0]}
                    onClick={(d) => onSelectProject((d as { id: string }).id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <Bar dataKey="Received" fill={C[1]} radius={[4, 4, 0, 0]}
                    onClick={(d) => onSelectProject((d as { id: string }).id)}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="All Projects"
        extra={
          <FilterBtn
            content={
              <Select
                size="small"
                value={sortBy}
                onChange={(v: 'contract' | 'outstanding' | 'name') => setSortBy(v)}
                style={{ width: 150 }}
                options={[
                  { value: 'contract', label: 'By contract value' },
                  { value: 'outstanding', label: 'By outstanding' },
                  { value: 'name', label: 'By name' },
                ]}
              />
            }
          />
        }
      >
        <Table
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
          onRow={(row) => ({
            onClick: () => onSelectProject(row.id),
            style: { cursor: 'pointer' },
          })}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><b>Portfolio Total</b></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><b>{fmtAmt(totals.contract)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><b>{fmtAmt(totals.billed)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <b style={{ color: totals.outstanding > 0 ? '#cf1322' : undefined }}>{fmtAmt(totals.outstanding)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
}

// ─── Project Dashboard (all roles, cards vary by role) ───────────────────────
function ProjectDashboard({
  projectId, role,
}: { projectId: string; role: UserRole }) {
  const { data: projects } = useProjects();
  const { data: summary, isLoading: summaryLoading } = useProjectSummary(projectId);
  const { fmtAmt } = useNumberFormat();

  const project = projects?.find((p) => p.id === projectId);

  const isAdminOrPm = role === 'ADMIN' || role === 'PROJECT_MANAGER';
  const isQs        = role === 'QUANTITY_SURVEYOR';
  const isSe        = role === 'SITE_ENGINEER';
  const isStore     = role === 'STORE_KEEPER';

  // QS KPIs derived from BOQ sections
  const { data: sections } = useBoqSections(isQs || isAdminOrPm ? projectId : null);
  const { data: measurements } = useMeasurements(isQs || isAdminOrPm ? projectId : null);

  const boqKpis = useMemo(() => {
    if (!sections || !measurements) return null;
    const tendered  = sections.flatMap((s) => s.items).reduce((a, i) => a + parseFloat(i.tendered_qty) * parseFloat(i.rate), 0);
    const consumed  = sections.flatMap((s) => s.items).reduce((a, i) => a + parseFloat(i.consumed_qty) * parseFloat(i.rate), 0);
    const pct       = tendered > 0 ? (consumed / tendered) * 100 : 0;
    const unbilled  = measurements.filter((m) => m.status === 'LOCKED' && !m.billed).length;
    return { tendered, consumed, pct, unbilled };
  }, [sections, measurements]);

  // SE/DPR KPIs
  const { data: dprs } = useDprList(isSe || isAdminOrPm ? projectId : null);
  const seKpis = useMemo(() => {
    if (!dprs) return null;
    const submitted  = dprs.filter((d) => d.status === 'SUBMITTED').length;
    const noWorkDays = dprs.filter((d) => d.no_work).length;
    const workDays   = dprs.filter((d) => !d.no_work).length;
    const openIssues = dprs.flatMap((d) => d.issues).filter((i) => i.status === 'OPEN').length;
    return { total: dprs.length, submitted, noWorkDays, workDays, openIssues };
  }, [dprs]);

  // STORE KPIs
  const { data: indents } = useMaterialIndents(isStore || isAdminOrPm ? projectId : null);
  const storeKpis = useMemo(() => {
    if (!indents) return null;
    const pending  = indents.filter((i) => i.status === 'SUBMITTED').length;
    const issued   = indents.filter((i) => ['ISSUED', 'PARTIALLY_RECEIVED'].includes(i.status)).length;
    const received = indents.filter((i) => i.status === 'RECEIVED').length;
    return { total: indents.length, pending, issued, received };
  }, [indents]);

  if (summaryLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  return (
    <div>
      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      {(isAdminOrPm) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            {
              title: 'Contract Value',
              value: fmtAmt(summary?.contract_value),
            },
            {
              title: 'Total Billed',
              value: fmtAmt(summary?.total_billed),
              suffix: summary ? ` (${((parseFloat(summary.total_billed) / parseFloat(summary.contract_value)) * 100).toFixed(1)}%)` : '',
            },
            {
              title: 'Payment Received',
              value: fmtAmt(summary?.total_received),
              color: '#52c41a',
            },
            {
              title: 'Outstanding',
              value: fmtAmt(summary?.outstanding),
              color: parseFloat(summary?.outstanding ?? '0') > 0 ? '#cf1322' : undefined,
            },
          ].map((k) => (
            <Col key={k.title} xs={12} sm={12} md={6}>
              <KpiCard title={k.title} value={k.value} suffix={k.suffix} color={k.color} />
            </Col>
          ))}
        </Row>
      )}

      {isQs && boqKpis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: 'Tendered Value', value: fmtAmt(boqKpis.tendered) },
            { title: 'Consumed Value', value: fmtAmt(boqKpis.consumed) },
            { title: 'BOQ Completion', value: `${boqKpis.pct.toFixed(1)}%` },
            { title: 'Unbilled Measurements', value: String(boqKpis.unbilled), color: boqKpis.unbilled > 0 ? '#faad14' : undefined },
          ].map((k) => (
            <Col key={k.title} xs={12} sm={12} md={6}>
              <KpiCard title={k.title} value={k.value} color={k.color} />
            </Col>
          ))}
        </Row>
      )}

      {isSe && seKpis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: 'DPR Entries', value: String(seKpis.total) },
            { title: 'Work Days', value: String(seKpis.workDays), color: '#52c41a' },
            { title: 'No-Work Days', value: String(seKpis.noWorkDays), color: seKpis.noWorkDays > 0 ? '#faad14' : undefined },
            { title: 'Open Issues', value: String(seKpis.openIssues), color: seKpis.openIssues > 0 ? '#ff4d4f' : undefined },
          ].map((k) => (
            <Col key={k.title} xs={12} sm={12} md={6}>
              <KpiCard title={k.title} value={k.value} color={k.color} />
            </Col>
          ))}
        </Row>
      )}

      {isStore && storeKpis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total Indents', value: String(storeKpis.total) },
            { title: 'Pending Approval', value: String(storeKpis.pending), color: storeKpis.pending > 0 ? '#faad14' : undefined },
            { title: 'Issued', value: String(storeKpis.issued) },
            { title: 'Received', value: String(storeKpis.received), color: '#52c41a' },
          ].map((k) => (
            <Col key={k.title} xs={12} sm={12} md={6}>
              <KpiCard title={k.title} value={k.value} color={k.color} />
            </Col>
          ))}
        </Row>
      )}

      {/* ── Admin / PM charts ─────────────────────────────────────────── */}
      {isAdminOrPm && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <DailyTrendChart projectId={projectId} projectStart={project?.start_date} />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <CostDonutChart projectId={projectId} projectStart={project?.start_date} />
            </Col>
            <Col xs={24} md={8}>
              <ExpenseCategoryChart projectId={projectId} projectStart={project?.start_date} />
            </Col>
            <Col xs={24} md={8}>
              <MeasurementStatusChart projectId={projectId} />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <BoqProgressChart projectId={projectId} />
            </Col>
            <Col xs={24} md={12}>
              <AttendanceTrendChart projectId={projectId} />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <DprIssuesChart projectId={projectId} />
            </Col>
            <Col xs={24} md={8}>
              <IndentStatusChart projectId={projectId} />
            </Col>
            <Col xs={24} md={8}>
              <BillsPipelineChart projectId={projectId} />
            </Col>
          </Row>
        </>
      )}

      {/* ── QS charts ─────────────────────────────────────────────────── */}
      {isQs && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <BoqProgressChart projectId={projectId} />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <MeasurementStatusChart projectId={projectId} />
            </Col>
            <Col xs={24} md={12}>
              <BillsPipelineChart projectId={projectId} />
            </Col>
          </Row>
        </>
      )}

      {/* ── Site Engineer charts ───────────────────────────────────────── */}
      {isSe && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <DprIssuesChart projectId={projectId} />
            </Col>
            <Col xs={24} md={12}>
              <AttendanceTrendChart projectId={projectId} />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <ProductionProgressOverview projectId={projectId} />
            </Col>
          </Row>
        </>
      )}

      {/* ── Store Keeper charts ────────────────────────────────────────── */}
      {isStore && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            <IndentStatusChart projectId={projectId} />
          </Col>
          <Col xs={24} md={12}>
            <Card title="Pending Indents">
              {indents?.filter((i) => i.status === 'SUBMITTED').length === 0 ? (
                <Empty description="No pending indents" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Table
                  rowKey="id"
                  dataSource={(indents ?? []).filter((i) => i.status === 'SUBMITTED')}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Source', dataIndex: 'source_type', width: 140,
                      render: (v: string) => <Tag>{v.replace('_', ' ')}</Tag> },
                    { title: 'Items', dataIndex: 'items', width: 80,
                      render: (items: unknown[]) => items.length },
                    { title: 'Needed by', dataIndex: 'needed_by_date', width: 110,
                      render: (v: string | null) => v ?? '—' },
                  ]}
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}

// ─── Main DashboardPage export ────────────────────────────────────────────────
export function DashboardPage() {
  const { data: session } = useSession();
  const role = session?.role ?? 'SITE_ENGINEER';
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useProjectContextStore((s) => s.setSelectedProjectId);
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === selectedProjectId);

  const isAdmin = role === 'ADMIN';

  return (
    <div>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 20,
        }}
      >
        <Space align="center" wrap>
          {selectedProjectId && isAdmin && (
            <Button
              icon={<RollbackOutlined />}
              size="small"
              onClick={() => setSelectedProjectId(null)}
            >
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
            <Tag color={STATUS_TAG[project.status] ?? 'default'}>{project.status}</Tag>
          )}
        </Space>
        <ProjectSelector style={{ minWidth: 220 }} />
      </div>

      {/* Admin no-project → portfolio view */}
      {isAdmin && !selectedProjectId && (
        <AdminPortfolioView onSelectProject={setSelectedProjectId} />
      )}

      {/* Non-admin no-project → prompt */}
      {!isAdmin && !selectedProjectId && (
        <Empty description="Select a project to view analytics." style={{ marginTop: 60 }} />
      )}

      {/* Project selected → role-based dashboard */}
      {selectedProjectId && (
        <ProjectDashboard projectId={selectedProjectId} role={role} />
      )}
    </div>
  );
}
