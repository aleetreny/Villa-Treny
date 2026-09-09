/** A few floating-point operations can put an exact decimal just below its
 * value. This allowance follows the operands' precision, stays below 1e-9
 * cells, and must never round genuine fractional wages or leakage to cents. */
function arithmeticTolerance(...values: number[]): number {
  return Math.min(1e-9, Number.EPSILON * Math.max(1, ...values.map(Math.abs)) * 16);
}

export function canSpendCells(balance: number, cells: number, reserved = 0): boolean {
  return [balance, cells, reserved].every(Number.isFinite) && cells >= 0
    && balance - reserved >= cells - arithmeticTolerance(balance, reserved, cells);
}

/** Report the largest two-decimal offer that the same affordability check will
 * accept. The underlying account and reservations retain their full precision. */
export function maxSpendableCells(balance: number, reserved = 0): number {
  if (![balance, reserved].every(Number.isFinite)) return 0;
  const available = Math.max(0, balance - reserved);
  const nearestCent = Math.round(available * 100) / 100;
  return canSpendCells(balance, nearestCent, reserved) ? nearestCent : Math.floor(available * 100) / 100;
}
