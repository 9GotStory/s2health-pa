import assert from "node:assert/strict";
import test from "node:test";

import {
  Pool,
  type QueryResultRow,
} from "pg";

import {
  runMigrations,
} from "../src/db/migrate.js";

import {
  loadSyncConfigSnapshot,
  type SyncConfigSnapshot,
} from "../src/sync/config.js";

import {
  MophTransportError,
  type MophClient,
  type MophRow,
  type MophSourceRequest,
} from "../src/sync/moph-client.js";

import {
  runMophSynchronization,
  SyncActivationError,
  SyncOrchestrationError,
} from "../src/sync/orchestrator.js";

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

function requireDefined<T>(
  value: T | undefined,
  context: string,
): T {
  if (value === undefined) {
    throw new Error(
      `Missing test fixture: ${context}`,
    );
  }

  return value;
}

interface SyncRunStateRow
  extends QueryResultRow {
  readonly id: string;
  readonly status: string;
  readonly completed_source_count: number;
  readonly failed_source_count: number;
  readonly finished_at: Date | null;
  readonly activated_at: Date | null;
  readonly error_summary:
    | Record<string, unknown>
    | null;
  readonly config_snapshot:
    Record<string, unknown>;
}

interface ActiveStateRow
  extends QueryResultRow {
  readonly active_sync_run_id:
    | string
    | null;
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
): Promise<SyncConfigSnapshot> {
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

async function readLatestSyncRun(
  pool: Pool,
): Promise<SyncRunStateRow> {
  const result =
    await pool.query<SyncRunStateRow>(`
      SELECT
        id::TEXT AS id,
        status,
        completed_source_count,
        failed_source_count,
        finished_at,
        activated_at,
        error_summary,
        config_snapshot
      FROM sync_runs
      ORDER BY id DESC
      LIMIT 1
    `);

  return requireDefined(
    result.rows[0],
    "latest sync run",
  );
}

async function readActiveSyncRunId(
  pool: Pool,
): Promise<string | null> {
  const result =
    await pool.query<ActiveStateRow>(`
      SELECT active_sync_run_id::TEXT
        AS active_sync_run_id
      FROM app_state
      WHERE singleton_id = 1
    `);

  return requireDefined(
    result.rows[0],
    "app_state singleton",
  ).active_sync_run_id;
}

async function countKpiResults(
  pool: Pool,
  syncRunId: string,
): Promise<number> {
  const result =
    await pool.query<{
      readonly count: number;
    }>(
      `
        SELECT
          COUNT(*)::INTEGER AS count
        FROM kpi_results
        WHERE sync_run_id = $1
      `,
      [
        syncRunId,
      ],
    );

  return requireDefined(
    result.rows[0],
    "kpi result count",
  ).count;
}

function createDeterministicClock():
  () => Date {
  let next =
    Date.parse(
      "2026-10-01T00:00:00.000Z",
    );

  return () => {
    next += 1000;

    return new Date(
      next,
    );
  };
}

interface FakeRowsOptions {
  readonly outsideDistrictSheets?:
    ReadonlySet<string>;

  readonly expandedSheet?: {
    readonly sheet: string;
    readonly rowCount: number;
  };
}

function buildFakeRowsBySheet(
  snapshot: SyncConfigSnapshot,
  options: FakeRowsOptions = {},
): Record<
  string,
  readonly MophRow[]
> {
  const sheetIndexByName =
    new Map<string, number>();

  snapshot.physicalDefinitions.forEach(
    (definition, index) => {
      sheetIndexByName.set(
        definition.sourceSheet,
        index,
      );
    },
  );

  const rowsBySheet =
    new Map<
      string,
      Record<string, unknown>[]
    >();

  for (
    const definition
    of snapshot
      .physicalDefinitions
  ) {
    rowsBySheet.set(
      definition.sourceSheet,
      [],
    );
  }

  const areacodeFor = (
    sheet: string,
  ): string => {
    const index =
      requireDefined(
        sheetIndexByName.get(
          sheet,
        ),
        `index for ${sheet}`,
      );

    const districtPrefix =
      options.outsideDistrictSheets?.has(
        sheet,
      ) === true
        ? "5499"
        : "5406";

    return `${districtPrefix}${String(
      index + 1,
    ).padStart(2, "0")}`;
  };

  const baseIdentity = (
    sheet: string,
  ): Record<string, unknown> => ({
    areacode:
      areacodeFor(sheet),
    hospcode: "06413",
    b_year:
      snapshot.fiscalYear,
    date_com: "20261001",
  });

  for (
    const definition
    of snapshot
      .physicalDefinitions
  ) {
    const list =
      requireDefined(
        rowsBySheet.get(
          definition.sourceSheet,
        ),
        definition.sourceSheet,
      );

    list.push(
      baseIdentity(
        definition.sourceSheet,
      ),
    );
  }

  for (
    const definition
    of snapshot.definitions
  ) {
    if (
      definition.sourceOnly ||
      definition.kind !==
        "physical"
    ) {
      continue;
    }

    const list =
      requireDefined(
        rowsBySheet.get(
          definition.sourceSheet,
        ),
        definition.sourceSheet,
      );

    for (const row of list) {
      row.target = 100;
      row.result = 60;
      row.a = 60;
      row.b = 100;

      if (
        definition.isQuarterly
      ) {
        const quarterCount =
          definition.effectiveQuarter ??
          snapshot.currentQuarter;

        for (
          let quarter = 1;
          quarter <=
          quarterCount;
          quarter += 1
        ) {
          row[
            `target${quarter}`
          ] = 10;
          row[
            `result${quarter}`
          ] = 6;
        }
      }
    }
  }

  const prefixesBySheet =
    new Map<
      string,
      Set<string>
    >();

  for (
    const definition
    of snapshot
      .virtualDefinitions
  ) {
    if (
      definition.valuePrefix ===
      null
    ) {
      continue;
    }

    const existing =
      prefixesBySheet.get(
        definition.sourceSheet,
      ) ??
      new Set<string>();

    existing.add(
      definition.valuePrefix,
    );

    prefixesBySheet.set(
      definition.sourceSheet,
      existing,
    );
  }

  for (
    const [
      sheet,
      prefixes,
    ] of prefixesBySheet
  ) {
    const list =
      requireDefined(
        rowsBySheet.get(
          sheet,
        ),
        sheet,
      );

    for (const row of list) {
      for (
        let month = 1;
        month <= 12;
        month += 1
      ) {
        const mm =
          String(
            month,
          ).padStart(2, "0");

        row[`target${mm}`] = 5;

        for (
          const valuePrefix
          of prefixes
        ) {
          row[
            `${valuePrefix}${mm}`
          ] = 3;
        }
      }
    }
  }

  const sourceIdsBySheet =
    new Map<
      string,
      Set<string>
    >();

  for (
    const definition
    of snapshot
      .virtualDefinitions
  ) {
    if (
      definition.sourceId ===
      null
    ) {
      continue;
    }

    const existing =
      sourceIdsBySheet.get(
        definition.sourceSheet,
      ) ??
      new Set<string>();

    existing.add(
      definition.sourceId,
    );

    sourceIdsBySheet.set(
      definition.sourceSheet,
      existing,
    );
  }

  for (
    const [
      sheet,
      sourceIds,
    ] of sourceIdsBySheet
  ) {
    const list =
      requireDefined(
        rowsBySheet.get(
          sheet,
        ),
        sheet,
      );

    for (
      const sourceId
      of [
        ...sourceIds,
      ].sort()
    ) {
      list.push(
        {
          ...baseIdentity(
            sheet,
          ),
          id: sourceId,
          target: 20,
          result: 10,
        },
      );
    }
  }

  if (
    options.expandedSheet !==
    undefined
  ) {
    const list =
      requireDefined(
        rowsBySheet.get(
          options.expandedSheet.sheet,
        ),
        options.expandedSheet.sheet,
      );

    const base =
      requireDefined(
        list[0],
        `${options.expandedSheet.sheet} base row`,
      );

    for (
      let extra = 1;
      extra <=
      options.expandedSheet.rowCount;
      extra += 1
    ) {
      list.push(
        {
          ...base,

          areacode: `5406${String(
            extra + 1,
          ).padStart(2, "0")}`,

          hospcode:
            String(
              extra,
            ).padStart(5, "0"),
        },
      );
    }
  }

  const frozen:
    Record<
      string,
      readonly MophRow[]
    > = {};

  for (
    const [
      sheet,
      list,
    ] of rowsBySheet
  ) {
    frozen[sheet] =
      Object.freeze(
        list.map(
          (row) =>
            Object.freeze({
              ...row,
            }),
        ),
      );
  }

  return frozen;
}

interface RecordedFetchRequest {
  readonly tableName: string;
  readonly year: string;
  readonly province: string;
  readonly limit: number | null;
}

interface FakeMophClientOptions {
  readonly rowsBySheet:
    Readonly<
      Record<
        string,
        readonly MophRow[]
      >
    >;

  readonly failingSheets?:
    ReadonlySet<string>;
}

function createFakeMophClient(
  options: FakeMophClientOptions,
): {
  readonly client: MophClient;
  readonly fetchRequests:
    readonly RecordedFetchRequest[];
  readonly eventLog:
    readonly string[];

  waitBetweenSourcesCount():
    number;
} {
  const fetchRequests:
    RecordedFetchRequest[] =
    [];

  const eventLog: string[] =
    [];

  let waitCount = 0;

  const client: MophClient =
    Object.freeze({
      async fetchSource(
        request: MophSourceRequest,
      ): Promise<
        readonly MophRow[]
      > {
        fetchRequests.push(
          {
            tableName:
              request.tableName,
            year:
              request.year,
            province:
              request.province,
            limit:
              request.limit ??
              null,
          },
        );

        eventLog.push(
          `fetch:${request.tableName}`,
        );

        if (
          options.failingSheets?.has(
            request.tableName,
          ) === true
        ) {
          throw new MophTransportError(
            `Injected fake transport failure for ${request.tableName}`,
          );
        }

        const rows =
          options.rowsBySheet[
            request.tableName
          ];

        assert.ok(
          rows !== undefined,
          `Fake MOPH rows are missing for ${request.tableName}`,
        );

        return rows;
      },

      async waitBetweenSources():
        Promise<void> {
        waitCount += 1;

        eventLog.push(
          "wait",
        );
      },
    });

  return Object.freeze({
    client,
    fetchRequests,
    eventLog,

    waitBetweenSourcesCount:
      () => waitCount,
  });
}

test(
  "T002C synchronization orchestrator PostgreSQL contract",
  {
    skip: skipReason,
  },

  async (t) => {
    assert.ok(
      testDatabaseUrl !==
        undefined,
    );

    assert.equal(
      process.env
        .PA_ALLOW_DESTRUCTIVE_DB_TESTS,
      "YES",
      "PA_ALLOW_DESTRUCTIVE_DB_TESTS=YES is required",
    );

    const parsed =
      new URL(
        testDatabaseUrl,
      );

    assert.ok(
      parsed.protocol ===
        "postgres:" ||
      parsed.protocol ===
        "postgresql:",
      "TEST_DATABASE_URL must use PostgreSQL",
    );

    const databaseName =
      decodeURIComponent(
        parsed.pathname.replace(
          /^\/+/,
          "",
        ),
      );

    assert.match(
      databaseName,
      /_test$/,
      "Destructive tests require a database name ending in _test",
    );

    const pool = new Pool({
      connectionString:
        testDatabaseUrl,

      max: 4,
    });

    try {
      await t.test(
        "runtime is PostgreSQL major 18",
        async () => {
          const result =
            await pool.query<{
              readonly server_version_num:
                string;
            }>(
              `
                SHOW server_version_num
              `,
            );

          const version =
            result.rows[0]
              ?.server_version_num;

          assert.ok(
            version,
          );

          assert.match(
            version,
            /^18\d{4}$/,
          );
        },
      );

      await resetPublicSchema(
        pool,
      );

      await t.test(
        "migrations 0001 through 0005 apply with the district scope setting",
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

          const scope =
            await pool.query<{
              readonly value:
                unknown;
            }>(
              `
                SELECT value
                FROM app_settings
                WHERE key =
                  'district_area_prefix'
              `,
            );

          assert.equal(
            scope.rows.length,
            1,
          );

          assert.equal(
            scope.rows[0]
              ?.value,
            "5406",
          );
        },
      );

      let activatedRunId:
        | string
        | null = null;

      await t.test(
        "success path fetches all physical sources sequentially and activates the full dataset",
        async () => {
          const snapshot =
            await loadSnapshot(
              pool,
            );

          const rowsBySheet =
            buildFakeRowsBySheet(
              snapshot,
            );

          const fake =
            createFakeMophClient(
              {
                rowsBySheet,
              },
            );

          const summary =
            await runMophSynchronization(
              pool,
              {
                mophClient:
                  fake.client,

                now:
                  createDeterministicClock(),
              },
            );

          assert.equal(
            summary.status,
            "succeeded",
          );

          assert.equal(
            summary.activated,
            true,
          );

          assert.equal(
            summary
              .completedSourceCount,
            18,
          );

          assert.equal(
            summary.resultCount,
            47,
          );

          assert.equal(
            fake
              .fetchRequests
              .length,
            18,
          );

          assert.deepEqual(
            fake.fetchRequests.map(
              (request) =>
                request.tableName,
            ),

            snapshot.physicalDefinitions.map(
              (definition) =>
                definition.sourceSheet,
            ),
          );

          const expectedEvents:
            string[] = [];

          snapshot.physicalDefinitions.forEach(
            (
              definition,
              index,
            ) => {
              expectedEvents.push(
                `fetch:${definition.sourceSheet}`,
              );

              if (
                index <
                17
              ) {
                expectedEvents.push(
                  "wait",
                );
              }
            },
          );

          assert.deepEqual(
            fake.eventLog,
            expectedEvents,
          );

          assert.equal(
            fake.waitBetweenSourcesCount(),
            17,
          );

          for (
            const [
              index,
              request,
            ] of fake
              .fetchRequests
              .entries()
          ) {
            assert.equal(
              request.year,
              snapshot
                .currentYear,
            );

            assert.equal(
              request.province,
              snapshot
                .provinceCode,
            );

            const definition =
              requireDefined(
                snapshot
                  .physicalDefinitions[
                  index
                ],
                `physical definition ${index}`,
              );

            assert.equal(
              request.limit,
              definition.sourceLimit,
            );
          }

          const run =
            await readLatestSyncRun(
              pool,
            );

          assert.equal(
            run.id,
            summary.syncRunId,
          );

          assert.equal(
            run.status,
            "succeeded",
          );

          assert.equal(
            run.completed_source_count,
            18,
          );

          assert.equal(
            run.failed_source_count,
            0,
          );

          assert.ok(
            run.finished_at,
          );

          assert.ok(
            run.activated_at,
          );

          assert.equal(
            run.error_summary,
            null,
          );

          assert.equal(
            run
              .config_snapshot
              .districtAreaPrefix,
            "5406",
          );

          assert.equal(
            run
              .config_snapshot
              .currentYear,
            snapshot
              .currentYear,
          );

          assert.equal(
            run
              .config_snapshot
              .provinceCode,
            snapshot
              .provinceCode,
          );

          assert.equal(
            run
              .config_snapshot
              .currentQuarter,
            snapshot
              .currentQuarter,
          );

          assert.equal(
            run
              .config_snapshot
              .definitionCount,
            52,
          );

          assert.equal(
            run
              .config_snapshot
              .physicalSourceCount,
            18,
          );

          const snapshotDefinitions =
            run
              .config_snapshot
              .definitions;

          assert.ok(
            Array.isArray(
              snapshotDefinitions,
            ),
          );

          assert.equal(
            snapshotDefinitions
              .length,
            52,
          );

          const persistedDefinitions =
            snapshotDefinitions as
              readonly Record<
                string,
                unknown
              >[];

          for (
            const definition
            of snapshot.definitions
          ) {
            const persisted =
              persistedDefinitions.find(
                (candidate) =>
                  candidate.id ===
                  definition.id,
              );

            assert.ok(
              persisted,
              `Missing persisted definition snapshot: ${definition.kpiKey}`,
            );

            assert.equal(
              persisted.targetValue,
              definition.targetValue,
              `Persisted targetValue drifted for ${definition.kpiKey}`,
            );
          }

          assert.equal(
            await readActiveSyncRunId(
              pool,
            ),
            summary.syncRunId,
          );

          activatedRunId =
            summary.syncRunId;

          const recordCounts =
            await pool.query<{
              readonly source_name:
                string;
              readonly row_count:
                number;
              readonly min_sequence:
                number;
              readonly max_sequence:
                number;
            }>(
              `
                SELECT
                  source_name,
                  COUNT(*)::INTEGER
                    AS row_count,
                  MIN(source_sequence)::INTEGER
                    AS min_sequence,
                  MAX(source_sequence)::INTEGER
                    AS max_sequence
                FROM source_records
                WHERE sync_run_id = $1
                GROUP BY source_name
                ORDER BY source_name
              `,
              [
                summary.syncRunId,
              ],
            );

          assert.equal(
            recordCounts
              .rows
              .length,
            18,
          );

          for (
            const row
            of recordCounts
              .rows
          ) {
            assert.equal(
              row.min_sequence,
              1,
            );

            assert.equal(
              row.max_sequence,
              row.row_count,
            );

            const expected =
              requireDefined(
                rowsBySheet[
                  row.source_name
                ],
                row.source_name,
              );

            assert.equal(
              row.row_count,
              expected.length,
            );
          }

          const probeSheet =
            requireDefined(
              snapshot
                .physicalDefinitions[13],
              "physical definition 13",
            ).sourceSheet;

          const probeRows =
            await pool.query<{
              readonly source_sequence:
                number;
              readonly hospcode:
                | string
                | null;
              readonly areacode:
                | string
                | null;
              readonly b_year:
                | number
                | null;
              readonly target:
                | string
                | null;
              readonly result:
                | string
                | null;
              readonly raw_payload:
                Record<
                  string,
                  unknown
                >;
            }>(
              `
                SELECT
                  source_sequence,
                  hospcode,
                  areacode,
                  b_year,
                  target,
                  result,
                  raw_payload
                FROM source_records
                WHERE sync_run_id = $1
                  AND source_name = $2
                ORDER BY source_sequence
              `,
              [
                summary.syncRunId,
                probeSheet,
              ],
            );

          const expectedProbe =
            rowsBySheet[
              probeSheet
            ] ?? [];

          assert.equal(
            probeRows
              .rows
              .length,
            expectedProbe.length,
          );

          probeRows.rows.forEach(
            (
              row,
              index,
            ) => {
              const expected =
                requireDefined(
                  expectedProbe[
                    index
                  ],
                  `${probeSheet} row ${index}`,
                );

              assert.deepEqual(
                row.raw_payload,
                {
                  ...expected,
                },
              );

              assert.equal(
                row.hospcode,
                "06413",
              );

              assert.equal(
                row.areacode,
                String(
                  expected.areacode,
                ),
              );

              assert.equal(
                row.b_year,
                snapshot
                  .fiscalYear,
              );

              assert.equal(
                row.target,
                null,
              );

              assert.equal(
                row.result,
                null,
              );
            },
          );

          const resultStats =
            await pool.query<{
              readonly total:
                number;
              readonly distinct_definitions:
                number;
              readonly complete_rows:
                number;
            }>(
              `
                SELECT
                  COUNT(*)::INTEGER
                    AS total,
                  COUNT(
                    DISTINCT kpi_definition_id
                  )::INTEGER
                    AS distinct_definitions,
                  COUNT(*) FILTER (
                    WHERE details =
                      '{}'::JSONB
                      AND calculated_at
                        IS NOT NULL
                  )::INTEGER
                    AS complete_rows
                FROM kpi_results
                WHERE sync_run_id = $1
              `,
              [
                summary.syncRunId,
              ],
            );

          assert.equal(
            resultStats
              .rows[0]
              ?.total,
            summary.resultCount,
          );

          assert.equal(
            resultStats
              .rows[0]
              ?.distinct_definitions,
            47,
          );

          assert.equal(
            resultStats
              .rows[0]
              ?.complete_rows,
            47,
          );

          const periods =
            await pool.query<{
              readonly period_code:
                string;
              readonly count:
                number;
            }>(
              `
                SELECT
                  period_code,
                  COUNT(*)::INTEGER
                    AS count
                FROM kpi_results
                WHERE sync_run_id = $1
                GROUP BY period_code
                ORDER BY period_code
              `,
              [
                summary.syncRunId,
              ],
            );

          assert.deepEqual(
            periods.rows,
            [
              {
                period_code:
                  "annual",
                count: 43,
              },
              {
                period_code:
                  "q3",
                count: 2,
              },
              {
                period_code:
                  "q4",
                count: 2,
              },
            ],
          );
        },
      );

      await t.test(
        "source failure fails closed while preserving evidence and the active dataset",
        async () => {
          const snapshot =
            await loadSnapshot(
              pool,
            );

          const failingDefinition =
            requireDefined(
              snapshot
                .physicalDefinitions[1],
              "physical definition 1",
            );

          const rowsBySheet =
            buildFakeRowsBySheet(
              snapshot,
            );

          const fake =
            createFakeMophClient(
              {
                rowsBySheet,

                failingSheets:
                  new Set(
                    [
                      failingDefinition.sourceSheet,
                    ],
                  ),
              },
            );

          await assert.rejects(
            () =>
              runMophSynchronization(
                pool,
                {
                  mophClient:
                    fake.client,

                  now:
                    createDeterministicClock(),
                },
              ),

            (
              error: unknown,
            ) =>
              error instanceof
              SyncOrchestrationError,
          );

          assert.equal(
            fake
              .fetchRequests
              .length,
            18,
          );

          assert.equal(
            fake.waitBetweenSourcesCount(),
            17,
          );

          const run =
            await readLatestSyncRun(
              pool,
            );

          assert.equal(
            run.status,
            "failed",
          );

          assert.equal(
            run.completed_source_count,
            17,
          );

          assert.equal(
            run.failed_source_count,
            1,
          );

          assert.ok(
            run.finished_at,
          );

          assert.equal(
            run.activated_at,
            null,
          );

          const errorSummary =
            run.error_summary;

          assert.ok(
            errorSummary,
          );

          assert.equal(
            errorSummary.phase,
            "sources",
          );

          const sources =
            errorSummary.sources;

          assert.ok(
            Array.isArray(
              sources,
            ),
          );

          assert.equal(
            sources.length,
            1,
          );

          const failure =
            requireDefined(
              sources[0],
              "source failure evidence",
            ) as Record<
              string,
              unknown
            >;

          assert.equal(
            failure.sourceName,
            failingDefinition.sourceSheet,
          );

          assert.equal(
            failure.errorName,
            "MophTransportError",
          );

          assert.ok(
            typeof failure.message ===
              "string",
          );

          assert.ok(
            (failure.message as string)
              .length > 0,
          );

          assert.ok(
            (failure.message as string)
              .length <= 500,
          );

          const serialized =
            JSON.stringify(
              errorSummary,
            );

          for (
            const forbidden
            of [
              '"stack"',
              '"cause"',
              '"raw_payload"',
              '"credentials"',
              '"TEST_DATABASE_URL"',
            ]
          ) {
            assert.equal(
              serialized.includes(
                forbidden,
              ),
              false,

              `error_summary must not contain ${forbidden}`,
            );
          }

          const persistedSources =
            await pool.query<{
              readonly source_name:
                string;
            }>(
              `
                SELECT
                  DISTINCT source_name
                FROM source_records
                WHERE sync_run_id = $1
                ORDER BY source_name
              `,
              [
                run.id,
              ],
            );

          assert.equal(
            persistedSources
              .rows
              .length,
            17,
          );

          assert.equal(
            persistedSources.rows.some(
              (row) =>
                row.source_name ===
                failingDefinition.sourceSheet,
            ),
            false,
          );

          assert.equal(
            await countKpiResults(
              pool,
              run.id,
            ),
            0,
          );

          assert.equal(
            await readActiveSyncRunId(
              pool,
            ),
            activatedRunId,
          );
        },
      );

      await t.test(
        "calculation failure keeps source evidence and blocks activation",
        async () => {
          const snapshot =
            await loadSnapshot(
              pool,
            );

          const victim =
            requireDefined(
              snapshot
                .physicalDefinitions[0],
              "physical definition 0",
            );

          const rowsBySheet =
            buildFakeRowsBySheet(
              snapshot,
              {
                outsideDistrictSheets:
                  new Set(
                    [
                      victim.sourceSheet,
                    ],
                  ),
              },
            );

          const fake =
            createFakeMophClient(
              {
                rowsBySheet,
              },
            );

          await assert.rejects(
            () =>
              runMophSynchronization(
                pool,
                {
                  mophClient:
                    fake.client,

                  now:
                    createDeterministicClock(),
                },
              ),

            (
              error: unknown,
            ) =>
              error instanceof
              SyncOrchestrationError,
          );

          assert.equal(
            fake
              .fetchRequests
              .length,
            18,
          );

          assert.equal(
            fake.waitBetweenSourcesCount(),
            17,
          );

          const run =
            await readLatestSyncRun(
              pool,
            );

          assert.equal(
            run.status,
            "failed",
          );

          assert.equal(
            run.completed_source_count,
            18,
          );

          assert.equal(
            run.failed_source_count,
            0,
          );

          assert.ok(
            run.finished_at,
          );

          assert.equal(
            run.activated_at,
            null,
          );

          const errorSummary =
            run.error_summary;

          assert.ok(
            errorSummary,
          );

          assert.equal(
            errorSummary.phase,
            "calculation",
          );

          assert.ok(
            typeof errorSummary.message ===
              "string",
          );

          assert.ok(
            String(
              errorSummary.message,
            ).length <= 500,
          );

          const persistedSources =
            await pool.query<{
              readonly count:
                number;
            }>(
              `
                SELECT
                  COUNT(
                    DISTINCT source_name
                  )::INTEGER
                    AS count
                FROM source_records
                WHERE sync_run_id = $1
              `,
              [
                run.id,
              ],
            );

          assert.equal(
            persistedSources
              .rows[0]
              ?.count,
            18,
          );

          assert.equal(
            await countKpiResults(
              pool,
              run.id,
            ),
            0,
          );

          assert.equal(
            await readActiveSyncRunId(
              pool,
            ),
            activatedRunId,
          );
        },
      );

      await t.test(
        "activation rollback preserves the previous active dataset",
        async () => {
          await pool.query(`
            CREATE FUNCTION pa_test_activation_fault()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $fn$
            BEGIN
              RAISE EXCEPTION
                'injected activation test fault';
            END;
            $fn$
          `);

          try {
            await pool.query(`
              CREATE TRIGGER trg_pa_test_activation_fault
              BEFORE UPDATE
              ON sync_runs
              FOR EACH ROW
              WHEN (
                NEW.activated_at IS NOT NULL
                AND OLD.activated_at IS NULL
              )
              EXECUTE FUNCTION
                pa_test_activation_fault()
            `);

            const snapshot =
              await loadSnapshot(
                pool,
              );

            const rowsBySheet =
              buildFakeRowsBySheet(
                snapshot,
              );

            const fake =
              createFakeMophClient(
                {
                  rowsBySheet,
                },
              );

            await assert.rejects(
              () =>
                runMophSynchronization(
                  pool,
                  {
                    mophClient:
                      fake.client,

                    now:
                      createDeterministicClock(),
                  },
                ),

              (
                error: unknown,
              ) =>
                error instanceof
                SyncActivationError,
            );

            assert.equal(
              fake
                .fetchRequests
                .length,
              18,
            );

            assert.equal(
              fake.waitBetweenSourcesCount(),
              17,
            );

            const run =
              await readLatestSyncRun(
                pool,
              );

            assert.equal(
              run.status,
              "succeeded",
            );

            assert.equal(
              run.completed_source_count,
              18,
            );

            assert.equal(
              run.failed_source_count,
              0,
            );

            assert.ok(
              run.finished_at,
            );

            assert.equal(
              run.activated_at,
              null,
            );

            assert.equal(
              await countKpiResults(
                pool,
                run.id,
              ),
              47,
            );

            assert.equal(
              await readActiveSyncRunId(
                pool,
              ),
              activatedRunId,
            );
          } finally {
            await pool.query(`
              DROP TRIGGER IF EXISTS
                trg_pa_test_activation_fault
              ON sync_runs
            `);

            await pool.query(`
              DROP FUNCTION IF EXISTS
                pa_test_activation_fault()
            `);
          }
        },
      );

      await t.test(
        "multi-batch persistence crosses the 64-row boundary in one orchestration run",
        async () => {
          const snapshot =
            await loadSnapshot(
              pool,
            );

          const expandedDefinition =
            requireDefined(
              snapshot.physicalDefinitions.find(
                (definition) =>
                  !definition.sourceOnly,
              ),
              "first public physical definition",
            );

          const rowsBySheet =
            buildFakeRowsBySheet(
              snapshot,
              {
                expandedSheet: {
                  sheet:
                    expandedDefinition.sourceSheet,
                  rowCount: 70,
                },
              },
            );

          const expectedExpandedRows =
            requireDefined(
              rowsBySheet[
                expandedDefinition.sourceSheet
              ],
              expandedDefinition.sourceSheet,
            );

          assert.ok(
            expectedExpandedRows.length >
              64,
          );

          const fake =
            createFakeMophClient(
              {
                rowsBySheet,
              },
            );

          const summary =
            await runMophSynchronization(
              pool,
              {
                mophClient:
                  fake.client,

                now:
                  createDeterministicClock(),
              },
            );

          assert.equal(
            summary.status,
            "succeeded",
          );

          assert.equal(
            summary.activated,
            true,
          );

          assert.equal(
            summary
              .completedSourceCount,
            18,
          );

          assert.ok(
            summary.resultCount >
              64,
          );

          const expanded =
            await pool.query<{
              readonly row_count:
                number;
              readonly min_sequence:
                number;
              readonly max_sequence:
                number;
            }>(
              `
                SELECT
                  COUNT(*)::INTEGER
                    AS row_count,
                  MIN(source_sequence)::INTEGER
                    AS min_sequence,
                  MAX(source_sequence)::INTEGER
                    AS max_sequence
                FROM source_records
                WHERE sync_run_id = $1
                  AND source_name = $2
              `,
              [
                summary.syncRunId,
                expandedDefinition.sourceSheet,
              ],
            );

          const expandedStats =
            requireDefined(
              expanded.rows[0],
              "expanded source stats",
            );

          assert.ok(
            expandedStats.row_count >
              64,
          );

          assert.equal(
            expandedStats.row_count,
            expectedExpandedRows.length,
          );

          assert.equal(
            expandedStats.min_sequence,
            1,
          );

          assert.equal(
            expandedStats.max_sequence,
            expectedExpandedRows.length,
          );

          assert.equal(
            await countKpiResults(
              pool,
              summary.syncRunId,
            ),
            summary.resultCount,
          );

          const run =
            await readLatestSyncRun(
              pool,
            );

          assert.equal(
            run.id,
            summary.syncRunId,
          );

          assert.equal(
            run.status,
            "succeeded",
          );

          assert.equal(
            run.completed_source_count,
            18,
          );

          assert.equal(
            run.failed_source_count,
            0,
          );

          assert.ok(
            run.activated_at,
          );

          assert.equal(
            await readActiveSyncRunId(
              pool,
            ),
            summary.syncRunId,
          );
        },
      );
    } finally {
      try {
        await resetPublicSchema(
          pool,
        );
      } finally {
        await pool.end();
      }
    }
  },
);
