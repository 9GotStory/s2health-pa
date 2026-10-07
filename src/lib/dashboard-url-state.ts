export interface DashboardUrlState {
  category: string;
  facilities: string[];
  kpis: string[];
}

export interface DashboardUrlStateAllowedValues {
  categories: Iterable<string>;
  facilities: Iterable<string>;
  kpis: Iterable<string>;
}

const CATEGORY_PARAM = "cat";
const FACILITY_PARAM = "facility";
const KPI_PARAM = "kpi";

function canonicalValues(values: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(values)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort();
}

export function normalizeDashboardUrlState(
  state: DashboardUrlState,
): DashboardUrlState {
  return {
    category: state.category.trim(),
    facilities: canonicalValues(state.facilities),
    kpis: canonicalValues(state.kpis),
  };
}

export function parseDashboardUrlState(
  search: string | URLSearchParams,
): DashboardUrlState {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  return normalizeDashboardUrlState({
    category: params.get(CATEGORY_PARAM) ?? "",
    facilities: params.getAll(FACILITY_PARAM),
    kpis: params.getAll(KPI_PARAM),
  });
}

export function serializeDashboardUrlState(
  state: DashboardUrlState,
): string {
  const normalized = normalizeDashboardUrlState(state);
  const params = new URLSearchParams();

  if (normalized.category) {
    params.set(CATEGORY_PARAM, normalized.category);
  }
  normalized.facilities.forEach((facility) => {
    params.append(FACILITY_PARAM, facility);
  });
  normalized.kpis.forEach((kpi) => {
    params.append(KPI_PARAM, kpi);
  });

  return params.toString();
}

export function sanitizeDashboardUrlState(
  state: DashboardUrlState,
  allowed: DashboardUrlStateAllowedValues,
): DashboardUrlState {
  const normalized = normalizeDashboardUrlState(state);
  const categories = new Set(canonicalValues(allowed.categories));
  const facilities = new Set(canonicalValues(allowed.facilities));
  const kpis = new Set(canonicalValues(allowed.kpis));

  return {
    category:
      normalized.category && categories.has(normalized.category)
        ? normalized.category
        : "",
    facilities: normalized.facilities.filter((value) =>
      facilities.has(value),
    ),
    kpis: normalized.kpis.filter((value) => kpis.has(value)),
  };
}

export function dashboardUrlStateEquals(
  left: DashboardUrlState,
  right: DashboardUrlState,
): boolean {
  const a = normalizeDashboardUrlState(left);
  const b = normalizeDashboardUrlState(right);

  return (
    a.category === b.category &&
    a.facilities.length === b.facilities.length &&
    a.kpis.length === b.kpis.length &&
    a.facilities.every((value, index) => value === b.facilities[index]) &&
    a.kpis.every((value, index) => value === b.kpis[index])
  );
}
