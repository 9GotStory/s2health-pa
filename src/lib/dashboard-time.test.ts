import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_TIME_ZONE,
  formatDashboardDate,
} from "./dashboard-time.ts";

test("dashboard date uses the canonical Bangkok timezone", () => {
  assert.equal(
    DASHBOARD_TIME_ZONE,
    "Asia/Bangkok",
  );
});

test("dashboard date advances at Bangkok midnight instead of UTC midnight", () => {
  assert.equal(
    formatDashboardDate(
      new Date("2026-10-06T17:30:00.000Z"),
    ),
    "2026-10-07",
  );

  assert.equal(
    formatDashboardDate(
      new Date("2026-10-07T16:59:59.999Z"),
    ),
    "2026-10-07",
  );

  assert.equal(
    formatDashboardDate(
      new Date("2026-10-07T17:00:00.000Z"),
    ),
    "2026-10-08",
  );
});
