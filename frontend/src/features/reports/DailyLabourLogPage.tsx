import { useState } from 'react';
import { DatePicker, Empty, Select, Table, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useWorkerCategories } from '@/api/hooks/useMasters';
import { useDailyLabourLog, type DailyLabourLogRow } from '@/api/hooks/useWorkerEarnings';
import { useDateFormat, useNumberFormat } from '@/utils/format';

const { RangePicker } = DatePicker;

export function DailyLabourLogPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: categories } = useWorkerCategories();
  const { fmtDate, dateFormat } = useDateFormat();
  const { fmtAmt } = useNumberFormat();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);

  const fromDate = range[0].format('YYYY-MM-DD');
  const toDate = range[1].format('YYYY-MM-DD');

  const { data: report, isLoading } = useDailyLabourLog(selectedProjectId, fromDate, toDate, categoryId);

  return (
    <div>
      <Typography.Title level={3}>Daily Labour Log</Typography.Title>
      <Typography.Paragraph type="secondary">
        Day-by-day attendance and labour cost (attendance × category daily rate) — informational costing only, not a
        payroll system.
      </Typography.Paragraph>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <ProjectSelector style={{ width: 280 }} />
        <RangePicker
          value={range}
          onChange={(values) => {
            if (values && values[0] && values[1]) setRange([values[0], values[1]]);
          }}
          format={dateFormat}
          allowClear={false}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="All categories"
          style={{ width: 200 }}
          value={categoryId}
          onChange={setCategoryId}
          options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      {!selectedProjectId && <Empty description="Select a project to view the daily labour log." />}

      {selectedProjectId && (
        <Table
          rowKey={(row: DailyLabourLogRow) => `${row.attendance_date}-${row.worker_id}`}
          loading={isLoading}
          dataSource={report?.rows ?? []}
          pagination={{ pageSize: 31 }}
          scroll={{ x: 700 }}
          columns={[
            { title: 'Date', dataIndex: 'attendance_date', render: fmtDate, sorter: (a, b) => a.attendance_date.localeCompare(b.attendance_date), defaultSortOrder: 'ascend' as const },
            { title: 'Worker', dataIndex: 'worker_name' },
            { title: 'Category', dataIndex: 'category_name' },
            { title: 'Daily Rate', dataIndex: 'daily_rate', align: 'right' as const, render: fmtAmt },
            { title: 'Cost', dataIndex: 'cost', align: 'right' as const, render: fmtAmt },
          ]}
          summary={() =>
            report ? (
              <Table.Summary>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    Total
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    {fmtAmt(report.total_cost)}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          }
        />
      )}
    </div>
  );
}
