import test from "node:test";
import assert from "node:assert/strict";

import {
  parseDashboardResponse,
  parseFacilitiesResponse,
  parseKpiCatalogResponse,
  parseTambonsResponse,
} from "../site/js/contracts.js";

const dashboardBody = {
  dataset: {
    syncRunId: "42",
    fiscalYear: 2570,
    currentQuarter: 2,
    activatedAt: "2026-10-07T00:00:00.000Z",
    sourceLastUpdated: "202610070030",
  },
  results: [
    {
      kpiKey: "kpi-1",
      periodCode: "annual",
      areacode: "5406",
      hospcode: "06413",
      target: 100,
      result: 90,
    },
  ],
};

test("dashboard contract accepts normalized active dataset", () => {
  const parsed = parseDashboardResponse(dashboardBody);

  assert.equal(parsed.dataset.syncRunId, "42");
  assert.equal(parsed.dataset.currentQuarter, 2);
  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0].hospcode, "06413");
});

test("dashboard contract accepts authoritative no-dataset state", () => {
  const parsed = parseDashboardResponse({
    dataset: null,
    results: [],
  });

  assert.equal(parsed.dataset, null);
  assert.deepEqual(parsed.results, []);
});

test("dashboard contract fails closed on mixed invalid primitives", () => {
  assert.throws(
    () =>
      parseDashboardResponse({
        ...dashboardBody,
        dataset: {
          ...dashboardBody.dataset,
          currentQuarter: 5,
        },
      }),
    /currentQuarter/,
  );

  assert.throws(
    () =>
      parseDashboardResponse({
        ...dashboardBody,
        results: [
          {
            ...dashboardBody.results[0],
            result: "90",
          },
        ],
      }),
    /finite number/,
  );
});

test("KPI catalog rejects duplicate keys", () => {
  const entry = {
    key: "kpi-1",
    title: "ตัวชี้วัด 1",
    target: 80,
    order: 1,
    link: null,
    categoryCode: "01",
    category: "หมวด 1",
    categoryOrder: 1,
    subgroup: null,
    isQuarterly: false,
    targetMonths: null,
    effectiveQuarter: null,
  };

  assert.throws(
    () =>
      parseKpiCatalogResponse({
        kpis: [entry, entry],
      }),
    /Duplicate KPI key/,
  );
});

test("facility and tambon references enforce exact code widths", () => {
  assert.deepEqual(
    parseFacilitiesResponse({
      facilities: [
        {
          hospcode: "06413",
          hospname: "รพ.สต. บ้านหนุน",
          tambonId: "540601",
        },
      ],
    }),
    [
      {
        hospcode: "06413",
        hospname: "รพ.สต. บ้านหนุน",
        tambonId: "540601",
      },
    ],
  );

  assert.deepEqual(
    parseTambonsResponse({
      tambons: [
        {
          id: "540601",
          nameTh: "บ้านหนุน",
        },
      ],
    }),
    [
      {
        id: "540601",
        nameTh: "บ้านหนุน",
      },
    ],
  );

  assert.throws(
    () =>
      parseFacilitiesResponse({
        facilities: [
          {
            hospcode: "6413",
            hospname: "bad",
            tambonId: "540601",
          },
        ],
      }),
    /5-digit code/,
  );
});
