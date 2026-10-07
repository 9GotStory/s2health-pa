import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAggregate,
  evaluateKPI,
  isRawCountKPI,
} from "./kpi-utils.ts";
import type { KPISummary } from "./types";

function summary(
  overrides: Partial<KPISummary> = {},
): KPISummary {
  return {
    title: "KPI",
    tableName: "s_dm_screen" as KPISummary["tableName"],
    totalTarget: 100,
    totalResult: 80,
    percentage: 80,
    data: [],
    breakdown: {
      "06413": {
        target: 50,
        result: 45,
        percentage: 90,
      },
      "06414": {
        target: 50,
        result: 35,
        percentage: 70,
      },
    },
    targetValue: 80,
    targetMonths: 12,
    ...overrides,
  };
}

test("percentage KPI evaluation uses the configured target", () => {
  const kpi = summary();

  assert.equal(evaluateKPI(kpi), "pass");
  assert.equal(evaluateKPI(kpi, ["06414"]), "fail");
});

test("raw-count KPI is never classified as pass or fail", () => {
  const kpi = summary({
    totalTarget: 0,
    totalResult: 12,
    percentage: 0,
    targetValue: 0,
    breakdown: {
      "06413": {
        target: 0,
        result: 7,
        percentage: 0,
      },
      "06414": {
        target: 0,
        result: 5,
        percentage: 0,
      },
    },
  });

  assert.equal(evaluateKPI(kpi), "not-applicable");
  assert.equal(evaluateKPI(kpi, ["06413"]), "not-applicable");

  assert.deepEqual(computeAggregate(kpi, ["06413"]), {
    totalTarget: 0,
    totalResult: 7,
    percentage: 100,
  });
});


test("computeAggregate returns full totals when no facility filter is active", () => {
  const kpi = summary();

  assert.deepEqual(computeAggregate(kpi), {
    totalTarget: 100,
    totalResult: 80,
    percentage: 80,
  });
});

test("computeAggregate scopes a percentage KPI to one selected facility", () => {
  const kpi = summary();

  assert.deepEqual(computeAggregate(kpi, ["06414"]), {
    totalTarget: 50,
    totalResult: 35,
    percentage: 70,
  });
});

test("computeAggregate combines multiple selected facilities deterministically", () => {
  const kpi = summary();

  assert.deepEqual(computeAggregate(kpi, ["06414", "06413"]), {
    totalTarget: 100,
    totalResult: 80,
    percentage: 80,
  });
});


test("KPI type remains percentage when a selected facility has zero denominator", () => {
  const kpi = summary({
    breakdown: {
      "06413": {
        target: 0,
        result: 12,
        percentage: 0,
      },
      "06414": {
        target: 100,
        result: 80,
        percentage: 80,
      },
    },
  });

  assert.equal(isRawCountKPI(kpi), false);
  assert.deepEqual(computeAggregate(kpi, ["06413"]), {
    totalTarget: 0,
    totalResult: 12,
    percentage: 0,
  });
  assert.equal(evaluateKPI(kpi, ["06413"]), "not-applicable");
});

test("canonical raw-count type does not change under facility filters", () => {
  const kpi = summary({
    totalTarget: 0,
    totalResult: 12,
    percentage: 0,
    targetValue: 0,
    breakdown: {
      "06413": {
        target: 0,
        result: 7,
        percentage: 0,
      },
      "06414": {
        target: 0,
        result: 5,
        percentage: 0,
      },
    },
  });

  assert.equal(isRawCountKPI(kpi), true);
  assert.equal(evaluateKPI(kpi, ["06413"]), "not-applicable");
});
