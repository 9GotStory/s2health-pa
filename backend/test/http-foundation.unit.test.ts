import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
} from "../src/app.js";

import {
  loadServerConfig,
  ServerConfigError,
} from "../src/config/server.js";

import type {
  AppStateRow,
  HealthDatabase,
} from "../src/observability/health.js";

interface FakeDatabase
  extends HealthDatabase {
  getQueryCount(): number;
}

function createFakeDatabase(
  behavior: {
    readonly rows?: readonly AppStateRow[];
    readonly error?: Error;
  },
): FakeDatabase {
  let queryCount = 0;

  return {
    query: async () => {
      queryCount += 1;

      if (
        behavior.error !==
        undefined
      ) {
        throw behavior.error;
      }

      return {
        rows: behavior.rows ?? [],
      };
    },

    getQueryCount: () =>
      queryCount,
  };
}

test(
  "buildApp constructs an injectable application without opening a network listener",
  async () => {
    const db =
      createFakeDatabase({
        rows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      assert.equal(
        app.server.listening,
        false,
      );

      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/live",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        app.server.listening,
        false,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "liveness answers ok without touching the injected database",
  async () => {
    const db =
      createFakeDatabase({
        rows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/live",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"status":"ok"}',
      );

      assert.equal(
        db.getQueryCount(),
        0,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "readiness reports ready when an active sync run exists",
  async () => {
    const db =
      createFakeDatabase({
        rows: [
          {
            active_sync_run_id:
              421,
          },
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/ready",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"status":"ready"}',
      );

      assert.equal(
        db.getQueryCount(),
        1,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "readiness reports ready when active sync run is null",
  async () => {
    const db =
      createFakeDatabase({
        rows: [
          {
            active_sync_run_id:
              null,
          },
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/ready",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"status":"ready"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "readiness fails closed without leaking internal database errors",
  async () => {
    const internalMessage =
      "password authentication failed for user pa_admin at postgres://pa_admin:hunter2@10.0.0.8:5432/pa_prod";

    const db =
      createFakeDatabase({
        error: new Error(
          internalMessage,
        ),
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/ready",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"status":"not_ready"}',
      );

      assert.equal(
        response.body.includes(
          internalMessage,
        ),
        false,
      );

      assert.equal(
        response.body.includes(
          "hunter2",
        ),
        false,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "readiness fails closed when the app_state singleton row is missing",
  async () => {
    const db =
      createFakeDatabase({
        rows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/ready",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"status":"not_ready"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "unknown routes keep the normal Fastify 404 behavior",
  async () => {
    const db =
      createFakeDatabase({
        rows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/not-a-route",
        });

      assert.equal(
        response.statusCode,
        404,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "server configuration falls back to defaults when environment is empty",
  () => {
    const config =
      loadServerConfig({});

    assert.equal(
      config.host,
      "127.0.0.1",
    );

    assert.equal(
      config.port,
      3001,
    );
  },
);

test(
  "server configuration parses explicit host and port values",
  () => {
    const config =
      loadServerConfig({
        PA_API_HOST: "0.0.0.0",
        PA_API_PORT: "3002",
      });

    assert.equal(
      config.host,
      "0.0.0.0",
    );

    assert.equal(
      config.port,
      3002,
    );

    const padded =
      loadServerConfig({
        PA_API_PORT: " 3002 ",
      });

    assert.equal(
      padded.port,
      3002,
    );
  },
);

test(
  "invalid PA_API_PORT values fail closed",
  async (t) => {
    const invalidPorts = [
      "",
      " ",
      "0",
      "65536",
      "-1",
      "1.5",
      "abc",
    ];

    for (
      const invalidPort of
      invalidPorts
    ) {
      await t.test(
        JSON.stringify(
          invalidPort,
        ),

        async () => {
          assert.throws(
            () =>
              loadServerConfig({
                PA_API_PORT:
                  invalidPort,
              }),

            ServerConfigError,
          );
        },
      );
    }
  },
);

test(
  "explicit blank PA_API_HOST fails closed",
  () => {
    assert.throws(
      () =>
        loadServerConfig({
          PA_API_HOST: "",
        }),

      ServerConfigError,
    );

    assert.throws(
      () =>
        loadServerConfig({
          PA_API_HOST: "   ",
        }),

      ServerConfigError,
    );
  },
);

test(
  "server configuration leaves CORS disabled by default",
  () => {
    const config =
      loadServerConfig({});

    assert.deepEqual(
      config.corsOrigins,
      [],
    );
  },
);

test(
  "server configuration parses and deduplicates exact CORS origins",
  () => {
    const config =
      loadServerConfig({
        PA_CORS_ORIGINS:
          "https://9gotstory.github.io, http://localhost:3000,https://9gotstory.github.io",
      });

    assert.deepEqual(
      config.corsOrigins,
      [
        "https://9gotstory.github.io",
        "http://localhost:3000",
      ],
    );
  },
);

test(
  "invalid CORS origin configuration fails closed",
  async (t) => {
    const invalidValues = [
      "",
      " ",
      "https://9gotstory.github.io/",
      "https://9gotstory.github.io/path",
      "ftp://example.test",
      "not-an-origin",
      "https://example.test,,https://other.test",
    ];

    for (
      const invalidValue
      of invalidValues
    ) {
      await t.test(
        JSON.stringify(
          invalidValue,
        ),

        () => {
          assert.throws(
            () =>
              loadServerConfig({
                PA_CORS_ORIGINS:
                  invalidValue,
              }),

            ServerConfigError,
          );
        },
      );
    }
  },
);

test(
  "allowed browser origin receives CORS headers on API GET",
  async () => {
    const db =
      createFakeDatabase({
        rows: [
          {
            active_sync_run_id:
              null,
          },
        ],
      });

    const app = buildApp({
      db,
      corsOrigins: [
        "https://9gotstory.github.io",
      ],
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/ready",
          headers: {
            origin:
              "https://9gotstory.github.io",
          },
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.headers[
          "access-control-allow-origin"
        ],
        "https://9gotstory.github.io",
      );

      assert.equal(
        response.headers.vary,
        "Origin",
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "unapproved browser origin receives no CORS grant",
  async () => {
    const db =
      createFakeDatabase({
        rows: [
          {
            active_sync_run_id:
              null,
          },
        ],
      });

    const app = buildApp({
      db,
      corsOrigins: [
        "https://9gotstory.github.io",
      ],
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/health/ready",
          headers: {
            origin:
              "https://example.invalid",
          },
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.headers[
          "access-control-allow-origin"
        ],
        undefined,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "approved CORS preflight succeeds for GET",
  async () => {
    const db =
      createFakeDatabase({
        rows: [],
      });

    const app = buildApp({
      db,
      corsOrigins: [
        "https://9gotstory.github.io",
      ],
    });

    try {
      const response =
        await app.inject({
          method: "OPTIONS",
          url: "/api/v1/dashboard",
          headers: {
            origin:
              "https://9gotstory.github.io",
            "access-control-request-method":
              "GET",
            "access-control-request-headers":
              "content-type",
          },
        });

      assert.equal(
        response.statusCode,
        204,
      );

      assert.equal(
        response.headers[
          "access-control-allow-origin"
        ],
        "https://9gotstory.github.io",
      );

      assert.equal(
        response.headers[
          "access-control-allow-methods"
        ],
        "GET, OPTIONS",
      );

      assert.equal(
        response.headers[
          "access-control-allow-headers"
        ],
        "Accept, Content-Type",
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "CORS preflight rejects unapproved origins and methods",
  async (t) => {
    const db =
      createFakeDatabase({
        rows: [],
      });

    const app = buildApp({
      db,
      corsOrigins: [
        "https://9gotstory.github.io",
      ],
    });

    try {
      for (
        const testCase
        of [
          {
            origin:
              "https://example.invalid",
            method: "GET",
          },
          {
            origin:
              "https://9gotstory.github.io",
            method: "POST",
          },
        ]
      ) {
        await t.test(
          `${testCase.origin} ${testCase.method}`,

          async () => {
            const response =
              await app.inject({
                method: "OPTIONS",
                url: "/api/v1/dashboard",
                headers: {
                  origin:
                    testCase.origin,
                  "access-control-request-method":
                    testCase.method,
                },
              });

            assert.equal(
              response.statusCode,
              403,
            );

            assert.equal(
              response.headers[
                "access-control-allow-origin"
              ],
              undefined,
            );
          },
        );
      }
    } finally {
      await app.close();
    }
  },
);

