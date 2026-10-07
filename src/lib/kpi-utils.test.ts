import test from "node:test";
import assert from "node:assert/strict";

import {
  collectFacilityFilterKeys,
  computeAggregate,
  DEFAULT_TARGET,
  evaluateKPI,
  formatDashboardAreaLabel,
  isRawCountKPI,
  matchesFacilityFilter,
  resolveKpiTarget,
  summarizeKPIEvaluations,
} from "./kpi-utils.ts";
import type { DashboardResultRow, KPISummary } from "./types";

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

test("target resolver preserves explicit zero and defaults only null", () => {
  assert.equal(resolveKpiTarget(summary({ targetValue: 0 })), 0);
  assert.equal(resolveKpiTarget(summary({ targetValue: null })), DEFAULT_TARGET);
  assert.equal(resolveKpiTarget(summary({ targetValue: 85 })), 85);
});

test("percentage KPI evaluation honors an explicit zero target", () => {
  const kpi = summary({
    percentage: 0,
    totalResult: 0,
    targetValue: 0,
  });

  assert.equal(evaluateKPI(kpi), "pass");
});

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


test("summary evaluation reconciles pass, fail, raw-count, and unavailable percentage KPIs", () => {
  const passing = summary({
    title: "Passing",
    percentage: 90,
    totalResult: 90,
    targetValue: 80,
    breakdown: {
      "06413": {
        target: 50,
        result: 45,
        percentage: 90,
      },
    },
  });
  const failing = summary({
    title: "Failing",
    percentage: 70,
    totalResult: 70,
    targetValue: 80,
    breakdown: {
      "06413": {
        target: 50,
        result: 35,
        percentage: 70,
      },
    },
  });
  const rawCount = summary({
    title: "Raw count",
    totalTarget: 0,
    totalResult: 12,
    percentage: 0,
    targetValue: 0,
  });
  const unavailable = summary({
    title: "Unavailable",
    breakdown: {
      "06413": {
        target: 0,
        result: 4,
        percentage: 0,
      },
    },
  });

  assert.deepEqual(
    summarizeKPIEvaluations(
      [passing, failing, rawCount, unavailable],
      ["06413"],
    ),
    {
      total: 4,
      evaluated: 2,
      passed: 1,
      failed: 1,
      rawCount: 1,
      unavailablePercentage: 1,
      successRate: 50,
    },
  );
});

test("summary evaluation returns null success rate when no percentage KPI is evaluable", () => {
  const rawCount = summary({
    totalTarget: 0,
    totalResult: 7,
    percentage: 0,
    targetValue: 0,
  });
  const unavailable = summary({
    breakdown: {
      "06413": {
        target: 0,
        result: 3,
        percentage: 0,
      },
    },
  });

  assert.deepEqual(
    summarizeKPIEvaluations([rawCount, unavailable], ["06413"]),
    {
      total: 2,
      evaluated: 0,
      passed: 0,
      failed: 0,
      rawCount: 1,
      unavailablePercentage: 1,
      successRate: null,
    },
  );
});


test("facility filter domain includes registry and contract-valid breakdown keys", () => {
  const kpi = summary({
    totalTarget: 120,
    totalResult: 90,
    percentage: 75,
    breakdown: {
      "06413": {
        target: 50,
        result: 45,
        percentage: 90,
      },
      "99999": {
        target: 30,
        result: 15,
        percentage: 50,
      },
      "54069999": {
        target: 40,
        result: 30,
        percentage: 75,
      },
    },
  });

  const keys = collectFacilityFilterKeys(
    [kpi],
    {
      "06413": {
        name: "บ้านหนุน",
        tambon_id: "540601",
      },
      "06414": {
        name: "ทุ่งน้าว",
        tambon_id: "540602",
      },
    },
  );

  assert.deepEqual(
    keys,
    ["06413", "06414", "54069999", "99999"],
  );

  assert.deepEqual(
    computeAggregate(kpi, keys),
    computeAggregate(kpi),
  );
});

test("facility row matching uses hospcode first and areacode when hospcode is null", () => {
  const base: DashboardResultRow = {
    kpiKey: "s_dm_screen",
    periodCode: "annual",
    areacode: "54069999",
    hospcode: null,
    target: 1,
    result: 1,
  };

  assert.equal(
    matchesFacilityFilter(base, ["54069999"]),
    true,
  );
  assert.equal(
    matchesFacilityFilter(
      {
        ...base,
        hospcode: "99999",
      },
      ["99999"],
    ),
    true,
  );
  assert.equal(
    matchesFacilityFilter(
      {
        ...base,
        hospcode: "99999",
      },
      ["54069999"],
    ),
    false,
  );
});


test("dashboard area label preserves raw code when geographic metadata is unavailable", () => {
  const tambons = {
    "540601": "บ้านหนุน",
  };

  assert.equal(
    formatDashboardAreaLabel("54060101", tambons),
    "ต.บ้านหนุน ม.1",
  );
  assert.equal(
    formatDashboardAreaLabel("540601", tambons),
    "ต.บ้านหนุน",
  );
  assert.equal(
    formatDashboardAreaLabel("54069999", tambons),
    "54069999",
  );
  assert.equal(
    formatDashboardAreaLabel("5406", tambons),
    "5406",
  );
  assert.equal(
    formatDashboardAreaLabel("540601AB", tambons),
    "540601AB",
  );
  assert.equal(
    formatDashboardAreaLabel("5406010", tambons),
    "5406010",
  );
  assert.equal(
    formatDashboardAreaLabel("540601001", tambons),
    "540601001",
  );
  assert.equal(
    formatDashboardAreaLabel("", tambons),
    "-",
  );
});
