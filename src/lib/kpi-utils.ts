import type { KPISummary, DashboardResultRow } from "./types";

/**
 * Fallback target used when a KPI has no explicit targetValue in the API
 * catalog. All "pass/fail" comparisons across components must resolve
 * through this constant so the default stays consistent everywhere.
 */
export const DEFAULT_TARGET = 80;

export type KPIEvaluation = "pass" | "fail" | "not-applicable";

/**
 * Evaluate a KPI against its configured percentage target.
 *
 * Raw-count KPIs (totalTarget === 0) intentionally have no pass/fail
 * semantics; they only report result counts.
 */
export function evaluateKPI(
  kpi: KPISummary,
  selectedFacilities: string[] = [],
): KPIEvaluation {
  const { totalTarget, percentage } = computeAggregate(
    kpi,
    selectedFacilities,
  );

  if (totalTarget === 0) {
    return "not-applicable";
  }

  const target = kpi.targetValue || DEFAULT_TARGET;
  return percentage >= target ? "pass" : "fail";
}

export interface KPIValue {
  t: number;
  r: number;
}

/**
 * Format a percentage for display, always with 2 decimals.
 * Use this everywhere a percentage is rendered as text so the rounding
 * shown to the user matches the value used for pass/fail coloring.
 */
export function formatPct(val: number): string {
  return val.toFixed(2);
}

/**
 * Round a percentage to 2 decimals as a number. Reuses formatPct so the
 * numeric value exported to Excel matches what the UI shows exactly
 * (toFixed-based rounding, not Math.round — they diverge on .xx5 due to
 * IEEE-754 float representation, e.g. 89.585 → 89.58 not 89.59).
 */
export function roundPct(val: number): number {
  return parseFloat(formatPct(val));
}

/**
 * Read the already-calculated `target` and `result` of a normalized
 * DashboardResultRow from Backend v2. Pure API validation guarantees both
 * are finite numbers — no normalization happens here.
 */
export function calculateKPIValue(item: DashboardResultRow): KPIValue {
  const t = item.target;
  const r = item.result;

  return { t, r };
}

/**
 * Compute aggregate target/result/percentage for a KPI, scoped to the
 * selected facilities (or full totals when none selected). Shared by the
 * table, card, and summary-stats views so they never drift apart.
 */
export function computeAggregate(
  kpi: KPISummary,
  selectedFacilities: string[] = [],
): { totalTarget: number; totalResult: number; percentage: number } {
  if (selectedFacilities.length === 0) {
    return {
      totalTarget: kpi.totalTarget,
      totalResult: kpi.totalResult,
      percentage: kpi.percentage,
    };
  }

  const breakdown = kpi.breakdown ?? {};
  let selTarget = 0;
  let selResult = 0;
  for (const f of selectedFacilities) {
    const entry = breakdown[f];
    if (!entry) continue;
    selTarget += entry.target;
    selResult += entry.result;
  }

  // Raw-count KPIs (totalTarget === 0) only track results.
  if (kpi.totalTarget === 0) {
    return {
      totalTarget: 0,
      totalResult: selResult,
      percentage: selResult > 0 ? 100 : 0,
    };
  }

  return {
    totalTarget: selTarget,
    totalResult: selResult,
    percentage: selTarget > 0 ? (selResult / selTarget) * 100 : 0,
  };
}
