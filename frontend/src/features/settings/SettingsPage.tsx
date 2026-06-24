import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Typography,
  Upload,
  message,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload';
import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
  type DateFormat,
} from '@/api/hooks/useOrganizationSettings';
import { useUploadPhoto } from '@/api/hooks/useUpload';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

interface OrgFormValues {
  company_name: string;
  company_address?: string;
  gst_number?: string;
  currency_code: string;
  currency_symbol: string;
  date_format: DateFormat;
  decimal_places: number;
  use_thousands_separator: boolean;
  fiscal_year_start_month: number;
  default_measurement_tolerance_percent: number;
  email_notifications_enabled: boolean;
}

export function SettingsPage() {
  const { data: settings, isLoading } = useOrganizationSettings();
  const updateSettings = useUpdateOrganizationSettings();
  const uploadPhoto = useUploadPhoto();
  const [form] = Form.useForm<OrgFormValues>();
  const [logoFile, setLogoFile] = useState<UploadFile | null>(null);

  if (isLoading || !settings) return null;

  const handleSave = async (values: OrgFormValues) => {
    try {
      let company_logo_url = settings.company_logo_url;
      if (logoFile?.originFileObj) {
        company_logo_url = await uploadPhoto.mutateAsync({
          prefix: 'company-logo',
          file: logoFile.originFileObj as File,
        });
      }
      await updateSettings.mutateAsync({ ...values, company_logo_url });
      message.success('Organization settings saved');
    } catch {
      message.error('Could not save settings');
    }
  };

  return (
    <div>
      <Typography.Title level={3}>Organization Settings</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          company_name: settings.company_name,
          company_address: settings.company_address ?? undefined,
          gst_number: settings.gst_number ?? undefined,
          currency_code: settings.currency_code,
          currency_symbol: settings.currency_symbol,
          date_format: settings.date_format,
          decimal_places: settings.decimal_places,
          use_thousands_separator: settings.use_thousands_separator,
          fiscal_year_start_month: settings.fiscal_year_start_month,
          default_measurement_tolerance_percent: parseFloat(settings.default_measurement_tolerance_percent),
          email_notifications_enabled: settings.email_notifications_enabled,
        }}
      >
        <Card title="Company Branding" style={{ marginBottom: 16 }}>
          <Form.Item name="company_name" label="Company Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Company Logo">
            {settings.company_logo_url && !logoFile && (
              <img
                src={settings.company_logo_url}
                alt="logo"
                style={{ height: 48, marginBottom: 8, display: 'block', objectFit: 'contain' }}
              />
            )}
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              accept="image/*"
              fileList={logoFile ? [logoFile] : []}
              onChange={({ fileList }) => setLogoFile(fileList[0] ?? null)}
            >
              <Button icon={<UploadOutlined />}>Upload Logo</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="company_address" label="Registered Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="gst_number" label="GST Number">
            <Input />
          </Form.Item>
        </Card>

        <Card title="Regional & Financial Formats" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="currency_code" label="Currency Code (ISO 4217)" rules={[{ required: true, len: 3 }]}>
              <Input maxLength={3} placeholder="INR" />
            </Form.Item>
            <Form.Item name="currency_symbol" label="Currency Symbol" rules={[{ required: true }]}>
              <Input maxLength={5} placeholder="₹" />
            </Form.Item>
          </div>
          <Form.Item name="date_format" label="Date Format" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (India standard)' },
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (ISO 8601)' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="decimal_places" label="Decimal Places (monetary amounts)">
              <InputNumber min={0} max={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="use_thousands_separator" label="Thousands Separator" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="fiscal_year_start_month" label="Fiscal Year Start Month">
            <Select options={MONTHS} />
          </Form.Item>
        </Card>

        <Card title="Notifications" style={{ marginBottom: 16 }}>
          <Form.Item
            name="email_notifications_enabled"
            label="Send email notifications in addition to in-app notifications"
            valuePropName="checked"
            extra="Email only actually sends if the backend has SMTP configured. This switch is the org-wide on/off."
          >
            <Switch />
          </Form.Item>
        </Card>

        <Card title="Measurement Defaults" style={{ marginBottom: 24 }}>
          <Form.Item
            name="default_measurement_tolerance_percent"
            label="Default BOQ over-run tolerance (measurements beyond this % above tendered qty are rejected)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={100} style={{ width: 200 }} addonAfter="%" />
          </Form.Item>
        </Card>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={updateSettings.isPending || uploadPhoto.isPending}
        >
          Save Organization Settings
        </Button>
      </Form>
    </div>
  );
}
