import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardModel,
  filterSummaries,
  getAggregate,
  getCategories,
  getDashboardStats,
} from "../site/js/model.js";

const dataset = {
  syncRunId: "99",
  fiscalYear: 2570,
  currentQuarter: 2,
  activatedAt: "2026-10-07T00:00:00.000Z",
  sourceLastUpdated: "202610070030",
};

const facilities = [
  {
    hospcode: "06413",
    hospname: "รพ.สต. บ้านหนุน",
    tambonId: "540601",
  },
  {
    hospcode: "06414",
    hospname: "รพ.สต. ทุ่งน้าว",
    tambonId: "540602",
  },
];

const tambons = [
  {
    id: "540601",
    nameTh: "บ้านหนุน",
  },
  {
    id: "540602",
    nameTh: "ทุ่งน้าว",
  },
];

const kpis = [
  {
    key: "annual",
    title: "ตัวชี้วัดรายปี",
    target: 80,
    order: 1,
    link: null,
    categoryCode: "a",
    category: "ปฐมภูมิ",
    categoryOrder: 1,
    subgroup: "",
    isQuarterly: false,
    targetMonths: null,
    effectiveQuarter: null,
  },
  {
    key: "quarter",
    title: "ตัวชี้วัดรายไตรมาส",
    target: 70,
    order: 2,
    link: null,
    categoryCode: "b",
    category: "NCD",
    categoryOrder: 2,
    subgroup: "คัดกรอง",
    isQuarterly: true,
    targetMonths: null,
    effectiveQuarter: 2,
  },
];

const results = [
  {
    kpiKey: "annual",
    periodCode: "annual",
    areacode: "5406",
    hospcode: "06413",
    target: 100,
    result: 90,
  },
  {
    kpiKey: "annual",
    periodCode: "annual",
    areacode: "5406",
    hospcode: "06414",
    target: 100,
    result: 60,
  },
  {
    kpiKey: "quarter",
    periodCode: "q2",
    areacode: "5406",
    hospcode: "06413",
    target: 20,
    result: 16,
  },
  {
    kpiKey: "quarter",
    periodCode: "q2",
    areacode: "5406",
    hospcode: "06414",
    target: 20,
    result: 10,
  },
];

test("model preserves backend-calculated rows and builds aggregate breakdown", () => {
  const model = buildDashboardModel({
    dataset,
    facilities,
    tambons,
    kpis,
    results,
  });

  assert.equal(model.summaries.length, 2);

  const annual = model.summaries[0];
  assert.equal(annual.totalTarget, 200);
  assert.equal(annual.totalResult, 150);
  assert.equal(annual.percentage, 75);
  assert.equal(annual.periodLabel, "รายปี");

  assert.deepEqual(getAggregate(annual, "06413"), {
    target: 100,
    result: 90,
    percentage: 90,
  });

  assert.equal(model.summaries[1].periodLabel, "สะสม 6 เดือน (Q2)");
});

test("model summary stats respect facility selection", () => {
  const model = buildDashboardModel({
    dataset,
    facilities,
    tambons,
    kpis,
    results,
  });

  assert.deepEqual(getDashboardStats(model.summaries), {
    total: 2,
    passed: 0,
    attention: 2,
    passRate: 0,
  });

  assert.deepEqual(getDashboardStats(model.summaries, "06413"), {
    total: 2,
    passed: 2,
    attention: 0,
    passRate: 100,
  });
});

test("categories and search filters are presentation-only", () => {
  const model = buildDashboardModel({
    dataset,
    facilities,
    tambons,
    kpis,
    results,
  });

  assert.deepEqual(
    getCategories(model.summaries).map(({ code, count }) => ({ code, count })),
    [
      { code: "a", count: 1 },
      { code: "b", count: 1 },
    ],
  );

  assert.deepEqual(
    filterSummaries(model.summaries, { query: "คัดกรอง" }).map(
      (summary) => summary.key,
    ),
    ["quarter"],
  );
});

test("facility must reference a known tambon", () => {
  assert.throws(
    () =>
      buildDashboardModel({
        dataset,
        kpis,
        results,
        tambons,
        facilities: [
          {
            hospcode: "06413",
            hospname: "bad",
            tambonId: "999999",
          },
        ],
      }),
    /unknown tambon/,
  );
});
