import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export interface ThemePalette {
  layoutBackground: string;
  headerBackground: string;
  siderBackground: string;
  headerText: string;
  headerMutedText: string;
  contentBackground: string;
  contentText: string;
  contentMutedText: string;
  borderColor: string;
  accent: string;
}

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const palettes: Record<ResolvedThemeMode, ThemePalette> = {
  light: {
    layoutBackground: '#f3f3f3',
    headerBackground: '#ffffff',
    siderBackground: '#ffffff',
    headerText: '#1f2937',
    headerMutedText: '#64748b',
    contentBackground: '#ffffff',
    contentText: '#0f172a',
    contentMutedText: '#475569',
    borderColor: '#e2e8f0',
    accent: '#1677ff',
  },
  dark: {
    layoutBackground: '#0f172a',
    headerBackground: '#151f32',
    siderBackground: '#1c1c1e',
    headerText: '#e2e8f0',
    headerMutedText: '#94a3b8',
    contentBackground: '#1a202c',
    contentText: '#e2e8f0',
    contentMutedText: '#94a3b8',
    borderColor: '#2c2c2e',
    accent: '#4096ff',
  },
};

export const ThemeModeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedMode: 'light',
  palette: palettes.light,
  setMode: () => undefined,
  toggleMode: () => undefined,
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
