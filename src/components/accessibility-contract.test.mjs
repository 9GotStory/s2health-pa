import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

test("dashboard filter exposes keyboard and state semantics", () => {
  const text = source("./DashboardFilter.tsx");

  assert.match(text, /aria-expanded=\{isOpen\}/);
  assert.match(text, /aria-controls="dashboard-filter-panel"/);
  assert.match(text, /role="tablist"/);
  assert.match(text, /aria-selected=\{activeTab === "facilities"\}/);
  assert.match(text, /aria-selected=\{activeTab === "kpis"\}/);
  assert.match(text, /aria-pressed=\{selectedFacilities\.includes\(f\.value\)\}/);
  assert.match(text, /aria-pressed=\{selectedKPIs\.includes\(k\.value\)\}/);
  assert.match(text, /aria-label="ล้างคำค้นหา"/);
  assert.match(text, /hidden=\{!isOpen\}/);
});

test("KPI detail modal behaves as a keyboard modal dialog", () => {
  const text = source("./KPIDetailModal.tsx");

  assert.match(text, /role="dialog"/);
  assert.match(text, /aria-modal="true"/);
  assert.match(text, /aria-labelledby=\{titleId\}/);
  assert.match(text, /aria-describedby=\{descriptionId\}/);
  assert.match(text, /event\.key === "Escape"/);
  assert.match(text, /event\.key !== "Tab"/);
  assert.match(text, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(text, /previousFocus\?\.focus\(\)/);
});

test("mobile KPI cards expose explicit keyboard actions", () => {
  const text = source("./KPICard.tsx");

  assert.match(text, />\s*ดูรายละเอียด\s*<\/button>/);
  assert.match(text, /aria-expanded=\{isExpanded\}/);
  assert.match(text, /เปิดรายละเอียดภายนอกของ/);
  assert.match(text, /focus-visible:ring-brand-500/);
});
