import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dashboardUrlStateEquals,
  normalizeDashboardUrlState,
  parseDashboardUrlState,
  sanitizeDashboardUrlState,
  serializeDashboardUrlState,
} from "./dashboard-url-state.ts";

test("URL state: empty query parses to empty dashboard state", () => {
  assert.deepEqual(parseDashboardUrlState(""), {
    category: "",
    facilities: [],
    kpis: [],
  });
});

test("URL state: legacy category-only link remains supported", () => {
  assert.deepEqual(parseDashboardUrlState("?cat=basic"), {
    category: "basic",
    facilities: [],
    kpis: [],
  });
});

test("URL state: one facility round-trips", () => {
  const state = {
    category: "",
    facilities: ["06413"],
    kpis: [],
  };
  assert.deepEqual(parseDashboardUrlState(serializeDashboardUrlState(state)), state);
});

test("URL state: multiple facilities round-trip in canonical order", () => {
  const query = serializeDashboardUrlState({
    category: "",
    facilities: ["06414", "06413"],
    kpis: [],
  });
  assert.equal(query, "facility=06413&facility=06414");
  assert.deepEqual(parseDashboardUrlState(query).facilities, ["06413", "06414"]);
});

test("URL state: one KPI round-trips", () => {
  const state = {
    category: "",
    facilities: [],
    kpis: ["s_anc5"],
  };
  assert.deepEqual(parseDashboardUrlState(serializeDashboardUrlState(state)), state);
});

test("URL state: multiple KPIs round-trip in canonical order", () => {
  const query = serializeDashboardUrlState({
    category: "",
    facilities: [],
    kpis: ["s_ht_screen", "s_anc5"],
  });
  assert.equal(query, "kpi=s_anc5&kpi=s_ht_screen");
  assert.deepEqual(parseDashboardUrlState(query).kpis, ["s_anc5", "s_ht_screen"]);
});

test("URL state: combined state round-trips", () => {
  const state = {
    category: "basic",
    facilities: ["06413", "06414"],
    kpis: ["s_anc5", "s_ht_screen"],
  };
  assert.deepEqual(parseDashboardUrlState(serializeDashboardUrlState(state)), state);
});

test("URL state: malformed empty and duplicate values normalize away", () => {
  assert.deepEqual(
    parseDashboardUrlState(
      "?facility=06414&facility=&facility=06413&facility=06414&kpi=s_anc5&kpi=%20",
    ),
    {
      category: "",
      facilities: ["06413", "06414"],
      kpis: ["s_anc5"],
    },
  );
});

test("URL state: stale identifiers are removed during validation", () => {
  assert.deepEqual(
    sanitizeDashboardUrlState(
      {
        category: "unknown",
        facilities: ["06413", "99999"],
        kpis: ["s_anc5", "missing"],
      },
      {
        categories: ["basic"],
        facilities: ["06413", "06414"],
        kpis: ["s_anc5", "s_ht_screen"],
      },
    ),
    {
      category: "",
      facilities: ["06413"],
      kpis: ["s_anc5"],
    },
  );
});

test("URL state: clearing selections removes their query parameters", () => {
  assert.equal(
    serializeDashboardUrlState({
      category: "basic",
      facilities: [],
      kpis: [],
    }),
    "cat=basic",
  );
});

test("URL state: equality ignores input order and duplicate values", () => {
  assert.equal(
    dashboardUrlStateEquals(
      {
        category: " basic ",
        facilities: ["06414", "06413", "06413"],
        kpis: ["s_ht_screen", "s_anc5"],
      },
      normalizeDashboardUrlState({
        category: "basic",
        facilities: ["06413", "06414"],
        kpis: ["s_anc5", "s_ht_screen"],
      }),
    ),
    true,
  );
});
