import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("dashboard page restores URL state on browser back/forward", () => {
  assert.match(source, /addEventListener\(["']popstate["']/);
  assert.match(source, /parseDashboardUrlState\(window\.location\.search\)/);
});

test("dashboard page records user filter changes in browser history", () => {
  assert.match(source, /window\.history\.pushState/);
});

test("dashboard page canonicalizes invalid or stale URL state without adding history", () => {
  assert.match(source, /window\.history\.replaceState/);
  assert.match(source, /sanitizeDashboardUrlState/);
});
