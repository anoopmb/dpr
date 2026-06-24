import { Alert, Card, Col, Row, Skeleton, Statistic, Typography } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useProjects, useProjectSummary } from '@/api/hooks/useProjects';
import { useOrganizationSettings } from '@/api/hooks/useOrganizationSettings';

function fmt(value: string | undefined, symbol: string, decimals: number): string {
  if (value === undefined) return '—';
  const n = parseFloat(value);
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function DashboardPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: projects } = useProjects();
  const { data: summary, isLoading: summaryLoading } = useProjectSummary(selectedProjectId);
  const { data: orgSettings } = useOrganizationSettings();

  const symbol = orgSettings?.currency_symbol ?? '₹';
  const decimals = orgSettings?.decimal_places ?? 2;

  const allProjectsContractTotal = (projects ?? []).reduce(
    (acc, p) => acc + parseFloat(p.contract_value),
    0,
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Typography.Title>
        <ProjectSelector style={{ minWidth: 240 }} />
      </div>

      {!selectedProjectId && (
        <Alert
          type="info"
          showIcon
          message="Showing aggregate across all projects. Select a project for a detailed breakdown."
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedProjectId ? (
        summaryLoading ? (
          <Skeleton active />
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Contract Value"
                  value={fmt(summary?.contract_value, symbol, decimals)}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Work Billed"
                  value={fmt(summary?.total_billed, symbol, decimals)}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Payment Received"
                  value={fmt(summary?.total_received, symbol, decimals)}
                  valueStyle={{ fontSize: 20, color: '#389e0d' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Outstanding"
                  value={fmt(summary?.outstanding, symbol, decimals)}
                  valueStyle={{ fontSize: 20, color: parseFloat(summary?.outstanding ?? '0') > 0 ? '#cf1322' : undefined }}
                />
              </Card>
            </Col>
          </Row>
        )
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Contract Value"
                value={`${symbol}${allProjectsContractTotal.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`}
                valueStyle={{ fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Active Projects" value={(projects ?? []).filter((p) => p.status === 'ACTIVE').length} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Completed Projects" value={(projects ?? []).filter((p) => p.status === 'COMPLETED').length} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Total Projects" value={(projects ?? []).length} />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
