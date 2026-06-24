import { Skeleton, Table, Tag, Typography } from 'antd';
import { useProjects } from '@/api/hooks/useProjects';
import { apiClient } from '@/api/client';
import { useQueries } from '@tanstack/react-query';
import type { ProjectSummaryRead } from '@/api/hooks/useProjects';
import { useNumberFormat } from '@/utils/format';

export function AnalyticsPage() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { fmtAmt } = useNumberFormat();

  const summaryQueries = useQueries({
    queries: (projects ?? []).map((p) => ({
      queryKey: ['project-summary', p.id],
      queryFn: async () => (await apiClient.get<ProjectSummaryRead>(`/projects/${p.id}/summary`)).data,
      enabled: !!projects,
    })),
  });

  const loading = projectsLoading || summaryQueries.some((q) => q.isLoading);

  const rows = (projects ?? []).map((p, i) => ({
    key: p.id,
    name: p.name,
    status: p.status,
    contract_value: fmtAmt(p.contract_value),
    total_billed: fmtAmt(summaryQueries[i]?.data?.total_billed),
    total_received: fmtAmt(summaryQueries[i]?.data?.total_received),
    outstanding: fmtAmt(summaryQueries[i]?.data?.outstanding),
    outstanding_raw: parseFloat(summaryQueries[i]?.data?.outstanding ?? '0'),
  }));

  const STATUS_COLOR: Record<string, string> = { ACTIVE: 'blue', COMPLETED: 'green', SUSPENDED: 'red' };

  return (
    <div>
      <Typography.Title level={3}>Analytics — All Projects</Typography.Title>
      {loading ? (
        <Skeleton active />
      ) : (
        <Table
          rowKey="key"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Project', dataIndex: 'name', ellipsis: true },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
            },
            { title: 'Contract Value', dataIndex: 'contract_value', align: 'right' },
            { title: 'Billed', dataIndex: 'total_billed', align: 'right' },
            { title: 'Received', dataIndex: 'total_received', align: 'right' },
            {
              title: 'Outstanding',
              dataIndex: 'outstanding',
              align: 'right',
              render: (val: string, row) => (
                <span style={{ color: row.outstanding_raw > 0 ? '#cf1322' : undefined }}>{val}</span>
              ),
            },
          ]}
          summary={(data) => {
            const totalBilledRaw = summaryQueries.reduce(
              (acc, q) => acc + parseFloat(q.data?.total_billed ?? '0'),
              0,
            );
            const totalReceivedRaw = summaryQueries.reduce(
              (acc, q) => acc + parseFloat(q.data?.total_received ?? '0'),
              0,
            );
            const totalOutstandingRaw = totalBilledRaw - totalReceivedRaw;
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <b>Total ({data.length} projects)</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <b>{fmtAmt((projects ?? []).reduce((acc, p) => acc + parseFloat(p.contract_value), 0))}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <b>{fmtAmt(totalBilledRaw)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <b>{fmtAmt(totalReceivedRaw)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <b style={{ color: totalOutstandingRaw > 0 ? '#cf1322' : undefined }}>
                    {fmtAmt(totalOutstandingRaw)}
                  </b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      )}
    </div>
  );
}
