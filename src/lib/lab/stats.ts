/** Small, deterministic statistics used by every Lab experiment. These are
 * descriptive aids for a handful of model outputs, not proof of a mechanism. */

export type Interval = { low: number; high: number };

/** Wilson score interval for k successes in n trials (95% by default). */
export function wilson(k: number, n: number, z = 1.959963984540054): Interval | null {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) return null;
  const p = k / n, z2 = z * z, denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (z / denominator) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function logChoose(n: number, k: number): number {
  let total = 0;
  for (let i = 1; i <= k; i++) total += Math.log(n - k + i) - Math.log(i);
  return total;
}
/** Probability of exactly k successes. Log space keeps large n finite. */
export function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, Math.min(k, n - k)) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
/** Exact two-sided binomial test: the total probability of outcomes no more
 * likely than the observed one under the null proportion p. */
export function binomialTest(k: number, n: number, p = 0.5): number | null {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n || p <= 0 || p >= 1) return null;
  const observed = binomialPmf(k, n, p);
  let total = 0;
  for (let i = 0; i <= n; i++) {
    const value = binomialPmf(i, n, p);
    if (value <= observed * (1 + 1e-7)) total += value;
  }
  return Math.min(1, total);
}

export type Rate = { count: number; opportunities: number; rate: number | null; interval: Interval | null; baseline: number; pValue: number | null };
export function rate(count: number, opportunities: number, baseline: number): Rate {
  return { count, opportunities, rate: opportunities ? count / opportunities : null, interval: wilson(count, opportunities),
    baseline, pValue: binomialTest(count, opportunities, baseline) };
}

/** Plain-language reading of a rate against its baseline. Deliberately
 * cautious: overlap with the baseline is "consistent with chance", and a
 * departure is described as a pattern in this sample, never a cause. */
export function rateReading(value: Rate, minimum = 10): 'too_few' | 'consistent' | 'above' | 'below' {
  if (value.opportunities < minimum || !value.interval) return 'too_few';
  if (value.interval.low > value.baseline) return 'above';
  if (value.interval.high < value.baseline) return 'below';
  return 'consistent';
}

export const percent = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : (value * 100).toFixed(digits) + '%';
