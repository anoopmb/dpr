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
  /** Selected sidebar nav item — a light, neutral pill with dark text, the
   * same treatment in both themes per explicit instruction (not a solid
   * accent fill in dark mode). */
  navItemSelectedBg: string;
  navItemSelectedColor: string;
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
    layoutBackground: '#eef0f2',
    headerBackground: '#eef0f2',
    siderBackground: '#ffffff',
    headerText: '#0f172a',
    headerMutedText: '#6b7280',
    contentBackground: '#ffffff',
    contentText: '#0f172a',
    contentMutedText: '#6b7280',
    borderColor: '#e2e5e9',
    accent: '#1677ff',
    navItemSelectedBg: '#e4e7eb',
    navItemSelectedColor: '#0f172a',
  },
  dark: {
    layoutBackground: '#0b0e14',
    headerBackground: '#0b0e14',
    siderBackground: '#0b0e14',
    headerText: '#f1f5f9',
    headerMutedText: '#8b949e',
    contentBackground: '#11151c',
    contentText: '#f1f5f9',
    contentMutedText: '#8b949e',
    borderColor: '#1f242c',
    accent: '#3b82f6',
    navItemSelectedBg: '#e4e7eb',
    navItemSelectedColor: '#0f172a',
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
