import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const exportSource = fs.readFileSync(
  new URL("./excel-export.ts", import.meta.url),
  "utf8",
);
const tableSource = fs.readFileSync(
  new URL("../components/KPITable.tsx", import.meta.url),
  "utf8",
);

test("Excel export resolves aggregate result through shared KPI semantics", () => {
  assert.match(
    exportSource,
    /computeAggregate\(\s*kpi,\s*selectedFacilities,\s*\)/,
  );
  assert.match(
    exportSource,
    /selectedFacilities:\s*string\[\]\s*=\s*\[\]/,
  );
  assert.match(exportSource, /aggregate\.totalResult/);
  assert.match(exportSource, /aggregate\.percentage/);
});

test("KPITable passes current facility selection into Excel export", () => {
  assert.match(
    tableSource,
    /exportToExcel\(\s*data,\s*hospitalMap,\s*displayConfigKeys,\s*fiscalYear,\s*selectedFacilities,\s*\)/,
  );
});
