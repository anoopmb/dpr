import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { ThemeModeContext, palettes, type ThemeContextValue, type ThemeMode, type ResolvedThemeMode } from '@/theme/theme-context';

const STORAGE_KEY = 'dpr-ui-theme';

function getInitialMode(): ThemeMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function getSystemPreference(): ResolvedThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);
  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>(getSystemPreference);
  const resolvedMode = mode === 'system' ? systemMode : mode;
  const palette = palettes[resolvedMode];

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemMode(event.matches ? 'dark' : 'light');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedMode);
    document.body.style.backgroundColor = palette.layoutBackground;
    document.body.style.color = palette.contentText;
  }, [resolvedMode, palette]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggleMode = useCallback(
    () => setModeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedMode, palette, setMode, toggleMode }),
    [mode, resolvedMode, palette, setMode, toggleMode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: resolvedMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: palette.accent,
            borderRadius: 6,
          },
          components: {
            Menu: {
              itemBorderRadius: 8,
              itemMarginInline: 8,
              itemMarginBlock: 2,
              itemHeight: 40,
              subMenuItemBorderRadius: 8,
              iconSize: 16,
              collapsedIconSize: 18,
              itemColor: palette.headerMutedText,
              itemHoverColor: palette.contentText,
              subMenuItemSelectedColor: palette.accent,
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
