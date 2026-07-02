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
  // 'nos' is always a leading multiplicand regardless of formula — lets any
  // work type express "N identical units of this shape" without each
  // formula needing its own nos-handling. PRODUCT already multiplied nos
  // in along with everything else, so pulling it out here doesn't change
  // PRODUCT's result (multiplication is commutative).
  const nos = dimensionFields.includes('nos') ? (dimensions.nos ?? 1) : 1;
  const values = dimensionFields.filter((f) => f !== 'nos').map((field) => dimensions[field] ?? 0);

  if (formula === 'PRODUCT') {
    return values.reduce((acc, v) => acc * v, 1) * nos;
  }

  if (formula === 'AREA_LH') {
    const [length, height] = values;
    return length * height * nos;
  }

  // LENGTH_ONLY — billed by running length. e.g. GEN_COUNT, whose only
  // field is 'nos' itself — the count IS the quantity, nothing else to
  // multiply it against.
  if (values.length === 0) return nos;
  return values[0] * nos;
}
