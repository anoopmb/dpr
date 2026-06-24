import { useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Empty, Row, Space, Statistic, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useProjects } from '@/api/hooks/useProjects';
import { useProfitability, type DailyProfitabilityRead } from '@/api/hooks/useProfitability';
import { useDateFormat, useNumberFormat } from '@/utils/format';

const { RangePicker } = DatePicker;

function fmtPct(v: string | null) {
  if (v === null) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
}

const BAR_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

export function ProfitabilityPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === selectedProjectId);
  const { fmtDate, dateFormat } = useDateFormat();
  const { fmtAmt } = useNumberFormat();

  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month')]);

  const fromDate = range[0].format('YYYY-MM-DD');
  const toDate = range[1].format('YYYY-MM-DD');

  const { data: profitability, isLoading } = useProfitability(selectedProjectId, fromDate, toDate);

  const quickSelect = (kind: 'week' | 'month' | 'project') => {
    if (kind === 'week') setRange([dayjs().startOf('week'), dayjs().endOf('week')]);
    else if (kind === 'month') setRange([dayjs().startOf('month'), dayjs().endOf('month')]);
    else if (kind === 'project' && project) setRange([dayjs(project.start_date), dayjs()]);
  };

  const breakdownSegments = useMemo(() => {
    if (!profitability) return [];
    const segments: { label: string; amount: number }[] = [];
    const mach = parseFloat(profitability.machinery_cost);
    if (mach > 0) segments.push({ label: 'Machinery', amount: mach });
    const mat = parseFloat(profitability.material_cost);
    if (mat > 0) segments.push({ label: 'Materials', amount: mat });
    for (const cat of profitability.expense_by_category) {
      const amt = parseFloat(cat.amount);
      if (amt > 0) segments.push({ label: cat.category_name, amount: amt });
    }
    return segments;
  }, [profitability]);

  const totalBreakdown = breakdownSegments.reduce((sum, s) => sum + s.amount, 0);

  const dailyColumns: TableColumnsType<DailyProfitabilityRead> = [
    { title: 'Date', dataIndex: 'date', width: 110, render: fmtDate },
    {
      title: 'Production Value',
      dataIndex: 'production_value',
      align: 'right' as const,
      render: (v: string) => fmtAmt(v),
    },
    {
      title: 'Machinery Cost',
      dataIndex: 'machinery_cost',
      align: 'right' as const,
      render: (v: string) => fmtAmt(v),
    },
    {
      title: 'Material Cost',
      dataIndex: 'material_cost',
      align: 'right' as const,
      render: (v: string) => fmtAmt(v),
    },
    {
      title: 'Expense Cost',
      dataIndex: 'expense_cost',
      align: 'right' as const,
      render: (v: string) => fmtAmt(v),
    },
    {
      title: 'Total Cost',
      dataIndex: 'total_cost',
      align: 'right' as const,
      render: (v: string) => fmtAmt(v),
    },
    {
      title: 'Net P&L',
      dataIndex: 'net_profit',
      align: 'right' as const,
      render: (v: string) => (
        <span style={{ color: parseFloat(v) < 0 ? '#cf1322' : '#3f8600' }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: 'P&L %',
      dataIndex: 'profit_percent',
      align: 'right' as const,
      render: (v: string | null) => (
        <span style={{ color: v !== null && parseFloat(v) < 0 ? '#cf1322' : v !== null ? '#3f8600' : undefined }}>
          {fmtPct(v)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Profitability
      </Typography.Title>

      <ProjectSelector style={{ marginBottom: 16, width: 320 }} />

      {!selectedProjectId && <Empty description="Select a project to view profitability." />}

      {selectedProjectId && (
        <>
          <Space style={{ marginBottom: 16 }} wrap>
            <Button onClick={() => quickSelect('week')}>This Week</Button>
            <Button onClick={() => quickSelect('month')}>This Month</Button>
            <Button onClick={() => quickSelect('project')} disabled={!project}>
              Project to Date
            </Button>
            <RangePicker
              value={range}
              onChange={(values) => {
                if (values && values[0] && values[1]) setRange([values[0], values[1]]);
              }}
              format={dateFormat}
              allowClear={false}
            />
          </Space>

          {profitability && (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic title="Production Value" value={fmtAmt(profitability.production_value)} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic title="Total Cost" value={fmtAmt(profitability.total_cost)} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic
                      title="Net P&L"
                      value={fmtAmt(profitability.net_profit)}
                      valueStyle={{ color: parseFloat(profitability.net_profit) < 0 ? '#cf1322' : '#3f8600' }}
                    />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card>
                    <Statistic
                      title="Margin %"
                      value={fmtPct(profitability.profit_percent)}
                      valueStyle={{
                        color:
                          profitability.profit_percent !== null && parseFloat(profitability.profit_percent) < 0
                            ? '#cf1322'
                            : profitability.profit_percent !== null
                              ? '#3f8600'
                              : undefined,
                      }}
                    />
                  </Card>
                </Col>
              </Row>

              {breakdownSegments.length > 0 && (
                <Card title="Cost Breakdown" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden' }}>
                    {breakdownSegments.map((seg, i) => (
                      <div
                        key={seg.label}
                        style={{
                          width: `${(seg.amount / totalBreakdown) * 100}%`,
                          background: BAR_COLORS[i % BAR_COLORS.length],
                        }}
                        title={`${seg.label}: ${fmtAmt(seg.amount)}`}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                    {breakdownSegments.map((seg, i) => (
                      <Space key={seg.label} size={6}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: BAR_COLORS[i % BAR_COLORS.length],
                            display: 'inline-block',
                          }}
                        />
                        <Typography.Text>
                          {seg.label}: {fmtAmt(seg.amount)}
                        </Typography.Text>
                      </Space>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Daily Breakdown">
                <Table
                  rowKey="date"
                  dataSource={profitability.daily}
                  columns={dailyColumns}
                  loading={isLoading}
                  size="small"
                  pagination={{ pageSize: 31 }}
                />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
