import { useState } from 'react';
import { getApiErrorMessage } from '@/utils/api-error';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Skeleton,
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
  type OrganizationSettingsRead,
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

type LogoSlotKey =
  | 'company_logo_light_url'
  | 'company_logo_dark_url'
  | 'company_logo_small_light_url'
  | 'company_logo_small_dark_url'
  | 'favicon_url';

const LOGO_SLOTS: { key: LogoSlotKey; label: string; help: string; previewBg?: string }[] = [
  {
    key: 'company_logo_light_url',
    label: 'Main Logo — Light Theme',
    help: 'Shown in the sidebar and login screen when light theme is active.',
  },
  {
    key: 'company_logo_dark_url',
    label: 'Main Logo — Dark Theme',
    help: 'Shown in the sidebar and login screen when dark theme is active.',
    previewBg: '#1a202c',
  },
  {
    key: 'company_logo_small_light_url',
    label: 'Small Logo (Sidebar) — Light Theme',
    help: 'Compact mark shown in the collapsed sidebar on light theme.',
  },
  {
    key: 'company_logo_small_dark_url',
    label: 'Small Logo (Sidebar) — Dark Theme',
    help: 'Compact mark shown in the collapsed sidebar on dark theme.',
    previewBg: '#1a202c',
  },
  {
    key: 'favicon_url',
    label: 'Favicon',
    help: 'Browser tab icon. Square image recommended (e.g. 64×64 PNG/SVG).',
  },
];

interface OrgFormValues {
  company_name: string;
  company_address?: string;
  gst_number?: string;
  currency_code: string;
  currency_symbol: string;
  date_format: DateFormat;
  timezone: string;
  decimal_places: number;
  use_thousands_separator: boolean;
  fiscal_year_start_month: number;
  default_measurement_tolerance_percent: number;
  email_notifications_enabled: boolean;
  steel_measurement_uom: 'MT' | 'KG';
}

// Real, browser-provided IANA timezone list (Intl.supportedValuesOf is
// supported in all browsers this app targets) — not a hand-maintained
// guess list that could drift or omit a zone an org actually needs.
const TIMEZONE_OPTIONS = Intl.supportedValuesOf('timeZone').map((tz) => ({ value: tz, label: tz }));

function LogoUploadField({
  slot,
  currentUrl,
  file,
  onFileChange,
}: {
  slot: { key: LogoSlotKey; label: string; help: string; previewBg?: string };
  currentUrl: string | null;
  file: UploadFile | null;
  onFileChange: (file: UploadFile | null) => void;
}) {
  return (
    <Form.Item label={slot.label} extra={slot.help}>
      {currentUrl && !file && (
        <div
          style={{
            background: slot.previewBg ?? '#f5f5f5',
            display: 'inline-block',
            padding: 8,
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          <img src={currentUrl} alt={slot.label} style={{ height: 40, display: 'block', objectFit: 'contain' }} />
        </div>
      )}
      <Upload
        beforeUpload={() => false}
        maxCount={1}
        accept="image/*"
        fileList={file ? [file] : []}
        onChange={({ fileList }) => onFileChange(fileList[0] ?? null)}
      >
        <Button icon={<UploadOutlined />}>{currentUrl ? 'Replace' : 'Upload'}</Button>
      </Upload>
    </Form.Item>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useOrganizationSettings();
  const updateSettings = useUpdateOrganizationSettings();
  const uploadPhoto = useUploadPhoto();
  const [form] = Form.useForm<OrgFormValues>();
  const [logoFiles, setLogoFiles] = useState<Record<LogoSlotKey, UploadFile | null>>({
    company_logo_light_url: null,
    company_logo_dark_url: null,
    company_logo_small_light_url: null,
    company_logo_small_dark_url: null,
    favicon_url: null,
  });

  if (isLoading || !settings) {
    return (
      <div>
        <Typography.Title level={3}>Settings</Typography.Title>
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </div>
    );
  }

  const handleSave = async (values: OrgFormValues) => {
    try {
      const logoUpdates: Partial<Record<LogoSlotKey, string>> = {};
      for (const slot of LOGO_SLOTS) {
        const file = logoFiles[slot.key];
        if (file?.originFileObj) {
          logoUpdates[slot.key] = await uploadPhoto.mutateAsync({
            prefix: 'company-logo',
            file: file.originFileObj as File,
          });
        }
      }
      await updateSettings.mutateAsync({ ...values, ...logoUpdates });
      setLogoFiles({
        company_logo_light_url: null,
        company_logo_dark_url: null,
        company_logo_small_light_url: null,
        company_logo_small_dark_url: null,
        favicon_url: null,
      });
      message.success('Settings saved');
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not save settings'));
    }
  };

  return (
    <div>
      <Typography.Title level={3}>Settings</Typography.Title>
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
          timezone: settings.timezone,
          decimal_places: settings.decimal_places,
          use_thousands_separator: settings.use_thousands_separator,
          fiscal_year_start_month: settings.fiscal_year_start_month,
          default_measurement_tolerance_percent: parseFloat(settings.default_measurement_tolerance_percent),
          email_notifications_enabled: settings.email_notifications_enabled,
          steel_measurement_uom: settings.steel_measurement_uom ?? 'MT',
        }}
      >
        <Card title="Company Branding" style={{ marginBottom: 16 }}>
          <Form.Item name="company_name" label="Company Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Typography.Title level={5} style={{ marginTop: 8 }}>Logos &amp; Favicon</Typography.Title>
          <Row gutter={24}>
            {LOGO_SLOTS.map((slot) => (
              <Col key={slot.key} xs={24} md={12}>
                <LogoUploadField
                  slot={slot}
                  currentUrl={settings[slot.key as keyof OrganizationSettingsRead] as string | null}
                  file={logoFiles[slot.key]}
                  onFileChange={(file) => setLogoFiles((prev) => ({ ...prev, [slot.key]: file }))}
                />
              </Col>
            ))}
          </Row>

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
          <Form.Item
            name="timezone"
            label="Timezone"
            rules={[{ required: true }]}
            extra="Used to format every timestamp shown across the app (audit logs, check-in times, etc.) and to determine the current calendar date for attendance/DPR validation server-side — not just a display preference."
          >
            <Select showSearch optionFilterProp="label" options={TIMEZONE_OPTIONS} />
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
          <Form.Item
            name="steel_measurement_uom"
            label="Steel / Reinforcement Measurement Unit"
            extra="Controls whether auto-calculated steel material quantities are recorded in Metric Tons (MT) or Kilograms (KG)."
            rules={[{ required: true }]}
          >
            <Select
              style={{ width: 200 }}
              options={[
                { value: 'MT', label: 'MT — Metric Ton' },
                { value: 'KG', label: 'KG — Kilogram' },
              ]}
            />
          </Form.Item>
        </Card>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={updateSettings.isPending || uploadPhoto.isPending}
        >
          Save Settings
        </Button>
      </Form>
    </div>
  );
}
