import assert from "node:assert/strict";
import test from "node:test";

import type {
  SyncConfigSnapshot,
  SyncKpiDefinition,
} from "../src/sync/config.js";

import {
  calculateKpiResults,
  SyncCalculationError,
  type CalculatedKpiResult,
  type SourceRow,
  type SourceRowsBySheet,
} from "../src/sync/calculation.js";


function requireDefined<T>(
  value: T | undefined,
  context: string,
): T {
  if (value === undefined) {
    throw new Error(
      `Missing test fixture: ${context}`,
    );
  }

  return value;
}

const PHYSICAL_SHEETS =
  Array.from(
    { length: 18 },
    (_unused, index) =>
      `source_${String(index + 1).padStart(2, "0")}`,
  );

function createDefinition(
  input: {
    readonly id: string;
    readonly kpiKey: string;
    readonly kind: "physical" | "virtual";
    readonly sourceSheet: string;
    readonly sortOrder: number;
    readonly sourceOnly?: boolean;
    readonly sourceId?: string | null;
    readonly valuePrefix?: string | null;
    readonly isQuarterly?: boolean;
    readonly targetMonths?: number | null;
    readonly effectiveQuarter?: number | null;
  },
): SyncKpiDefinition {
  const sourceOnly =
    input.sourceOnly ?? false;

  return Object.freeze({
    id: input.id,
    kpiKey: input.kpiKey,
    kind: input.kind,
    sourceSheet: input.sourceSheet,
    sourceId: input.sourceId ?? null,
    valuePrefix: input.valuePrefix ?? null,
    targetValue: null,
    isQuarterly: input.isQuarterly ?? false,
    targetMonths: input.targetMonths ?? null,
    effectiveQuarter: input.effectiveQuarter ?? null,
    sortOrder: input.sortOrder,
    metadata: Object.freeze(
      sourceOnly
        ? { source_only: true }
        : {},
    ),
    sourceOnly,
    sourceLimit: null,
  });
}

function makeSnapshot(
  currentQuarter = 4,
): SyncConfigSnapshot {
  const physical =
    PHYSICAL_SHEETS.map(
      (sourceSheet, index) =>
        createDefinition({
          id: `p${index + 1}`,
          kpiKey:
            `physical_${String(index + 1).padStart(2, "0")}`,
          kind: "physical",
          sourceSheet,
          sortOrder: index + 1,
          sourceOnly: index >= 13,
        }),
    );

  const virtual =
    Array.from(
      { length: 34 },
      (_unused, index) => {
        const sourceSheet =
          requireDefined(
            PHYSICAL_SHEETS[
              13 + (index % 5)
            ],
            "virtual source sheet",
          );

        return createDefinition({
          id: `v${index + 1}`,
          kpiKey:
            `virtual_${String(index + 1).padStart(2, "0")}`,
          kind: "virtual",
          sourceSheet,
          sortOrder: 100 + index,
          valuePrefix:
            `dose${String(index + 1).padStart(2, "0")}_`,
        });
      },
    );

  const definitions =
    Object.freeze([
      ...physical,
      ...virtual,
    ]);

  const sourceOnlyDefinitions =
    physical.filter(
      (definition) =>
        definition.sourceOnly,
    );

  return Object.freeze({
    currentYear: "2569",
    fiscalYear: 2569,
    provinceCode: "54",
    currentQuarter,
    definitions,
    physicalDefinitions:
      Object.freeze(physical),
    virtualDefinitions:
      Object.freeze(virtual),
    sourceOnlyDefinitions:
      Object.freeze(
        sourceOnlyDefinitions,
      ),
  });
}

function patchDefinition(
  snapshot: SyncConfigSnapshot,
  kpiKey: string,
  patch: Partial<SyncKpiDefinition>,
): SyncConfigSnapshot {
  let replaced = false;

  const definitions =
    snapshot.definitions.map(
      (definition) => {
        if (
          definition.kpiKey !==
          kpiKey
        ) {
          return definition;
        }

        replaced = true;

        return Object.freeze({
          ...definition,
          ...patch,
        });
      },
    );

  assert.equal(
    replaced,
    true,
  );

  const physical =
    definitions.filter(
      (definition) =>
        definition.kind ===
        "physical",
    );

  const virtual =
    definitions.filter(
      (definition) =>
        definition.kind ===
        "virtual",
    );

  const sourceOnly =
    physical.filter(
      (definition) =>
        definition.sourceOnly,
    );

  return Object.freeze({
    ...snapshot,
    definitions:
      Object.freeze(definitions),
    physicalDefinitions:
      Object.freeze(physical),
    virtualDefinitions:
      Object.freeze(virtual),
    sourceOnlyDefinitions:
      Object.freeze(sourceOnly),
  });
}

function makeSources(
  snapshot: SyncConfigSnapshot,
  districtAreaPrefix = "5406",
): SourceRowsBySheet {
  const mutable:
    Record<
      string,
      Record<string, unknown>[]
    > = {};

  snapshot.physicalDefinitions.forEach(
    (definition, index) => {
      mutable[
        definition.sourceSheet
      ] = [
        {
          areacode:
            `${districtAreaPrefix}${String(index + 1).padStart(2, "0")}`,
          hospcode:
            `H${String(index + 1).padStart(2, "0")}`,
          target: 10,
          result: 5,
          target01: 1,
        },
      ];
    },
  );

  for (
    const definition of
    snapshot.virtualDefinitions
  ) {
    if (
      definition.valuePrefix === null
    ) {
      continue;
    }

    const rows =
      requireDefined(
        mutable[
          definition.sourceSheet
        ],
        definition.sourceSheet,
      );

    const row =
      requireDefined(
        rows[0],
        definition.sourceSheet,
      );

    row[
      `${definition.valuePrefix}01`
    ] = 2;
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(
        mutable,
      ).map(
        ([sourceSheet, rows]) => [
          sourceSheet,
          Object.freeze(
            rows.map(
              (row) =>
                Object.freeze({
                  ...row,
                }),
            ),
          ),
        ],
      ),
    ),
  ) as SourceRowsBySheet;
}

function replaceRows(
  sources: SourceRowsBySheet,
  sourceSheet: string,
  rows: readonly SourceRow[],
): SourceRowsBySheet {
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      sources,
      sourceSheet,
    ),
  );

  return Object.freeze({
    ...sources,
    [sourceSheet]:
      Object.freeze(
        rows.map(
          (row) =>
            Object.freeze({
              ...row,
            }),
        ),
      ),
  });
}

function patchFirstRow(
  sources: SourceRowsBySheet,
  sourceSheet: string,
  patch: Readonly<Record<string, unknown>>,
): SourceRowsBySheet {
  const rows =
    requireDefined(
      sources[sourceSheet],
      sourceSheet,
    );

  const first =
    requireDefined(
      rows[0],
      sourceSheet,
    );

  return replaceRows(
    sources,
    sourceSheet,
    [
      {
        ...first,
        ...patch,
      },
      ...rows.slice(1),
    ],
  );
}

function onlyResult(
  results: readonly CalculatedKpiResult[],
  kpiKey: string,
): CalculatedKpiResult {
  const matches =
    results.filter(
      (result) =>
        result.kpiKey ===
        kpiKey,
    );

  assert.equal(
    matches.length,
    1,
  );

  return requireDefined(
    matches[0],
    kpiKey,
  );
}

function expectCalculationError(
  action: () => unknown,
): void {
  assert.throws(
    action,
    (
      error: unknown,
    ) =>
      error instanceof
      SyncCalculationError,
  );
}

test(
  "calculator accepts an explicit non-production district prefix and emits exactly 47 immutable public definitions",
  () => {
    const snapshot =
      makeSnapshot();

    const sources =
      makeSources(
        snapshot,
        "9999",
      );

    const results =
      calculateKpiResults(
        snapshot,
        sources,
        "9999",
      );

    assert.equal(
      results.length,
      47,
    );

    assert.equal(
      new Set(
        results.map(
          (result) =>
            result.kpiDefinitionId,
        ),
      ).size,
      47,
    );

    for (
      const definition of
      snapshot.sourceOnlyDefinitions
    ) {
      assert.equal(
        results.some(
          (result) =>
            result.kpiDefinitionId ===
            definition.id,
        ),
        false,
      );
    }

    assert.equal(
      Object.isFrozen(results),
      true,
    );

    assert.equal(
      Object.isFrozen(
        results[0],
      ),
      true,
    );
  },
);

test(
  "district filtering excludes outside-prefix and missing-areacode rows before math",
  () => {
    const snapshot =
      makeSnapshot();

    let sources =
      makeSources(snapshot);

    const base =
      requireDefined(
        sources.source_01?.[0],
        "source_01",
      );

    sources = replaceRows(
      sources,
      "source_01",
      [
        base,
        {
          ...base,
          areacode: "549901",
          target: 1000,
          result: 1000,
        },
        {
          hospcode: "MISSING",
          target: 1000,
          result: 1000,
        },
      ],
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "physical_01",
      );

    assert.equal(
      result.target,
      10,
    );

    assert.equal(
      result.result,
      5,
    );
  },
);

test(
  "annual value-prefix calculation preserves primary/fallback precedence through month 12",
  () => {
    let snapshot =
      makeSnapshot();

    snapshot =
      patchDefinition(
        snapshot,
        "virtual_01",
        {
          valuePrefix: "dose",
        },
      );

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_14",
      {
        target01: 1,
        target_01: 100,
        target02: 2,
        target_02: 200,
        target12: 3,
        dose01: 4,
        dose_01: 400,
        dose_02: 5,
        dose12: 6,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "virtual_01",
      );

    assert.equal(
      result.target,
      6,
    );

    assert.equal(
      result.result,
      15,
    );

    assert.equal(
      result.periodCode,
      "annual",
    );
  },
);

test(
  "quarter calculation supports all three naming families with precedence and current-quarter fallback",
  () => {
    let snapshot =
      makeSnapshot(3);

    snapshot =
      patchDefinition(
        snapshot,
        "physical_01",
        {
          isQuarterly: true,
          effectiveQuarter: null,
        },
      );

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        target1: 1,
        targetq1: 100,
        t_q1: 1000,
        targetq2: 2,
        t_q3: 3,
        result1: 4,
        resultq1: 400,
        r_q1: 4000,
        resultq2: 5,
        r_q3: 6,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "physical_01",
      );

    assert.equal(
      result.target,
      6,
    );

    assert.equal(
      result.result,
      15,
    );

    assert.equal(
      result.periodCode,
      "q3",
    );
  },
);

test(
  "effectiveQuarter overrides currentQuarter for math and period code",
  () => {
    let snapshot =
      makeSnapshot(4);

    snapshot =
      patchDefinition(
        snapshot,
        "physical_01",
        {
          isQuarterly: true,
          effectiveQuarter: 2,
        },
      );

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        target1: 1,
        target2: 2,
        target3: 100,
        result1: 3,
        result2: 4,
        result3: 100,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "physical_01",
      );

    assert.equal(
      result.target,
      3,
    );

    assert.equal(
      result.result,
      7,
    );

    assert.equal(
      result.periodCode,
      "q2",
    );
  },
);

test(
  "sourceId filtering is trimmed case-normalized exact and occurs before direct calculation",
  () => {
    let snapshot =
      makeSnapshot();

    snapshot =
      patchDefinition(
        snapshot,
        "virtual_01",
        {
          valuePrefix: null,
          sourceId: " AbC ",
        },
      );

    let sources =
      makeSources(snapshot);

    const base =
      requireDefined(
        sources.source_14?.[0],
        "source_14",
      );

    sources = replaceRows(
      sources,
      "source_14",
      [
        {
          ...base,
          id: "  aBc  ",
          target: 7,
          result: 8,
        },
        {
          ...base,
          id: "other",
          target: 100,
          result: 100,
          hospcode: "OTHER",
        },
      ],
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "virtual_01",
      );

    assert.equal(
      result.target,
      7,
    );

    assert.equal(
      result.result,
      8,
    );
  },
);

test(
  "sourceId definition with zero matching rows fails closed",
  () => {
    let snapshot =
      makeSnapshot();

    snapshot =
      patchDefinition(
        snapshot,
        "virtual_01",
        {
          valuePrefix: null,
          sourceId: "wanted",
        },
      );

    let sources =
      makeSources(snapshot);

    const base =
      requireDefined(
        sources.source_14?.[0],
        "source_14",
      );

    sources = replaceRows(
      sources,
      "source_14",
      [
        {
          ...base,
          id: "other",
        },
      ],
    );

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
    );
  },
);

test(
  "dental special branch maps B to target and A to result",
  () => {
    let snapshot =
      makeSnapshot();

    snapshot =
      patchDefinition(
        snapshot,
        "physical_01",
        {
          kpiKey:
            "s_dental_0_5_cavity_free",
        },
      );

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        a: 7,
        b: 11,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "s_dental_0_5_cavity_free",
      );

    assert.equal(
      result.target,
      11,
    );

    assert.equal(
      result.result,
      7,
    );
  },
);

test(
  "aged9 special branch reads direct annual target/result",
  () => {
    let snapshot =
      makeSnapshot();

    snapshot =
      patchDefinition(
        snapshot,
        "physical_01",
        {
          kpiKey: "s_aged9",
        },
      );

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        target: 21,
        result: 13,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "s_aged9",
      );

    assert.equal(
      result.target,
      21,
    );

    assert.equal(
      result.result,
      13,
    );

    assert.equal(
      result.periodCode,
      "annual",
    );
  },
);

test(
  "standard annual KPI uses annual result when both annual target and result are positive",
  () => {
    const snapshot =
      makeSnapshot();

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          makeSources(snapshot),
          "5406",
        ),
        "physical_01",
      );

    assert.equal(
      result.target,
      10,
    );

    assert.equal(
      result.result,
      5,
    );

    assert.equal(
      result.periodCode,
      "annual",
    );
  },
);

test(
  "standard annual KPI falls back to quarter result while remaining annual period",
  () => {
    const snapshot =
      makeSnapshot(3);

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        target: 10,
        result: 0,
        result1: 1,
        result2: 2,
        result3: 3,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "physical_01",
      );

    assert.equal(
      result.target,
      10,
    );

    assert.equal(
      result.result,
      6,
    );

    assert.equal(
      result.periodCode,
      "annual",
    );
  },
);

test(
  "forced quarterly KPI sums quarter families instead of annual fields",
  () => {
    let snapshot =
      makeSnapshot(2);

    snapshot =
      patchDefinition(
        snapshot,
        "physical_01",
        {
          isQuarterly: true,
        },
      );

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        target: 999,
        result: 999,
        target1: 2,
        target2: 3,
        result1: 4,
        result2: 5,
      },
    );

    const result =
      onlyResult(
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
        "physical_01",
      );

    assert.equal(
      result.target,
      5,
    );

    assert.equal(
      result.result,
      9,
    );

    assert.equal(
      result.periodCode,
      "q2",
    );
  },
);

test(
  "targetMonths does not affect calculation or period selection",
  () => {
    let first =
      patchDefinition(
        makeSnapshot(3),
        "physical_01",
        {
          isQuarterly: true,
          targetMonths: 1,
        },
      );

    let second =
      patchDefinition(
        makeSnapshot(3),
        "physical_01",
        {
          isQuarterly: true,
          targetMonths: 12,
        },
      );

    let firstSources =
      makeSources(first);

    let secondSources =
      makeSources(second);

    const quarterFields = {
      target1: 1,
      target2: 2,
      target3: 3,
      result1: 4,
      result2: 5,
      result3: 6,
    };

    firstSources =
      patchFirstRow(
        firstSources,
        "source_01",
        quarterFields,
      );

    secondSources =
      patchFirstRow(
        secondSources,
        "source_01",
        quarterFields,
      );

    const firstResult =
      onlyResult(
        calculateKpiResults(
          first,
          firstSources,
          "5406",
        ),
        "physical_01",
      );

    const secondResult =
      onlyResult(
        calculateKpiResults(
          second,
          secondSources,
          "5406",
        ),
        "physical_01",
      );

    assert.deepEqual(
      firstResult,
      secondResult,
    );
  },
);

test(
  "grouping sums identical logical identity while keeping different facility and area separate",
  () => {
    const snapshot =
      makeSnapshot();

    let sources =
      makeSources(snapshot);

    const base =
      requireDefined(
        sources.source_01?.[0],
        "source_01",
      );

    sources = replaceRows(
      sources,
      "source_01",
      [
        {
          ...base,
          areacode: "540601",
          hospcode: "A",
          target: 10,
          result: 5,
        },
        {
          ...base,
          areacode: "540601",
          hospcode: "A",
          target: 2,
          result: 3,
        },
        {
          ...base,
          areacode: "540601",
          hospcode: "B",
          target: 4,
          result: 1,
        },
        {
          ...base,
          areacode: "540602",
          hospcode: "A",
          target: 6,
          result: 2,
        },
      ],
    );

    const results =
      calculateKpiResults(
        snapshot,
        sources,
        "5406",
      ).filter(
        (result) =>
          result.kpiKey ===
          "physical_01",
      );

    assert.deepEqual(
      results.map(
        (result) => ({
          areacode:
            result.areacode,
          hospcode:
            result.hospcode,
          target:
            result.target,
          result:
            result.result,
        }),
      ),
      [
        {
          areacode: "540601",
          hospcode: "A",
          target: 12,
          result: 8,
        },
        {
          areacode: "540601",
          hospcode: "B",
          target: 4,
          result: 1,
        },
        {
          areacode: "540602",
          hospcode: "A",
          target: 6,
          result: 2,
        },
      ],
    );
  },
);

test(
  "result ordering is deterministic with null hospcode before non-null values",
  () => {
    const snapshot =
      makeSnapshot();

    let sources =
      makeSources(snapshot);

    const base =
      requireDefined(
        sources.source_01?.[0],
        "source_01",
      );

    sources = replaceRows(
      sources,
      "source_01",
      [
        {
          ...base,
          areacode: "540601",
          hospcode: "B",
        },
        {
          ...base,
          areacode: "540601",
          hospcode: "",
        },
        {
          ...base,
          areacode: "540601",
          hospcode: "A",
        },
      ],
    );

    const results =
      calculateKpiResults(
        snapshot,
        sources,
        "5406",
      );

    const physical =
      results.filter(
        (result) =>
          result.kpiKey ===
          "physical_01",
      );

    assert.deepEqual(
      physical.map(
        (result) =>
          result.hospcode,
      ),
      [
        null,
        "A",
        "B",
      ],
    );

    assert.equal(
      results[0]?.kpiKey,
      "physical_01",
    );
  },
);

test(
  "missing physical source fails closed",
  () => {
    const snapshot =
      makeSnapshot();

    const sources =
      makeSources(snapshot);

    const missing =
      Object.freeze(
        Object.fromEntries(
          Object.entries(
            sources,
          ).filter(
            ([sourceSheet]) =>
              sourceSheet !==
              "source_01",
          ),
        ),
      ) as SourceRowsBySheet;

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          missing,
          "5406",
        ),
    );
  },
);

test(
  "unexpected physical source fails closed",
  () => {
    const snapshot =
      makeSnapshot();

    const sources:
      SourceRowsBySheet =
      Object.freeze({
        ...makeSources(snapshot),
        unexpected_source:
          Object.freeze([]),
      });

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
    );
  },
);

test(
  "source with zero district-eligible rows fails closed rather than returning partial output",
  () => {
    const snapshot =
      makeSnapshot();

    let sources =
      makeSources(snapshot);

    const base =
      requireDefined(
        sources.source_01?.[0],
        "source_01",
      );

    sources = replaceRows(
      sources,
      "source_01",
      [
        {
          ...base,
          areacode: "549901",
        },
      ],
    );

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
    );
  },
);

test(
  "non-finite selected numeric input fails closed",
  () => {
    const snapshot =
      makeSnapshot();

    let sources =
      makeSources(snapshot);

    sources = patchFirstRow(
      sources,
      "source_01",
      {
        target: "Infinity",
      },
    );

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          sources,
          "5406",
        ),
    );
  },
);

test(
  "malformed district prefix fails closed",
  () => {
    const snapshot =
      makeSnapshot();

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          makeSources(snapshot),
          "540",
        ),
    );

    expectCalculationError(
      () =>
        calculateKpiResults(
          snapshot,
          makeSources(snapshot),
          "54A6",
        ),
    );
  },
);
