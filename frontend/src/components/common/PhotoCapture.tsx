import { useRef, useState } from 'react';
import { Button, Image, Space } from 'antd';
import { CameraOutlined } from '@ant-design/icons';

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
  label?: string;
}

export function PhotoCapture({ onCapture, label = 'Capture Photo' }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onCapture(file);
  };

  return (
    <Space direction="vertical" align="center" style={{ width: '100%' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <Button icon={<CameraOutlined />} size="large" block onClick={() => inputRef.current?.click()}>
        {label}
      </Button>
      {previewUrl && <Image src={previewUrl} width={120} alt="Captured preview" />}
    </Space>
  );
}
