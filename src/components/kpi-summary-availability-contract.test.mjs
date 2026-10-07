import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const summarySource = fs.readFileSync(
  new URL("./KPISummaryStats.tsx", import.meta.url),
  "utf8",
);

test("summary renders unavailable success rate neutrally", () => {
  assert.match(summarySource, /successRate === null \? "—"/);
  assert.match(summarySource, /ไม่มีตัวชี้วัดที่ประเมินได้/);
  assert.match(summarySource, /จาก \${evaluated} ตัวที่ประเมินได้/);
});

test("summary exposes unavailable percentage KPI count separately", () => {
  assert.match(summarySource, /unavailablePercentage/);
  assert.match(summarySource, /ไม่มีฐานประเมิน/);
  assert.match(summarySource, /summarizeKPIEvaluations\(data, selectedFacilities\)/);
});
