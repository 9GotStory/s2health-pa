import type {
  SyncConfigSnapshot,
  SyncKpiDefinition,
} from "./config.js";

const EXPECTED_PHYSICAL_SOURCE_COUNT = 18;
const EXPECTED_PUBLIC_DEFINITION_COUNT = 47;
const EXPECTED_SOURCE_ONLY_COUNT = 5;

export type PeriodCode =
  | "annual"
  | "q1"
  | "q2"
  | "q3"
  | "q4";

export type SourceRow =
  Readonly<Record<string, unknown>>;

export type SourceRowsBySheet =
  Readonly<
    Record<
      string,
      readonly SourceRow[]
    >
  >;

export interface CalculatedKpiResult {
  readonly kpiDefinitionId: string;
  readonly kpiKey: string;
  readonly fiscalYear: number;
  readonly periodCode: PeriodCode;
  readonly areacode: string;
  readonly hospcode: string | null;
  readonly target: number;
  readonly result: number;
}

interface MutableAggregate {
  readonly kpiDefinitionId: string;
  readonly kpiKey: string;
  readonly fiscalYear: number;
  readonly periodCode: PeriodCode;
  readonly areacode: string;
  readonly hospcode: string | null;
  readonly sortOrder: number;
  target: number;
  result: number;
}

export class SyncCalculationError
  extends Error {
  override readonly name: string =
    "SyncCalculationError";
}

function calculationError(
  message: string,
): never {
  throw new SyncCalculationError(
    message,
  );
}

function validateDistrictAreaPrefix(
  districtAreaPrefix: string,
): void {
  if (
    !/^\d{4}$/.test(
      districtAreaPrefix,
    )
  ) {
    calculationError(
      "districtAreaPrefix must be exactly four decimal digits",
    );
  }
}

function validateQuarter(
  value: number,
  context: string,
): 1 | 2 | 3 | 4 {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 4
  ) {
    calculationError(
      `Invalid quarter for ${context}`,
    );
  }

  return value as 1 | 2 | 3 | 4;
}

function finiteNumber(
  value: unknown,
  context: string,
): number {
  const converted = Number(value);

  if (!Number.isFinite(converted)) {
    calculationError(
      `Non-finite numeric value for ${context}`,
    );
  }

  return converted;
}

function addFinite(
  left: number,
  right: number,
  context: string,
): number {
  const total = left + right;

  if (!Number.isFinite(total)) {
    calculationError(
      `Non-finite numeric total for ${context}`,
    );
  }

  return total;
}

function firstTruthy(
  values: readonly unknown[],
): unknown {
  for (const value of values) {
    if (value) {
      return value;
    }
  }

  return 0;
}

function annualSum(
  row: SourceRow,
  prefix: string,
  context: string,
): number {
  let total = 0;

  for (
    let month = 1;
    month <= 12;
    month += 1
  ) {
    const mm =
      String(month).padStart(
        2,
        "0",
      );

    const selected =
      firstTruthy([
        row[`${prefix}${mm}`],
        row[`${prefix}_${mm}`],
      ]);

    total = addFinite(
      total,
      finiteNumber(
        selected,
        `${context} month ${mm}`,
      ),
      context,
    );
  }

  return total;
}

function quarterSum(
  row: SourceRow,
  prefix: string,
  quarter: 1 | 2 | 3 | 4,
  context: string,
): number {
  let total = 0;

  for (
    let index = 1;
    index <= quarter;
    index += 1
  ) {
    const selected =
      firstTruthy([
        row[`${prefix}${index}`],
        row[`${prefix}q${index}`],
        row[
          `${prefix.charAt(0)}_q${index}`
        ],
      ]);

    total = addFinite(
      total,
      finiteNumber(
        selected,
        `${context} quarter ${index}`,
      ),
      context,
    );
  }

  return total;
}

function directNumber(
  row: SourceRow,
  field: string,
  context: string,
): number {
  return finiteNumber(
    firstTruthy([
      row[field],
    ]),
    context,
  );
}

function effectiveQuarter(
  snapshot: SyncConfigSnapshot,
  definition: SyncKpiDefinition,
): 1 | 2 | 3 | 4 {
  return validateQuarter(
    definition.effectiveQuarter ??
      snapshot.currentQuarter,
    definition.kpiKey,
  );
}

function periodCodeForDefinition(
  snapshot: SyncConfigSnapshot,
  definition: SyncKpiDefinition,
): PeriodCode {
  if (!definition.isQuarterly) {
    return "annual";
  }

  const quarter =
    effectiveQuarter(
      snapshot,
      definition,
    );

  return `q${quarter}` as PeriodCode;
}

function calculateRow(
  snapshot: SyncConfigSnapshot,
  definition: SyncKpiDefinition,
  row: SourceRow,
): {
  readonly target: number;
  readonly result: number;
} {
  const context =
    definition.kpiKey;

  if (
    definition.valuePrefix !== null
  ) {
    return {
      target:
        annualSum(
          row,
          "target",
          `${context} target`,
        ),

      result:
        annualSum(
          row,
          definition.valuePrefix,
          `${context} result`,
        ),
    };
  }

  if (
    definition.sourceId !== null
  ) {
    return {
      target:
        directNumber(
          row,
          "target",
          `${context} target`,
        ),

      result:
        directNumber(
          row,
          "result",
          `${context} result`,
        ),
    };
  }

  if (
    definition.kpiKey ===
    "s_dental_0_5_cavity_free"
  ) {
    return {
      target:
        directNumber(
          row,
          "b",
          `${context} target`,
        ),

      result:
        directNumber(
          row,
          "a",
          `${context} result`,
        ),
    };
  }

  if (
    definition.kpiKey ===
    "s_aged9"
  ) {
    return {
      target:
        directNumber(
          row,
          "target",
          `${context} target`,
        ),

      result:
        directNumber(
          row,
          "result",
          `${context} result`,
        ),
    };
  }

  const targetMain =
    directNumber(
      row,
      "target",
      `${context} target`,
    );

  const resultMain =
    directNumber(
      row,
      "result",
      `${context} result`,
    );

  const quarter =
    effectiveQuarter(
      snapshot,
      definition,
    );

  if (
    targetMain > 0 &&
    !definition.isQuarterly
  ) {
    return {
      target:
        targetMain,

      result:
        resultMain > 0
          ? resultMain
          : quarterSum(
              row,
              "result",
              quarter,
              `${context} result`,
            ),
    };
  }

  return {
    target:
      quarterSum(
        row,
        "target",
        quarter,
        `${context} target`,
      ),

    result:
      quarterSum(
        row,
        "result",
        quarter,
        `${context} result`,
      ),
  };
}

function isSourceRow(
  value: unknown,
): value is SourceRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function districtEligible(
  row: SourceRow,
  districtAreaPrefix: string,
): boolean {
  const areacode =
    row.areacode;

  if (
    areacode === undefined ||
    areacode === null ||
    areacode === ""
  ) {
    return false;
  }

  return String(
    areacode,
  ).startsWith(
    districtAreaPrefix,
  );
}

function normalizeHospcode(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function normalizedSourceId(
  value: string,
  kpiKey: string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (normalized.length === 0) {
    calculationError(
      `Blank source_id for ${kpiKey}`,
    );
  }

  return normalized;
}

function compareText(
  left: string,
  right: string,
): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareHospcode(
  left: string | null,
  right: string | null,
): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return compareText(
    left,
    right,
  );
}

function validateSnapshotAndSources(
  snapshot: SyncConfigSnapshot,
  sourceRowsBySheet: SourceRowsBySheet,
  districtAreaPrefix: string,
): ReadonlyMap<
  string,
  readonly SourceRow[]
> {
  validateDistrictAreaPrefix(
    districtAreaPrefix,
  );

  if (
    snapshot.physicalDefinitions.length !==
    EXPECTED_PHYSICAL_SOURCE_COUNT
  ) {
    calculationError(
      `Expected ${EXPECTED_PHYSICAL_SOURCE_COUNT} physical definitions`,
    );
  }

  const sourceOnlyCount =
    snapshot.definitions.filter(
      (definition) =>
        definition.sourceOnly,
    ).length;

  if (
    sourceOnlyCount !==
    EXPECTED_SOURCE_ONLY_COUNT
  ) {
    calculationError(
      `Expected ${EXPECTED_SOURCE_ONLY_COUNT} source-only definitions`,
    );
  }

  const publicDefinitions =
    snapshot.definitions.filter(
      (definition) =>
        !definition.sourceOnly,
    );

  if (
    publicDefinitions.length !==
    EXPECTED_PUBLIC_DEFINITION_COUNT
  ) {
    calculationError(
      `Expected ${EXPECTED_PUBLIC_DEFINITION_COUNT} public KPI definitions`,
    );
  }

  const publicIds =
    new Set(
      publicDefinitions.map(
        (definition) =>
          definition.id,
      ),
    );

  if (
    publicIds.size !==
    EXPECTED_PUBLIC_DEFINITION_COUNT
  ) {
    calculationError(
      "Public KPI definition IDs must be unique",
    );
  }

  if (
    !Number.isInteger(
      snapshot.fiscalYear,
    )
  ) {
    calculationError(
      "fiscalYear must be an integer",
    );
  }

  validateQuarter(
    snapshot.currentQuarter,
    "snapshot.currentQuarter",
  );

  const physicalSourceSheets =
    snapshot.physicalDefinitions.map(
      (definition) =>
        definition.sourceSheet,
    );

  const physicalSourceSet =
    new Set(
      physicalSourceSheets,
    );

  if (
    physicalSourceSet.size !==
    EXPECTED_PHYSICAL_SOURCE_COUNT
  ) {
    calculationError(
      "Physical source_sheet values must be unique",
    );
  }

  for (
    const definition of
    publicDefinitions
  ) {
    if (
      !physicalSourceSet.has(
        definition.sourceSheet,
      )
    ) {
      calculationError(
        `Unknown source_sheet for ${definition.kpiKey}`,
      );
    }
  }

  const actualSourceKeys =
    Object.keys(
      sourceRowsBySheet,
    );

  const missing =
    physicalSourceSheets.filter(
      (sourceSheet) =>
        !Object.prototype.hasOwnProperty.call(
          sourceRowsBySheet,
          sourceSheet,
        ),
    );

  const extra =
    actualSourceKeys.filter(
      (sourceSheet) =>
        !physicalSourceSet.has(
          sourceSheet,
        ),
    );

  if (
    missing.length > 0 ||
    extra.length > 0
  ) {
    calculationError(
      `Physical source set mismatch; missing=[${missing.join(",")}], extra=[${extra.join(",")}]`,
    );
  }

  const eligible =
    new Map<
      string,
      readonly SourceRow[]
    >();

  for (
    const sourceSheet of
    physicalSourceSheets
  ) {
    const rows =
      sourceRowsBySheet[
        sourceSheet
      ];

    if (
      rows === undefined ||
      !Array.isArray(rows)
    ) {
      calculationError(
        `Invalid rows for physical source ${sourceSheet}`,
      );
    }

    for (const row of rows) {
      if (!isSourceRow(row)) {
        calculationError(
          `Invalid source row for ${sourceSheet}`,
        );
      }
    }

    const districtRows =
      rows.filter(
        (row) =>
          districtEligible(
            row,
            districtAreaPrefix,
          ),
      );

    if (
      districtRows.length === 0
    ) {
      calculationError(
        `No eligible district rows for ${sourceSheet}`,
      );
    }

    eligible.set(
      sourceSheet,
      Object.freeze([
        ...districtRows,
      ]),
    );
  }

  return eligible;
}

export function calculateKpiResults(
  snapshot: SyncConfigSnapshot,
  sourceRowsBySheet: SourceRowsBySheet,
  districtAreaPrefix: string,
): readonly CalculatedKpiResult[] {
  const eligibleRowsBySheet =
    validateSnapshotAndSources(
      snapshot,
      sourceRowsBySheet,
      districtAreaPrefix,
    );

  const publicDefinitions =
    snapshot.definitions
      .filter(
        (definition) =>
          !definition.sourceOnly,
      )
      .slice()
      .sort(
        (left, right) =>
          left.sortOrder -
            right.sortOrder ||
          compareText(
            left.kpiKey,
            right.kpiKey,
          ),
      );

  const aggregates =
    new Map<
      string,
      MutableAggregate
    >();

  const coveredDefinitions =
    new Set<string>();

  for (
    const definition of
    publicDefinitions
  ) {
    const districtRows =
      eligibleRowsBySheet.get(
        definition.sourceSheet,
      );

    if (
      districtRows === undefined
    ) {
      calculationError(
        `Missing eligible source rows for ${definition.kpiKey}`,
      );
    }

    let calculationRows =
      districtRows;

    if (
      definition.sourceId !== null
    ) {
      const sourceId =
        normalizedSourceId(
          definition.sourceId,
          definition.kpiKey,
        );

      calculationRows =
        districtRows.filter(
          (row) =>
            String(
              row.id || "",
            )
              .trim()
              .toLowerCase() ===
            sourceId,
        );

      if (
        calculationRows.length === 0
      ) {
        calculationError(
          `No source_id rows for ${definition.kpiKey}`,
        );
      }
    }

    if (
      calculationRows.length === 0
    ) {
      calculationError(
        `No calculation rows for ${definition.kpiKey}`,
      );
    }

    const periodCode =
      periodCodeForDefinition(
        snapshot,
        definition,
      );

    let emitted = 0;

    for (const row of calculationRows) {
      const areacodeValue =
        row.areacode;

      if (
        areacodeValue === undefined ||
        areacodeValue === null ||
        areacodeValue === ""
      ) {
        calculationError(
          `Eligible row lost areacode for ${definition.kpiKey}`,
        );
      }

      const areacode =
        String(
          areacodeValue,
        );

      const hospcode =
        normalizeHospcode(
          row.hospcode,
        );

      const values =
        calculateRow(
          snapshot,
          definition,
          row,
        );

      const aggregateKey =
        JSON.stringify([
          definition.id,
          snapshot.fiscalYear,
          periodCode,
          areacode,
          hospcode,
        ]);

      const existing =
        aggregates.get(
          aggregateKey,
        );

      if (existing === undefined) {
        aggregates.set(
          aggregateKey,
          {
            kpiDefinitionId:
              definition.id,

            kpiKey:
              definition.kpiKey,

            fiscalYear:
              snapshot.fiscalYear,

            periodCode,
            areacode,
            hospcode,

            sortOrder:
              definition.sortOrder,

            target:
              values.target,

            result:
              values.result,
          },
        );
      } else {
        existing.target =
          addFinite(
            existing.target,
            values.target,
            `${definition.kpiKey} target aggregate`,
          );

        existing.result =
          addFinite(
            existing.result,
            values.result,
            `${definition.kpiKey} result aggregate`,
          );
      }

      emitted += 1;
    }

    if (emitted === 0) {
      calculationError(
        `No result rows for ${definition.kpiKey}`,
      );
    }

    coveredDefinitions.add(
      definition.id,
    );
  }

  if (
    coveredDefinitions.size !==
    EXPECTED_PUBLIC_DEFINITION_COUNT
  ) {
    calculationError(
      `Expected results for ${EXPECTED_PUBLIC_DEFINITION_COUNT} public KPI definitions`,
    );
  }

  const ordered =
    [...aggregates.values()]
      .sort(
        (left, right) =>
          left.sortOrder -
            right.sortOrder ||
          compareText(
            left.kpiKey,
            right.kpiKey,
          ) ||
          compareText(
            left.periodCode,
            right.periodCode,
          ) ||
          compareText(
            left.areacode,
            right.areacode,
          ) ||
          compareHospcode(
            left.hospcode,
            right.hospcode,
          ),
      )
      .map(
        (
          aggregate,
        ): CalculatedKpiResult =>
          Object.freeze({
            kpiDefinitionId:
              aggregate.kpiDefinitionId,

            kpiKey:
              aggregate.kpiKey,

            fiscalYear:
              aggregate.fiscalYear,

            periodCode:
              aggregate.periodCode,

            areacode:
              aggregate.areacode,

            hospcode:
              aggregate.hospcode,

            target:
              aggregate.target,

            result:
              aggregate.result,
          }),
      );

  return Object.freeze(
    ordered,
  );
}
