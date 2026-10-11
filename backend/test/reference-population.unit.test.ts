import assert from "node:assert/strict";

import test from "node:test";

import {
  REFERENCE_LOCK_CLASS,
  REFERENCE_LOCK_KEY,
  ReferenceLockUnavailableError,
  getReferenceSourceUrl,
  loadReferenceSnapshot,
  normalizeReferenceSnapshot,
  populateReferenceMasters,
  replaceReferenceSnapshot,
} from "../src/reference/populate.js";

import type {
  ReferenceClient,
  ReferenceFetch,
  ReferenceFetchInit,
  ReferencePool,
} from "../src/reference/populate.js";

const VALID_SOURCE_URL =
  "https://script.google.com/macros/s/AKfycbUnitProbe0123456789/exec";

const MIGRATION_LOCK_CLASS =
  20260911;

const SYNC_LOCK_CLASS =
  20260912;

type TestEnvironment =
  Record<
    string,
    string | undefined
  >;

interface HospitalSourceRow {
  readonly hospcode: string;
  readonly hospname: string;
  readonly tambon_id: string;
}

interface TambonSourceRow {
  readonly id: string;
  readonly name_th: string;
  readonly district_id: string;
  readonly zip_code:
    | string
    | null;
}

interface RecordedRequest {
  readonly url: string;
  readonly init: ReferenceFetchInit;
}

interface RecordedQuery {
  readonly text: string;
  readonly values:
    readonly unknown[];
}

interface FakeFetchBehavior {
  readonly hospitals?: unknown;
  readonly tambons?: unknown;
  readonly networkError?: Error;
  readonly jsonError?: Error;
}

interface FakeClientBehavior {
  readonly lockAcquired?: boolean;
  readonly failOnFragment?: string;
}

function createEnv(
  overrides: TestEnvironment = {},
): TestEnvironment {
  return {
    PA_REFERENCE_SOURCE_URL:
      VALID_SOURCE_URL,

    ...overrides,
  };
}

function validHospitalRows():
  HospitalSourceRow[] {
  return [
    {
      hospcode: "06413",
      hospname: "บ้านหนุน",
      tambon_id: "540601",
    },

    {
      hospcode: "10702",
      hospname: "บ้านแป้น",
      tambon_id: "540602",
    },
  ];
}

function validTambonRows():
  TambonSourceRow[] {
  return [
    {
      id: "540601",
      name_th: "บ้านหนุน",
      district_id: "5406",
      zip_code: "54120",
    },

    {
      id: "540602",
      name_th: "บ้านแป้น",
      district_id: "5406",
      zip_code: "",
    },
  ];
}

function validSnapshot() {
  return normalizeReferenceSnapshot(
    validHospitalRows(),
    validTambonRows(),
  );
}

function createFakeFetch(
  behavior: FakeFetchBehavior = {},
) {
  const requests:
    RecordedRequest[] = [];

  const fetchImpl: ReferenceFetch =
    async (
      url,
      init,
    ) => {
      requests.push({
        url,
        init,
      });

      if (
        behavior.networkError !==
        undefined
      ) {
        throw behavior.networkError;
      }

      const hospitals =
        behavior.hospitals ??
        validHospitalRows();

      const tambons =
        behavior.tambons ??
        validTambonRows();

      const payload = url.endsWith(
        "?sheet=hospitals",
      )
        ? hospitals
        : tambons;

      return {
        ok: true,
        status: 200,

        json:
          async () => {
            if (
              behavior.jsonError !==
              undefined
            ) {
              throw behavior.jsonError;
            }

            return payload;
          },
      };
    };

  return {
    fetchImpl,
    requests,
  };
}

function normalizeSql(
  text: string,
): string {
  return text
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .toLowerCase();
}

function createFakeClient(
  behavior: FakeClientBehavior = {},
) {
  const queries: RecordedQuery[] =
    [];

  let released = false;

  const client: ReferenceClient =
    {
      query: async (
        text,
        values,
      ) => {
        queries.push({
          text,

          values:
            values ?? [],
        });

        const normalized =
          normalizeSql(
            text,
          );

        if (
          behavior.failOnFragment !==
            undefined &&
          normalized.includes(
            behavior.failOnFragment,
          )
        ) {
          throw new Error(
            "injected persistence failure",
          );
        }

        if (
          normalized.includes(
            "pg_try_advisory_xact_lock",
          )
        ) {
          return {
            rows: [
              {
                acquired:
                  behavior.lockAcquired ??
                  true,
              },
            ],
          };
        }

        return {
          rows: [],
        };
      },

      release: () => {
        released = true;
      },
    };

  return {
    client,
    queries,

    isReleased: () =>
      released,

    normalizedTexts: () =>
      queries.map(
        (
          query,
        ) =>
          normalizeSql(
            query.text,
          ),
      ),
  };
}

function createFakePool(
  client: ReferenceClient,
) {
  let connectCount = 0;

  const pool: ReferencePool = {
    connect: async () => {
      connectCount += 1;

      return client;
    },
  };

  return {
    pool,

    getConnectCount: () =>
      connectCount,
  };
}

test(
  "PA_REFERENCE_SOURCE_URL validation",

  async (t) => {
    await t.test(
      "accepts a valid Google Apps Script web-app URL",

      () => {
        assert.equal(
          getReferenceSourceUrl(
            createEnv(),
          ),

          VALID_SOURCE_URL,
        );
      },
    );

    await t.test(
      "rejects a missing value",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              {},
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects a blank value",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  "   ",
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects a non-URL value",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  "not a url",
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects http",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  VALID_SOURCE_URL.replace(
                    "https://",
                    "http://",
                  ),
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects a non-Google-Apps-Script hostname",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  "https://example.com/macros/s/AKfycbUnitProbe0123456789/exec",
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects a malformed web-app path",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  "https://script.google.com/macros/s/AKfycbUnitProbe0123456789/dev",
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );

        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  "https://script.google.com/macros/exec",
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects embedded credentials",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  "https://user:secret@script.google.com/macros/s/AKfycbUnitProbe0123456789/exec",
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects a pre-existing query string",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  `${VALID_SOURCE_URL}?sheet=hospitals`,
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );

    await t.test(
      "rejects a fragment",

      () => {
        assert.throws(
          () =>
            getReferenceSourceUrl(
              createEnv({
                PA_REFERENCE_SOURCE_URL:
                  `${VALID_SOURCE_URL}#section`,
              }),
            ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );
      },
    );
  },
);

test(
  "reference source fetch contract",

  async (t) => {
    await t.test(
      "requests exactly the two reference sheets read-only",

      async () => {
        const fake =
          createFakeFetch();

        const snapshot =
          await loadReferenceSnapshot(
            {
              sourceUrl:
                VALID_SOURCE_URL,

              fetch:
                fake.fetchImpl,
            },
          );

        assert.equal(
          fake.requests
            .length,

          2,
        );

        assert.equal(
          fake.requests[0]
            ?.url,

          `${VALID_SOURCE_URL}?sheet=hospitals`,
        );

        assert.equal(
          fake.requests[1]
            ?.url,

          `${VALID_SOURCE_URL}?sheet=tambon_master`,
        );

        for (
          const request
          of fake.requests
        ) {
          assert.equal(
            request.init
              .method,

            "GET",
          );

          assert.ok(
            request.init.signal instanceof AbortSignal,
          );
        }

        assert.equal(
          snapshot.tambons
            .length,

          2,
        );

        assert.equal(
          snapshot.facilities
            .length,

          2,
        );
      },
    );

    await t.test(
      "rejects when the source fetch fails",

      async () => {
        const fake =
          createFakeFetch(
            {
              networkError:
                new Error(
                  "network is unreachable",
                ),
            },
          );

        await assert.rejects(
          loadReferenceSnapshot(
            {
              sourceUrl:
                VALID_SOURCE_URL,

              fetch:
                fake.fetchImpl,
            },
          ),

          {
            name:
              "ReferenceTransportError",
          },
        );
      },
    );

    await t.test(
      "rejects invalid JSON",

      async () => {
        const fake =
          createFakeFetch(
            {
              jsonError:
                new SyntaxError(
                  "Unexpected token",
                ),
            },
          );

        await assert.rejects(
          loadReferenceSnapshot(
            {
              sourceUrl:
                VALID_SOURCE_URL,

              fetch:
                fake.fetchImpl,
            },
          ),

          {
            name:
              "ReferenceTransportError",
          },
        );
      },
    );

    await t.test(
      "rejects a non-array payload",

      async () => {
        const fake =
          createFakeFetch(
            {
              hospitals: {
                data: [],
              },
            },
          );

        await assert.rejects(
          loadReferenceSnapshot(
            {
              sourceUrl:
                VALID_SOURCE_URL,

              fetch:
                fake.fetchImpl,
            },
          ),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects an empty array payload",

      async () => {
        const fake =
          createFakeFetch(
            {
              tambons: [],
            },
          );

        await assert.rejects(
          loadReferenceSnapshot(
            {
              sourceUrl:
                VALID_SOURCE_URL,

              fetch:
                fake.fetchImpl,
            },
          ),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );
  },
);

test(
  "hospital reference validation",

  async (t) => {
    const normalize = (
      hospitals: unknown,
    ) =>
      normalizeReferenceSnapshot(
        hospitals,
        validTambonRows(),
      );

    await t.test(
      "valid rows normalize with trimmed values",

      () => {
        const snapshot =
          normalize([
            {
              hospcode:
                " 06413 ",

              hospname:
                " บ้านหนุน ",

              tambon_id:
                " 540601 ",
            },
          ]);

        assert.deepEqual(
          snapshot.facilities,

          [
            {
              hospcode:
                "06413",

              hospname:
                "บ้านหนุน",

              tambonId:
                "540601",
            },
          ],
        );
      },
    );

    await t.test(
      "rejects an unknown row field",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                hospcode:
                  "06413",

                hospname:
                  "บ้านหนุน",

                tambon_id:
                  "540601",

                extra: 1,
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects a blank hospname",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                hospcode:
                  "06413",

                hospname:
                  "   ",

                tambon_id:
                  "540601",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects an invalid hospcode",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                hospcode:
                  "6413",

                hospname:
                  "บ้านหนุน",

                tambon_id:
                  "540601",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects an invalid tambon_id",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                hospcode:
                  "06413",

                hospname:
                  "บ้านหนุน",

                tambon_id:
                  "54060",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects a duplicate hospcode",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                hospcode:
                  "06413",

                hospname:
                  "บ้านหนุน",

                tambon_id:
                  "540601",
              },

              {
                hospcode:
                  "06413",

                hospname:
                  "ศูนย์สุขภาพจิต",

                tambon_id:
                  "540602",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );
  },
);

test(
  "tambon reference validation",

  async (t) => {
    const normalize = (
      tambons: unknown,
    ) =>
      normalizeReferenceSnapshot(
        [
          {
            hospcode:
              "06413",

            hospname:
              "บ้านหนุน",

            tambon_id:
              "540601",
          },
        ],

        tambons,
      );

    await t.test(
      "valid rows normalize with a five-digit zip",

      () => {
        const snapshot =
          normalize([
            {
              id: "540601",

              name_th:
                "บ้านหนุน",

              district_id:
                "5406",

              zip_code:
                "54120",
            },
          ]);

        assert.deepEqual(
          snapshot.tambons,

          [
            {
              id: "540601",

              districtId:
                "5406",

              nameTh:
                "บ้านหนุน",

              zipCode:
                "54120",
            },
          ],
        );
      },
    );

    await t.test(
      "rejects an unknown row field",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "540601",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  "54120",

                extra: 1,
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects an invalid id",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "54060",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects a blank name_th",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "540601",

                name_th:
                  "   ",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "rejects a district other than 5406",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "540701",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5407",

                zip_code:
                  "54120",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",

            message:
              /district_id must be 5406/,
          },
        );
      },
    );

    await t.test(
      "rejects an id that does not start with district_id",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "540701",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",

            message:
              /id must start with district_id/,
          },
        );
      },
    );

    await t.test(
      "rejects an invalid zip_code",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "540601",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  "5412",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );

    await t.test(
      "normalizes blank and null zip_code to null",

      () => {
        const snapshot =
          normalize([
            {
              id: "540601",

              name_th:
                "บ้านหนุน",

              district_id:
                "5406",

              zip_code:
                "   ",
            },

            {
              id: "540602",

              name_th:
                "บ้านแป้น",

              district_id:
                "5406",

              zip_code:
                null,
            },
          ]);

        assert.equal(
          snapshot.tambons[0]
            ?.zipCode,

          null,
        );

        assert.equal(
          snapshot.tambons[1]
            ?.zipCode,

          null,
        );
      },
    );

    await t.test(
      "rejects a duplicate id",

      () => {
        assert.throws(
          () =>
            normalize([
              {
                id: "540601",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },

              {
                id: "540601",

                name_th:
                  "บ้านหนุนซ้ำ",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },
            ]),

          {
            name:
              "ReferenceSourceDataError",
          },
        );
      },
    );
  },
);

test(
  "cross-dataset reference integrity",

  async (t) => {
    await t.test(
      "rejects a hospital referencing an unknown tambon",

      () => {
        assert.throws(
          () =>
            normalizeReferenceSnapshot(
              [
                {
                  hospcode:
                    "06413",

                  hospname:
                    "บ้านหนุน",

                  tambon_id:
                    "540699",
                },
              ],

              validTambonRows(),
            ),

          {
            name:
              "ReferenceSourceDataError",

            message:
              /unknown tambon_id/,
          },
        );
      },
    );
  },
);

test(
  "snapshot normalization is count-agnostic and deterministic",

  async (t) => {
    await t.test(
      "a single-tambon single-facility snapshot validates",

      () => {
        const snapshot =
          normalizeReferenceSnapshot(
            [
              {
                hospcode:
                  "06413",

                hospname:
                  "บ้านหนุน",

                tambon_id:
                  "540601",
              },
            ],

            [
              {
                id: "540601",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  null,
              },
            ],
          );

        assert.equal(
          snapshot.tambons
            .length,

          1,
        );

        assert.equal(
          snapshot.facilities
            .length,

          1,
        );

        assert.equal(
          snapshot.tambons[0]
            ?.zipCode,

          null,
        );
      },
    );

    await t.test(
      "sorts tambons by id and facilities by hospcode ascending",

      () => {
        const snapshot =
          normalizeReferenceSnapshot(
            [
              {
                hospcode:
                  "10702",

                hospname:
                  "บ้านแป้น",

                tambon_id:
                  "540602",
              },

              {
                hospcode:
                  "06413",

                hospname:
                  "บ้านหนุน",

                tambon_id:
                  "540601",
              },
            ],

            [
              {
                id: "540602",

                name_th:
                  "บ้านแป้น",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },

              {
                id: "540601",

                name_th:
                  "บ้านหนุน",

                district_id:
                  "5406",

                zip_code:
                  "54120",
              },
            ],
          );

        assert.deepEqual(
          snapshot.tambons.map(
            (
              tambon,
            ) =>
              tambon.id,
          ),

          [
            "540601",
            "540602",
          ],
        );

        assert.deepEqual(
          snapshot.facilities.map(
            (
              facility,
            ) =>
              facility.hospcode,
          ),

          [
            "06413",
            "10702",
          ],
        );
      },
    );
  },
);

test(
  "source failures never reach the database",

  async (t) => {
    await t.test(
      "fetch failure performs no database connection",

      async () => {
        const recorder =
          createFakeClient();

        const {
          pool,

          getConnectCount,
        } = createFakePool(
          recorder.client,
        );

        const fake =
          createFakeFetch(
            {
              networkError:
                new Error(
                  "network is unreachable",
                ),
            },
          );

        await assert.rejects(
          populateReferenceMasters(
            pool,

            {
              env:
                createEnv(),

              fetch:
                fake.fetchImpl,
            },
          ),

          {
            name:
              "ReferenceTransportError",
          },
        );

        assert.equal(
          getConnectCount(),

          0,
        );
      },
    );

    await t.test(
      "invalid snapshot performs no database connection",

      async () => {
        const recorder =
          createFakeClient();

        const {
          pool,

          getConnectCount,
        } = createFakePool(
          recorder.client,
        );

        const fake =
          createFakeFetch(
            {
              tambons: [],
            },
          );

        await assert.rejects(
          populateReferenceMasters(
            pool,

            {
              env:
                createEnv(),

              fetch:
                fake.fetchImpl,
            },
          ),

          {
            name:
              "ReferenceSourceDataError",
          },
        );

        assert.equal(
          getConnectCount(),

          0,
        );
      },
    );

    await t.test(
      "missing source URL performs no database connection",

      async () => {
        const recorder =
          createFakeClient();

        const {
          pool,

          getConnectCount,
        } = createFakePool(
          recorder.client,
        );

        await assert.rejects(
          populateReferenceMasters(
            pool,

            {
              env: {},
            },
          ),

          {
            name:
              "ReferenceSourceUrlError",
          },
        );

        assert.equal(
          getConnectCount(),

          0,
        );
      },
    );
  },
);

test(
  "replacement transaction executes the frozen statement sequence",

  async (t) => {
    await t.test(
      "BEGIN, lock, delete, insert, commit in the required order",

      async () => {
        const recorder =
          createFakeClient();

        const {
          pool,
        } = createFakePool(
          recorder.client,
        );

        const summary =
          await replaceReferenceSnapshot(
            pool,

            validSnapshot(),
          );

        const texts =
          recorder.normalizedTexts();

        assert.equal(
          texts[0],

          "begin",
        );

        const lockIndex =
          texts.findIndex(
            (
              text,
            ) =>
              text.includes(
                "pg_try_advisory_xact_lock",
              ),
          );

        assert.equal(
          lockIndex,

          1,
        );

        const deleteFacilitiesIndex =
          texts.findIndex(
            (
              text,
            ) =>
              text.includes(
                "delete from facilities",
              ),
          );

        const deleteTambonsIndex =
          texts.findIndex(
            (
              text,
            ) =>
              text.includes(
                "delete from tambons",
              ),
          );

        const insertTambonsIndex =
          texts.findIndex(
            (
              text,
            ) =>
              text.includes(
                "insert into tambons",
              ),
          );

        const insertFacilitiesIndex =
          texts.findIndex(
            (
              text,
            ) =>
              text.includes(
                "insert into facilities",
              ),
          );

        assert.ok(
          deleteFacilitiesIndex >
            lockIndex,
        );

        assert.ok(
          deleteTambonsIndex >
            deleteFacilitiesIndex,
        );

        assert.ok(
          insertTambonsIndex >
            deleteTambonsIndex,
        );

        assert.ok(
          insertFacilitiesIndex >
            insertTambonsIndex,
        );

        assert.equal(
          texts[
            texts.length - 1
          ],

          "commit",
        );

        assert.deepEqual(
          recorder.queries[
            lockIndex
          ]?.values,

          [
            REFERENCE_LOCK_CLASS,

            REFERENCE_LOCK_KEY,
          ],
        );

        assert.deepEqual(
          summary,

          {
            tambonCount: 2,

            facilityCount: 2,
          },
        );

        assert.equal(
          recorder.isReleased(),

          true,
        );
      },
    );

    await t.test(
      "the reference lock identity is dedicated",

      () => {
        assert.notEqual(
          REFERENCE_LOCK_CLASS,

          MIGRATION_LOCK_CLASS,
        );

        assert.notEqual(
          REFERENCE_LOCK_CLASS,

          SYNC_LOCK_CLASS,
        );
      },
    );
  },
);

test(
  "unavailable reference lock rolls back without mutation",

  async () => {
    const recorder =
      createFakeClient(
        {
          lockAcquired: false,
        },
      );

    const {
      pool,
    } = createFakePool(
      recorder.client,
    );

    await assert.rejects(
      replaceReferenceSnapshot(
        pool,

        validSnapshot(),
      ),

      ReferenceLockUnavailableError,
    );

    const texts =
      recorder.normalizedTexts();

    assert.equal(
      texts[0],

      "begin",
    );

    assert.equal(
      texts.includes(
        "rollback",
      ),

      true,
    );

    assert.equal(
      texts.some(
        (
          text,
        ) =>
          text.includes(
            "delete",
          ),
      ),

      false,
    );

    assert.equal(
      texts.some(
        (
          text,
        ) =>
          text.includes(
            "insert",
          ),
      ),

      false,
    );

    assert.equal(
      texts.includes(
        "commit",
      ),

      false,
    );

    assert.equal(
      recorder.isReleased(),

      true,
    );
  },
);

test(
  "persistence failure after BEGIN rolls back and never commits",

  async () => {
    const recorder =
      createFakeClient(
        {
          failOnFragment:
            "insert into tambons",
        },
      );

    const {
      pool,
    } = createFakePool(
      recorder.client,
    );

    await assert.rejects(
      replaceReferenceSnapshot(
        pool,

        validSnapshot(),
      ),

      /injected persistence failure/,
    );

    const texts =
      recorder.normalizedTexts();

    assert.equal(
      texts[0],

      "begin",
    );

    assert.equal(
      texts.some(
        (
          text,
        ) =>
          text.includes(
            "delete from facilities",
          ),
      ),

      true,
    );

    assert.equal(
      texts[
        texts.length - 1
      ],

      "rollback",
    );

    assert.equal(
      texts.includes(
        "commit",
      ),

      false,
    );

    assert.equal(
      recorder.isReleased(),

      true,
    );
  },
);

test(
  "source values are parameterized, never interpolated",

  async () => {
    const recorder =
      createFakeClient();

    const {
      pool,
    } = createFakePool(
      recorder.client,
    );

    await replaceReferenceSnapshot(
      pool,

      validSnapshot(),
    );

    const insertQueries =
      recorder.queries.filter(
        (
          query,
        ) =>
          normalizeSql(
            query.text,
          ).startsWith(
            "insert into",
          ),
      );

    assert.ok(
      insertQueries.length >= 2,
    );

    const insertText =
      insertQueries
        .map(
          (
            query,
          ) =>
            normalizeSql(
              query.text,
            ),
        )
        .join(" ");

    const insertValues =
      insertQueries.flatMap(
        (
          query,
        ) =>
          query.values,
      );

    const sourceValues = [
      "06413",
      "10702",
      "540601",
      "540602",
      "5406",
      "54120",
      "บ้านหนุน",
      "บ้านแป้น",
    ];

    for (
      const sourceValue
      of sourceValues
    ) {
      assert.equal(
        insertText.includes(
          sourceValue,
        ),

        false,

        `SQL text must not contain source value: ${sourceValue}`,
      );

      assert.ok(
        insertValues.includes(
          sourceValue,
        ),

        `query values must carry source value: ${sourceValue}`,
      );
    }
  },
);
