import { useState } from 'react';
import { Button, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@/utils/api-error';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthStore, type AuthUser, type UserRole } from '@/store/auth-store';
import { useThemeMode } from '@/theme/theme-context';
import { useOrganizationBranding } from '@/api/hooks/useOrganizationSettings';

interface MeResponse {
  id: string;
  login_id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
  role: UserRole;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const { resolvedMode, palette } = useThemeMode();
  const { data: branding } = useOrganizationBranding();

  const logoUrl = resolvedMode === 'dark' ? branding?.company_logo_dark_url : branding?.company_logo_light_url;
  const companyName = branding?.company_name ?? 'DPR System';

  const onFinish = async (values: { login_id: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post<MeResponse>('/auth/login', values);
      const user: AuthUser = {
        id: data.id,
        loginId: data.login_id,
        fullName: data.full_name,
        email: data.email,
        photoUrl: data.photo_url,
        role: data.role,
      };
      queryClient.setQueryData(['session'], user);
      setUser(user);
      navigate(user.role === 'SITE_ENGINEER' ? '/field/dpr-today' : '/dashboard');
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Could not sign in. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Card: warm off-white in light, neutral charcoal (not cold blue) in dark
  const cardBg     = resolvedMode === 'dark' ? '#232830' : '#f7f7f5';
  const cardBorder = resolvedMode === 'dark' ? '1px solid rgba(255,255,255,0.07)' : '1px solid #e2e8f0';
  const inputBg    = resolvedMode === 'dark' ? '#111827' : '#ffffff';
  const inputBorder = resolvedMode === 'dark' ? 'rgba(255,255,255,0.12)' : '#d1d5db';
  const mutedText  = palette.contentMutedText;
  const titleColor = palette.contentText;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette.layoutBackground,
      }}
    >
      <div
        style={{
          width: 380,
          background: cardBg,
          border: cardBorder,
          borderRadius: 12,
          padding: '36px 32px 32px',
          boxShadow:
            resolvedMode === 'dark'
              ? '0 8px 40px rgba(0,0,0,0.55)'
              : '0 4px 24px rgba(0,0,0,0.10)',
        }}
      >
        {/* ── Branding ── */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName}
              style={{ height: 52, maxWidth: 220, marginBottom: 14, objectFit: 'contain' }}
            />
          ) : (
            /* Fallback mark, shown until the org configures a logo */
            <div
              style={{
                width: 52,
                height: 52,
                background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                boxShadow: '0 4px 16px rgba(22,119,255,0.35)',
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="4" y="5"  width="14" height="3" rx="1.5" fill="white" />
                <rect x="4" y="11" width="10" height="3" rx="1.5" fill="white" fillOpacity="0.85" />
                <rect x="4" y="17" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.7" />
                <circle cx="21" cy="21" r="5" fill="#52c41a" />
                <path d="M18.5 21l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}

          <Typography.Title
            level={3}
            style={{ margin: 0, color: titleColor, fontWeight: 700, fontSize: 22 }}
          >
            {companyName}
          </Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: mutedText }}>
            Daily Progress Reporting Platform
          </Typography.Text>
        </div>

        {/* ── Form ── */}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="login_id"
            label={<span style={{ color: titleColor, fontWeight: 500 }}>User ID</span>}
            rules={[{ required: true, message: 'Please enter your User ID' }]}
            style={{ marginBottom: 16 }}
          >
            <Input
              placeholder="e.g. jsmith"
              autoFocus
              size="large"
              style={{
                background: inputBg,
                borderColor: inputBorder,
                color: '#e2e8f0',
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ color: titleColor, fontWeight: 500 }}>Password</span>}
            rules={[{ required: true, message: 'Please enter your password' }]}
            style={{ marginBottom: 24 }}
          >
            <Input.Password
              size="large"
              style={{
                background: inputBg,
                borderColor: inputBorder,
                color: '#e2e8f0',
              }}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={loading}
            style={{ fontWeight: 600, height: 44 }}
          >
            Sign in
          </Button>
        </Form>
      </div>
    </div>
  );
}
