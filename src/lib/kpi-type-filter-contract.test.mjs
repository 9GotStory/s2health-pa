import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cardSource = fs.readFileSync(
  new URL("../components/KPICard.tsx", import.meta.url),
  "utf8",
);
const tableSource = fs.readFileSync(
  new URL("../components/KPITable.tsx", import.meta.url),
  "utf8",
);
const summarySource = fs.readFileSync(
  new URL("../components/KPISummaryStats.tsx", import.meta.url),
  "utf8",
);
const excelSource = fs.readFileSync(
  new URL("./excel-export.ts", import.meta.url),
  "utf8",
);

test("shared UI derives KPI type from canonical helper", () => {
  assert.match(cardSource, /isRawCountKPI\(kpi\)/);
  assert.match(tableSource, /isRawCountKPI\(kpi\)/);
  assert.match(summarySource, /data\.filter\(isRawCountKPI\)\.length/);
  assert.match(excelSource, /isRawCountKPI\(kpi\)/);
});

test("filtered percentage KPI with zero denominator renders unavailable aggregate", () => {
  assert.match(
    cardSource,
    /hasPercentageValue\s*=\s*!isRawCount\s*&&\s*totalTarget\s*>\s*0/,
  );
  assert.match(
    tableSource,
    /hasPercentageValue\s*=\s*!isRawCount\s*&&\s*totalTarget\s*>\s*0/,
  );
  assert.match(cardSource, /hasPercentageValue[\s\S]*?"—"/);
  assert.match(tableSource, /hasPercentageValue[\s\S]*?"—"/);
});

test("Excel keeps percentage KPI type when filtered denominator is zero", () => {
  assert.match(
    excelSource,
    /hasPercentageValue\s*=\s*!isRawCount\s*&&\s*aggregate\.totalTarget\s*>\s*0/,
  );
  assert.match(
    excelSource,
    /isRawCount\s*\?\s*aggregate\.totalResult[\s\S]*?:\s*hasPercentageValue[\s\S]*?:\s*"—"/,
  );
});
