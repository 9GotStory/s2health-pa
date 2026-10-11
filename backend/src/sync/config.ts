import type {
  PoolClient,
  QueryResultRow,
} from "pg";

const REQUIRED_SETTINGS = [
  "current_year",
  "province_code",
  "current_quarter",
] as const;

const EXPECTED_DEFINITION_COUNT = 52;
const EXPECTED_PHYSICAL_COUNT = 18;
const EXPECTED_VIRTUAL_COUNT = 34;
const EXPECTED_SOURCE_ONLY_COUNT = 5;

type Queryable =
  Pick<
    PoolClient,
    "query"
  >;

export type KpiKind =
  | "physical"
  | "virtual";

export interface SyncKpiDefinition {
  readonly id: string;
  readonly kpiKey: string;
  readonly kind: KpiKind;
  readonly sourceSheet: string;
  readonly sourceId: string | null;
  readonly valuePrefix: string | null;
  readonly targetValue: number | null;
  readonly isQuarterly: boolean;
  readonly targetMonths: number | null;
  readonly effectiveQuarter: number | null;
  readonly sortOrder: number;
  readonly metadata:
    Readonly<Record<string, unknown>>;
  readonly sourceOnly: boolean;
  readonly sourceLimit: number | null;
}

export interface SyncConfigSnapshot {
  readonly currentYear: string;
  readonly fiscalYear: number;
  readonly provinceCode: string;
  readonly currentQuarter: number;

  readonly definitions:
    readonly SyncKpiDefinition[];

  readonly physicalDefinitions:
    readonly SyncKpiDefinition[];

  readonly virtualDefinitions:
    readonly SyncKpiDefinition[];

  readonly sourceOnlyDefinitions:
    readonly SyncKpiDefinition[];
}

interface SettingRow
  extends QueryResultRow {
  readonly key: string;
  readonly value: unknown;
}

interface DefinitionRow
  extends QueryResultRow {
  readonly id: string;
  readonly kpi_key: string;
  readonly kind: string;
  readonly source_sheet: string;
  readonly source_id: string | null;
  readonly value_prefix: string | null;
  readonly target_value: string | null;
  readonly is_quarterly: boolean;
  readonly target_months: number | null;
  readonly effective_quarter: number | null;
  readonly sort_order: number;
  readonly metadata: unknown;
}

export class SyncConfigError
  extends Error {
  override readonly name: string =
    "SyncConfigError";
}

function configError(
  message: string,
): never {
  throw new SyncConfigError(message);
}

function validateCurrentYear(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}$/.test(value)
  ) {
    return configError(
      "app_settings.current_year must be a four-digit string",
    );
  }

  return value;
}

function validateProvinceCode(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{2}$/.test(value)
  ) {
    return configError(
      "app_settings.province_code must be a two-digit string",
    );
  }

  return value;
}

function validateCurrentQuarter(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 4
  ) {
    return configError(
      "app_settings.current_quarter must be an integer from 1 through 4",
    );
  }

  return value;
}

function validateKind(
  value: string,
  kpiKey: string,
): KpiKind {
  if (
    value !== "physical" &&
    value !== "virtual"
  ) {
    return configError(
      `Invalid KPI kind for ${kpiKey}`,
    );
  }

  return value;
}

function validateOptionalSmallInt(
  value: number | null,
  minimum: number,
  maximum: number,
  field: string,
  kpiKey: string,
): number | null {
  if (value === null) {
    return null;
  }

  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return configError(
      `Invalid ${field} for ${kpiKey}`,
    );
  }

  return value;
}

function validateTargetValue(
  value: string | null,
  kpiKey: string,
): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > 100
  ) {
    return configError(
      `Invalid percentage target_value for ${kpiKey}: expected 0 through 100`,
    );
  }

  return parsed;
}

function validateMetadata(
  value: unknown,
  kpiKey: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return configError(
      `Invalid metadata for ${kpiKey}`,
    );
  }

  return Object.freeze({
    ...value,
  });
}

function readSourceLimit(
  metadata: Readonly<Record<string, unknown>>,
  kpiKey: string,
): number | null {
  const value = metadata.limit;

  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    return configError(
      `Invalid metadata.limit for ${kpiKey}`,
    );
  }

  return value;
}

function createDefinition(
  row: DefinitionRow,
): SyncKpiDefinition {
  if (
    row.kpi_key.trim().length === 0 ||
    row.source_sheet.trim().length === 0
  ) {
    return configError(
      "KPI key/source_sheet must not be blank",
    );
  }

  const metadata =
    validateMetadata(
      row.metadata,
      row.kpi_key,
    );

  const kind =
    validateKind(
      row.kind,
      row.kpi_key,
    );

  const sourceOnly =
    metadata.source_only === true;

  if (
    sourceOnly &&
    kind !== "physical"
  ) {
    return configError(
      `source_only KPI must be physical: ${row.kpi_key}`,
    );
  }

  return Object.freeze({
    id: row.id,
    kpiKey: row.kpi_key,
    kind,
    sourceSheet: row.source_sheet,
    sourceId: row.source_id,
    valuePrefix: row.value_prefix,

    targetValue:
      validateTargetValue(
        row.target_value,
        row.kpi_key,
      ),

    isQuarterly:
      row.is_quarterly,

    targetMonths:
      validateOptionalSmallInt(
        row.target_months,
        1,
        12,
        "target_months",
        row.kpi_key,
      ),

    effectiveQuarter:
      validateOptionalSmallInt(
        row.effective_quarter,
        1,
        4,
        "effective_quarter",
        row.kpi_key,
      ),

    sortOrder: row.sort_order,
    metadata,
    sourceOnly,

    sourceLimit:
      readSourceLimit(
        metadata,
        row.kpi_key,
      ),
  });
}

async function loadSettings(
  db: Queryable,
): Promise<{
  readonly currentYear: string;
  readonly provinceCode: string;
  readonly currentQuarter: number;
}> {
  const result =
    await db.query<SettingRow>(
      `
        SELECT
          key,
          value
        FROM app_settings
        WHERE key = ANY($1::TEXT[])
        ORDER BY key
      `,
      [
        [...REQUIRED_SETTINGS],
      ],
    );

  if (
    result.rows.length !==
    REQUIRED_SETTINGS.length
  ) {
    return configError(
      "Required synchronization app_settings are missing",
    );
  }

  const settings =
    new Map<string, unknown>();

  for (const row of result.rows) {
    settings.set(
      row.key,
      row.value,
    );
  }

  for (const key of REQUIRED_SETTINGS) {
    if (!settings.has(key)) {
      return configError(
        `Required app_setting is missing: ${key}`,
      );
    }
  }

  return Object.freeze({
    currentYear:
      validateCurrentYear(
        settings.get(
          "current_year",
        ),
      ),

    provinceCode:
      validateProvinceCode(
        settings.get(
          "province_code",
        ),
      ),

    currentQuarter:
      validateCurrentQuarter(
        settings.get(
          "current_quarter",
        ),
      ),
  });
}

async function loadDefinitions(
  db: Queryable,
): Promise<
  readonly SyncKpiDefinition[]
> {
  const result =
    await db.query<DefinitionRow>(`
      SELECT
        id::TEXT AS id,
        kpi_key,
        kind,
        source_sheet,
        source_id,
        value_prefix,
        target_value::TEXT AS target_value,
        is_quarterly,
        target_months,
        effective_quarter,
        sort_order,
        metadata
      FROM kpi_definitions
      WHERE is_active = TRUE
      ORDER BY
        sort_order,
        kpi_key
    `);

  const definitions =
    result.rows.map(
      createDefinition,
    );

  if (
    definitions.length !==
    EXPECTED_DEFINITION_COUNT
  ) {
    return configError(
      `Expected ${EXPECTED_DEFINITION_COUNT} active KPI definitions`,
    );
  }

  return Object.freeze(definitions);
}

export async function loadSyncConfigSnapshot(
  db: Queryable,
): Promise<SyncConfigSnapshot> {
  const settings =
    await loadSettings(db);

  const definitions =
    await loadDefinitions(db);

  const physicalDefinitions =
    definitions.filter(
      (definition) =>
        definition.kind ===
        "physical",
    );

  const virtualDefinitions =
    definitions.filter(
      (definition) =>
        definition.kind ===
        "virtual",
    );

  const sourceOnlyDefinitions =
    physicalDefinitions.filter(
      (definition) =>
        definition.sourceOnly,
    );

  if (
    physicalDefinitions.length !==
    EXPECTED_PHYSICAL_COUNT
  ) {
    return configError(
      `Expected ${EXPECTED_PHYSICAL_COUNT} physical KPI definitions`,
    );
  }

  if (
    virtualDefinitions.length !==
    EXPECTED_VIRTUAL_COUNT
  ) {
    return configError(
      `Expected ${EXPECTED_VIRTUAL_COUNT} virtual KPI definitions`,
    );
  }

  if (
    sourceOnlyDefinitions.length !==
    EXPECTED_SOURCE_ONLY_COUNT
  ) {
    return configError(
      `Expected ${EXPECTED_SOURCE_ONLY_COUNT} source-only KPI definitions`,
    );
  }

  return Object.freeze({
    currentYear:
      settings.currentYear,

    fiscalYear:
      Number(
        settings.currentYear,
      ),

    provinceCode:
      settings.provinceCode,

    currentQuarter:
      settings.currentQuarter,

    definitions,

    physicalDefinitions:
      Object.freeze(
        physicalDefinitions,
      ),

    virtualDefinitions:
      Object.freeze(
        virtualDefinitions,
      ),

    sourceOnlyDefinitions:
      Object.freeze(
        sourceOnlyDefinitions,
      ),
  });
}
