import assert from "node:assert/strict";
import test from "node:test";

import type { Pool } from "pg";

import {
  runMophSynchronization,
} from "../src/sync/orchestrator.js";

import type {
  MophClient,
} from "../src/sync/moph-client.js";

/**
 * Feature 032 / T006 RED contract.
 *
 * The fake pool models the existing read/lock sequence and refuses the first
 * writing SQL statement. No real MOPH request, database, timer, or network is
 * ever used by this unit test.
 *
 * The production orchestrator deliberately ignores an untrusted caller
 * approvedTarget field. In T007 GREEN, missing or spoofed approval must
 * be rejected before the first INSERT, and a test-only injected verified
 * provider can reach the old insertion boundary.
 */
interface ApprovedSyncTarget {
  readonly schemaVersion: 1;
  readonly approvalId: string;
  readonly runMode: "manual" | "scheduled";
  readonly issuedAt: string;
  readonly fiscalYear: number;
  readonly currentQuarter: number;
  readonly provinceCode: string;
  readonly districtAreaPrefix: string;
  readonly expiresAt: string;
}

const INSERT_PROBE = "T006_PROBE_UNAUTHORIZED_SYNC_RUN_INSERT";
const fixedTime = new Date("2026-10-12T10:00:00.000Z");

const approved: ApprovedSyncTarget = Object.freeze({
  schemaVersion: 1,
  approvalId: "t006-test-authority",
  runMode: "manual",
  issuedAt: "2026-10-11T10:00:00.000Z",
  fiscalYear: 2569,
  currentQuarter: 4,
  provinceCode: "54",
  districtAreaPrefix: "5406",
  expiresAt: "2026-10-13T10:00:00.000Z",
});

type DefinitionRow = {
  id: string;
  kpi_key: string;
  kind: "physical" | "virtual";
  source_sheet: string;
  source_id: null;
  value_prefix: null;
  target_value: null;
  is_quarterly: boolean;
  target_months: null;
  effective_quarter: null;
  sort_order: number;
  metadata: Record<string, unknown>;
};

function definitions(): DefinitionRow[] {
  const rows: DefinitionRow[] = [];

  for (let number = 1; number <= 52; number += 1) {
    const physical = number <= 18;
    rows.push({
      id: String(number),
      kpi_key: "t006_" + String(number),
      kind: physical ? "physical" : "virtual",
      source_sheet: "t006_source_" + String(
        physical ? number : 1,
      ),
      source_id: null,
      value_prefix: null,
      target_value: null,
      is_quarterly: false,
      target_months: null,
      effective_quarter: null,
      sort_order: number,
      metadata:
        physical && number <= 5
          ? { source_only: true }
          : {},
    });
  }

  return rows;
}

interface SqlProbe {
  readonly pool: Pool;
  readonly writingAttempts: string[];
  readonly observedQueries: string[];
  readonly state: {
    settings: {
      currentYear: string;
      currentQuarter: number;
      provinceCode: string;
      district: string;
    };
    activeRunId: string;
    fetchedSources: number;
    lockAcquired: number;
    lockReleased: number;
    clientReleased: number;
  };
}

function createSqlProbe(): SqlProbe {
  const writingAttempts: string[] = [];
  const observedQueries: string[] = [];
  const state: SqlProbe["state"] = {
    settings: {
      currentYear: "2569",
      currentQuarter: 4,
      provinceCode: "54",
      district: "5406",
    },
    activeRunId: "2",
    fetchedSources: 0,
    lockAcquired: 0,
    lockReleased: 0,
    clientReleased: 0,
  };

  // Deliberately only implements existing *read* queries and the lock. A new
  // approval read can be added here in T007 without touching Production.
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      observedQueries.push(normalized);

      if (/pg_try_advisory_lock/i.test(normalized)) {
        state.lockAcquired += 1;
        return { rows: [{ acquired: true }], rowCount: 1 };
      }

      if (/pg_advisory_unlock/i.test(normalized)) {
        state.lockReleased += 1;
        return { rows: [{ released: true }], rowCount: 1 };
      }

      if (
        /FROM app_settings/i.test(normalized) &&
        /key = ANY/i.test(normalized)
      ) {
        return {
          rows: [
            { key: "current_year", value: state.settings.currentYear },
            { key: "current_quarter", value: state.settings.currentQuarter },
            { key: "province_code", value: state.settings.provinceCode },
          ],
          rowCount: 3,
        };
      }

      if (/FROM kpi_definitions/i.test(normalized)) {
        return { rows: definitions(), rowCount: 52 };
      }

      if (
        /FROM app_settings/i.test(normalized) &&
        /key = \$1/i.test(normalized)
      ) {
        return {
          rows: [{ value: state.settings.district }],
          rowCount: 1,
        };
      }

      if (/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i.test(normalized)) {
        writingAttempts.push(normalized);
        throw new Error(INSERT_PROBE);
      }

      throw new Error("T006_UNEXPECTED_SQL: " + normalized.slice(0, 100));
    },

    release() {
      state.clientReleased += 1;
    },
  };

  // The fake deliberately stops at the first SQL write. Type assertion is
  // restricted to test code, never a runtime database adapter.
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  return { pool, writingAttempts, observedQueries, state };
}

function fakeMophClient(state: SqlProbe["state"]): MophClient {
  return {
    async fetchSource() {
      state.fetchedSources += 1;
      throw new Error("T006_MOPH_CALLED_BEFORE_APPROVAL");
    },
    async waitBetweenSources() {},
  };
}

async function observeAttempt(
  probe: SqlProbe,
  target?: ApprovedSyncTarget,
): Promise<unknown> {
  const dependencies = {
    mophClient: fakeMophClient(probe.state),
    runMode: "manual" as const,
    now: () => new Date(fixedTime),
    ...(target === undefined ? {} : { approvedTarget: target }),
  };

  // The additional approvedTarget property is a forward-compatible test
  // contract. The current production type accepts extra fields via
  // structural typing but ignores this authority until T007.
  try {
    await runMophSynchronization(probe.pool, dependencies);
    return null;
  } catch (error) {
    return error;
  }
}

test("T006 RED: reject unauthorized sync targets before any run INSERT", async (t) => {
  const scenarios: ReadonlyArray<{
    name: string;
    target?: ApprovedSyncTarget;
  }> = [
    { name: "missing authorization" },
    {
      name: "expired authorization",
      target: { ...approved, expiresAt: "2026-10-11T10:00:00.000Z" },
    },
    {
      name: "wrong fiscal year",
      target: { ...approved, fiscalYear: 2570 },
    },
    {
      name: "wrong quarter",
      target: { ...approved, currentQuarter: 1 },
    },
    {
      name: "wrong province",
      target: { ...approved, provinceCode: "55" },
    },
    {
      name: "wrong district",
      target: { ...approved, districtAreaPrefix: "5499" },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const probe = createSqlProbe();
      const beforeSettings = structuredClone(probe.state.settings);
      const beforeActiveRun = probe.state.activeRunId;

      const error = await observeAttempt(probe, scenario.target);

      assert.equal(
        probe.writingAttempts.length,
        0,
        scenario.name + ": attempted a DB write before approval",
      );
      assert.equal(probe.state.fetchedSources, 0, "MOPH must not be called");
      assert.deepEqual(probe.state.settings, beforeSettings);
      assert.equal(probe.state.activeRunId, beforeActiveRun);
      assert.equal(probe.state.lockAcquired, 1, "must use existing lock");
      assert.equal(probe.state.lockReleased, 1, "must release lock");
      assert.equal(probe.state.clientReleased, 1, "must release session");
      assert.ok(error instanceof Error, "must reject unauthorized call");
      assert.notEqual(error.message, INSERT_PROBE);
      assert.match(error.message, /authoriz|approv|policy|target/i);
    });
  }
});

test("T007: a matching self-asserted target is not an authorization", async () => {
  const probe = createSqlProbe();
  const error = await observeAttempt(probe, approved);

  assert.equal(probe.writingAttempts.length, 0);
  assert.equal(probe.state.fetchedSources, 0);
  assert.equal(probe.state.lockAcquired, 1);
  assert.equal(probe.state.lockReleased, 1);
  assert.equal(probe.state.clientReleased, 1);
  assert.ok(error instanceof Error);
  assert.match(error.message, /authoriz|approv|policy|target/i);
});

test("T007: an explicitly injected test approval provider allows a matching target", async () => {
  const probe = createSqlProbe();
  let seen = 0;
  let error: unknown;
  try {
    await runMophSynchronization(probe.pool, {
      now: () => new Date(fixedTime),
      mophClient: fakeMophClient(probe.state),
      runMode: "manual",
      approvalProvider: async () => { seen += 1; return approved; },
    });
  } catch (caught) {
    error = caught;
  }
  assert.equal(seen, 1);
  assert.equal(probe.writingAttempts.length, 1);
  assert.equal(probe.state.fetchedSources, 0);
  assert.equal(probe.state.lockAcquired, 1);
  assert.equal(probe.state.lockReleased, 1);
  assert.equal(probe.state.clientReleased, 1);
  assert.ok(error instanceof Error);
  assert.equal(error.message, INSERT_PROBE);
});

test("T006 RED: a fiscal calendar rollover never authorizes a prior-year run", async () => {
  const probe = createSqlProbe();
  const error = await observeAttempt(probe);

  // Fixed clock is Oct 12, 2026 (Thai FY2570); app_settings remains FY2569.
  assert.equal(fixedTime.getUTCFullYear(), 2026);
  assert.equal(probe.state.settings.currentYear, "2569");
  assert.equal(probe.state.settings.currentQuarter, 4);
  assert.equal(probe.writingAttempts.length, 0);
  assert.equal(probe.state.fetchedSources, 0);
  assert.ok(error instanceof Error);
  assert.match(error.message, /authoriz|approv|policy|target/i);
});
