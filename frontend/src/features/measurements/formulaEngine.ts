/**
 * Mirrors backend app/domain/measurement/calculators.py — quantity is
 * computed from a work type's formula + dimension_fields, both sourced
 * from the work_type_master table (GET /masters/work-types), not
 * hardcoded here. Used for live on-device preview only; the server always
 * re-validates and recomputes before persisting.
 */

export type WorkTypeFormula = 'PRODUCT' | 'AREA_LH' | 'LENGTH_ONLY';

export function calculateQuantity(
  formula: WorkTypeFormula,
  dimensionFields: string[],
  dimensions: Record<string, number>,
): number {
  const values = dimensionFields.map((field) => dimensions[field] ?? 0);

  if (formula === 'PRODUCT') {
    return values.reduce((acc, v) => acc * v, 1);
  }

  if (formula === 'AREA_LH') {
    const [length, height] = values;
    return length * height;
  }

  // LENGTH_ONLY — billed by running length
  return values[0] ?? 0;
}
