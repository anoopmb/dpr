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

/**
 * Mirrors backend app/domain/measurement/expression.py exactly — a small
 * hand-written tokenizer + recursive-descent parser (never eval()) so a
 * site engineer can type e.g. "(1+2.5)/2" into an L/B/D field instead of a
 * single reading. This is UX-only, live-preview math: the server always
 * re-evaluates the expression text itself and never trusts this computed
 * number.
 */
export class ExpressionError extends Error {}

export function evaluateExpression(text: string): number {
  const tokens: string[] = [];
  const tokenRe = /\s*(\d+\.?\d*|.)/y;
  let pos = 0;
  while (pos < text.length) {
    tokenRe.lastIndex = pos;
    const match = tokenRe.exec(text);
    if (!match || match[0].length === 0) {
      throw new ExpressionError(`Could not parse expression: ${JSON.stringify(text)}`);
    }
    const tok = match[1];
    if (/^\d+\.?\d*$/.test(tok)) {
      tokens.push(tok);
    } else if (!/^\s*$/.test(tok)) {
      if (!'+-*/()'.includes(tok)) {
        throw new ExpressionError(`Unsupported character ${JSON.stringify(tok)} in expression: ${JSON.stringify(text)}`);
      }
      tokens.push(tok);
    }
    pos = tokenRe.lastIndex;
  }

  let i = 0;
  const peek = () => (i < tokens.length ? tokens[i] : null);
  const next = () => {
    const tok = peek();
    if (tok === null) throw new ExpressionError('Unexpected end of expression');
    i += 1;
    return tok;
  };

  if (peek() === null) throw new ExpressionError('Expression is empty');

  const parseExpression = (): number => {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      if (op === '*') {
        value = value * rhs;
      } else {
        if (rhs === 0) throw new ExpressionError(`Division by zero in expression: ${JSON.stringify(text)}`);
        value = value / rhs;
      }
    }
    return value;
  };

  const parseFactor = (): number => {
    const tok = peek();
    if (tok === '-') { next(); return -parseFactor(); }
    if (tok === '+') { next(); return parseFactor(); }
    if (tok === '(') {
      next();
      const value = parseExpression();
      if (peek() !== ')') throw new ExpressionError(`Missing closing parenthesis in expression: ${JSON.stringify(text)}`);
      next();
      return value;
    }
    if (tok !== null && /^\d+\.?\d*$/.test(tok)) {
      next();
      const value = Number(tok);
      if (Number.isNaN(value)) throw new ExpressionError(`Invalid number ${JSON.stringify(tok)} in expression: ${JSON.stringify(text)}`);
      return value;
    }
    throw new ExpressionError(`Unexpected token ${JSON.stringify(tok)} in expression: ${JSON.stringify(text)}`);
  };

  const result = parseExpression();
  if (peek() !== null) {
    throw new ExpressionError(`Unexpected trailing input in expression: ${JSON.stringify(text)}`);
  }
  return result;
}

// A plain number (optionally with a leading -, decimal point) is NOT an
// expression — only treat input as an expression (and thus something to
// store in dimension_expressions) if it actually uses an operator/paren.
export function isArithmeticExpression(text: string): boolean {
  return /[+\-*/()]/.test(text.trim().replace(/^-/, ''));
}
