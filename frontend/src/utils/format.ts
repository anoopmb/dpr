/**
 * Shared number / currency formatting utilities driven by OrganizationSettings.
 *
 * Usage:
 *   const { fmtAmt, fmtQty } = useNumberFormat();
 *   fmtAmt(1234567.5)   →  "₹ 12,34,567.50"
 *   fmtQty(554.25)      →  "554.250"
 */

import { useOrganizationSettings } from '@/api/hooks/useOrganizationSettings';
import { useUoms } from '@/api/hooks/useMasters';

export interface NumberFormat {
  /** Format a monetary amount using org currency settings */
  fmtAmt: (v: string | number | null | undefined) => string;
  /** Format a quantity value (fixed 3 decimal places, no currency symbol) */
  fmtQty: (v: string | number | null | undefined, decimals?: number) => string;
  /** Format a quantity using its UOM's own decimal_places (falls back to 3 if the unit code isn't found) */
  fmtQtyByUnit: (v: string | number | null | undefined, unitCode: string | null | undefined) => string;
  /** Currency symbol from settings (e.g. "₹") */
  symbol: string;
  /** Whether settings have loaded */
  ready: boolean;
}

function rawFmt(
  v: string | number | null | undefined,
  decimals: number,
  useThousands: boolean,
  locale: string,
): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: useThousands,
  });
}

export function useNumberFormat(): NumberFormat {
  const { data: settings } = useOrganizationSettings();
  const { data: uoms } = useUoms();

  const symbol       = settings?.currency_symbol ?? '₹';
  const decimals     = settings?.decimal_places ?? 2;
  const useThousands = settings?.use_thousands_separator ?? true;
  // en-IN gives Indian grouping (1,00,000); en-US gives Western (100,000)
  const locale = 'en-IN';

  const uomDecimalsByCode = new Map((uoms ?? []).map((u) => [u.code, u.decimal_places]));

  const fmtAmt = (v: string | number | null | undefined): string => {
    const formatted = rawFmt(v, decimals, useThousands, locale);
    if (formatted === '—') return '—';
    return `${symbol} ${formatted}`;
  };

  const fmtQty = (v: string | number | null | undefined, dec = 3): string =>
    rawFmt(v, dec, useThousands, locale);

  const fmtQtyByUnit = (v: string | number | null | undefined, unitCode: string | null | undefined): string =>
    rawFmt(v, unitCode ? uomDecimalsByCode.get(unitCode) ?? 3 : 3, useThousands, locale);

  return { fmtAmt, fmtQty, fmtQtyByUnit, symbol, ready: !!settings };
}
