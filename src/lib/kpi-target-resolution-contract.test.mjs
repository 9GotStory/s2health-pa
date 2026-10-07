import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const utilsSource = fs.readFileSync(
  new URL("./kpi-utils.ts", import.meta.url),
  "utf8",
);
const cardSource = fs.readFileSync(
  new URL("../components/KPICard.tsx", import.meta.url),
  "utf8",
);
const tableSource = fs.readFileSync(
  new URL("../components/KPITable.tsx", import.meta.url),
  "utf8",
);
const cardListSource = fs.readFileSync(
  new URL("../components/KPICardList.tsx", import.meta.url),
  "utf8",
);
const excelSource = fs.readFileSync(
  new URL("./excel-export.ts", import.meta.url),
  "utf8",
);

test("KPI target fallback uses nullish semantics", () => {
  assert.match(
    utilsSource,
    /return kpi\.targetValue \?\? DEFAULT_TARGET;/,
  );
});

test("shared target consumers resolve through one helper", () => {
  for (const source of [
    cardSource,
    tableSource,
    cardListSource,
    excelSource,
  ]) {
    assert.match(source, /resolveKpiTarget/);
    assert.doesNotMatch(source, /targetValue\s*\|\|\s*DEFAULT_TARGET/);
  }
});

test("desktop target column resolves explicit zero through the helper", () => {
  assert.match(
    tableSource,
    /≥\{resolveKpiTarget\(info\.row\.original\)\}/,
  );
});
