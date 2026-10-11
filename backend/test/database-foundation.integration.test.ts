import assert from "node:assert/strict";

import {
  appendFile,
  copyFile,
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
  resolve,
} from "node:path";

import test from "node:test";

import {
  Pool,
  type PoolClient,
} from "pg";

import {
  loadMigrations,
  MigrationChecksumError,
  runMigrations,
} from "../src/db/migrate.js";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL?.trim();

const skipReason =
  testDatabaseUrl === undefined ||
  testDatabaseUrl.length === 0
    ? "TEST_DATABASE_URL not set; runtime proof deferred to T005"
    : false;

function hasPgCode(
  error: unknown,
  expectedCode: string,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const pgError =
    error as Error & {
      readonly code?: string;
    };

  return pgError.code === expectedCode;
}

async function expectPgCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) =>
      hasPgCode(
        error,
        expectedCode,
      ),
  );
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

async function activateRun(
  pool: Pool,
  syncRunId: string,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        SELECT id
        FROM sync_runs
        WHERE id = $1
        FOR UPDATE
      `,
      [
        syncRunId,
      ],
    );

    await client.query(
      `
        SELECT singleton_id
        FROM app_state
        WHERE singleton_id = 1
        FOR UPDATE
      `,
    );

    await client.query(
      `
        UPDATE app_state
        SET
          active_sync_run_id = $1,
          updated_at = NOW()
        WHERE singleton_id = 1
      `,
      [
        syncRunId,
      ],
    );

    await client.query(
      `
        UPDATE sync_runs
        SET activated_at =
          COALESCE(
            activated_at,
            NOW()
          )
        WHERE id = $1
      `,
      [
        syncRunId,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function attemptRolledBackActivation(
  pool: Pool,
  syncRunId: string,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        SELECT id
        FROM sync_runs
        WHERE id = $1
        FOR UPDATE
      `,
      [
        syncRunId,
      ],
    );

    await client.query(
      `
        SELECT singleton_id
        FROM app_state
        WHERE singleton_id = 1
        FOR UPDATE
      `,
    );

    await client.query(
      `
        UPDATE app_state
        SET
          active_sync_run_id = $1,
          updated_at = NOW()
        WHERE singleton_id = 1
      `,
      [
        syncRunId,
      ],
    );

    await client.query(
      `
        UPDATE sync_runs
        SET activated_at = NOW()
        WHERE id = $1
      `,
      [
        syncRunId,
      ],
    );

    await client.query(`
      INSERT INTO app_state (
        singleton_id,
        active_sync_run_id,
        updated_at
      )
      VALUES (
        2,
        NULL,
        NOW()
      )
    `);

    throw new Error(
      "Expected singleton constraint failure",
    );
  } catch (error) {
    await client.query("ROLLBACK");

    if (
      hasPgCode(
        error,
        "23514",
      )
    ) {
      return;
    }

    throw error;
  } finally {
    client.release();
  }
}

async function createSyncRun(
  pool: Pool,
  options: {
    readonly status:
      | "running"
      | "succeeded"
      | "failed";
    readonly expected: number;
    readonly completed: number;
    readonly failed: number;
  },
): Promise<string> {
  const finishedAt =
    options.status === "running"
      ? null
      : new Date();

  const result =
    await pool.query<{
      readonly id: string;
    }>(
      `
        INSERT INTO sync_runs (
          status,
          province_code,
          fiscal_year,
          current_quarter,
          expected_source_count,
          completed_source_count,
          failed_source_count,
          config_snapshot,
          started_at,
          finished_at
        )
        VALUES (
          $1,
          '54',
          2569,
          1,
          $2,
          $3,
          $4,
          '{}'::JSONB,
          NOW(),
          $5
        )
        RETURNING id
      `,
      [
        options.status,
        options.expected,
        options.completed,
        options.failed,
        finishedAt,
      ],
    );

  const id = result.rows[0]?.id;

  assert.ok(id);

  return id;
}

test(
  "PostgreSQL 18 database foundation contract",
  {
    skip: skipReason,
  },
  async (t) => {
    if (!testDatabaseUrl) {
      throw new Error(
        "TEST_DATABASE_URL unexpectedly missing",
      );
    }

    assert.equal(
      process.env
        .PA_ALLOW_DESTRUCTIVE_DB_TESTS,
      "YES",
      "PA_ALLOW_DESTRUCTIVE_DB_TESTS=YES is required",
    );

    const parsed =
      new URL(testDatabaseUrl);

    assert.ok(
      parsed.protocol === "postgres:" ||
      parsed.protocol === "postgresql:",
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
      max: 2,
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

          assert.ok(version);

          assert.match(
            version,
            /^18\d{4}$/,
          );
        },
      );

      await resetPublicSchema(pool);

      await t.test(
        "target_months migration refuses multi-value arrays and rolls back",
        async () => {
          const directory =
            await mkdtemp(
              join(
                tmpdir(),
                "pa-dashboard-target-months-refusal-",
              ),
            );

          try {
            for (
              const filename
              of [
                "0001_database_foundation.sql",
                "0002_sync_run_lifecycle_guard.sql",
              ]
            ) {
              await copyFile(
                resolve(
                  "migrations",
                  filename,
                ),
                join(
                  directory,
                  filename,
                ),
              );
            }

            await resetPublicSchema(pool);

            const foundation =
              await runMigrations(
                pool,
                directory,
              );

            assert.deepEqual(
              foundation.applied,
              [
                "0001",
                "0002",
              ],
            );

            const category =
              await pool.query<{
                readonly id: string;
              }>(`
                INSERT INTO kpi_categories (
                  code,
                  name
                )
                VALUES (
                  'target-months-refusal',
                  'Target Months Refusal'
                )
                RETURNING id
              `);

            const categoryId =
              category.rows[0]?.id;

            assert.ok(categoryId);

            await pool.query(
              `
                INSERT INTO kpi_definitions (
                  kpi_key,
                  title,
                  category_id,
                  kind,
                  source_sheet,
                  target_months,
                  updated_at
                )
                VALUES (
                  'target-months.refusal',
                  'Target Months Refusal',
                  $1,
                  'physical',
                  's_refusal',
                  ARRAY[1, 2]::SMALLINT[],
                  NOW()
                )
              `,
              [
                categoryId,
              ],
            );

            await copyFile(
              resolve(
                "migrations",
                "0003_kpi_target_months_scalar.sql",
              ),
              join(
                directory,
                "0003_kpi_target_months_scalar.sql",
              ),
            );

            await assert.rejects(
              () =>
                runMigrations(
                  pool,
                  directory,
                ),
              (error: unknown) =>
                error instanceof Error &&
                error.message.includes(
                  "multi-value target_months arrays exist",
                ),
            );

            const schema =
              await pool.query<{
                readonly data_type: string;
                readonly udt_name: string;
                readonly is_nullable: string;
              }>(`
                SELECT
                  data_type,
                  udt_name,
                  is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'kpi_definitions'
                  AND column_name = 'target_months'
              `);

            assert.equal(
              schema.rows[0]?.data_type,
              "ARRAY",
            );

            assert.equal(
              schema.rows[0]?.udt_name,
              "_int2",
            );

            assert.equal(
              schema.rows[0]?.is_nullable,
              "NO",
            );

            const preserved =
              await pool.query<{
                readonly target_months:
                  number[];
              }>(`
                SELECT target_months
                FROM kpi_definitions
                WHERE kpi_key =
                  'target-months.refusal'
              `);

            assert.deepEqual(
              preserved.rows[0]
                ?.target_months,
              [
                1,
                2,
              ],
            );

            const ledger =
              await pool.query<{
                readonly version: string;
              }>(`
                SELECT version
                FROM schema_migrations
                ORDER BY version
              `);

            assert.deepEqual(
              ledger.rows.map(
                (row) => row.version,
              ),
              [
                "0001",
                "0002",
              ],
            );
          } finally {
            await resetPublicSchema(pool);

            await rm(
              directory,
              {
                recursive: true,
                force: true,
              },
            );
          }
        },
      );

      await t.test(
        "target_months migration converts safe arrays and records checksum",
        async () => {
          const directory =
            await mkdtemp(
              join(
                tmpdir(),
                "pa-dashboard-target-months-conversion-",
              ),
            );

          try {
            for (
              const filename
              of [
                "0001_database_foundation.sql",
                "0002_sync_run_lifecycle_guard.sql",
              ]
            ) {
              await copyFile(
                resolve(
                  "migrations",
                  filename,
                ),
                join(
                  directory,
                  filename,
                ),
              );
            }

            await resetPublicSchema(pool);

            const foundation =
              await runMigrations(
                pool,
                directory,
              );

            assert.deepEqual(
              foundation.applied,
              [
                "0001",
                "0002",
              ],
            );

            const category =
              await pool.query<{
                readonly id: string;
              }>(`
                INSERT INTO kpi_categories (
                  code,
                  name
                )
                VALUES (
                  'target-months-conversion',
                  'Target Months Conversion'
                )
                RETURNING id
              `);

            const categoryId =
              category.rows[0]?.id;

            assert.ok(categoryId);

            await pool.query(
              `
                INSERT INTO kpi_definitions (
                  kpi_key,
                  title,
                  category_id,
                  kind,
                  source_sheet,
                  target_months,
                  updated_at
                )
                VALUES
                  (
                    'target-months.empty',
                    'Target Months Empty',
                    $1,
                    'physical',
                    's_empty',
                    ARRAY[]::SMALLINT[],
                    NOW()
                  ),
                  (
                    'target-months.single',
                    'Target Months Single',
                    $1,
                    'physical',
                    's_single',
                    ARRAY[9]::SMALLINT[],
                    NOW()
                  )
              `,
              [
                categoryId,
              ],
            );

            await copyFile(
              resolve(
                "migrations",
                "0003_kpi_target_months_scalar.sql",
              ),
              join(
                directory,
                "0003_kpi_target_months_scalar.sql",
              ),
            );

            const correction =
              await runMigrations(
                pool,
                directory,
              );

            assert.deepEqual(
              correction.applied,
              [
                "0003",
              ],
            );

            assert.deepEqual(
              correction.skipped,
              [
                "0001",
                "0002",
              ],
            );

            const converted =
              await pool.query<{
                readonly kpi_key: string;
                readonly target_months:
                  number | null;
              }>(`
                SELECT
                  kpi_key,
                  target_months
                FROM kpi_definitions
                WHERE kpi_key LIKE
                  'target-months.%'
                ORDER BY kpi_key
              `);

            assert.deepEqual(
              converted.rows,
              [
                {
                  kpi_key:
                    "target-months.empty",
                  target_months:
                    null,
                },
                {
                  kpi_key:
                    "target-months.single",
                  target_months:
                    9,
                },
              ],
            );

            const schema =
              await pool.query<{
                readonly data_type: string;
                readonly udt_name: string;
                readonly is_nullable: string;
                readonly column_default:
                  string | null;
              }>(`
                SELECT
                  data_type,
                  udt_name,
                  is_nullable,
                  column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'kpi_definitions'
                  AND column_name = 'target_months'
              `);

            assert.equal(
              schema.rows[0]?.data_type,
              "smallint",
            );

            assert.equal(
              schema.rows[0]?.udt_name,
              "int2",
            );

            assert.equal(
              schema.rows[0]?.is_nullable,
              "YES",
            );

            assert.equal(
              schema.rows[0]?.column_default,
              null,
            );

            const migrations =
              await loadMigrations(
                directory,
              );

            const migration =
              migrations.find(
                (candidate) =>
                  candidate.version ===
                  "0003",
              );

            assert.ok(migration);

            const ledger =
              await pool.query<{
                readonly checksum_sha256:
                  string;
              }>(
                `
                  SELECT checksum_sha256
                  FROM schema_migrations
                  WHERE version = '0003'
                `,
              );

            assert.equal(
              ledger.rows[0]
                ?.checksum_sha256,
              migration.checksumSha256,
            );

            const replay =
              await runMigrations(
                pool,
                directory,
              );

            assert.deepEqual(
              replay.applied,
              [],
            );

            assert.deepEqual(
              replay.skipped,
              [
                "0001",
                "0002",
                "0003",
              ],
            );
          } finally {
            await resetPublicSchema(pool);

            await rm(
              directory,
              {
                recursive: true,
                force: true,
              },
            );
          }
        },
      );

      await resetPublicSchema(pool);

      await t.test(
        "KPI registry seed refuses pre-existing authority collisions",
        async () => {
          const directory =
            await mkdtemp(
              join(
                tmpdir(),
                "pa-dashboard-seed-collision-",
              ),
            );

          try {
            for (
              const filename
              of [
                "0001_database_foundation.sql",
                "0002_sync_run_lifecycle_guard.sql",
                "0003_kpi_target_months_scalar.sql",
              ]
            ) {
              await copyFile(
                resolve(
                  "migrations",
                  filename,
                ),
                join(
                  directory,
                  filename,
                ),
              );
            }

            await resetPublicSchema(pool);

            const foundation =
              await runMigrations(
                pool,
                directory,
              );

            assert.deepEqual(
              foundation.applied,
              [
                "0001",
                "0002",
                "0003",
              ],
            );

            await pool.query(`
              INSERT INTO app_settings (
                key,
                value,
                updated_at
              )
              VALUES (
                'current_year',
                to_jsonb(
                  '9999'::TEXT
                ),
                NOW()
              )
            `);

            await copyFile(
              resolve(
                "migrations",
                "0004_kpi_registry_seed.sql",
              ),
              join(
                directory,
                "0004_kpi_registry_seed.sql",
              ),
            );

            await expectPgCode(
              () =>
                runMigrations(
                  pool,
                  directory,
                ),
              "23505",
            );

            const preserved =
              await pool.query<{
                readonly value: unknown;
              }>(`
                SELECT value
                FROM app_settings
                WHERE key =
                  'current_year'
              `);

            assert.deepEqual(
              preserved.rows[0]?.value,
              "9999",
            );

            const categories =
              await pool.query<{
                readonly count: number;
              }>(`
                SELECT
                  COUNT(*)::INTEGER
                    AS count
                FROM kpi_categories
              `);

            const definitions =
              await pool.query<{
                readonly count: number;
              }>(`
                SELECT
                  COUNT(*)::INTEGER
                    AS count
                FROM kpi_definitions
              `);

            assert.equal(
              categories.rows[0]?.count,
              0,
            );

            assert.equal(
              definitions.rows[0]?.count,
              0,
            );

            const ledger =
              await pool.query<{
                readonly version: string;
              }>(`
                SELECT version
                FROM schema_migrations
                ORDER BY version
              `);

            assert.deepEqual(
              ledger.rows.map(
                (row) => row.version,
              ),
              [
                "0001",
                "0002",
                "0003",
              ],
            );
          } finally {
            await resetPublicSchema(pool);

            await rm(
              directory,
              {
                recursive: true,
                force: true,
              },
            );
          }
        },
      );

      await resetPublicSchema(pool);

      await t.test(
        "clean migration applies and replay skips",
        async () => {
          const first =
            await runMigrations(pool);

          assert.deepEqual(
            first.applied,
            [
              "0001",
              "0002",
              "0003",
              "0004",
              "0005",
            ],
          );

          assert.deepEqual(
            first.skipped,
            [],
          );

          const second =
            await runMigrations(pool);

          assert.deepEqual(
            second.applied,
            [],
          );

          assert.deepEqual(
            second.skipped,
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
        "district scope setting is recorded by migration 0005 as JSON text",
        async () => {
          const ledger =
            await pool.query<{
              readonly version: string;
            }>(`
              SELECT version
              FROM schema_migrations
              ORDER BY version
            `);

          assert.deepEqual(
            ledger.rows.map(
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

          const scope =
            await pool.query<{
              readonly value: unknown;
            }>(`
              SELECT value
              FROM app_settings
              WHERE key =
                'district_area_prefix'
            `);

          assert.equal(
            scope.rows.length,
            1,
          );

          assert.equal(
            typeof scope
              .rows[0]
              ?.value,
            "string",
          );

          assert.equal(
            scope.rows[0]
              ?.value,
            "5406",
          );
        },
      );

      await t.test(
        "KPI/settings registry seed matches frozen 52-definition authority",
        async () => {
          const settingsResult =
            await pool.query<{
              readonly settings: unknown;
            }>(`
              SELECT
                jsonb_object_agg(
                  key,
                  value
                ) AS settings
              FROM app_settings
            `);

          assert.deepEqual(
            settingsResult.rows[0]
              ?.settings,
{
            "current_quarter": 4,
            "current_year": "2569",
            "district_area_prefix": "5406",
            "province_code": "54"
},
          );

          const categoriesResult =
            await pool.query<{
              readonly categories: unknown;
            }>(`
              SELECT
                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'code',
                        code,
                      'name',
                        name,
                      'sort_order',
                        sort_order,
                      'metadata',
                        metadata
                    )
                    ORDER BY
                      sort_order,
                      code
                  ),
                  '[]'::JSONB
                ) AS categories
              FROM kpi_categories
            `);

          assert.deepEqual(
            categoriesResult.rows[0]
              ?.categories,
[
            {
                        "code": "kpi_master",
                        "metadata": {},
                        "name": "ตัวชี้วัดพื้นฐาน",
                        "sort_order": 1
            },
            {
                        "code": "kpi_epi",
                        "metadata": {},
                        "name": "สร้างเสริมภูมิคุ้มกันโรค",
                        "sort_order": 2
            }
],
          );

          const counts =
            await pool.query<{
              readonly physical: number;
              readonly virtual: number;
              readonly total: number;
              readonly source_only: number;
            }>(`
              SELECT
                COUNT(*) FILTER (
                  WHERE kind =
                    'physical'
                )::INTEGER
                  AS physical,

                COUNT(*) FILTER (
                  WHERE kind =
                    'virtual'
                )::INTEGER
                  AS virtual,

                COUNT(*)::INTEGER
                  AS total,

                COUNT(*) FILTER (
                  WHERE metadata @>
                    '{"source_only":true}'::JSONB
                )::INTEGER
                  AS source_only
              FROM kpi_definitions
            `);

          assert.deepEqual(
            counts.rows[0],
            {
              physical: 18,
              virtual: 34,
              total: 52,
              source_only: 5,
            },
          );

          const definitionsResult =
            await pool.query<{
              readonly definitions: unknown;
            }>(`
              SELECT
                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'kpi_key',
                        definition.kpi_key,
                      'title',
                        definition.title,
                      'category',
                        category.code,
                      'kind',
                        definition.kind,
                      'source_sheet',
                        definition.source_sheet,
                      'source_id',
                        definition.source_id,
                      'value_prefix',
                        definition.value_prefix,
                      'subgroup',
                        definition.subgroup,
                      'link',
                        definition.link,
                      'target_value',
                        definition.target_value,
                      'is_quarterly',
                        definition.is_quarterly,
                      'target_months',
                        definition.target_months,
                      'effective_quarter',
                        definition.effective_quarter,
                      'sort_order',
                        definition.sort_order,
                      'is_active',
                        definition.is_active,
                      'metadata',
                        definition.metadata
                    )
                    ORDER BY
                      definition.sort_order,
                      definition.kpi_key
                  ),
                  '[]'::JSONB
                ) AS definitions
              FROM kpi_definitions
                AS definition
              JOIN kpi_categories
                AS category
                ON category.id =
                   definition.category_id
            `);

          assert.deepEqual(
            definitionsResult.rows[0]
              ?.definitions,
[
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_kpi_anc12",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/1c1b8e24aff59258a806f122e264031e",
                        "metadata": {},
                        "sort_order": 1,
                        "source_id": null,
                        "source_sheet": "s_kpi_anc12",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 75,
                        "title": "ร้อยละหญิงตั้งครรภ์ได้รับการฝากครรภ์ครั้งแรกก่อนหรือเท่ากับ 12 สัปดาห์",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_anc5",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/bd63b8d99f7054560fcf9c3b96f39c13",
                        "metadata": {},
                        "sort_order": 2,
                        "source_id": null,
                        "source_sheet": "s_anc5",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 75,
                        "title": "ร้อยละหญิงตั้งครรภ์ที่ได้รับการดูแลก่อนคลอด 5 ครั้ง ตามเกณฑ์",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_kpi_food",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/4164a7c49fcb2b8c3ccca67dcdf28bd0",
                        "metadata": {},
                        "sort_order": 3,
                        "source_id": null,
                        "source_sheet": "s_kpi_food",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 50,
                        "title": "ร้อยละของเด็กแรกเกิด - ต่ำกว่า 6 เดือน กินนมแม่อย่างเดียว",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": 3,
                        "is_active": true,
                        "is_quarterly": true,
                        "kind": "physical",
                        "kpi_key": "s_kpi_childdev4",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/1b60d68b1cb5b003fcba38a4a0e4027b",
                        "metadata": {},
                        "sort_order": 4,
                        "source_id": null,
                        "source_sheet": "s_kpi_childdev4",
                        "subgroup": null,
                        "target_months": 9,
                        "target_value": 87,
                        "title": "ร้อยละของเด็กอายุ 0-5 ปี ทั้งหมดตามช่วงอายุที่กำหนดมีพัฒนาการสมวัย",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": 3,
                        "is_active": true,
                        "is_quarterly": true,
                        "kind": "physical",
                        "kpi_key": "s_kpi_childdev2",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/684e99dc7538c8b1a97f19f91a100f08",
                        "metadata": {},
                        "sort_order": 5,
                        "source_id": null,
                        "source_sheet": "s_kpi_childdev2",
                        "subgroup": null,
                        "target_months": 9,
                        "target_value": 20,
                        "title": "ร้อยละของเด็กอายุ 0-5 ปี ที่ได้รับการคัดกรองพัฒนาการ พบสงสัยล่าช้า",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_aged9",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/aa86b13e8cb60cae6c3216b7e3e5f151",
                        "metadata": {},
                        "sort_order": 6,
                        "source_id": null,
                        "source_sheet": "s_aged9",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 80,
                        "title": "การคัดกรองผู้สูงอายุ 9 ด้าน",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_dm_screen",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/626c89f6b8d9f7ed90c72c719775eb07",
                        "metadata": {},
                        "sort_order": 7,
                        "source_id": null,
                        "source_sheet": "s_dm_screen",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 90,
                        "title": "ร้อยละของประชากรอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองเพื่อวินิจฉัยเบาหวาน",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_ht_screen",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/9702fa28cd2ec73ecc6af89d14f46874",
                        "metadata": {},
                        "sort_order": 8,
                        "source_id": null,
                        "source_sheet": "s_ht_screen",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 90,
                        "title": "ร้อยละของประชากรอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองเพื่อวินิจฉัยโรคความดันโลหิตสูง",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": true,
                        "kind": "physical",
                        "kpi_key": "s_ncd_screen_repleate1",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/e9e461e793e8258f47d46d6956f12832",
                        "metadata": {},
                        "sort_order": 9,
                        "source_id": null,
                        "source_sheet": "s_ncd_screen_repleate1",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 70,
                        "title": "ร้อยละการตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยโรคเบาหวาน",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": true,
                        "kind": "physical",
                        "kpi_key": "s_ht_screen_follow",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/b57439ff27302ade8c38d1dd189644a4",
                        "metadata": {},
                        "sort_order": 10,
                        "source_id": null,
                        "source_sheet": "s_ht_screen_follow",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 80,
                        "title": "ร้อยละการตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยโรคความดันโลหิตสูง",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_dental_0_5_cavity_free",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/abt2t2k4z4xeqzytwbave",
                        "metadata": {},
                        "sort_order": 11,
                        "source_id": null,
                        "source_sheet": "s_dental_0_5_cavity_free",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 80,
                        "title": "ร้อยละของเด็กอายุ 0-5 ปี ฟันดีไม่มีผุ",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_kpi_dental28",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/e07a6ff3cd63d34a759be4bff5c1a4c6",
                        "metadata": {},
                        "sort_order": 12,
                        "source_id": null,
                        "source_sheet": "s_kpi_dental28",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 25,
                        "title": "ร้อยละเด็ก 6 ปี ได้รับการเคลือบหลุมร่องฟันแท้",
                        "value_prefix": null
            },
            {
                        "category": "kpi_master",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_kpi_dental33",
                        "link": "https://hdc.moph.go.th/pre/public/standard-report-detail/1fb6b46f1d1fd42362f97072f4b3b653",
                        "metadata": {},
                        "sort_order": 13,
                        "source_id": null,
                        "source_sheet": "s_kpi_dental33",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": 50,
                        "title": "การตรวจช่องปากผู้สูงอายุโดยทันตบุคลากร",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_epi1",
                        "link": null,
                        "metadata": {
                                    "source_only": true
                        },
                        "sort_order": 14,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": null,
                        "title": "s_epi1",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_epi2",
                        "link": null,
                        "metadata": {
                                    "source_only": true
                        },
                        "sort_order": 15,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": null,
                        "title": "s_epi2",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_epi3",
                        "link": null,
                        "metadata": {
                                    "source_only": true
                        },
                        "sort_order": 16,
                        "source_id": null,
                        "source_sheet": "s_epi3",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": null,
                        "title": "s_epi3",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_epi5",
                        "link": null,
                        "metadata": {
                                    "source_only": true
                        },
                        "sort_order": 17,
                        "source_id": null,
                        "source_sheet": "s_epi5",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": null,
                        "title": "s_epi5",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "physical",
                        "kpi_key": "s_epi_complete",
                        "link": null,
                        "metadata": {
                                    "limit": 5000,
                                    "source_only": true
                        },
                        "sort_order": 18,
                        "source_id": null,
                        "source_sheet": "s_epi_complete",
                        "subgroup": null,
                        "target_months": null,
                        "target_value": null,
                        "title": "s_epi_complete",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__bcg",
                        "link": null,
                        "metadata": {},
                        "sort_order": 100,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน BCG",
                        "value_prefix": "bcg"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__dtp1",
                        "link": null,
                        "metadata": {},
                        "sort_order": 101,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน DTP1",
                        "value_prefix": "dtp1"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__dtp2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 102,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน DTP2",
                        "value_prefix": "dtp2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__dtp_hb3",
                        "link": null,
                        "metadata": {},
                        "sort_order": 103,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน DTP-HB3",
                        "value_prefix": "dtp_hb3"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hbv",
                        "link": null,
                        "metadata": {},
                        "sort_order": 104,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน HBV",
                        "value_prefix": "hbv"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hbv2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 105,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน HBV2",
                        "value_prefix": "hbv2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hbv3",
                        "link": null,
                        "metadata": {},
                        "sort_order": 106,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน HBV3",
                        "value_prefix": "hbv3"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hbv4",
                        "link": null,
                        "metadata": {},
                        "sort_order": 107,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน HBV4",
                        "value_prefix": "hbv4"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hib1",
                        "link": null,
                        "metadata": {},
                        "sort_order": 108,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน Hib1",
                        "value_prefix": "hib1"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hib2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 109,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน Hib2",
                        "value_prefix": "hib2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__hib3",
                        "link": null,
                        "metadata": {},
                        "sort_order": 110,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน Hib3",
                        "value_prefix": "hib3"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__ipv",
                        "link": null,
                        "metadata": {},
                        "sort_order": 111,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน IPV",
                        "value_prefix": "ipv"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__ipv1",
                        "link": null,
                        "metadata": {},
                        "sort_order": 112,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน IPV1",
                        "value_prefix": "ipv1"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__mmr",
                        "link": null,
                        "metadata": {},
                        "sort_order": 113,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน MMR",
                        "value_prefix": "mmr"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__opv3",
                        "link": null,
                        "metadata": {},
                        "sort_order": 114,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน OPV3",
                        "value_prefix": "opv3"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__pcv1",
                        "link": null,
                        "metadata": {},
                        "sort_order": 115,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน PCV1",
                        "value_prefix": "pcv1"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__pcv2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 116,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน PCV2",
                        "value_prefix": "pcv2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__pcv3",
                        "link": null,
                        "metadata": {},
                        "sort_order": 117,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน PCV3",
                        "value_prefix": "pcv3"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__rota",
                        "link": null,
                        "metadata": {},
                        "sort_order": 118,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน Rota",
                        "value_prefix": "rota"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi1__rota1",
                        "link": null,
                        "metadata": {},
                        "sort_order": 119,
                        "source_id": null,
                        "source_sheet": "s_epi1",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีน Rota1",
                        "value_prefix": "rota1"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi_complete__1y",
                        "link": null,
                        "metadata": {},
                        "sort_order": 120,
                        "source_id": "28dd2c7955ce926456240b2ff0100bde",
                        "source_sheet": "s_epi_complete",
                        "subgroup": "กลุ่มอายุ 1 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 1 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi2__dtp4",
                        "link": null,
                        "metadata": {},
                        "sort_order": 121,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีน DTP4",
                        "value_prefix": "dtp4"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi2__opv4",
                        "link": null,
                        "metadata": {},
                        "sort_order": 122,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีน OPV4",
                        "value_prefix": "opv4"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi2__mmr1",
                        "link": null,
                        "metadata": {},
                        "sort_order": 123,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีน MMR เข็มที่ 1",
                        "value_prefix": "mmr1"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi2__mmr2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 124,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีน MMR เข็มที่ 2",
                        "value_prefix": "mmr2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi2__je2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 125,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีน JE2",
                        "value_prefix": "je2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi2__pcv4",
                        "link": null,
                        "metadata": {},
                        "sort_order": 126,
                        "source_id": null,
                        "source_sheet": "s_epi2",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 95,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีน PCV4",
                        "value_prefix": "pcv4"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi_complete__2y",
                        "link": null,
                        "metadata": {},
                        "sort_order": 127,
                        "source_id": "35f4a8d465e6e1edc05f3d8ab658c551",
                        "source_sheet": "s_epi_complete",
                        "subgroup": "กลุ่มอายุ 2 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 2 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi3__je3",
                        "link": null,
                        "metadata": {},
                        "sort_order": 128,
                        "source_id": null,
                        "source_sheet": "s_epi3",
                        "subgroup": "กลุ่มอายุ 3 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 3 ปี ได้รับวัคซีน JE3",
                        "value_prefix": "je3"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi3__mmr2",
                        "link": null,
                        "metadata": {},
                        "sort_order": 129,
                        "source_id": null,
                        "source_sheet": "s_epi3",
                        "subgroup": "กลุ่มอายุ 3 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 3 ปี ได้รับวัคซีน MMR เข็มที่ 2",
                        "value_prefix": "mmr2"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi_complete__3y",
                        "link": null,
                        "metadata": {},
                        "sort_order": 130,
                        "source_id": "d1fe173d08e959397adf34b1d77e88d7",
                        "source_sheet": "s_epi_complete",
                        "subgroup": "กลุ่มอายุ 3 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 3 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)",
                        "value_prefix": null
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi5__dtp5",
                        "link": null,
                        "metadata": {},
                        "sort_order": 131,
                        "source_id": null,
                        "source_sheet": "s_epi5",
                        "subgroup": "กลุ่มอายุ 5 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 5 ปี ได้รับวัคซีน DTP5",
                        "value_prefix": "dtp5"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi5__opv5",
                        "link": null,
                        "metadata": {},
                        "sort_order": 132,
                        "source_id": null,
                        "source_sheet": "s_epi5",
                        "subgroup": "กลุ่มอายุ 5 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 5 ปี ได้รับวัคซีน OPV5",
                        "value_prefix": "opv5"
            },
            {
                        "category": "kpi_epi",
                        "effective_quarter": null,
                        "is_active": true,
                        "is_quarterly": false,
                        "kind": "virtual",
                        "kpi_key": "s_epi_complete__5y",
                        "link": null,
                        "metadata": {},
                        "sort_order": 133,
                        "source_id": "f033ab37c30201f73f142449d037028d",
                        "source_sheet": "s_epi_complete",
                        "subgroup": "กลุ่มอายุ 5 ปี",
                        "target_months": null,
                        "target_value": 90,
                        "title": "เด็กครบ 5 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)",
                        "value_prefix": null
            }
],
          );

          const migrations =
            await loadMigrations();

          const seedMigration =
            migrations.find(
              (migration) =>
                migration.version ===
                "0004",
            );

          assert.ok(seedMigration);

          const ledger =
            await pool.query<{
              readonly checksum_sha256:
                string;
            }>(`
              SELECT checksum_sha256
              FROM schema_migrations
              WHERE version = '0004'
            `);

          assert.equal(
            ledger.rows[0]
              ?.checksum_sha256,
            seedMigration.checksumSha256,
          );
        },
      );

      await t.test(
        "changed applied migration checksum is rejected",
        async () => {
          const directory =
            await mkdtemp(
              join(
                tmpdir(),
                "pa-dashboard-checksum-test-",
              ),
            );

          try {
            const source = resolve(
              "migrations",
              "0001_database_foundation.sql",
            );

            const target = join(
              directory,
              "0001_database_foundation.sql",
            );

            await copyFile(
              source,
              target,
            );

            await appendFile(
              target,
              "\n-- checksum drift probe\n",
              "utf8",
            );

            await assert.rejects(
              () =>
                runMigrations(
                  pool,
                  directory,
                ),
              MigrationChecksumError,
            );
          } finally {
            await rm(
              directory,
              {
                recursive: true,
                force: true,
              },
            );
          }
        },
      );

      await t.test(
        "schema contains exact foundation tables",
        async () => {
          const result =
            await pool.query<{
              readonly table_name: string;
            }>(
              `
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
              `,
            );

          const actual =
            result.rows.map(
              (row) => row.table_name,
            );

          const expected = [
            "app_settings",
            "app_state",
            "facilities",
            "kpi_categories",
            "kpi_definitions",
            "kpi_results",
            "schema_migrations",
            "source_records",
            "sync_runs",
            "tambons",
          ];

          assert.deepEqual(
            actual,
            expected,
          );
        },
      );

      await t.test(
        "critical named constraints exist",
        async () => {
          const result =
            await pool.query<{
              readonly conname: string;
            }>(
              `
                SELECT conname
                FROM pg_constraint
                WHERE connamespace =
                  'public'::regnamespace
              `,
            );

          const names =
            new Set(
              result.rows.map(
                (row) => row.conname,
              ),
            );

          const required = [
            "ck_app_state_singleton",
            "ck_kpi_definitions_effective_quarter",
            "ck_kpi_definitions_kind",
            "ck_kpi_definitions_target_months",
            "ck_kpi_results_period",
            "ck_source_records_raw_payload_object",
            "ck_source_records_sequence",
            "ck_sync_runs_counts_nonnegative",
            "ck_sync_runs_counts_within_expected",
            "ck_sync_runs_current_quarter",
            "ck_sync_runs_lifecycle",
            "ck_sync_runs_status",
            "fk_app_state_active_sync_run",
            "fk_facilities_tambon",
            "fk_kpi_definitions_category",
            "fk_kpi_results_definition",
            "fk_kpi_results_sync_run",
            "fk_source_records_sync_run",
            "uq_kpi_categories_code",
            "uq_kpi_definitions_key",
            "uq_kpi_results_logical",
            "uq_source_records_run_source_sequence",
          ];

          for (
            const name
            of required
          ) {
            assert.ok(
              names.has(name),
              `Missing constraint: ${name}`,
            );
          }
        },
      );

      await t.test(
        "minimal explicit index baseline exists",
        async () => {
          const result =
            await pool.query<{
              readonly indexname: string;
            }>(
              `
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
              `,
            );

          const names =
            new Set(
              result.rows.map(
                (row) => row.indexname,
              ),
            );

          const required = [
            "idx_facilities_tambon",
            "idx_kpi_definitions_category_sort",
            "idx_kpi_results_run_area",
            "idx_kpi_results_run_definition",
            "idx_kpi_results_run_facility",
            "idx_source_records_run_area",
            "idx_source_records_run_facility",
            "idx_source_records_run_source",
            "idx_sync_runs_status_started",
          ];

          for (
            const name
            of required
          ) {
            assert.ok(
              names.has(name),
              `Missing index: ${name}`,
            );
          }
        },
      );

      const categoryResult =
        await pool.query<{
          readonly id: string;
        }>(
          `
            INSERT INTO kpi_categories (
              code,
              name
            )
            VALUES (
              'foundation-test',
              'Foundation Test'
            )
            RETURNING id
          `,
        );

      const categoryId =
        categoryResult.rows[0]?.id;

      assert.ok(categoryId);

      await t.test(
        "target_months is nullable scalar constrained to 1 through 12",
        async () => {
          const schema =
            await pool.query<{
              readonly data_type: string;
              readonly udt_name: string;
              readonly is_nullable: string;
              readonly column_default:
                string | null;
            }>(`
              SELECT
                data_type,
                udt_name,
                is_nullable,
                column_default
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'kpi_definitions'
                AND column_name = 'target_months'
            `);

          assert.equal(
            schema.rows[0]?.data_type,
            "smallint",
          );

          assert.equal(
            schema.rows[0]?.udt_name,
            "int2",
          );

          assert.equal(
            schema.rows[0]?.is_nullable,
            "YES",
          );

          assert.equal(
            schema.rows[0]?.column_default,
            null,
          );

          const validValues:
            readonly [
              string,
              number | null,
            ][] = [
              [
                "null",
                null,
              ],
              [
                "one",
                1,
              ],
              [
                "nine",
                9,
              ],
              [
                "twelve",
                12,
              ],
            ];

          for (
            const [
              suffix,
              value,
            ]
            of validValues
          ) {
            await pool.query(
              `
                INSERT INTO kpi_definitions (
                  kpi_key,
                  title,
                  category_id,
                  kind,
                  source_sheet,
                  target_months,
                  updated_at
                )
                VALUES (
                  $1,
                  $2,
                  $3,
                  'physical',
                  $4,
                  $5,
                  NOW()
                )
              `,
              [
                `target-months.valid.${suffix}`,
                `Target Months Valid ${suffix}`,
                categoryId,
                `s_target_months_${suffix}`,
                value,
              ],
            );
          }

          for (
            const invalid
            of [
              0,
              13,
            ]
          ) {
            await expectPgCode(
              () =>
                pool.query(
                  `
                    INSERT INTO kpi_definitions (
                      kpi_key,
                      title,
                      category_id,
                      kind,
                      source_sheet,
                      target_months,
                      updated_at
                    )
                    VALUES (
                      $1,
                      'Invalid Target Months',
                      $2,
                      'physical',
                      's_invalid_target_months',
                      $3,
                      NOW()
                    )
                  `,
                  [
                    `target-months.invalid.${invalid}`,
                    categoryId,
                    invalid,
                  ],
                ),
              "23514",
            );
          }
        },
      );

      const definitionResult =
        await pool.query<{
          readonly id: string;
        }>(
          `
            INSERT INTO kpi_definitions (
              kpi_key,
              title,
              category_id,
              kind,
              source_sheet,
              target_months,
              updated_at
            )
            VALUES (
              'foundation.physical',
              'Foundation Physical KPI',
              $1,
              'physical',
              's_foundation',
              9,
              NOW()
            )
            RETURNING id
          `,
          [
            categoryId,
          ],
        );

      const definitionId =
        definitionResult.rows[0]?.id;

      assert.ok(definitionId);

      await t.test(
        "external codes preserve leading zeros",
        async () => {
          await pool.query(`
            INSERT INTO tambons (
              id,
              district_id,
              name_th,
              zip_code,
              updated_at
            )
            VALUES (
              '540601',
              '5406',
              'ทดสอบ',
              '54120',
              NOW()
            )
          `);

          await pool.query(`
            INSERT INTO facilities (
              hospcode,
              hospname,
              tambon_id,
              updated_at
            )
            VALUES (
              '06413',
              'Test Facility',
              '540601',
              NOW()
            )
          `);

          const result =
            await pool.query<{
              readonly hospcode: string;
              readonly tambon_id: string;
            }>(
              `
                SELECT
                  hospcode,
                  tambon_id
                FROM facilities
                WHERE hospcode = '06413'
              `,
            );

          assert.equal(
            result.rows[0]?.hospcode,
            "06413",
          );

          assert.equal(
            result.rows[0]?.tambon_id,
            "540601",
          );
        },
      );

      await t.test(
        "KPI definition constraints reject invalid values",
        async () => {
          await expectPgCode(
            () =>
              pool.query(
                `
                  INSERT INTO kpi_definitions (
                    kpi_key,
                    title,
                    category_id,
                    kind,
                    source_sheet,
                    updated_at
                  )
                  VALUES (
                    'invalid.kind',
                    'Invalid',
                    $1,
                    'unknown',
                    'probe',
                    NOW()
                  )
                `,
                [
                  categoryId,
                ],
              ),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  INSERT INTO kpi_definitions (
                    kpi_key,
                    title,
                    category_id,
                    kind,
                    source_sheet,
                    effective_quarter,
                    updated_at
                  )
                  VALUES (
                    'invalid.quarter',
                    'Invalid',
                    $1,
                    'physical',
                    'probe',
                    5,
                    NOW()
                  )
                `,
                [
                  categoryId,
                ],
              ),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  INSERT INTO kpi_definitions (
                    kpi_key,
                    title,
                    category_id,
                    kind,
                    source_sheet,
                    target_months,
                    updated_at
                  )
                  VALUES (
                    'invalid.month',
                    'Invalid',
                    $1,
                    'physical',
                    'probe',
                    13,
                    NOW()
                  )
                `,
                [
                  categoryId,
                ],
              ),
            "23514",
          );
        },
      );

      await t.test(
        "sync run constraints reject invalid state",
        async () => {
          await expectPgCode(
            () =>
              pool.query(`
                INSERT INTO sync_runs (
                  status,
                  province_code,
                  fiscal_year,
                  current_quarter,
                  expected_source_count,
                  config_snapshot,
                  started_at
                )
                VALUES (
                  'running',
                  '54',
                  2569,
                  5,
                  1,
                  '{}'::JSONB,
                  NOW()
                )
              `),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(`
                INSERT INTO sync_runs (
                  status,
                  province_code,
                  fiscal_year,
                  current_quarter,
                  expected_source_count,
                  completed_source_count,
                  config_snapshot,
                  started_at
                )
                VALUES (
                  'running',
                  '54',
                  2569,
                  1,
                  -1,
                  0,
                  '{}'::JSONB,
                  NOW()
                )
              `),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(`
                INSERT INTO sync_runs (
                  status,
                  province_code,
                  fiscal_year,
                  current_quarter,
                  expected_source_count,
                  completed_source_count,
                  failed_source_count,
                  config_snapshot,
                  started_at
                )
                VALUES (
                  'running',
                  '54',
                  2569,
                  1,
                  1,
                  1,
                  1,
                  '{}'::JSONB,
                  NOW()
                )
              `),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(`
                INSERT INTO sync_runs (
                  status,
                  province_code,
                  fiscal_year,
                  current_quarter,
                  expected_source_count,
                  completed_source_count,
                  failed_source_count,
                  config_snapshot,
                  started_at,
                  finished_at
                )
                VALUES (
                  'succeeded',
                  '54',
                  2569,
                  1,
                  2,
                  1,
                  0,
                  '{}'::JSONB,
                  NOW(),
                  NOW()
                )
              `),
            "23514",
          );
        },
      );

      const runningRunId =
        await createSyncRun(
          pool,
          {
            status: "running",
            expected: 2,
            completed: 0,
            failed: 0,
          },
        );

      await t.test(
        "source payload JSONB round-trips and row identity is sequence-based",
        async () => {
          const payload = {
            hospcode: "06413",
            areacode: "540601",
            target: 10,
            result: 7,
            extra_dynamic_field:
              "preserved",
          };

          await pool.query(
            `
              INSERT INTO source_records (
                sync_run_id,
                source_name,
                source_sequence,
                raw_payload
              )
              VALUES (
                $1,
                's_probe',
                1,
                $2::JSONB
              )
            `,
            [
              runningRunId,
              JSON.stringify(payload),
            ],
          );

          await pool.query(
            `
              INSERT INTO source_records (
                sync_run_id,
                source_name,
                source_sequence,
                raw_payload
              )
              VALUES (
                $1,
                's_probe',
                2,
                $2::JSONB
              )
            `,
            [
              runningRunId,
              JSON.stringify(payload),
            ],
          );

          const result =
            await pool.query<{
              readonly raw_payload:
                Record<string, unknown>;
            }>(
              `
                SELECT raw_payload
                FROM source_records
                WHERE sync_run_id = $1
                  AND source_name = 's_probe'
                  AND source_sequence = 1
              `,
              [
                runningRunId,
              ],
            );

          assert.deepEqual(
            result.rows[0]?.raw_payload,
            payload,
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  INSERT INTO source_records (
                    sync_run_id,
                    source_name,
                    source_sequence,
                    raw_payload
                  )
                  VALUES (
                    $1,
                    's_probe',
                    1,
                    '{}'::JSONB
                  )
                `,
                [
                  runningRunId,
                ],
              ),
            "23505",
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  INSERT INTO source_records (
                    sync_run_id,
                    source_name,
                    source_sequence,
                    raw_payload
                  )
                  VALUES (
                    $1,
                    's_bad_json',
                    1,
                    '[]'::JSONB
                  )
                `,
                [
                  runningRunId,
                ],
              ),
            "23514",
          );
        },
      );

      await t.test(
        "KPI result NULL logical identity is unique",
        async () => {
          await pool.query(
            `
              INSERT INTO kpi_results (
                sync_run_id,
                kpi_definition_id,
                fiscal_year,
                period_code,
                target,
                result,
                calculated_at
              )
              VALUES (
                $1,
                $2,
                2569,
                'annual',
                10,
                7,
                NOW()
              )
            `,
            [
              runningRunId,
              definitionId,
            ],
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  INSERT INTO kpi_results (
                    sync_run_id,
                    kpi_definition_id,
                    fiscal_year,
                    period_code,
                    target,
                    result,
                    calculated_at
                  )
                  VALUES (
                    $1,
                    $2,
                    2569,
                    'annual',
                    20,
                    8,
                    NOW()
                  )
                `,
                [
                  runningRunId,
                  definitionId,
                ],
              ),
            "23505",
          );
        },
      );

      await t.test(
        "app_state singleton starts inactive",
        async () => {
          const result =
            await pool.query<{
              readonly singleton_id: number;
              readonly active_sync_run_id:
                string | null;
            }>(
              `
                SELECT
                  singleton_id,
                  active_sync_run_id
                FROM app_state
              `,
            );

          assert.equal(
            result.rows.length,
            1,
          );

          assert.equal(
            result.rows[0]?.singleton_id,
            1,
          );

          assert.equal(
            result.rows[0]
              ?.active_sync_run_id,
            null,
          );

          await expectPgCode(
            () =>
              pool.query(`
                INSERT INTO app_state (
                  singleton_id,
                  active_sync_run_id,
                  updated_at
                )
                VALUES (
                  2,
                  NULL,
                  NOW()
                )
              `),
            "23514",
          );
        },
      );

      const failedRunId =
        await createSyncRun(
          pool,
          {
            status: "failed",
            expected: 1,
            completed: 0,
            failed: 1,
          },
        );

      const succeededRunA =
        await createSyncRun(
          pool,
          {
            status: "succeeded",
            expected: 1,
            completed: 1,
            failed: 0,
          },
        );

      const succeededRunB =
        await createSyncRun(
          pool,
          {
            status: "succeeded",
            expected: 1,
            completed: 1,
            failed: 0,
          },
        );

      await t.test(
        "failed run cannot return to running",
        async () => {
          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE sync_runs
                  SET
                    status = 'running',
                    failed_source_count = 0,
                    finished_at = NULL
                  WHERE id = $1
                `,
                [
                  failedRunId,
                ],
              ),
            "23514",
          );
        },
      );

      await t.test(
        "succeeded run cannot return to running",
        async () => {
          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE sync_runs
                  SET
                    status = 'running',
                    completed_source_count = 0,
                    finished_at = NULL
                  WHERE id = $1
                `,
                [
                  succeededRunA,
                ],
              ),
            "23514",
          );
        },
      );

      await t.test(
        "config snapshot cannot change",
        async () => {
          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE sync_runs
                  SET config_snapshot =
                    '{"mutated":true}'::JSONB
                  WHERE id = $1
                `,
                [
                  runningRunId,
                ],
              ),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE sync_runs
                  SET config_snapshot =
                    '{"mutated":true}'::JSONB
                  WHERE id = $1
                `,
                [
                  succeededRunA,
                ],
              ),
            "23514",
          );
        },
      );

      await t.test(
        "activated_at cannot be forged before activation",
        async () => {
          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE sync_runs
                  SET activated_at = NOW()
                  WHERE id = $1
                `,
                [
                  succeededRunA,
                ],
              ),
            "23514",
          );
        },
      );

      await t.test(
        "activation guard rejects ineligible runs",
        async () => {
          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE app_state
                  SET
                    active_sync_run_id = $1,
                    updated_at = NOW()
                  WHERE singleton_id = 1
                `,
                [
                  runningRunId,
                ],
              ),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE app_state
                  SET
                    active_sync_run_id = $1,
                    updated_at = NOW()
                  WHERE singleton_id = 1
                `,
                [
                  failedRunId,
                ],
              ),
            "23514",
          );

          await expectPgCode(
            () =>
              pool.query(`
                UPDATE app_state
                SET
                  active_sync_run_id = 999999999,
                  updated_at = NOW()
                WHERE singleton_id = 1
              `),
            "23503",
          );
        },
      );

      await t.test(
        "complete succeeded run activates",
        async () => {
          await activateRun(
            pool,
            succeededRunA,
          );

          const result =
            await pool.query<{
              readonly active_sync_run_id:
                string | null;
              readonly activated_at:
                Date | null;
            }>(
              `
                SELECT
                  s.active_sync_run_id,
                  r.activated_at
                FROM app_state AS s
                JOIN sync_runs AS r
                  ON r.id =
                    s.active_sync_run_id
                WHERE s.singleton_id = 1
              `,
            );

          assert.equal(
            result.rows[0]
              ?.active_sync_run_id,
            succeededRunA,
          );

          assert.ok(
            result.rows[0]
              ?.activated_at,
          );
        },
      );

      await t.test(
        "activated_at cannot be rewritten after activation",
        async () => {
          const before =
            await pool.query<{
              readonly activated_at:
                Date | null;
            }>(
              `
                SELECT activated_at
                FROM sync_runs
                WHERE id = $1
              `,
              [
                succeededRunA,
              ],
            );

          const activatedAt =
            before.rows[0]
              ?.activated_at;

          assert.ok(activatedAt);

          await expectPgCode(
            () =>
              pool.query(
                `
                  UPDATE sync_runs
                  SET activated_at =
                    activated_at
                    + INTERVAL '1 second'
                  WHERE id = $1
                `,
                [
                  succeededRunA,
                ],
              ),
            "23514",
          );

          const after =
            await pool.query<{
              readonly activated_at:
                Date | null;
            }>(
              `
                SELECT activated_at
                FROM sync_runs
                WHERE id = $1
              `,
              [
                succeededRunA,
              ],
            );

          assert.equal(
            after.rows[0]
              ?.activated_at?.getTime(),
            activatedAt.getTime(),
          );
        },
      );

      await t.test(
        "failed activation transaction preserves previous pointer",
        async () => {
          await attemptRolledBackActivation(
            pool,
            succeededRunB,
          );

          const state =
            await pool.query<{
              readonly active_sync_run_id:
                string | null;
            }>(
              `
                SELECT active_sync_run_id
                FROM app_state
                WHERE singleton_id = 1
              `,
            );

          assert.equal(
            state.rows[0]
              ?.active_sync_run_id,
            succeededRunA,
          );

          const run =
            await pool.query<{
              readonly activated_at:
                Date | null;
            }>(
              `
                SELECT activated_at
                FROM sync_runs
                WHERE id = $1
              `,
              [
                succeededRunB,
              ],
            );

          assert.equal(
            run.rows[0]?.activated_at,
            null,
          );
        },
      );

      await t.test(
        "pointer and activated_at commit together",
        async () => {
          await activateRun(
            pool,
            succeededRunB,
          );

          const result =
            await pool.query<{
              readonly active_sync_run_id:
                string | null;
              readonly activated_at:
                Date | null;
            }>(
              `
                SELECT
                  s.active_sync_run_id,
                  r.activated_at
                FROM app_state AS s
                JOIN sync_runs AS r
                  ON r.id =
                    s.active_sync_run_id
                WHERE s.singleton_id = 1
              `,
            );

          assert.equal(
            result.rows[0]
              ?.active_sync_run_id,
            succeededRunB,
          );

          assert.ok(
            result.rows[0]
              ?.activated_at,
          );
        },
      );
    } finally {
      try {
        await resetPublicSchema(pool);
      } finally {
        await pool.end();
      }
    }
  },
);
