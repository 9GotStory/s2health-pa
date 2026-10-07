import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const filterSource = fs.readFileSync(
  new URL("./DashboardFilter.tsx", import.meta.url),
  "utf8",
);
const pageSource = fs.readFileSync(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);

test("DashboardFilter exposes one atomic selection callback", () => {
  assert.match(
    filterSource,
    /onSelectionChange:\s*\(selection:\s*DashboardFilterSelection\)\s*=>\s*void/,
  );
  assert.doesNotMatch(filterSource, /onFacilitiesChange/);
  assert.doesNotMatch(filterSource, /onKPIsChange/);
});

test("clear-all emits one complete empty filter snapshot", () => {
  assert.match(
    filterSource,
    /onSelectionChange\(\{\s*facilities:\s*\[\],\s*kpis:\s*\[\],\s*\}\)/,
  );
});

test("single-dimension updates preserve the untouched selection", () => {
  assert.match(
    filterSource,
    /const updateFacilities = \(facilities: string\[\]\) => \{\s*onSelectionChange\(\{\s*facilities,\s*kpis: selectedKPIs,/,
  );
  assert.match(
    filterSource,
    /const updateKPIs = \(kpis: string\[\]\) => \{\s*onSelectionChange\(\{\s*facilities: selectedFacilities,\s*kpis,/,
  );
});

test("page maps one combined filter selection to one dashboard-state commit", () => {
  assert.match(
    pageSource,
    /onSelectionChange=\{\(\{ facilities, kpis \}\) =>\s*commitDashboardUrlState\(\{\s*\.\.\.dashboardViewState,\s*facilities,\s*kpis,/,
  );
});
