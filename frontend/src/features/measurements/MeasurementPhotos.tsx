import { Button, Image, Space, Typography } from 'antd';
import { DownloadOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { MeasurementPhotoRead } from '@/api/hooks/useMeasurements';
import { mapsLink } from '@/utils/geo';

/**
 * Renders the evidence photos attached to a measurement: click-to-zoom
 * thumbnails, a per-photo download button, and a map link when the photo
 * carries GPS coordinates. Renders nothing when there are no photos.
 */
export function MeasurementPhotos({ photos }: { photos: MeasurementPhotoRead[] }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
        Photos ({photos.length})
      </Typography.Text>
      <Image.PreviewGroup>
        <Space wrap size={12}>
          {photos.map((p) => {
            const link = mapsLink(p.latitude, p.longitude);
            return (
              <div key={p.id} style={{ textAlign: 'center' }}>
                <Image
                  src={p.photo_url}
                  width={72}
                  height={72}
                  style={{ objectFit: 'cover', borderRadius: 6 }}
                  alt="Measurement photo"
                />
                <div style={{ marginTop: 2 }}>
                  <a href={p.photo_url} download target="_blank" rel="noreferrer" title="Download">
                    <Button size="small" type="text" icon={<DownloadOutlined />} />
                  </a>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" title="Open location in maps">
                      <Button size="small" type="text" icon={<EnvironmentOutlined />} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </Space>
      </Image.PreviewGroup>
    </div>
  );
}
