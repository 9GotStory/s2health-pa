import type { KPISummary, DashboardResultRow } from "./types";

/**
 * Fallback target used when a KPI has no explicit targetValue in the API
 * catalog. All "pass/fail" comparisons across components must resolve
 * through this constant so the default stays consistent everywhere.
 */
export const DEFAULT_TARGET = 80;

/**
 * Resolve a KPI threshold without treating an explicit zero as missing.
 * Only null means the catalog omitted a target and should use the fallback.
 */
export function resolveKpiTarget(
  kpi: Pick<KPISummary, "targetValue">,
): number {
  return kpi.targetValue ?? DEFAULT_TARGET;
}

export type KPIEvaluation = "pass" | "fail" | "not-applicable";

/**
 * Canonical KPI type check.
 *
 * KPI type is defined by the unfiltered KPI aggregate from Backend v2 and
 * must not change when a facility filter yields a zero denominator.
 */
export function isRawCountKPI(
  kpi: Pick<KPISummary, "totalTarget">,
): boolean {
  return kpi.totalTarget === 0;
}

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

  if (isRawCountKPI(kpi) || totalTarget === 0) {
    return "not-applicable";
  }

  const target = resolveKpiTarget(kpi);
  return percentage >= target ? "pass" : "fail";
}


export interface KPISummaryEvaluation {
  total: number;
  evaluated: number;
  passed: number;
  failed: number;
  rawCount: number;
  unavailablePercentage: number;
  successRate: number | null;
}

/**
 * Classify KPI summary semantics for the current facility scope.
 *
 * Raw-count KPIs are classified by canonical KPI type. A percentage KPI can
 * be temporarily unevaluable when the selected facilities have no denominator;
 * that state is tracked separately so totals always reconcile.
 */
export function summarizeKPIEvaluations(
  data: KPISummary[],
  selectedFacilities: string[] = [],
): KPISummaryEvaluation {
  let passed = 0;
  let failed = 0;
  let rawCount = 0;
  let unavailablePercentage = 0;

  for (const kpi of data) {
    if (isRawCountKPI(kpi)) {
      rawCount += 1;
      continue;
    }

    const evaluation = evaluateKPI(kpi, selectedFacilities);
    if (evaluation === "pass") {
      passed += 1;
    } else if (evaluation === "fail") {
      failed += 1;
    } else {
      unavailablePercentage += 1;
    }
  }

  const evaluated = passed + failed;

  return {
    total: data.length,
    evaluated,
    passed,
    failed,
    rawCount,
    unavailablePercentage,
    successRate: evaluated > 0 ? (passed / evaluated) * 100 : null,
  };
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
