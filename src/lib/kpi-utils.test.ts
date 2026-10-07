import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAggregate,
  evaluateKPI,
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
