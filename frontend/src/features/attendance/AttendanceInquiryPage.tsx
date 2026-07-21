import { useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Empty, Image, Input, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined, EnvironmentOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAttendanceRange, useWorkers, type AttendanceRecordRead, type WorkerType } from '@/api/hooks/useAttendance';
import { useUserDirectory } from '@/api/hooks/useUsers';
import { useDateFormat } from '@/utils/format';
import { mapsLink } from '@/utils/geo';

const WORKER_TYPE_COLOR: Record<WorkerType, string> = {
  NORMAL: 'blue',
  CONTRACTOR: 'orange',
  SUBCONTRACTOR: 'purple',
};

export function AttendanceInquiryPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [search, setSearch] = useState('');
  const { fmtDate, fmtDateTime } = useDateFormat();

  const fromDate = month.startOf('month').format('YYYY-MM-DD');
  const toDate = month.endOf('month').format('YYYY-MM-DD');

  const { data: records, isLoading } = useAttendanceRange(selectedProjectId, fromDate, toDate);
  const { data: workers } = useWorkers(selectedProjectId);
  const { data: directory } = useUserDirectory();

  const workerById = useMemo(() => new Map((workers ?? []).map((w) => [w.id, w])), [workers]);
  const userById = useMemo(() => new Map((directory ?? []).map((u) => [u.id, u.full_name])), [directory]);

  const rows = useMemo(() => {
    const sorted = [...(records ?? [])].sort((a, b) =>
      a.attendance_date !== b.attendance_date
        ? (a.attendance_date < b.attendance_date ? 1 : -1)
        : (a.check_in_time < b.check_in_time ? 1 : -1),
    );
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) => (workerById.get(r.worker_id)?.full_name ?? '').toLowerCase().includes(q));
  }, [records, search, workerById]);

  const kpis = useMemo(() => {
    const list = records ?? [];
    return {
      checkIns: list.length,
      days: new Set(list.map((r) => r.attendance_date)).size,
      workers: new Set(list.map((r) => r.worker_id)).size,
    };
  }, [records]);

  const columns: TableColumnsType<AttendanceRecordRead> = [
    { title: 'Date', dataIndex: 'attendance_date', width: 115, render: fmtDate },
    {
      title: 'Worker',
      key: 'worker',
      render: (_, r) => {
        const w = workerById.get(r.worker_id);
        return (
          <Space size={4}>
            <span>{w?.full_name ?? r.worker_id}</span>
            {w && <Tag color={WORKER_TYPE_COLOR[w.worker_type]} style={{ margin: 0 }}>{w.worker_type}</Tag>}
          </Space>
        );
      },
    },
    { title: 'Check-in', dataIndex: 'check_in_time', width: 170, render: (v: string) => fmtDateTime(v) },
    {
      title: 'Geofence',
      dataIndex: 'within_geofence',
      width: 130,
      render: (v: boolean) => <Tag color={v ? 'green' : 'orange'}>{v ? 'In boundary' : 'Out of boundary'}</Tag>,
    },
    {
      title: 'Location',
      key: 'location',
      render: (_, r) => {
        const link = mapsLink(r.latitude, r.longitude);
        return (
          <Space direction="vertical" size={0}>
            {r.location_name && <Typography.Text style={{ fontSize: 12 }}>{r.location_name}</Typography.Text>}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer">
                <EnvironmentOutlined /> Map ↗
              </a>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>No GPS</Typography.Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Marked by',
      dataIndex: 'marked_by',
      width: 150,
      render: (v: string) => userById.get(v) ?? '—',
    },
    {
      title: 'Photo',
      key: 'photo',
      width: 110,
      align: 'center' as const,
      render: (_, r) =>
        r.photo_url ? (
          <Space size={4}>
            <Image src={r.photo_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} alt="Attendance photo" />
            <a href={r.photo_url} download target="_blank" rel="noreferrer" title="Download">
              <Button size="small" type="text" icon={<DownloadOutlined />} />
            </a>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Attendance Inquiry
      </Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <ProjectSelector style={{ width: 320 }} />
        <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} allowClear={false} />
        <Input.Search
          placeholder="Filter by worker name"
          allowClear
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Space>

      {!selectedProjectId ? (
        <Empty description="Select a project to review attendance." />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={8}><Card size="small"><Statistic title="Check-ins" value={kpis.checkIns} /></Card></Col>
            <Col xs={8}><Card size="small"><Statistic title="Days with attendance" value={kpis.days} /></Card></Col>
            <Col xs={8}><Card size="small"><Statistic title="Distinct workers" value={kpis.workers} /></Card></Col>
          </Row>

          <Image.PreviewGroup>
            <Table
              rowKey="id"
              dataSource={rows}
              columns={columns}
              loading={isLoading}
              size="small"
              bordered
              scroll={{ x: 900 }}
              pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total} check-ins` }}
              locale={{ emptyText: 'No attendance recorded for this month.' }}
            />
          </Image.PreviewGroup>
        </>
      )}
    </div>
  );
}
