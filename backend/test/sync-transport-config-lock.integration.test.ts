import assert from "node:assert/strict";
import test from "node:test";

import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";

import {
  runMigrations,
} from "../src/db/migrate.js";

import {
  loadSyncConfigSnapshot,
  SyncConfigError,
} from "../src/sync/config.js";

import {
  runMophSynchronization,
} from "../src/sync/orchestrator.js";

import type {
  MophClient,
} from "../src/sync/moph-client.js";

import {
  SyncLockUnavailableError,
  withSyncSessionLock,
} from "../src/sync/lock.js";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL?.trim();

const destructiveAllowed =
  process.env
    .PA_ALLOW_DESTRUCTIVE_DB_TESTS ===
  "YES";

const skipReason =
  testDatabaseUrl === undefined ||
  testDatabaseUrl.length === 0
    ? "TEST_DATABASE_URL not set"
    : !destructiveAllowed
      ? "PA_ALLOW_DESTRUCTIVE_DB_TESTS is not YES"
      : false;

interface CountRow
  extends QueryResultRow {
  readonly count: number;
}

interface VersionRow
  extends QueryResultRow {
  readonly version: string;
}

interface StateRow
  extends QueryResultRow {
  readonly row: string;
}

async function resetPublicSchema(
  pool: Pool,
): Promise<void> {
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE
  `);

  await pool.query(`
    CREATE SCHEMA public
  `);
}

async function loadSnapshot(
  pool: Pool,
) {
  const client =
    await pool.connect();

  try {
    return await
      loadSyncConfigSnapshot(
        client,
      );
  } finally {
    client.release();
  }
}

async function countSyncRuns(
  pool: Pool,
): Promise<number> {
  const result =
    await pool.query<CountRow>(`
      SELECT
        COUNT(*)::INTEGER AS count
      FROM sync_runs
    `);

  return (
    result.rows[0]?.count ??
    -1
  );
}

async function readState(
  pool: Pool,
): Promise<{
  readonly settings:
    readonly string[];
  readonly definitions:
    readonly string[];
  readonly syncRuns: number;
}> {
  const settings =
    await pool.query<StateRow>(`
      SELECT
        row_to_json(s)::TEXT AS row
      FROM (
        SELECT *
        FROM app_settings
        ORDER BY key
      ) AS s
    `);

  const definitions =
    await pool.query<StateRow>(`
      SELECT
        row_to_json(d)::TEXT AS row
      FROM (
        SELECT *
        FROM kpi_definitions
        ORDER BY id
      ) AS d
    `);

  return {
    settings:
      settings.rows.map(
        (row) => row.row,
      ),

    definitions:
      definitions.rows.map(
        (row) => row.row,
      ),

    syncRuns:
      await countSyncRuns(
        pool,
      ),
  };
}

function deferred():
  {
    readonly promise:
      Promise<void>;

    resolve():
      void;
  } {
  let resolvePromise:
    (() => void) |
    undefined;

  const promise =
    new Promise<void>(
      (resolve) => {
        resolvePromise =
          resolve;
      },
    );

  return {
    promise,

    resolve:
      () => {
        if (
          resolvePromise ===
          undefined
        ) {
          throw new Error(
            "Deferred resolver unavailable",
          );
        }

        resolvePromise();
      },
  };
}

async function withRollback(
  pool: Pool,
  action:
    (
      client: PoolClient,
    ) => Promise<void>,
): Promise<void> {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    await action(
      client,
    );
  } finally {
    await client.query(
      "ROLLBACK",
    );

    client.release();
  }
}

test(
  "T002A synchronization transport/config/lock PostgreSQL contract",
  {
    skip: skipReason,
  },

  async (t) => {
    assert.ok(
      testDatabaseUrl !==
      undefined,
    );

    const pool =
      new Pool({
        connectionString:
          testDatabaseUrl,

        max: 8,
      });

    try {
      await resetPublicSchema(
        pool,
      );

      await t.test(
        "migrations 0001 through 0005 apply",
        async () => {
          const summary =
            await runMigrations(
              pool,
            );

          assert.deepEqual(
            summary.applied,
            [
              "0001",
              "0002",
              "0003",
              "0004",
              "0005",
            ],
          );

          assert.deepEqual(
            summary.skipped,
            [],
          );

          const versions =
            await pool.query<VersionRow>(`
              SELECT version
              FROM schema_migrations
              ORDER BY version
            `);

          assert.deepEqual(
            versions.rows.map(
              (row) =>
                row.version,
            ),
            [
              "0001",
              "0002",
              "0003",
              "0004",
              "0005",
            ],
          );
        },
      );

      await t.test(
        "seeded synchronization config loads exact 52-definition authority",
        async () => {
          const snapshot =
            await loadSnapshot(
              pool,
            );

          assert.equal(
            snapshot.currentYear,
            "2569",
          );

          assert.equal(
            snapshot.fiscalYear,
            2569,
          );

          assert.equal(
            snapshot.provinceCode,
            "54",
          );

          assert.equal(
            snapshot.currentQuarter,
            4,
          );

          assert.equal(
            snapshot.definitions.length,
            52,
          );

          assert.equal(
            snapshot.physicalDefinitions.length,
            18,
          );

          assert.equal(
            snapshot.virtualDefinitions.length,
            34,
          );

          assert.equal(
            snapshot.sourceOnlyDefinitions.length,
            5,
          );

          assert.deepEqual(
            snapshot
              .physicalDefinitions
              .map(
                (definition) =>
                  definition.kpiKey,
              ),
            [
              "s_kpi_anc12",
              "s_anc5",
              "s_kpi_food",
              "s_kpi_childdev4",
              "s_kpi_childdev2",
              "s_aged9",
              "s_dm_screen",
              "s_ht_screen",
              "s_ncd_screen_repleate1",
              "s_ht_screen_follow",
              "s_dental_0_5_cavity_free",
              "s_kpi_dental28",
              "s_kpi_dental33",
              "s_epi1",
              "s_epi2",
              "s_epi3",
              "s_epi5",
              "s_epi_complete",
            ],
          );

          assert.deepEqual(
            snapshot
              .sourceOnlyDefinitions
              .map(
                (definition) =>
                  definition.kpiKey,
              ),
            [
              "s_epi1",
              "s_epi2",
              "s_epi3",
              "s_epi5",
              "s_epi_complete",
            ],
          );

          const epiComplete =
            snapshot
              .physicalDefinitions
              .find(
                (definition) =>
                  definition.kpiKey ===
                  "s_epi_complete",
              );

          assert.equal(
            epiComplete?.sourceLimit,
            5000,
          );

          for (
            const key of [
              "s_kpi_childdev4",
              "s_kpi_childdev2",
            ]
          ) {
            const definition =
              snapshot.definitions.find(
                (item) =>
                  item.kpiKey ===
                  key,
              );

            assert.equal(
              definition?.targetMonths,
              9,
            );

            assert.equal(
              definition?.effectiveQuarter,
              3,
            );
          }

          assert.equal(
            Object.isFrozen(
              snapshot,
            ),
            true,
          );

          assert.equal(
            Object.isFrozen(
              snapshot.definitions,
            ),
            true,
          );
        },
      );

      await t.test(
        "sync preflight enforces percentage target 0..100 without creating runs",

        async () => {
          const before = await countSyncRuns(pool);

          for (const target of [
            { value: null, expected: null },
            { value: "0", expected: 0 },
            { value: "85", expected: 85 },
            { value: "100", expected: 100 },
            { value: "-5", expected: undefined },
            { value: "150", expected: undefined },
          ]) {
            await withRollback(
              pool,
              async (client) => {
                const update = await client.query(
                  `
                    UPDATE kpi_definitions
                    SET target_value = $1::NUMERIC
                    WHERE kpi_key = 's_kpi_anc12'
                  `,
                  [target.value],
                );
                assert.equal(update.rowCount, 1);

                if (target.expected === undefined) {
                  await assert.rejects(
                    () => loadSyncConfigSnapshot(client),
                    (error: unknown) =>
                      error instanceof SyncConfigError,
                  );
                } else {
                  const snapshot =
                    await loadSyncConfigSnapshot(client);
                  const targetDefinition =
                    snapshot.definitions.find(
                      (definition) =>
                        definition.kpiKey === "s_kpi_anc12",
                    );
                  assert.ok(targetDefinition);
                  assert.equal(
                    targetDefinition.targetValue,
                    target.expected,
                  );
                }
              },
            );
          }

          assert.equal(
            await countSyncRuns(pool),
            before,
            "Rejected configuration must not create a synchronization run",
          );
        },
      );

      await t.test(
        "sync orchestrator stops before run creation and source fetch on invalid target",

        async () => {
          const before = await countSyncRuns(pool);
          let fetchCount = 0;
          const fakeMoph: MophClient = {
            fetchSource: async () => {
              fetchCount += 1;
              return [];
            },
            waitBetweenSources: async () => {},
          };

          const original = await pool.query<{
            readonly target_value: string | null;
          }>(`
            SELECT target_value::TEXT AS target_value
            FROM kpi_definitions
            WHERE kpi_key = 's_kpi_anc12'
          `);
          assert.equal(original.rows.length, 1);

          try {
            await pool.query(`
              UPDATE kpi_definitions
              SET target_value = 150
              WHERE kpi_key = 's_kpi_anc12'
            `);

            await assert.rejects(
              () => runMophSynchronization(
                pool,
                { mophClient: fakeMoph },
              ),
              (error: unknown) => error instanceof SyncConfigError,
            );
            assert.equal(fetchCount, 0);
            assert.equal(await countSyncRuns(pool), before);
          } finally {
            await pool.query(
              `
                UPDATE kpi_definitions
                SET target_value = $1::NUMERIC
                WHERE kpi_key = 's_kpi_anc12'
              `,
              [original.rows[0]?.target_value],
            );
          }
        },
      );

      await t.test(
        "invalid required setting fails closed",
        async () => {
          await withRollback(
            pool,
            async (client) => {
              await client.query(
                `
                  UPDATE app_settings
                  SET value =
                    to_jsonb(
                      $1::TEXT
                    )
                  WHERE key =
                    'current_year'
                `,
                [
                  "20x9",
                ],
              );

              await assert.rejects(
                () =>
                  loadSyncConfigSnapshot(
                    client,
                  ),

                (
                  error: unknown,
                ) =>
                  error instanceof
                  SyncConfigError,
              );
            },
          );
        },
      );

      await t.test(
        "missing required setting fails closed",
        async () => {
          await withRollback(
            pool,
            async (client) => {
              await client.query(`
                DELETE FROM app_settings
                WHERE key =
                  'current_quarter'
              `);

              await assert.rejects(
                () =>
                  loadSyncConfigSnapshot(
                    client,
                  ),

                (
                  error: unknown,
                ) =>
                  error instanceof
                  SyncConfigError,
              );
            },
          );
        },
      );

      await t.test(
        "configuration snapshot read performs no database mutation",
        async () => {
          const before =
            await readState(
              pool,
            );

          await loadSnapshot(
            pool,
          );

          const after =
            await readState(
              pool,
            );

          assert.deepEqual(
            after,
            before,
          );
        },
      );

      await t.test(
        "session advisory lock rejects overlap without creating sync run",
        async () => {
          const entered =
            deferred();

          const releaseHolder =
            deferred();

          const holder =
            withSyncSessionLock(
              pool,
              async () => {
                entered.resolve();

                await (
                  releaseHolder.promise
                );

                return "holder";
              },
            );

          await entered.promise;

          await assert.rejects(
            () =>
              withSyncSessionLock(
                pool,
                async () =>
                  "overlap",
              ),

            (
              error: unknown,
            ) =>
              error instanceof
              SyncLockUnavailableError,
          );

          assert.equal(
            await countSyncRuns(
              pool,
            ),
            0,
          );

          releaseHolder.resolve();

          assert.equal(
            await holder,
            "holder",
          );

          assert.equal(
            await withSyncSessionLock(
              pool,
              async () =>
                "second",
            ),
            "second",
          );
        },
      );

      await t.test(
        "callback failure releases synchronization lock",
        async () => {
          await assert.rejects(
            () =>
              withSyncSessionLock(
                pool,
                async () => {
                  throw new Error(
                    "callback failure",
                  );
                },
              ),

            /callback failure/,
          );

          assert.equal(
            await withSyncSessionLock(
              pool,
              async () =>
                "recovered",
            ),
            "recovered",
          );

          assert.equal(
            await countSyncRuns(
              pool,
            ),
            0,
          );
        },
      );
    } finally {
      await pool.end();
    }
  },
);
