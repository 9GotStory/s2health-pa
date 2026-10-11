import assert from "node:assert/strict";

import test from "node:test";

import {
  Pool,
} from "pg";

import {
  runMigrations,
} from "../src/db/migrate.js";

import {
  populateReferenceMasters,
} from "../src/reference/populate.js";

import type {
  ReferenceFetch,
} from "../src/reference/populate.js";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL?.trim();

const skipReason =
  testDatabaseUrl === undefined ||
  testDatabaseUrl.length === 0
    ? "TEST_DATABASE_URL not set; runtime proof deferred to authorized local PostgreSQL 18"
    : false;

const referenceSourceUrl =
  process.env.PA_REFERENCE_SOURCE_URL?.trim();

const externalFetchAllowed =
  process.env
    .PA_ALLOW_EXTERNAL_REFERENCE_FETCH ===
  "YES";

const liveSourceSkipReason =
  !externalFetchAllowed ||
  referenceSourceUrl === undefined ||
  referenceSourceUrl.length === 0
    ? "PA_REFERENCE_SOURCE_URL and PA_ALLOW_EXTERNAL_REFERENCE_FETCH=YES are required for the live legacy master source proof"
    : false;

const FAKE_SOURCE_URL =
  "https://script.google.com/macros/s/AKfycbIntegrationProbe4567/exec";

const FIRST_HOSPITALS = [
  {
    hospcode: "10702",
    hospname: "บ้านแป้น",
    tambon_id: "540602",
  },

  {
    hospcode: "06413",
    hospname: "บ้านหนุน",
    tambon_id: "540601",
  },
] as const;

const FIRST_TAMBONS = [
  {
    id: "540602",
    name_th: "บ้านแป้น",
    district_id: "5406",
    zip_code: null,
  },

  {
    id: "540601",
    name_th: "บ้านหนุน",
    district_id: "5406",
    zip_code: "54120",
  },
] as const;

const SECOND_HOSPITALS = [
  {
    hospcode: "06413",
    hospname: "บ้านหนุน",
    tambon_id: "540601",
  },
] as const;

const SECOND_TAMBONS = [
  {
    id: "540601",
    name_th: "บ้านหนุน",
    district_id: "5406",
    zip_code: "",
  },
] as const;

interface FakeSourceBehavior {
  readonly hospitals:
    readonly unknown[];

  readonly tambons:
    readonly unknown[];
}

function createFakeSource(
  behavior: FakeSourceBehavior,
) {
  const requests: string[] =
    [];

  const fetchImpl: ReferenceFetch =
    async (
      url,
      init,
    ) => {
      requests.push(
        `${init.method} ${url}`,
      );

      const payload = url.endsWith(
        "?sheet=hospitals",
      )
        ? behavior.hospitals
        : behavior.tambons;

      return {
        ok: true,
        status: 200,

        json:
          async () =>
            payload,
      };
    };

  return {
    fetchImpl,
    requests,
  };
}

interface TambonRow {
  readonly id: string;
  readonly district_id: string;
  readonly name_th: string;
  readonly zip_code:
    | string
    | null;
  readonly metadata: unknown;
  readonly updated_at: Date;
}

interface FacilityRow {
  readonly hospcode: string;
  readonly hospname: string;
  readonly tambon_id: string;
  readonly metadata: unknown;
  readonly updated_at: Date;
}

interface CountRow {
  readonly count: string;
}

async function countRows(
  pool: Pool,
  table: string,
): Promise<number> {
  const result =
    await pool.query<CountRow>(
      `
        SELECT COUNT(*)::TEXT AS count
        FROM ${table}
      `,
    );

  const count =
    result.rows[0]?.count;

  assert.ok(
    count !== undefined,
  );

  return Number(
    count,
  );
}

async function loadTambons(
  pool: Pool,
): Promise<
  readonly TambonRow[]
> {
  const result =
    await pool.query<TambonRow>(
      `
        SELECT
          id,
          district_id,
          name_th,
          zip_code,
          metadata,
          updated_at
        FROM tambons
        ORDER BY id
      `,
    );

  return result.rows;
}

async function loadFacilities(
  pool: Pool,
): Promise<
  readonly FacilityRow[]
> {
  const result =
    await pool.query<FacilityRow>(
      `
        SELECT
          hospcode,
          hospname,
          tambon_id,
          metadata,
          updated_at
        FROM facilities
        ORDER BY hospcode
      `,
    );

  return result.rows;
}

async function populateFakeSnapshot(
  pool: Pool,
  behavior: FakeSourceBehavior,
) {
  const source =
    createFakeSource(
      behavior,
    );

  const summary =
    await populateReferenceMasters(
      pool,

      {
        env: {
          PA_REFERENCE_SOURCE_URL:
            FAKE_SOURCE_URL,
        },

        fetch:
          source.fetchImpl,
      },
    );

  return {
    summary,
    requests:
      source.requests,
  };
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

test(
  "PostgreSQL 18 reference population contract",

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

      max: 2,
    });

    let destructiveSchemaMutationStarted =
      false;

    try {
      const versionResult =
        await pool.query<{
          readonly server_version_num:
            string;
        }>(
          `
            SHOW server_version_num
          `,
        );

      const version =
        versionResult.rows[0]
          ?.server_version_num;

      assert.ok(
        version,
      );

      assert.match(
        version,

        /^18\d{4}$/,

        "PostgreSQL 18 is required before destructive test setup",
      );

      await t.test(
        "runtime is PostgreSQL major 18",

        async () => {
          assert.match(
            version,

            /^18\d{4}$/,
          );
        },
      );

      destructiveSchemaMutationStarted =
        true;

      await resetPublicSchema(
        pool,
      );

      await t.test(
        "canonical migrations apply cleanly",

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
        },
      );

      await t.test(
        "fake-source population persists an exact reference snapshot",

        async () => {
          const first =
            await populateFakeSnapshot(
              pool,

              {
                hospitals:
                  FIRST_HOSPITALS,

                tambons:
                  FIRST_TAMBONS,
              },
            );

          assert.deepEqual(
            first.summary,

            {
              tambonCount: 2,

              facilityCount: 2,
            },
          );

          assert.deepEqual(
            first.requests,

            [
              `GET ${FAKE_SOURCE_URL}?sheet=hospitals`,

              `GET ${FAKE_SOURCE_URL}?sheet=tambon_master`,
            ],
          );

          const tambons =
            await loadTambons(
              pool,
            );

          assert.equal(
            tambons.length,

            2,
          );

          assert.deepEqual(
            {
              id: tambons[0]?.id,

              district_id:
                tambons[0]
                  ?.district_id,

              name_th:
                tambons[0]
                  ?.name_th,

              zip_code:
                tambons[0]
                  ?.zip_code,

              metadata:
                tambons[0]
                  ?.metadata,
            },

            {
              id: "540601",

              district_id:
                "5406",

              name_th:
                "บ้านหนุน",

              zip_code:
                "54120",

              metadata: {},
            },
          );

          assert.ok(
            tambons[0]
              ?.updated_at instanceof Date,
          );

          assert.equal(
            tambons[1]?.zip_code,

            null,
          );

          const facilities =
            await loadFacilities(
              pool,
            );

          assert.equal(
            facilities.length,

            2,
          );

          assert.equal(
            facilities[0]
              ?.hospcode,

            "06413",
          );

          assert.equal(
            facilities[0]
              ?.tambon_id,

            "540601",
          );

          assert.deepEqual(
            facilities[0]
              ?.metadata,

            {},
          );

          assert.ok(
            facilities[0]
              ?.updated_at instanceof Date,
          );

          const unresolved =
            await pool.query<CountRow>(
              `
                SELECT COUNT(*)::TEXT AS count
                FROM facilities AS facility
                LEFT JOIN tambons AS tambon
                  ON tambon.id =
                    facility.tambon_id
                WHERE tambon.id IS NULL
              `,
            );

          assert.equal(
            Number(
              unresolved.rows[0]
                ?.count,
            ),

            0,

            "facility foreign keys must resolve to tambons",
          );
        },
      );

      await t.test(
        "a second snapshot atomically replaces the first",

        async () => {
          const firstTambons =
            await loadTambons(
              pool,
            );

          assert.equal(
            firstTambons.length,

            2,
          );

          const second =
            await populateFakeSnapshot(
              pool,

              {
                hospitals:
                  SECOND_HOSPITALS,

                tambons:
                  SECOND_TAMBONS,
              },
            );

          assert.deepEqual(
            second.summary,

            {
              tambonCount: 1,

              facilityCount: 1,
            },
          );

          const tambons =
            await loadTambons(
              pool,
            );

          assert.deepEqual(
            tambons.map(
              (
                tambon,
              ) =>
                tambon.id,
            ),

            [
              "540601",
            ],

            "stale tambons must disappear",
          );

          assert.equal(
            tambons[0]
              ?.zip_code,

            null,
          );

          const facilities =
            await loadFacilities(
              pool,
            );

          assert.deepEqual(
            facilities.map(
              (
                facility,
              ) =>
                facility.hospcode,
            ),

            [
              "06413",
            ],

            "stale facilities must disappear",
          );

          assert.equal(
            await countRows(
              pool,

              "sync_runs",
            ),

            0,
          );

          assert.equal(
            await countRows(
              pool,

              "source_records",
            ),

            0,
          );

          assert.equal(
            await countRows(
              pool,

              "kpi_results",
            ),

            0,
          );
        },
      );

      await t.test(
        "live legacy master source population",

        {
          skip:
            liveSourceSkipReason,
        },

        async () => {
          const summary =
            await populateReferenceMasters(
              pool,
            );

          const tambonCount =
            await countRows(
              pool,

              "tambons",
            );

          const facilityCount =
            await countRows(
              pool,

              "facilities",
            );

          assert.equal(
            summary.tambonCount,

            tambonCount,

            "returned tambonCount must equal the persisted tambon count",
          );

          assert.equal(
            summary.facilityCount,

            facilityCount,

            "returned facilityCount must equal the persisted facility count",
          );

          const outOfDistrict =
            await pool.query<CountRow>(
              `
                SELECT COUNT(*)::TEXT AS count
                FROM tambons
                WHERE district_id <> '5406'
              `,
            );

          assert.equal(
            Number(
              outOfDistrict.rows[0]
                ?.count,
            ),

            0,

            "every tambon must stay within district 5406",
          );

          const unresolved =
            await pool.query<CountRow>(
              `
                SELECT COUNT(*)::TEXT AS count
                FROM facilities AS facility
                LEFT JOIN tambons AS tambon
                  ON tambon.id =
                    facility.tambon_id
                WHERE tambon.id IS NULL
              `,
            );

          assert.equal(
            Number(
              unresolved.rows[0]
                ?.count,
            ),

            0,

            "every facility tambon_id must resolve",
          );

          assert.ok(
            tambonCount > 0,
          );

          assert.ok(
            facilityCount > 0,
          );

          console.log(
            `Live reference source counts: tambons=${tambonCount} facilities=${facilityCount}`,
          );
        },
      );
    } finally {
      try {
        if (
          destructiveSchemaMutationStarted
        ) {
          await resetPublicSchema(
            pool,
          );
        }
      } finally {
        await pool.end();
      }
    }
  },
);
