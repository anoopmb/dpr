import { useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, List, Select, Space, Statistic, Typography, message } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { calculateQuantity } from '@/features/measurements/formulaEngine';
import { useProjectContextStore } from '@/store/project-context-store';
import { useBoqItems } from '@/api/hooks/useBoq';
import { useWorkTypes } from '@/api/hooks/useMasters';
import { useCreateMeasurement } from '@/api/hooks/useMeasurements';
import { useAttachPhoto } from '@/api/hooks/usePhotos';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { getCurrentPosition } from '@/utils/geolocation';

const FIELD_LABELS: Record<string, string> = {
  length: 'Length (m)',
  width: 'Width (m)',
  depth: 'Depth (m)',
  breadth: 'Breadth (m)',
  height: 'Height (m)',
  thickness: 'Thickness (m)',
  diameter: 'Diameter (mm)',
};

export function MeasurementEntryPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: boqItems } = useBoqItems(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const createMeasurement = useCreateMeasurement();
  const uploadPhoto = useUploadPhoto();
  const attachPhoto = useAttachPhoto();

  const [boqItemId, setBoqItemId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Record<string, number>>({});
  const [chainage, setChainage] = useState<string>('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [recordedToday, setRecordedToday] = useState<{ id: string; label: string; qty: string }[]>([]);

  const boqItem = (boqItems ?? []).find((b) => b.id === boqItemId);
  const workType = (workTypes ?? []).find((w) => w.id === boqItem?.work_type_id);
  const dimensionFields = useMemo(() => workType?.dimension_fields ?? [], [workType]);
  const quantity = useMemo(
    () => (workType ? calculateQuantity(workType.formula, dimensionFields, dimensions) : 0),
    [workType, dimensionFields, dimensions],
  );

  if (!selectedProjectId) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Select a project on Today's DPR first"
        description={<Link to="/field/dpr-today">Go to Today's DPR</Link>}
      />
    );
  }

  const handleSubmit = async () => {
    if (!boqItemId || dimensionFields.length === 0) {
      message.warning('Select a BOQ item first');
      return;
    }
    try {
      const measurement = await createMeasurement.mutateAsync({
        project_id: selectedProjectId,
        boq_item_id: boqItemId,
        measurement_date: dayjs().format('YYYY-MM-DD'),
        dimensions: Object.fromEntries(dimensionFields.map((f) => [f, String(dimensions[f] ?? 0)])),
        chainage: chainage.trim() || null,
      });

      if (photo) {
        try {
          const position = await getCurrentPosition();
          const photoUrl = await uploadPhoto.mutateAsync({ prefix: 'measurements', file: photo });
          await attachPhoto.mutateAsync({
            entity_type: 'MEASUREMENT',
            entity_id: measurement.id,
            photo_url: photoUrl,
            latitude: position.latitude,
            longitude: position.longitude,
            captured_at: new Date().toISOString(),
          });
        } catch {
          message.warning('Measurement saved, but the evidence photo could not be attached.');
        }
      }

      message.success(`Measurement recorded: ${measurement.computed_qty}`);
      setRecordedToday((prev) => [
        { id: measurement.id, label: boqItem ? `${boqItem.item_no} — ${boqItem.description}` : boqItemId, qty: measurement.computed_qty },
        ...prev,
      ]);
      setBoqItemId(null);
      setDimensions({});
      setChainage('');
      setPhoto(null);
    } catch {
      message.error('Could not save measurement — check it does not exceed the BOQ tolerance.');
    }
  };

  return (
    <div>
      <Typography.Title level={4}>{recordedToday.length > 0 ? 'Add Another Measurement for Today' : 'New Measurement'}</Typography.Title>

      {recordedToday.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
          <Typography.Text strong>Recorded today ({recordedToday.length})</Typography.Text>
          <List
            size="small"
            dataSource={recordedToday}
            renderItem={(entry) => (
              <List.Item>
                <Space>
                  <CheckCircleFilled style={{ color: '#52c41a' }} />
                  <span>{entry.label}</span>
                  <Typography.Text type="secondary">qty: {entry.qty}</Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      <Form layout="vertical">
        <Form.Item label="BOQ Item">
          <Select
            size="large"
            placeholder="Select BOQ item"
            value={boqItemId ?? undefined}
            onChange={(value) => {
              setBoqItemId(value);
              setDimensions({});
            }}
            options={(boqItems ?? []).map((b) => ({ value: b.id, label: `${b.item_no} — ${b.description}` }))}
          />
        </Form.Item>

        <Form.Item label="Chainage / Location (optional)">
          <Input
            size="large"
            placeholder="e.g. 2/130–2/390"
            value={chainage}
            onChange={(e) => setChainage(e.target.value)}
          />
        </Form.Item>

        {dimensionFields.map((field) => (
          <Form.Item key={field} label={FIELD_LABELS[field] ?? field}>
            <InputNumber
              size="large"
              min={0}
              style={{ width: '100%' }}
              value={dimensions[field]}
              onChange={(value) => setDimensions((prev) => ({ ...prev, [field]: value ?? 0 }))}
            />
          </Form.Item>
        ))}

        {dimensionFields.length > 0 && (
          <Card style={{ marginBottom: 16, textAlign: 'center' }}>
            <Statistic title="Computed Quantity" value={quantity.toFixed(3)} />
          </Card>
        )}

        {dimensionFields.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <PhotoCapture label="Capture Evidence Photo (optional)" onCapture={setPhoto} />
          </Card>
        )}

        <Button
          type="primary"
          block
          size="large"
          disabled={!boqItemId}
          loading={createMeasurement.isPending || uploadPhoto.isPending}
          onClick={handleSubmit}
        >
          {recordedToday.length > 0 ? 'Save & Add Another' : 'Submit Measurement'}
        </Button>
      </Form>
    </div>
  );
}
