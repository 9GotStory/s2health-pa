import assert from "node:assert/strict";
import test from "node:test";

import {
  createMophClient,
  getInterSourceDelayMs,
  MophSourceDataError,
  MophTransportError,
  type MophFetch,
  type MophFetchInit,
  type MophFetchResponse,
} from "../src/sync/moph-client.js";

function response(
  payload: unknown,
  options: {
    readonly ok?: boolean;
    readonly status?: number;
    readonly jsonError?: Error;
  } = {},
): MophFetchResponse {
  return {
    ok:
      options.ok ??
      true,

    status:
      options.status ??
      200,

    json:
      async () => {
        if (
          options.jsonError !==
          undefined
        ) {
          throw options.jsonError;
        }

        return payload;
      },
  };
}

interface CapturedRequest {
  readonly url: string;
  readonly init: MophFetchInit;
}

test(
  "MOPH client sends exact POST body without optional limit",
  async () => {
    const requests:
      CapturedRequest[] = [];

    const fetch:
      MophFetch =
      async (
        url,
        init,
      ) => {
        requests.push({
          url,
          init,
        });

        return response([
          {
            hospcode: "06413",
          },
        ]);
      };

    const client =
      createMophClient({
        fetch,
        sleep:
          async () => {},
        random:
          () => 0,
      });

    const rows =
      await client.fetchSource({
        tableName:
          "s_kpi_anc12",

        year:
          "2569",

        province:
          "54",

        limit:
          null,
      });

    assert.equal(
      requests.length,
      1,
    );

    const request =
      requests[0];

    assert.ok(
      request !== undefined,
    );

    assert.equal(
      request.url,
      "https://opendata.moph.go.th/api/report_data",
    );

    assert.equal(
      request.init.method,
      "POST",
    );

    assert.deepEqual(
      request.init.headers,
      {
        "Content-Type":
          "application/json",
      },
    );

    assert.deepEqual(
      JSON.parse(
        request.init.body,
      ),
      {
        tableName:
          "s_kpi_anc12",

        year:
          "2569",

        province:
          "54",

        type:
          "json",
      },
    );

    assert.equal(
      rows.length,
      1,
    );
  },
);

test(
  "MOPH client sends configured limit and accepts data envelope",
  async () => {
    let body:
      Record<string, unknown> |
      undefined;

    const client =
      createMophClient({
        fetch:
          async (
            _url,
            init,
          ) => {
            body =
              JSON.parse(
                init.body,
              ) as
                Record<
                  string,
                  unknown
                >;

            return response({
              data: [
                {
                  id: "example",
                },
              ],
            });
          },

        sleep:
          async () => {},

        random:
          () => 0,
      });

    const rows =
      await client.fetchSource({
        tableName:
          "s_epi_complete",

        year:
          "2569",

        province:
          "54",

        limit:
          5000,
      });

    assert.equal(
      body?.limit,
      5000,
    );

    assert.equal(
      rows.length,
      1,
    );
  },
);

test(
  "MOPH client rejects zero-row response",
  async () => {
    let calls = 0;

    const client =
      createMophClient({
        fetch:
          async () => {
            calls += 1;
            return response([]);
          },

        sleep:
          async () => {},

        random:
          () => 0,
      });

    await assert.rejects(
      () =>
        client.fetchSource({
          tableName:
            "s_kpi_anc12",

          year:
            "2569",

          province:
            "54",
        }),

      (
        error: unknown,
      ) =>
        error instanceof
        MophSourceDataError,
    );

    assert.equal(
      calls,
      1,
    );
  },
);

test(
  "MOPH client retries unexpected response shape exactly three attempts",
  async () => {
    let calls = 0;

    const sleeps:
      number[] = [];

    const client =
      createMophClient({
        fetch:
          async () => {
            calls += 1;

            return response({
              rows: [],
            });
          },

        sleep:
          async (
            milliseconds,
          ) => {
            sleeps.push(
              milliseconds,
            );
          },

        random:
          () => 0,
      });

    await assert.rejects(
      () =>
        client.fetchSource({
          tableName:
            "s_kpi_anc12",

          year:
            "2569",

          province:
            "54",
        }),

      (
        error: unknown,
      ) =>
        error instanceof
        MophTransportError,
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      sleeps,
      [
        5000,
        10000,
      ],
    );
  },
);

test(
  "MOPH client rejects non-object source rows",
  async (t) => {
    const invalidRows:
      readonly unknown[] = [
        null,
        "row",
        42,
        [],
      ];

    for (
      const invalid of
      invalidRows
    ) {
      await t.test(
        JSON.stringify(
          invalid,
        ),

        async () => {
          const client =
            createMophClient({
              fetch:
                async () =>
                  response([
                    invalid,
                  ]),

              sleep:
                async () => {},

              random:
                () => 0,
            });

          await assert.rejects(
            () =>
              client.fetchSource({
                tableName:
                  "s_kpi_anc12",

                year:
                  "2569",

                province:
                  "54",
              }),

            (
              error: unknown,
            ) =>
              error instanceof
              MophSourceDataError,
          );
        },
      );
    }
  },
);

test(
  "MOPH client retries HTTP failures with exact backoff",
  async () => {
    let calls = 0;

    const sleeps:
      number[] = [];

    const client =
      createMophClient({
        fetch:
          async () => {
            calls += 1;

            return response(
              null,
              {
                ok: false,
                status: 503,
              },
            );
          },

        sleep:
          async (
            milliseconds,
          ) => {
            sleeps.push(
              milliseconds,
            );
          },

        random:
          () => 0,
      });

    await assert.rejects(
      () =>
        client.fetchSource({
          tableName:
            "s_kpi_anc12",

          year:
            "2569",

          province:
            "54",
        }),

      /HTTP 503/,
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      sleeps,
      [
        5000,
        10000,
      ],
    );
  },
);

test(
  "MOPH client retries thrown fetch failures",
  async () => {
    let calls = 0;

    const sleeps:
      number[] = [];

    const client =
      createMophClient({
        fetch:
          async () => {
            calls += 1;

            throw new Error(
              "network down",
            );
          },

        sleep:
          async (
            milliseconds,
          ) => {
            sleeps.push(
              milliseconds,
            );
          },

        random:
          () => 0,
      });

    await assert.rejects(
      () =>
        client.fetchSource({
          tableName:
            "s_kpi_anc12",

          year:
            "2569",

          province:
            "54",
        }),

      /network down/,
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      sleeps,
      [
        5000,
        10000,
      ],
    );
  },
);

test(
  "MOPH client retries invalid JSON",
  async () => {
    let calls = 0;

    const sleeps:
      number[] = [];

    const client =
      createMophClient({
        fetch:
          async () => {
            calls += 1;

            return response(
              null,
              {
                jsonError:
                  new SyntaxError(
                    "bad json",
                  ),
              },
            );
          },

        sleep:
          async (
            milliseconds,
          ) => {
            sleeps.push(
              milliseconds,
            );
          },

        random:
          () => 0,
      });

    await assert.rejects(
      () =>
        client.fetchSource({
          tableName:
            "s_kpi_anc12",

          year:
            "2569",

          province:
            "54",
        }),

      /bad json/,
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      sleeps,
      [
        5000,
        10000,
      ],
    );
  },
);

test(
  "inter-source jitter remains inside frozen 4000 through 6999ms window",
  async () => {
    assert.equal(
      getInterSourceDelayMs(
        () => 0,
      ),
      4000,
    );

    assert.equal(
      getInterSourceDelayMs(
        () => 0.999999,
      ),
      6999,
    );

    assert.throws(
      () =>
        getInterSourceDelayMs(
          () => 1,
        ),
      RangeError,
    );

    const sleeps:
      number[] = [];

    const client =
      createMophClient({
        fetch:
          async () =>
            response([
              {},
            ]),

        sleep:
          async (
            milliseconds,
          ) => {
            sleeps.push(
              milliseconds,
            );
          },

        random:
          () => 0.5,
      });

    await client.waitBetweenSources();

    assert.deepEqual(
      sleeps,
      [
        5500,
      ],
    );
  },
);
