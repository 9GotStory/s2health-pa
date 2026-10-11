import type {
  FastifyInstance,
} from "fastify";

export interface ReadApiQueryResult {
  readonly rows: readonly unknown[];
}

export interface ReadApiDatabase {
  query(
    text: string,
  ): Promise<ReadApiQueryResult>;
}

const SERVICE_UNAVAILABLE = {
  error: "service_unavailable",
} as const;

const KPI_CATALOG_QUERY = `
  WITH active_state AS (
    SELECT
      state.active_sync_run_id,
      run.config_snapshot
    FROM app_state AS state
    LEFT JOIN sync_runs AS run
      ON run.id = state.active_sync_run_id
    WHERE state.singleton_id = 1
  ),
  member_rows AS (
  SELECT
    snapshot.definition IS NOT NULL
      AS snapshot_definition_present,
    COALESCE(
      snapshot.definition_match_count,
      0
    ) AS snapshot_definition_match_count,
    CASE
      WHEN state.active_sync_run_id IS NOT NULL
        AND snapshot.definition ? 'kpiKey'
        THEN snapshot.definition ->> 'kpiKey'
      ELSE definition.kpi_key
    END AS kpi_key,
    definition.title,
    CASE
      WHEN state.active_sync_run_id IS NOT NULL
        AND snapshot.definition ? 'targetValue'
        THEN
          (snapshot.definition ->> 'targetValue')::NUMERIC
      ELSE definition.target_value
    END AS target_value,
    definition.sort_order,
    definition.link,
    category.code AS category_code,
    category.name AS category_name,
    category.sort_order AS category_order,
    definition.subgroup,
    CASE
      WHEN state.active_sync_run_id IS NOT NULL
        AND snapshot.definition ? 'isQuarterly'
        THEN
          (snapshot.definition ->> 'isQuarterly')::BOOLEAN
      ELSE definition.is_quarterly
    END AS is_quarterly,
    CASE
      WHEN state.active_sync_run_id IS NOT NULL
        AND snapshot.definition ? 'targetMonths'
        THEN
          (snapshot.definition ->> 'targetMonths')::SMALLINT
      ELSE definition.target_months
    END AS target_months,
    CASE
      WHEN state.active_sync_run_id IS NOT NULL
        AND snapshot.definition ? 'effectiveQuarter'
        THEN
          (snapshot.definition ->> 'effectiveQuarter')::SMALLINT
      ELSE definition.effective_quarter
    END AS effective_quarter
  FROM kpi_definitions AS definition
  INNER JOIN kpi_categories AS category
    ON category.id = definition.category_id
  CROSS JOIN active_state AS state
  LEFT JOIN LATERAL (
    SELECT
      item AS definition,
      COUNT(*) OVER ()::INTEGER
        AS definition_match_count
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(
          state.config_snapshot -> 'definitions'
        ) = 'array'
          THEN state.config_snapshot -> 'definitions'
        ELSE '[]'::JSONB
      END
    ) WITH ORDINALITY
      AS snapshot_item(item, ordinal)
    WHERE item ->> 'id'
      = definition.id::TEXT
    ORDER BY ordinal ASC
    LIMIT 1
  ) AS snapshot
    ON state.active_sync_run_id IS NOT NULL
  WHERE (
      state.active_sync_run_id IS NULL
      AND definition.is_active = TRUE
      AND NOT (
        definition.metadata
          @> '{"source_only": true}'::JSONB
      )
    )
    OR (
      state.active_sync_run_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM kpi_results AS active_result
        WHERE active_result.sync_run_id
            = state.active_sync_run_id
          AND active_result.kpi_definition_id
            = definition.id
      )
    )
  ORDER BY
    category.sort_order ASC,
    definition.sort_order ASC,
    definition.kpi_key ASC
  )
  SELECT
    state.active_sync_run_id::TEXT AS active_sync_run_id,
    member_rows.*
  FROM active_state AS state
  LEFT JOIN member_rows ON TRUE
  ORDER BY
    member_rows.category_order ASC,
    member_rows.sort_order ASC,
    member_rows.kpi_key ASC
`;

const SYNC_STATUS_QUERY = `
  SELECT
    state.active_sync_run_id::TEXT
      AS active_sync_run_id,
    latest.id::TEXT AS latest_id,
    latest.status AS latest_status,
    latest.fiscal_year AS latest_fiscal_year,
    latest.current_quarter
      AS latest_current_quarter,
    latest.expected_source_count
      AS latest_expected_source_count,
    latest.completed_source_count
      AS latest_completed_source_count,
    latest.failed_source_count
      AS latest_failed_source_count,
    latest.started_at AS latest_started_at,
    latest.finished_at AS latest_finished_at,
    latest.activated_at AS latest_activated_at
  FROM app_state AS state
  LEFT JOIN LATERAL (
    SELECT
      id,
      status,
      fiscal_year,
      current_quarter,
      expected_source_count,
      completed_source_count,
      failed_source_count,
      started_at,
      finished_at,
      activated_at
    FROM sync_runs
    ORDER BY
      started_at DESC,
      id DESC
    LIMIT 1
  ) AS latest
    ON TRUE
  WHERE state.singleton_id = 1
`;

const FACILITIES_QUERY = `
  SELECT
    hospcode,
    hospname,
    tambon_id
  FROM facilities
  ORDER BY hospcode ASC
`;

const TAMBONS_QUERY = `
  SELECT
    id,
    name_th
  FROM tambons
  ORDER BY id ASC
`;

const DASHBOARD_QUERY = `
  SELECT
    state.active_sync_run_id::TEXT
      AS active_sync_run_id,
    run.id::TEXT AS run_id,
    run.status AS run_status,
    run.fiscal_year AS fiscal_year,
    run.current_quarter AS current_quarter,
    run.expected_source_count
      AS expected_source_count,
    run.completed_source_count
      AS completed_source_count,
    run.failed_source_count
      AS failed_source_count,
    run.finished_at AS finished_at,
    run.activated_at AS activated_at,
    fresh.source_last_updated
      AS source_last_updated,
    snapshot.definition IS NOT NULL
      AS snapshot_definition_present,
    COALESCE(
      snapshot.definition_match_count,
      0
    ) AS snapshot_definition_match_count,
    CASE
      WHEN snapshot.definition ? 'kpiKey'
        THEN snapshot.definition ->> 'kpiKey'
      ELSE definition.kpi_key
    END AS kpi_key,
    kpi.kpi_definition_id::TEXT
      AS kpi_definition_id,
    kpi.fiscal_year AS result_fiscal_year,
    kpi.period_code AS period_code,
    kpi.areacode AS areacode,
    kpi.hospcode AS hospcode,
    kpi.target AS target,
    kpi.result AS result
  FROM app_state AS state
  LEFT JOIN LATERAL (
    SELECT
      id,
      status,
      fiscal_year,
      current_quarter,
      expected_source_count,
      completed_source_count,
      failed_source_count,
      finished_at,
      activated_at,
      config_snapshot
    FROM sync_runs
    WHERE id = state.active_sync_run_id
  ) AS run ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      MAX(source.date_com)
        AS source_last_updated
    FROM source_records AS source
    WHERE source.sync_run_id
        = state.active_sync_run_id
      AND CASE
        -- Guard casts behind the digit/length check (no date normalization).
        WHEN source.date_com ~ '^[0-9]{12}([0-9]{2})?$'
          THEN
            SUBSTRING(source.date_com FROM 5 FOR 2)::INTEGER BETWEEN 1 AND 12
            AND SUBSTRING(source.date_com FROM 7 FOR 2)::INTEGER BETWEEN 1 AND
              CASE
                WHEN SUBSTRING(source.date_com FROM 5 FOR 2)::INTEGER
                  IN (1, 3, 5, 7, 8, 10, 12)
                  THEN 31
                WHEN SUBSTRING(source.date_com FROM 5 FOR 2)::INTEGER
                  IN (4, 6, 9, 11)
                  THEN 30
                WHEN SUBSTRING(source.date_com FROM 1 FOR 4)::INTEGER % 400 = 0
                  OR (
                    SUBSTRING(source.date_com FROM 1 FOR 4)::INTEGER % 4 = 0
                    AND SUBSTRING(source.date_com FROM 1 FOR 4)::INTEGER % 100 <> 0
                  )
                  THEN 29
                ELSE 28
              END
            AND SUBSTRING(source.date_com FROM 9 FOR 2)::INTEGER BETWEEN 0 AND 23
            AND SUBSTRING(source.date_com FROM 11 FOR 2)::INTEGER BETWEEN 0 AND 59
            AND CASE
              WHEN LENGTH(source.date_com) = 12 THEN TRUE
              ELSE SUBSTRING(source.date_com FROM 13 FOR 2)::INTEGER BETWEEN 0 AND 59
            END
        ELSE FALSE
      END
  ) AS fresh ON TRUE
  LEFT JOIN kpi_results AS kpi
    ON kpi.sync_run_id
      = state.active_sync_run_id
  LEFT JOIN kpi_definitions AS definition
    ON definition.id = kpi.kpi_definition_id
  LEFT JOIN LATERAL (
    SELECT
      item AS definition,
      COUNT(*) OVER ()::INTEGER
        AS definition_match_count
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(
          run.config_snapshot -> 'definitions'
        ) = 'array'
          THEN run.config_snapshot -> 'definitions'
        ELSE '[]'::JSONB
      END
    ) WITH ORDINALITY
      AS snapshot_item(item, ordinal)
    WHERE item ->> 'id'
      = definition.id::TEXT
    ORDER BY ordinal ASC
    LIMIT 1
  ) AS snapshot
    ON state.active_sync_run_id IS NOT NULL
  WHERE state.singleton_id = 1
  ORDER BY
    definition.sort_order ASC,
    definition.kpi_key ASC,
    kpi.period_code ASC,
    kpi.areacode ASC,
    kpi.hospcode ASC NULLS FIRST
`;

const SYNC_RUN_STATUSES = [
  "running",
  "succeeded",
  "failed",
] as const;

type SyncRunStatus =
  (typeof SYNC_RUN_STATUSES)[number];

const DASHBOARD_PERIOD_CODES = [
  "annual",
  "q1",
  "q2",
  "q3",
  "q4",
] as const;

function asRowObject(
  row: unknown,
): Record<string, unknown> {
  if (
    typeof row !== "object" ||
    row === null ||
    Array.isArray(row)
  ) {
    throw new Error(
      "Database row is not an object",
    );
  }

  return row as Record<string, unknown>;
}

function requireString(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = row[field];

  if (typeof value !== "string") {
    throw new Error(
      `Field ${field} is not a string`,
    );
  }

  return value;
}

function requireDigitCode(
  row: Record<string, unknown>,
  field: string,
  length: number,
): string {
  const value = row[field];

  if (
    typeof value !== "string" ||
    value.length !== length ||
    !/^\d+$/.test(value)
  ) {
    throw new Error(
      `Field ${field} is not a ${length}-digit code`,
    );
  }

  return value;
}

function requireNonblankString(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = row[field];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `Field ${field} is not a nonblank string`,
    );
  }

  return value;
}

function optionalString(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Field ${field} is not a string`,
    );
  }

  return value;
}

function optionalExternalHttpUrl(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = optionalString(
    row,
    field,
  );

  if (
    value === null ||
    value === ""
  ) {
    return value;
  }

  if (
    value.trim() !== value
  ) {
    throw new Error(
      `Field ${field} is not an absolute HTTP(S) URL, empty string, or null`,
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(
      value,
    );
  } catch {
    throw new Error(
      `Field ${field} is not an absolute HTTP(S) URL, empty string, or null`,
    );
  }

  if (
    (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) ||
    parsed.hostname.length === 0
  ) {
    throw new Error(
      `Field ${field} is not an absolute HTTP(S) URL, empty string, or null`,
    );
  }

  return value;
}

function requireInteger(
  row: Record<string, unknown>,
  field: string,
): number {
  const value = row[field];

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    throw new Error(
      `Field ${field} is not an integer`,
    );
  }

  return value;
}

function optionalInteger(
  row: Record<string, unknown>,
  field: string,
): number | null {
  const value = row[field];

  if (value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    throw new Error(
      `Field ${field} is not an integer`,
    );
  }

  return value;
}

function optionalBoundedInteger(
  row: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  const value = optionalInteger(
    row,
    field,
  );

  if (
    value !== null &&
    (
      value < minimum ||
      value > maximum
    )
  ) {
    throw new Error(
      `Field ${field} must be an integer from ${minimum} through ${maximum}`,
    );
  }

  return value;
}

function requireBoolean(
  row: Record<string, unknown>,
  field: string,
): boolean {
  const value = row[field];

  if (typeof value !== "boolean") {
    throw new Error(
      `Field ${field} is not a boolean`,
    );
  }

  return value;
}

function normalizeTarget(
  row: Record<string, unknown>,
  field: string,
): number | null {
  const value = row[field];

  if (value === null) {
    return null;
  }

  const target =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(target) ||
    target < 0 ||
    target > 100
  ) {
    throw new Error(
      `Field ${field} is not a percentage target from 0 through 100`,
    );
  }

  return target;
}

function requirePeriodCode(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = row[field];

  if (
    typeof value === "string" &&
    (DASHBOARD_PERIOD_CODES as readonly string[])
      .includes(value)
  ) {
    return value;
  }

  throw new Error(
    `Field ${field} is not a period code`,
  );
}

function requireDecimalIdentity(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = row[field];

  if (
    typeof value === "string" &&
    value.length > 0 &&
    /^[0-9]+$/.test(value)
  ) {
    return value;
  }

  throw new Error(
    `Field ${field} is not a decimal identity`,
  );
}

function optionalNonblankString(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    return value;
  }

  throw new Error(
    `Field ${field} is not a nonblank string`,
  );
}

function requireFiniteNumber(
  row: Record<string, unknown>,
  field: string,
): number {
  const value = row[field];

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }

    throw new Error(
      `Field ${field} is not a finite number`,
    );
  }

  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }

  throw new Error(
    `Field ${field} is not a finite number`,
  );
}

function isValidSourceMarker(value: string): boolean {
  if (!/^[0-9]{12}([0-9]{2})?$/.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = value.length === 14
    ? Number(value.slice(12, 14))
    : 0;

  const leapYear =
    year % 4 === 0 &&
    (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  const maximumDay = daysInMonth[month - 1];

  return (
    month >= 1 &&
    month <= 12 &&
    maximumDay !== undefined &&
    day >= 1 &&
    day <= maximumDay &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

function requireSourceLastUpdated(
  row: Record<string, unknown>,
): string | null {
  const value = row.source_last_updated;

  if (value === null) {
    return null;
  }

  if (typeof value === "string" && isValidSourceMarker(value)) {
    return value;
  }

  throw new Error(
    "Field source_last_updated is not a valid source marker",
  );
}

function normalizeId(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    if (value.length === 0) {
      throw new Error(
        `Field ${field} is an empty id`,
      );
    }

    return value;
  }

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    return String(value);
  }

  throw new Error(
    `Field ${field} is not a valid id`,
  );
}

function normalizeTimestamp(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = row[field];

  if (value === null) {
    throw new Error(
      `Field ${field} is unexpectedly null`,
    );
  }

  if (!(value instanceof Date)) {
    throw new Error(
      `Field ${field} is not a timestamp`,
    );
  }

  const time = value.getTime();

  if (!Number.isFinite(time)) {
    throw new Error(
      `Field ${field} is not a valid timestamp`,
    );
  }

  return value.toISOString();
}

function normalizeOptionalTimestamp(
  row: Record<string, unknown>,
  field: string,
): string | null {
  if (row[field] === null) {
    return null;
  }

  return normalizeTimestamp(
    row,
    field,
  );
}

interface PublicKpi {
  readonly key: string;
  readonly title: string;
  readonly target: number | null;
  readonly order: number;
  readonly link: string | null;
  readonly categoryCode: string;
  readonly category: string;
  readonly categoryOrder: number;
  readonly subgroup: string | null;
  readonly isQuarterly: boolean;
  readonly targetMonths: number | null;
  readonly effectiveQuarter: number | null;
}

interface PublicSyncRun {
  readonly id: string;
  readonly status: SyncRunStatus;
  readonly fiscalYear: number;
  readonly currentQuarter: number;
  readonly expectedSourceCount: number;
  readonly completedSourceCount: number;
  readonly failedSourceCount: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly activatedAt: string | null;
}

interface PublicSyncStatus {
  readonly activeSyncRunId: string | null;
  readonly latestRun:
    | PublicSyncRun
    | null;
}

interface PublicFacility {
  readonly hospcode: string;
  readonly hospname: string;
  readonly tambonId: string;
}

interface PublicTambon {
  readonly id: string;
  readonly nameTh: string;
}

interface PublicDashboardDataset {
  readonly syncRunId: string;
  readonly fiscalYear: number;
  readonly currentQuarter: number;
  readonly activatedAt: string;
  readonly sourceLastUpdated: string | null;
}

interface PublicDashboardResult {
  readonly kpiKey: string;
  readonly periodCode: string;
  readonly areacode: string;
  readonly hospcode: string | null;
  readonly target: number;
  readonly result: number;
}

interface PublicDashboard {
  readonly dataset: PublicDashboardDataset | null;
  readonly results: readonly PublicDashboardResult[];
}

function normalizeKpi(
  row: unknown,
): PublicKpi {
  const source = asRowObject(row);

  const activeSyncRunId =
    normalizeId(
      source,
      "active_sync_run_id",
    );

  if (
    activeSyncRunId !== null &&
    source.snapshot_definition_match_count !== 1
  ) {
    throw new Error(
      "Active KPI catalog member must have exactly one matching snapshot definition",
    );
  }

  return {
    key: requireNonblankString(
      source,
      "kpi_key",
    ),
    title: requireNonblankString(
      source,
      "title",
    ),
    target: normalizeTarget(
      source,
      "target_value",
    ),
    order: requireInteger(
      source,
      "sort_order",
    ),
    link: optionalExternalHttpUrl(
      source,
      "link",
    ),
    categoryCode: requireNonblankString(
      source,
      "category_code",
    ),
    category: requireNonblankString(
      source,
      "category_name",
    ),
    categoryOrder: requireInteger(
      source,
      "category_order",
    ),
    subgroup: optionalString(
      source,
      "subgroup",
    ),
    isQuarterly: requireBoolean(
      source,
      "is_quarterly",
    ),
    targetMonths: optionalBoundedInteger(
      source,
      "target_months",
      1,
      12,
    ),
    effectiveQuarter: optionalBoundedInteger(
      source,
      "effective_quarter",
      1,
      4,
    ),
  };
}

function normalizeFacility(
  row: unknown,
): PublicFacility {
  const source = asRowObject(row);

  return {
    hospcode: requireDigitCode(
      source,
      "hospcode",
      5,
    ),
    hospname: requireNonblankString(
      source,
      "hospname",
    ),
    tambonId: requireDigitCode(
      source,
      "tambon_id",
      6,
    ),
  };
}

function normalizeTambon(
  row: unknown,
): PublicTambon {
  const source = asRowObject(row);

  return {
    id: requireDigitCode(
      source,
      "id",
      6,
    ),
    nameTh: requireNonblankString(
      source,
      "name_th",
    ),
  };
}

function normalizeSyncRunStatus(
  row: Record<string, unknown>,
  field: string,
): SyncRunStatus {
  const value = row[field];

  if (
    typeof value === "string" &&
    (SYNC_RUN_STATUSES as readonly string[])
      .includes(value)
  ) {
    return value as SyncRunStatus;
  }

  throw new Error(
    `Field ${field} is not a sync run status`,
  );
}

function buildSyncStatus(
  row: unknown,
): PublicSyncStatus {
  const source = asRowObject(row);

  const latestId = normalizeId(
    source,
    "latest_id",
  );

  return {
    activeSyncRunId: normalizeId(
      source,
      "active_sync_run_id",
    ),

    latestRun:
      latestId === null
        ? null
        : {
            id: latestId,
            status: normalizeSyncRunStatus(
              source,
              "latest_status",
            ),
            fiscalYear: requireInteger(
              source,
              "latest_fiscal_year",
            ),
            currentQuarter: requireInteger(
              source,
              "latest_current_quarter",
            ),
            expectedSourceCount:
              requireInteger(
                source,
                "latest_expected_source_count",
              ),
            completedSourceCount:
              requireInteger(
                source,
                "latest_completed_source_count",
              ),
            failedSourceCount:
              requireInteger(
                source,
                "latest_failed_source_count",
              ),
            startedAt: normalizeTimestamp(
              source,
              "latest_started_at",
            ),
            finishedAt: normalizeOptionalTimestamp(
              source,
              "latest_finished_at",
            ),
            activatedAt: normalizeOptionalTimestamp(
              source,
              "latest_activated_at",
            ),
          },
  };
}

function normalizeDashboardResult(
  row: unknown,
  activeFiscalYear: number,
): PublicDashboardResult {
  const source = asRowObject(row);

  if (requireInteger(source, "result_fiscal_year") !== activeFiscalYear) {
    throw new Error("Active KPI result fiscal year disagrees with its sync run");
  }

  if (
    source.snapshot_definition_match_count !== 1
  ) {
    throw new Error(
      "Active dashboard result must have exactly one matching snapshot definition",
    );
  }

  return {
    kpiKey: requireNonblankString(
      source,
      "kpi_key",
    ),
    periodCode: requirePeriodCode(
      source,
      "period_code",
    ),
    areacode: requireNonblankString(
      source,
      "areacode",
    ),
    hospcode: optionalNonblankString(
      source,
      "hospcode",
    ),
    target: requireFiniteNumber(
      source,
      "target",
    ),
    result: requireFiniteNumber(
      source,
      "result",
    ),
  };
}

function validateDashboardRun(
  source: Record<string, unknown>,
): Omit<
  PublicDashboardDataset,
  "sourceLastUpdated"
> {
  const syncRunId = requireDecimalIdentity(
    source,
    "run_id",
  );

  if (source.run_status !== "succeeded") {
    throw new Error(
      "Active sync run is not succeeded",
    );
  }

  const fiscalYear = requireInteger(
    source,
    "fiscal_year",
  );

  const currentQuarter = requireInteger(
    source,
    "current_quarter",
  );

  if (
    currentQuarter < 1 ||
    currentQuarter > 4
  ) {
    throw new Error(
      "Active sync run quarter is out of range",
    );
  }

  const expectedSourceCount = requireInteger(
    source,
    "expected_source_count",
  );

  if (expectedSourceCount <= 0) {
    throw new Error(
      "Active sync run expects no sources",
    );
  }

  const completedSourceCount = requireInteger(
    source,
    "completed_source_count",
  );

  if (completedSourceCount !== expectedSourceCount) {
    throw new Error(
      "Active sync run is incomplete",
    );
  }

  if (
    requireInteger(
      source,
      "failed_source_count",
    ) !== 0
  ) {
    throw new Error(
      "Active sync run has failed sources",
    );
  }

  normalizeTimestamp(
    source,
    "finished_at",
  );

  return {
    syncRunId,
    fiscalYear,
    currentQuarter,
    activatedAt: normalizeTimestamp(
      source,
      "activated_at",
    ),
  };
}

function buildDashboard(
  rows: readonly unknown[],
): PublicDashboard {
  const first = rows[0];

  if (first === undefined) {
    throw new Error(
      "app_state singleton row is missing",
    );
  }

  const source = asRowObject(first);

  if (
    optionalString(
      source,
      "active_sync_run_id",
    ) === null
  ) {
    if (rows.length !== 1) {
      throw new Error(
        "Unexpected dashboard rows without an active dataset",
      );
    }

    return {
      dataset: null,
      results: [],
    };
  }

  const dataset = validateDashboardRun(source);

  if (source.kpi_key === null) {
    throw new Error(
      "Active dataset has no KPI results",
    );
  }

  const definitionByKey =
    new Map<string, string>();

  const results = rows.map((row) => {
    const result =
      normalizeDashboardResult(row, dataset.fiscalYear);
    const definitionId =
      requireDecimalIdentity(
        asRowObject(row),
        "kpi_definition_id",
      );
    const priorDefinitionId =
      definitionByKey.get(result.kpiKey);

    if (
      priorDefinitionId !== undefined &&
      priorDefinitionId !== definitionId
    ) {
      throw new Error(
        "Active dashboard has conflicting KPI machine identities",
      );
    }

    definitionByKey.set(
      result.kpiKey,
      definitionId,
    );

    return result;
  });

  return {
    dataset: {
      ...dataset,
      sourceLastUpdated:
        requireSourceLastUpdated(source),
    },
    results,
  };
}

export function registerReadApiRoutes(
  app: FastifyInstance,
  db: ReadApiDatabase,
): void {
  app.get(
    "/api/v1/kpis",

    async (request, reply) => {
      try {
        const result =
          await db.query(
            KPI_CATALOG_QUERY,
          );

        const first = result.rows[0];
        if (first === undefined) {
          throw new Error("app_state singleton row is missing");
        }
        const activeSyncRunId = normalizeId(
          asRowObject(first), "active_sync_run_id",
        );

        // The LEFT JOIN emits one sentinel row for an empty catalog.
        // This preserves the authoritative run identity even when
        // no public members were selected.
        if (
          asRowObject(first).kpi_key === null &&
          asRowObject(first).snapshot_definition_present === null
        ) {
          if (result.rows.length !== 1) {
            throw new Error("Unexpected catalog rows after empty marker");
          }
          return { activeSyncRunId, kpis: [] };
        }

        const seenActiveKeys = new Set<string>();
        const kpis = result.rows.map((row) => {
          const source = asRowObject(row);
          const rowRunId = normalizeId(source, "active_sync_run_id");
          if (rowRunId !== activeSyncRunId || source.kpi_key === null) {
            throw new Error("Inconsistent catalog active run identity");
          }
          const normalized = normalizeKpi(row);
          if (activeSyncRunId !== null) {
            if (seenActiveKeys.has(normalized.key)) {
              throw new Error("Active catalog has conflicting KPI machine identities");
            }
            seenActiveKeys.add(normalized.key);
          }
          return normalized;
        });

        return { activeSyncRunId, kpis };
      } catch (error) {
        request.log.error(
          error,
          "KPI catalog read failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }
    },
  );

  app.get(
    "/api/v1/facilities",

    async (request, reply) => {
      try {
        const result =
          await db.query(
            FACILITIES_QUERY,
          );

        const facilities =
          result.rows.map(
            (row) =>
              normalizeFacility(
                row,
              ),
          );

        return { facilities };
      } catch (error) {
        request.log.error(
          error,
          "Facility reference read failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }
    },
  );

  app.get(
    "/api/v1/tambons",

    async (request, reply) => {
      try {
        const result =
          await db.query(
            TAMBONS_QUERY,
          );

        const tambons =
          result.rows.map(
            (row) =>
              normalizeTambon(
                row,
              ),
          );

        return { tambons };
      } catch (error) {
        request.log.error(
          error,
          "Tambon reference read failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }
    },
  );

  app.get(
    "/api/v1/sync-status",

    async (request, reply) => {
      let row: unknown;

      try {
        const result =
          await db.query(
            SYNC_STATUS_QUERY,
          );

        row = result.rows[0];
      } catch (error) {
        request.log.error(
          error,
          "Sync status database query failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }

      if (row === undefined) {
        request.log.warn(
          "app_state singleton row is missing",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }

      try {
        return buildSyncStatus(row);
      } catch (error) {
        request.log.error(
          error,
          "Sync status row normalization failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }
    },
  );

  app.get(
    "/api/v1/dashboard",

    async (request, reply) => {
      let rows: readonly unknown[];

      try {
        const result =
          await db.query(
            DASHBOARD_QUERY,
          );

        rows = result.rows;
      } catch (error) {
        request.log.error(
          error,
          "Dashboard database query failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }

      try {
        return buildDashboard(rows);
      } catch (error) {
        request.log.error(
          error,
          "Dashboard read failed",
        );

        reply.code(503);

        return SERVICE_UNAVAILABLE;
      }
    },
  );
}
