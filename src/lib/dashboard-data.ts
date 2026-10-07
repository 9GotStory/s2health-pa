import type {
  DashboardDataset,
  DashboardPeriodCode,
  DashboardResultRow,
  KPISummary,
} from './types';

/**
 * Pure normalization / validation / transformation for the Backend v2
 * dashboard read API (/api/v1/dashboard, /api/v1/kpis, /api/v1/facilities,
 * /api/v1/tambons). No React, no DOM, no network, no browser storage, no
 * environment access — useKPIData owns the network lifecycle; this module
 * only validates and transforms what came back. Any violation throws;
 * the hook maps every throw to a load error. The backend is the KPI
 * calculation authority — totals here only sum already-calculated values.
 */

export interface PublicKpi {
  key: string;
  title: string;
  target: number | null;
  order: number;
  link: string | null;
  categoryCode: string;
  category: string;
  categoryOrder: number;
  subgroup: string | null;
  isQuarterly: boolean;
  targetMonths: number | null;
  effectiveQuarter: number | null;
}

export interface PublicFacility {
  hospcode: string;
  hospname: string;
  tambonId: string;
}

export interface PublicTambon {
  id: string;
  nameTh: string;
}

export interface HospitalDetail {
  name: string;
  tambon_id: string;
}

export interface ParsedDashboard {
  dataset: DashboardDataset | null;
  results: DashboardResultRow[];
}

export interface DashboardModel {
  summaries: KPISummary[];
  hospitalMap: Record<string, HospitalDetail>;
  tambonMap: Record<string, string>;
  lastUpdated: string;
}

const PERIOD_CODES: readonly DashboardPeriodCode[] = [
  'annual',
  'q1',
  'q2',
  'q3',
  'q4',
];

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new Error(`Field ${field} is not a string`);
  }
  return value;
}

function requireNonblankString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Field ${field} is not a nonblank string`);
  }
  return value;
}

function requireInteger(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Field ${field} is not an integer`);
  }
  return value;
}

// Backend returns JSON numbers; never coerce strings/objects/booleans.
function requireFiniteNumber(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Field ${field} is not a finite number`);
  }
  return value;
}

function optionalNonblankString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Field ${field} is not a nonblank string or null`);
  }
  return value;
}

// Backend contract for nullable plain strings (e.g. link/subgroup): any
// string — including "" — is valid; only non-string non-null is not.
function optionalString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Field ${field} is not a string or null`);
  }
  return value;
}


function optionalExternalHttpUrl(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = optionalString(record, field);
  if (value === null || value === '') return value;

  if (value.trim() !== value) {
    throw new Error(
      `Field ${field} is not an absolute HTTP(S) URL, empty string, or null`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Field ${field} is not an absolute HTTP(S) URL, empty string, or null`,
    );
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.hostname.length === 0
  ) {
    throw new Error(
      `Field ${field} is not an absolute HTTP(S) URL, empty string, or null`,
    );
  }

  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  field: string,
): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new Error(`Field ${field} is not a boolean`);
  }
  return value;
}

function requireDigitCode(
  record: Record<string, unknown>,
  field: string,
  length: number,
): string {
  const value = record[field];
  if (
    typeof value !== 'string' ||
    value.length !== length ||
    !/^\d+$/.test(value)
  ) {
    throw new Error(`Field ${field} is not a ${length}-digit code`);
  }
  return value;
}

function requirePeriodCode(
  record: Record<string, unknown>,
  field: string,
): DashboardPeriodCode {
  const value = record[field];
  if (
    typeof value === 'string' &&
    (PERIOD_CODES as readonly string[]).includes(value)
  ) {
    return value as DashboardPeriodCode;
  }
  throw new Error(`Field ${field} is not a period code`);
}

interface CompactTimestampParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseSourceLastUpdatedParts(value: string): CompactTimestampParts {
  if (!/^\d{12}(?:\d{2})?$/.test(value)) {
    throw new Error(
      'Field sourceLastUpdated is not a 12/14-digit timestamp',
    );
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = value.length === 14 ? Number(value.slice(12, 14)) : 0;

  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new Error(
      'Field sourceLastUpdated is not a valid calendar timestamp',
    );
  }

  return { year, month, day, hour, minute, second };
}

function requireSourceLastUpdated(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(
      'Field sourceLastUpdated is not a 12/14-digit timestamp',
    );
  }

  parseSourceLastUpdatedParts(value);
  return value;
}

function parseResultRow(value: unknown): DashboardResultRow {
  const record = asRecord(value, 'Dashboard result');
  return {
    kpiKey: requireNonblankString(record, 'kpiKey'),
    periodCode: requirePeriodCode(record, 'periodCode'),
    areacode: requireNonblankString(record, 'areacode'),
    hospcode: optionalNonblankString(record, 'hospcode'),
    target: requireFiniteNumber(record, 'target'),
    result: requireFiniteNumber(record, 'result'),
  };
}

/**
 * Validate a /api/v1/dashboard body. `dataset: null` + empty `results` is
 * the authoritative no-active-dataset state, not an error.
 */
export function parseDashboardResponse(value: unknown): ParsedDashboard {
  const root = asRecord(value, 'Dashboard response');
  if (!('dataset' in root) || !('results' in root)) {
    throw new Error('Dashboard response must have dataset and results');
  }

  const results = root.results;
  if (!Array.isArray(results)) {
    throw new Error('Dashboard results is not an array');
  }

  if (root.dataset === null) {
    if (results.length > 0) {
      throw new Error('No-active dataset must not carry results');
    }
    return { dataset: null, results: [] };
  }

  const datasetRecord = asRecord(root.dataset, 'Dashboard dataset');
  const syncRunId = requireString(datasetRecord, 'syncRunId');
  if (syncRunId.length === 0 || !/^\d+$/.test(syncRunId)) {
    throw new Error('Field syncRunId is not a decimal identity');
  }
  const currentQuarter = requireInteger(datasetRecord, 'currentQuarter');
  if (currentQuarter < 1 || currentQuarter > 4) {
    throw new Error('Field currentQuarter is out of range 1..4');
  }
  const activatedAt = requireString(datasetRecord, 'activatedAt');
  if (activatedAt.length === 0 || Number.isNaN(Date.parse(activatedAt))) {
    throw new Error('Field activatedAt is not a valid timestamp');
  }

  if (results.length === 0) {
    throw new Error('Active dataset must carry results');
  }

  return {
    dataset: {
      syncRunId,
      fiscalYear: requireInteger(datasetRecord, 'fiscalYear'),
      currentQuarter,
      activatedAt,
      sourceLastUpdated: requireSourceLastUpdated(
        datasetRecord.sourceLastUpdated,
      ),
    },
    results: results.map(parseResultRow),
  };
}

export function parseKpiCatalogResponse(value: unknown): PublicKpi[] {
  const root = asRecord(value, 'KPI catalog response');
  if (!Array.isArray(root.kpis)) {
    throw new Error('KPI catalog response must be { kpis: [...] }');
  }

  const seen = new Set<string>();
  return root.kpis.map((entry) => {
    const record = asRecord(entry, 'KPI catalog entry');
    const key = requireNonblankString(record, 'key');
    if (seen.has(key)) {
      throw new Error(`Duplicate KPI key: ${key}`);
    }
    seen.add(key);

    const effectiveQuarter =
      record.effectiveQuarter === null
        ? null
        : requireInteger(record, 'effectiveQuarter');
    if (effectiveQuarter !== null && (effectiveQuarter < 1 || effectiveQuarter > 4)) {
      throw new Error('Field effectiveQuarter is out of range 1..4');
    }

    const target =
      record.target === null
        ? null
        : requireFiniteNumber(record, 'target');
    if (target !== null && (target < 0 || target > 100)) {
      throw new Error('Field target is out of range 0..100');
    }

    const targetMonths =
      record.targetMonths === null
        ? null
        : requireInteger(record, 'targetMonths');
    if (targetMonths !== null && (targetMonths < 1 || targetMonths > 12)) {
      throw new Error('Field targetMonths is out of range 1..12');
    }

    return {
      key,
      title: requireNonblankString(record, 'title'),
      target,
      order: requireInteger(record, 'order'),
      link: optionalExternalHttpUrl(record, 'link'),
      categoryCode: requireNonblankString(record, 'categoryCode'),
      category: requireNonblankString(record, 'category'),
      categoryOrder: requireInteger(record, 'categoryOrder'),
      subgroup: optionalString(record, 'subgroup'),
      isQuarterly: requireBoolean(record, 'isQuarterly'),
      targetMonths,
      effectiveQuarter,
    };
  });
}

export function parseFacilitiesResponse(value: unknown): PublicFacility[] {
  const root = asRecord(value, 'Facilities response');
  if (!Array.isArray(root.facilities)) {
    throw new Error('Facilities response must be { facilities: [...] }');
  }

  const seen = new Set<string>();
  return root.facilities.map((entry) => {
    const record = asRecord(entry, 'Facility entry');
    const hospcode = requireDigitCode(record, 'hospcode', 5);
    if (seen.has(hospcode)) {
      throw new Error(`Duplicate facility hospcode: ${hospcode}`);
    }
    seen.add(hospcode);
    return {
      hospcode,
      hospname: requireNonblankString(record, 'hospname'),
      tambonId: requireDigitCode(record, 'tambonId', 6),
    };
  });
}

export function parseTambonsResponse(value: unknown): PublicTambon[] {
  const root = asRecord(value, 'Tambons response');
  if (!Array.isArray(root.tambons)) {
    throw new Error('Tambons response must be { tambons: [...] }');
  }

  const seen = new Set<string>();
  return root.tambons.map((entry) => {
    const record = asRecord(entry, 'Tambon entry');
    const id = requireDigitCode(record, 'id', 6);
    if (seen.has(id)) {
      throw new Error(`Duplicate tambon id: ${id}`);
    }
    seen.add(id);
    return {
      id,
      nameTh: requireNonblankString(record, 'nameTh'),
    };
  });
}

/**
 * Format the dataset-level sourceLastUpdated for presentation (Thai locale,
 * date/month/year/hour/minute + " น."). 14-digit values drop the seconds.
 * null → '' (an active dataset without a marker stays usable).
 */
export function formatSourceLastUpdated(value: string | null): string {
  if (value === null) return '';

  const { year, month, day, hour, minute } =
    parseSourceLastUpdatedParts(value);
  const d = new Date(0);
  d.setFullYear(year, month - 1, day);
  d.setHours(hour, minute, 0, 0);

  return (
    d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' น.'
  );
}

function guardFinite(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${what} overflowed to a non-finite number`);
  }
  return value;
}

/**
 * Cross-validate the four API payloads (active dataset) and build the
 * presentation model. Summaries stay in catalog order as returned by
 * /api/v1/kpis — the backend sort order IS the display order.
 */
export function buildDashboardModel(input: {
  dataset: DashboardDataset;
  results: DashboardResultRow[];
  kpis: PublicKpi[];
  facilities: PublicFacility[];
  tambons: PublicTambon[];
}): DashboardModel {
  const { dataset, results, kpis, facilities, tambons } = input;

  const tambonMap: Record<string, string> = {};
  for (const tambon of tambons) {
    tambonMap[tambon.id] = tambon.nameTh;
  }

  const hospitalMap: Record<string, HospitalDetail> = {};
  for (const facility of facilities) {
    if (!(facility.tambonId in tambonMap)) {
      throw new Error(
        `Facility ${facility.hospcode} references unknown tambon ${facility.tambonId}`,
      );
    }
    hospitalMap[facility.hospcode] = {
      name: facility.hospname,
      tambon_id: facility.tambonId,
    };
  }

  const rowsByKpiKey = new Map<string, DashboardResultRow[]>();
  for (const row of results) {
    const existing = rowsByKpiKey.get(row.kpiKey);
    if (existing) {
      existing.push(row);
    } else {
      rowsByKpiKey.set(row.kpiKey, [row]);
    }
  }

  // KPI consistency, both directions: no result for an unknown KPI, no
  // catalog KPI without active result rows.
  const catalogKeys = new Set(kpis.map((kpi) => kpi.key));
  for (const key of rowsByKpiKey.keys()) {
    if (!catalogKeys.has(key)) {
      throw new Error(`Dashboard result references unknown KPI: ${key}`);
    }
  }
  for (const key of catalogKeys) {
    if (!rowsByKpiKey.has(key)) {
      throw new Error(`Catalog KPI has no active result rows: ${key}`);
    }
  }

  const summaries: KPISummary[] = kpis.map((kpi) => {
    const rows = rowsByKpiKey.get(kpi.key)!;

    // periodCode is the authority for the calculated period — every row of
    // a KPI must agree on it.
    const periodCode = rows[0].periodCode;
    for (const row of rows) {
      if (row.periodCode !== periodCode) {
        throw new Error(`KPI ${kpi.key} has mixed period codes`);
      }
    }

    // Catalog period semantics must agree with the calculated period.
    if (!kpi.isQuarterly && periodCode !== 'annual') {
      throw new Error(`Annual KPI ${kpi.key} has period ${periodCode}`);
    }
    if (kpi.isQuarterly && periodCode === 'annual') {
      throw new Error(`Quarterly KPI ${kpi.key} has period annual`);
    }
    if (
      kpi.effectiveQuarter !== null &&
      periodCode !== `q${kpi.effectiveQuarter}`
    ) {
      throw new Error(
        `KPI ${kpi.key} must use effective quarter q${kpi.effectiveQuarter}, got ${periodCode}`,
      );
    }

    // Presentation period. targetMonths override wins; otherwise annual →
    // 12, quarterly → result period × 3 (NOT dataset.currentQuarter —
    // effective-quarter KPIs deliberately lag the fiscal quarter).
    let targetMonths: number;
    let periodLabel: string;
    if (kpi.targetMonths !== null) {
      targetMonths = kpi.targetMonths;
      periodLabel = `สะสม ${kpi.targetMonths} เดือน`;
    } else if (periodCode === 'annual') {
      targetMonths = 12;
      periodLabel = 'รายปี';
    } else {
      const quarterNumber = Number(periodCode.substring(1));
      targetMonths = quarterNumber * 3;
      periodLabel = `สะสม ${targetMonths} เดือน (Q${quarterNumber})`;
    }

    let totalTarget = 0;
    let totalResult = 0;
    // Aggregate in a Map: hospcode is contractually any nonblank string, so
    // keys like "__proto__"/"constructor" must be ordinary data keys — never
    // inherited Object properties — and each bucket is guarded against
    // overflow independently of the global totals.
    const buckets = new Map<
      string,
      { target: number; result: number; percentage: number }
    >();
    for (const row of rows) {
      totalTarget += row.target;
      totalResult += row.result;
      const key = row.hospcode || row.areacode;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { target: 0, result: 0, percentage: 0 };
        buckets.set(key, bucket);
      }
      bucket.target = guardFinite(
        bucket.target + row.target,
        `KPI ${kpi.key} breakdown ${key} target`,
      );
      bucket.result = guardFinite(
        bucket.result + row.result,
        `KPI ${kpi.key} breakdown ${key} result`,
      );
    }
    guardFinite(totalTarget, `KPI ${kpi.key} totalTarget`);
    guardFinite(totalResult, `KPI ${kpi.key} totalResult`);
    const percentage = guardFinite(
      totalTarget > 0 ? (totalResult / totalTarget) * 100 : 0,
      `KPI ${kpi.key} percentage`,
    );
    // Convert to a prototype-safe record for KPISummary consumers (direct
    // lookup, Object.keys, Object.entries, Excel export). Object.create(null)
    // has no inherited "__proto__" setter, so every key lands as a plain
    // own property.
    const breakdown: Record<
      string,
      { target: number; result: number; percentage: number }
    > = Object.create(null);
    for (const [key, bucket] of buckets) {
      bucket.percentage = guardFinite(
        bucket.target > 0 ? (bucket.result / bucket.target) * 100 : 0,
        `KPI ${kpi.key} breakdown ${key} percentage`,
      );
      breakdown[key] = bucket;
    }

    return {
      title: kpi.title,
      tableName: kpi.key,
      totalTarget,
      totalResult,
      percentage,
      data: rows,
      breakdown,
      targetValue: kpi.target,
      targetMonths,
      link: kpi.link ?? undefined,
      period: periodLabel,
      order: kpi.order,
      category: kpi.category,
      subgroup: kpi.subgroup ?? '',
      categoryOrder: kpi.categoryOrder,
    };
  });

  return {
    summaries,
    hospitalMap,
    tambonMap,
    lastUpdated: formatSourceLastUpdated(dataset.sourceLastUpdated),
  };
}
