import { useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { MobileOutlined } from '@ant-design/icons';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

export function InstallBanner() {
  const { isInstallable, isIosInstallable, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (isInstallable) {
    return (
      <Alert
        banner
        type="info"
        icon={<MobileOutlined />}
        message={
          <Space>
            <span>Install DPR System on your device for a better experience.</span>
            <Button size="small" type="primary" onClick={async () => { await promptInstall(); setDismissed(true); }}>
              Install
            </Button>
            <Button size="small" type="text" onClick={() => setDismissed(true)}>
              Not now
            </Button>
          </Space>
        }
        closable={false}
        style={{ padding: '6px 12px' }}
      />
    );
  }

  if (isIosInstallable) {
    return (
      <Alert
        banner
        type="info"
        icon={<MobileOutlined />}
        message="To install: tap the Share button in Safari, then choose &ldquo;Add to Home Screen&rdquo;."
        closable
        onClose={() => setDismissed(true)}
        style={{ padding: '6px 12px' }}
      />
    );
  }

  return null;
}
