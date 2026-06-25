import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { InstallBanner } from '@/components/layout/InstallBanner';

function App() {
  return (
    <AppProviders>
      {/* Mounted at the app root (not inside AppLayout) so the
          beforeinstallprompt listener attaches before login — Chrome fires
          that event once per page load and it's lost if nothing has
          subscribed yet. */}
      <InstallBanner />
      <AppRouter />
    </AppProviders>
  );
}

export default App;
