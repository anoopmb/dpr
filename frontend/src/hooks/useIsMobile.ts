import { Grid } from 'antd';

const { useBreakpoint } = Grid;

/** Same breakpoint AppLayout uses to switch the sidebar into its mobile
 * drawer mode (antd's `lg` breakpoint, 992px) — shared here so every page
 * can make the same "are we on mobile" call consistently. */
export function useIsMobile(): boolean {
  const screens = useBreakpoint();
  return screens.lg === false;
}
