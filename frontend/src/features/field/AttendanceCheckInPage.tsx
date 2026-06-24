import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, List, Select, Space, Tag, Typography, message } from 'antd';
import { AimOutlined, WarningOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import {
  useAttendanceRecords,
  useCheckIn,
  useCreateWorker,
  useMarkPresent,
  useWorkers,
  type WorkerRead,
} from '@/api/hooks/useAttendance';
import { useWorkerCategories } from '@/api/hooks/useMasters';
import { useProjects } from '@/api/hooks/useProjects';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { getCurrentPosition, haversineDistanceMeters, reverseGeocode } from '@/utils/geolocation';
import { useDateFormat } from '@/utils/format';

const todayStr = new Date().toISOString().slice(0, 10);

interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  locationName: string;
}

export function AttendanceCheckInPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === selectedProjectId);
  const verificationRequired = project?.attendance_verification_required ?? true;
  const { fmtDate } = useDateFormat();

  const { data: workers } = useWorkers(selectedProjectId);
  const { data: attendance } = useAttendanceRecords(selectedProjectId);
  const { data: categories } = useWorkerCategories();
  const createWorker = useCreateWorker();
  const checkIn = useCheckIn();
  const markPresent = useMarkPresent();
  const uploadPhoto = useUploadPhoto();

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [newWorkerForm] = Form.useForm<{ full_name: string; worker_category_id: string; phone?: string }>();
  const [addingWorker, setAddingWorker] = useState(false);
  const [bulkWorkerIds, setBulkWorkerIds] = useState<string[]>([]);

  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locating, setLocating] = useState(false);

  const siteLat = project?.site_latitude != null ? parseFloat(project.site_latitude) : null;
  const siteLng = project?.site_longitude != null ? parseFloat(project.site_longitude) : null;
  const siteRadius = project?.geofence_radius_meters ?? 500;

  const distanceMeters =
    location && siteLat != null && siteLng != null
      ? haversineDistanceMeters(location.latitude, location.longitude, siteLat, siteLng)
      : null;

  const outsideGeofence = distanceMeters != null && distanceMeters > siteRadius;

  const captureLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const name = await reverseGeocode(pos.latitude, pos.longitude);
      setLocation({ ...pos, locationName: name });
    } catch {
      message.error('Could not get GPS location. Enable location access and try again.');
    } finally {
      setLocating(false);
    }
  };

  // Auto-capture location on page load
  useEffect(() => {
    void captureLocation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedProjectId) {
    return (
      <div>
        <Typography.Title level={4}>Attendance</Typography.Title>
        <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />
        <Alert type="warning" showIcon message="Select a project to continue" />
      </div>
    );
  }

  const todayCheckedInIds = new Set(
    (attendance ?? []).filter((a) => a.attendance_date === todayStr).map((a) => a.worker_id),
  );
  const availableWorkers: WorkerRead[] = (workers ?? []).filter((w) => !todayCheckedInIds.has(w.id));

  const handleAddWorker = async (values: { full_name: string; worker_category_id: string; phone?: string }) => {
    try {
      const worker = await createWorker.mutateAsync({
        project_id: selectedProjectId,
        ...values,
        mark_present_today: !verificationRequired,
      });
      message.success(
        verificationRequired
          ? 'Worker added — check them in with a photo below'
          : 'Worker added and marked present for today',
      );
      if (verificationRequired) setSelectedWorkerId(worker.id);
      setAddingWorker(false);
      newWorkerForm.resetFields();
    } catch {
      message.error('Could not add worker');
    }
  };

  const handleVerifiedCheckIn = async () => {
    if (!selectedWorkerId || !photo) {
      message.warning('Select a worker and capture a photo first');
      return;
    }
    try {
      const pos = location ?? (await (async () => {
        const p = await getCurrentPosition();
        const name = await reverseGeocode(p.latitude, p.longitude);
        const loc = { ...p, locationName: name };
        setLocation(loc);
        return loc;
      })());

      const photoUrl = await uploadPhoto.mutateAsync({ prefix: 'attendance', file: photo });
      const record = await checkIn.mutateAsync({
        worker_id: selectedWorkerId,
        project_id: selectedProjectId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_accuracy_meters: pos.accuracy,
        location_name: pos.locationName,
        photo_url: photoUrl,
      });
      message.success(
        record.within_geofence
          ? 'Checked in — within site boundary'
          : 'Checked in — outside site boundary (flagged for review)',
      );
      setSelectedWorkerId(null);
      setPhoto(null);
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.data?.code === 'ALREADY_CHECKED_IN') {
        message.error('This worker is already checked in for today.');
      } else if (error instanceof GeolocationPositionError) {
        message.error('Could not get GPS location. Enable location access and try again.');
      } else if (error instanceof Error && error.message.includes('Geolocation')) {
        message.error('Could not get GPS location. Enable location access and try again.');
      } else {
        message.error('Check-in failed');
      }
    }
  };

  const handleBulkMarkPresent = async () => {
    if (bulkWorkerIds.length === 0) {
      message.warning('Select at least one worker');
      return;
    }
    try {
      const result = await markPresent.mutateAsync({
        project_id: selectedProjectId,
        worker_ids: bulkWorkerIds,
        latitude: location?.latitude,
        longitude: location?.longitude,
        gps_accuracy_meters: location?.accuracy,
        location_name: location?.locationName,
      });
      message.success(`${result.length} worker(s) marked present`);
      setBulkWorkerIds([]);
    } catch {
      message.error('Could not mark workers present');
    }
  };

  const locationCard = (
    <Card style={{ marginBottom: 16, background: location ? undefined : '#fffbe6' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Text strong>Your Location</Typography.Text>
          <Button size="small" icon={<AimOutlined />} loading={locating} onClick={captureLocation}>
            Refresh
          </Button>
        </div>
        {location ? (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {location.locationName}
            </Typography.Text>
            <Typography.Text style={{ fontSize: 11, color: '#888' }}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · accuracy ±{Math.round(location.accuracy)} m
            </Typography.Text>
            {outsideGeofence && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message={`You are ${Math.round(distanceMeters!)} m from the site boundary (limit: ${siteRadius} m). Check-in will be flagged for review.`}
              />
            )}
            {!outsideGeofence && siteLat != null && (
              <Alert
                type="success"
                showIcon
                message={`Within site boundary${distanceMeters != null ? ` — ${Math.round(distanceMeters)} m from centre` : ''}`}
              />
            )}
          </>
        ) : (
          <Alert
            type="info"
            showIcon
            message={locating ? 'Getting your location…' : 'Location not yet captured. Tap Refresh to try again.'}
          />
        )}
      </Space>
    </Card>
  );

  return (
    <div>
      <Typography.Title level={4}>Attendance — {fmtDate(todayStr)}</Typography.Title>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {locationCard}

      {/* Add new worker */}
      <Card style={{ marginBottom: 16 }}>
        <Button block onClick={() => setAddingWorker((prev) => !prev)} style={{ marginBottom: 12 }}>
          {addingWorker ? 'Cancel' : '+ Add New Worker'}
        </Button>
        {addingWorker && (
          <Form form={newWorkerForm} layout="vertical" onFinish={handleAddWorker}>
            <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="worker_category_id" label="Category" rules={[{ required: true }]}>
              <Select options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={createWorker.isPending}>
              {verificationRequired ? 'Save Worker' : 'Save Worker & Mark Present Today'}
            </Button>
          </Form>
        )}
      </Card>

      {verificationRequired ? (
        <>
          <Card title="Check-in (Photo + GPS required)" style={{ marginBottom: 16 }}>
            <Form.Item label="Select Worker">
              <Select
                size="large"
                value={selectedWorkerId ?? undefined}
                placeholder="Select worker"
                onChange={setSelectedWorkerId}
                options={(workers ?? []).map((w) => ({
                  value: w.id,
                  label: todayCheckedInIds.has(w.id) ? `${w.full_name} ✓` : w.full_name,
                  disabled: todayCheckedInIds.has(w.id),
                }))}
              />
            </Form.Item>
            <PhotoCapture label="Capture Check-in Photo" onCapture={setPhoto} />
          </Card>
          <Button
            type="primary"
            size="large"
            block
            loading={checkIn.isPending || uploadPhoto.isPending}
            onClick={handleVerifiedCheckIn}
          >
            Check In
          </Button>
        </>
      ) : (
        <Card title="Bulk Mark Present" style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Verification is off for this project. Select all workers who are present today.
          </Typography.Text>
          <Select
            mode="multiple"
            size="large"
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="Select workers present today"
            value={bulkWorkerIds}
            onChange={setBulkWorkerIds}
            options={availableWorkers.map((w) => ({ value: w.id, label: w.full_name }))}
          />
          <Button type="primary" block size="large" loading={markPresent.isPending} onClick={handleBulkMarkPresent}>
            Mark Present
          </Button>
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="To require photo + GPS verification, go to Settings → Project Settings."
            action={<Link to="/settings">Settings</Link>}
          />
        </Card>
      )}

      <List
        style={{ marginTop: 24 }}
        header={<b>Today's attendance</b>}
        dataSource={(attendance ?? []).filter((a) => a.attendance_date === todayStr)}
        renderItem={(row) => {
          const worker = (workers ?? []).find((w) => w.id === row.worker_id);
          return (
            <List.Item>
              <Space direction="vertical" size={2} style={{ flex: 1 }}>
                <span>
                  {worker?.full_name ?? row.worker_id}{' '}
                  {row.photo_url ? (
                    <Tag color={row.within_geofence ? 'green' : 'orange'}>
                      {row.within_geofence ? 'In boundary' : 'Out of boundary'}
                    </Tag>
                  ) : (
                    <Tag color="default">Auto-marked</Tag>
                  )}
                </span>
                {row.location_name && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {row.location_name}
                  </Typography.Text>
                )}
              </Space>
            </List.Item>
          );
        }}
      />
    </div>
  );
}
