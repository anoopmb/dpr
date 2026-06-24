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
              itemBorderRadius: 6,
              itemMarginInline: 4,
              itemMarginBlock: 1,
              itemHeight: 34,
              subMenuItemBorderRadius: 6,
              iconSize: 16,
              collapsedIconSize: 18,
              itemColor: palette.headerMutedText,
              itemHoverColor: palette.contentText,
              itemHoverBg: resolvedMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              // A neutral light-gray pill, not accent-tinted blue — the
              // standard treatment most sidebars use (GitHub, VS Code,
              // Slack): a subtle neutral highlight + bold/accent text marks
              // the selection, rather than a saturated colored fill.
              // Not a left-border line either — antd indents nested submenu
              // items via padding, not by shifting the item's own box, so a
              // border-inline-start on a deeply nested item renders at the
              // row's outer edge, nowhere near its visually-indented text.
              itemSelectedColor: palette.accent,
              itemSelectedBg: resolvedMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              subMenuItemSelectedColor: palette.contentText,
              subMenuItemBg: 'transparent',
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
