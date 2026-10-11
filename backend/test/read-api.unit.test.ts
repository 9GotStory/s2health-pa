import assert from "node:assert/strict";

import test from "node:test";

import {
  buildApp,
} from "../src/app.js";

import type {
  AppStateQueryResult,
  AppStateRow,
  HealthDatabase,
} from "../src/observability/health.js";

import type {
  ReadApiDatabase,
} from "../src/modules/read-api.js";

interface FakeDatabase
  extends HealthDatabase,
    ReadApiDatabase {
  query(
    text: string,
  ): Promise<AppStateQueryResult>;

  getQueries():
    readonly string[];
}

function createFakeDatabase(
  behavior: {
    readonly kpiRows?: readonly unknown[];
    readonly syncRows?: readonly unknown[];
    readonly facilityRows?: readonly unknown[];
    readonly tambonRows?: readonly unknown[];
    readonly dashboardRows?: readonly unknown[];
    readonly error?: Error;
  },
): FakeDatabase {
  const queries: string[] = [];

  return {
    query: async (text: string) => {
      queries.push(text);

      if (
        behavior.error !== undefined
      ) {
        throw behavior.error;
      }

      const rows = text.includes(
          "AS category_code",
        )
        ? (behavior.kpiRows ?? []).map(
            (row) =>
              typeof row === "object" &&
              row !== null &&
              !Array.isArray(row)
                ? {
                    active_sync_run_id:
                      null,
                    snapshot_definition_present:
                      false,
                    snapshot_definition_match_count:
                      0,
                    ...row,
                  }
                : row,
          )
        : text.includes(
            "kpi_results",
          )
          ? behavior.dashboardRows
          : text.includes(
              "facilities",
            )
            ? behavior.facilityRows
            : text.includes(
                "tambons",
              )
              ? behavior.tambonRows
              : behavior.syncRows;

      return {
        rows: (rows ??
          []) as readonly AppStateRow[],
      };
    },

    getQueries: () => queries,
  };
}

function createDashboardRow(
  overrides: Record<
    string,
    unknown
  > = {},
): Record<string, unknown> {
  return {
    active_sync_run_id: "42",
    run_id: "42",
    run_status: "succeeded",
    fiscal_year: 2569,
    result_fiscal_year: 2569,
    current_quarter: 4,
    expected_source_count: 1,
    completed_source_count: 1,
    failed_source_count: 0,
    finished_at: new Date(
      "2026-09-27T01:25:00.000Z",
    ),
    activated_at: new Date(
      "2026-09-27T01:30:00.000Z",
    ),
    source_last_updated:
      "202609261230",
    snapshot_definition_present:
      true,
    snapshot_definition_match_count:
      1,
    definition_sort_order: 1,
    kpi_definition_id: "101",
    kpi_key: "s_kpi_anc12",
    period_code: "q2",
    areacode: "54060101",
    hospcode: "06413",
    target: "100",
    result: "80",
    ...overrides,
  };
}

test(
  "buildApp registers the KPI catalog and sync status routes",

  async () => {
    const db =
      createFakeDatabase({
        kpiRows: [{ active_sync_run_id: null, kpi_key: null, snapshot_definition_present: null }],
      });

    const app = buildApp({
      db,
    });

    try {
      const kpis =
        await app.inject({
          method: "GET",
          url: "/api/v1/kpis",
        });

      assert.equal(
        kpis.statusCode,
        200,
      );

      const syncStatus =
        await app.inject({
          method: "GET",
          url: "/api/v1/sync-status",
        });

      assert.notEqual(
        syncStatus.statusCode,
        404,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog returns public fields in database order",

  async () => {
    const db =
      createFakeDatabase({
        kpiRows: [
          {
            kpi_key: "s_kpi_anc12",
            title: "ANC 12 weeks",
            target_value: "75",
            sort_order: 1,
            link:
              "https://hdc.moph.go.th/anc12",
            category_code:
              "kpi_master",
            category_name:
              "ตัวชี้วัดพื้นฐาน",
            category_order: 1,
            subgroup: null,
            is_quarterly: false,
            target_months: null,
            effective_quarter: null,
          },
          {
            kpi_key:
              "s_epi1__pcv1",
            title: "PCV1",
            target_value: "87.5",
            sort_order: 15,
            link: null,
            category_code: "kpi_epi",
            category_name:
              "สร้างเสริมภูมิคุ้มกันโรค",
            category_order: 2,
            subgroup:
              "กลุ่มอายุ 1 ปี",
            is_quarterly: true,
            target_months: 9,
            effective_quarter: 3,
          },
          {
            kpi_key:
              "s_kpi_no_target",
            title: "No target",
            target_value: null,
            sort_order: 16,
            link: null,
            category_code: "kpi_epi",
            category_name:
              "สร้างเสริมภูมิคุ้มกันโรค",
            category_order: 2,
            subgroup: null,
            is_quarterly: false,
            target_months: null,
            effective_quarter: null,
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
          url: "/api/v1/kpis",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.deepEqual(
        response.json(),
        {
          activeSyncRunId: null,
          kpis: [
            {
              key: "s_kpi_anc12",
              title:
                "ANC 12 weeks",
              target: 75,
              order: 1,
              link:
                "https://hdc.moph.go.th/anc12",
              categoryCode:
                "kpi_master",
              category:
                "ตัวชี้วัดพื้นฐาน",
              categoryOrder: 1,
              subgroup: null,
              isQuarterly: false,
              targetMonths: null,
              effectiveQuarter:
                null,
            },
            {
              key: "s_epi1__pcv1",
              title: "PCV1",
              target: 87.5,
              order: 15,
              link: null,
              categoryCode:
                "kpi_epi",
              category:
                "สร้างเสริมภูมิคุ้มกันโรค",
              categoryOrder: 2,
              subgroup:
                "กลุ่มอายุ 1 ปี",
              isQuarterly: true,
              targetMonths: 9,
              effectiveQuarter: 3,
            },
            {
              key: "s_kpi_no_target",
              title: "No target",
              target: null,
              order: 16,
              link: null,
              categoryCode:
                "kpi_epi",
              category:
                "สร้างเสริมภูมิคุ้มกันโรค",
              categoryOrder: 2,
              subgroup: null,
              isQuarterly: false,
              targetMonths: null,
              effectiveQuarter:
                null,
            },
          ],
        },
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog query binds active membership and semantics while preserving legacy fallback",

  async () => {
    const db =
      createFakeDatabase({
        kpiRows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      await app.inject({
        method: "GET",
        url: "/api/v1/kpis",
      });

      const queries =
        db.getQueries();

      assert.equal(
        queries.length,
        1,
      );

      const sql = (queries[0] ??
        "").replace(/\s+/g, " ");

      assert.ok(
        sql.includes(
          "kpi_definitions",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi_categories",
        ),
      );

      assert.ok(
        sql.includes(
          "app_state",
        ),
      );

      assert.ok(
        sql.includes(
          "active_sync_run_id",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi_results",
        ),
      );

      assert.ok(
        sql.includes(
          "active_result.sync_run_id = state.active_sync_run_id",
        ),
      );

      assert.ok(
        sql.includes(
          "active_result.kpi_definition_id = definition.id",
        ),
      );

      assert.ok(
        sql.includes(
          "sync_runs",
        ),
      );

      assert.ok(
        sql.includes(
          "config_snapshot",
        ),
      );

      assert.ok(
        sql.includes(
          "jsonb_array_elements",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition IS NOT NULL AS snapshot_definition_present",
        ),
      );

      assert.ok(
        sql.includes(
          "COUNT(*) OVER ()::INTEGER AS definition_match_count",
        ),
      );

      assert.ok(
        sql.includes(
          "WITH ORDINALITY",
        ),
      );

      assert.ok(
        sql.includes(
          "COALESCE( snapshot.definition_match_count, 0 ) AS snapshot_definition_match_count",
        ),
      );

      assert.ok(
        sql.includes(
          "state.active_sync_run_id::TEXT AS active_sync_run_id",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition ? 'kpiKey'",
        ),
      );

      assert.ok(
        sql.includes(
          "ELSE definition.kpi_key",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition ? 'targetValue'",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition ? 'isQuarterly'",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition ? 'targetMonths'",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition ? 'effectiveQuarter'",
        ),
      );

      assert.ok(
        sql.includes(
          "ELSE definition.target_value",
        ),
      );

      assert.ok(
        sql.includes(
          "ELSE definition.is_quarterly",
        ),
      );

      assert.ok(
        sql.includes(
          "ELSE definition.target_months",
        ),
      );

      assert.ok(
        sql.includes(
          "ELSE definition.effective_quarter",
        ),
      );

      assert.ok(
        sql.includes(
          "is_active = TRUE",
        ),
      );

      assert.ok(
        sql.includes(
          "source_only",
        ),
      );

      assert.ok(
        sql.includes("@>"),
      );

      assert.ok(
        sql.includes(
          "ORDER BY",
        ),
      );

      assert.ok(
        sql.includes(
          "category.sort_order",
        ),
      );

      assert.ok(
        sql.includes(
          "definition.sort_order",
        ),
      );

      assert.ok(
        sql.includes(
          "definition.kpi_key",
        ),
      );
    } finally {
      await app.close();
    }
  },
);

test("catalog binds active run identity and rejects incoherent rows", async (t) => {
  const member = {
    active_sync_run_id: "42",
    snapshot_definition_present: true,
    snapshot_definition_match_count: 1,
    kpi_key: "s_anc5", title: "ANC 5", target_value: "85",
    sort_order: 1, link: null, category_code: "basic",
    category_name: "Basic", category_order: 1, subgroup: null,
    is_quarterly: true, target_months: null, effective_quarter: null,
  };

  await t.test("selected member carries exactly one run marker", async () => {
    const app = buildApp({ db: createFakeDatabase({ kpiRows: [member] }) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/kpis" });
      assert.equal(response.statusCode, 200);
      const body = response.json() as {
        readonly activeSyncRunId: string | null;
        readonly kpis: readonly Record<string, unknown>[];
      };
      assert.equal(body.activeSyncRunId, "42");
      assert.equal(body.kpis.length, 1);
      assert.equal(body.kpis[0]?.target, 85);
      assert.equal("activeSyncRunId" in (body.kpis[0] ?? {}), false);
    } finally { await app.close(); }
  });

  await t.test("active run with no matching catalog members has a marker", async () => {
    const app = buildApp({ db: createFakeDatabase({
      kpiRows: [{ active_sync_run_id: "42", kpi_key: null, snapshot_definition_present: null }],
    }) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/kpis" });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { activeSyncRunId: "42", kpis: [] });
    } finally { await app.close(); }
  });

  await t.test("no active run with no registry entries has null marker", async () => {
    const app = buildApp({ db: createFakeDatabase({
      kpiRows: [{ active_sync_run_id: null, kpi_key: null, snapshot_definition_present: null }],
    }) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/kpis" });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { activeSyncRunId: null, kpis: [] });
    } finally { await app.close(); }
  });

  await t.test("incoherent per-row identities fail closed", async () => {
    const app = buildApp({ db: createFakeDatabase({
      kpiRows: [member, { ...member, kpi_key: "s_other", active_sync_run_id: "43" }],
    }) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/kpis" });
      assert.equal(response.statusCode, 503);
      assert.equal(response.body, '{"error":"service_unavailable"}');
    } finally { await app.close(); }
  });

  await t.test("a selected KPI with a null key is not mistaken for an empty catalog", async () => {
    const app = buildApp({ db: createFakeDatabase({
      kpiRows: [{ ...member, kpi_key: null }],
    }) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/kpis" });
      assert.equal(response.statusCode, 503);
      assert.equal(response.body, '{"error":"service_unavailable"}');
    } finally { await app.close(); }
  });

  await t.test("missing state row fails closed", async () => {
    const app = buildApp({ db: createFakeDatabase({ kpiRows: [] }) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/kpis" });
      assert.equal(response.statusCode, 503);
    } finally { await app.close(); }
  });
});

test(
  "KPI catalog rejects duplicate effective keys from distinct active definition IDs",

  async () => {
    const catalogRow = (
      key: string,
      title: string,
    ) => ({
      active_sync_run_id: "42",
      snapshot_definition_present: true,
      snapshot_definition_match_count: 1,
      kpi_key: key,
      title,
      target_value: "75",
      sort_order: 1,
      link: null,
      category_code: "kpi_master",
      category_name: "ตัวชี้วัดพื้นฐาน",
      category_order: 1,
      subgroup: null,
      is_quarterly: false,
      target_months: null,
      effective_quarter: null,
    });

    const db = createFakeDatabase({
      kpiRows: [
        catalogRow("s_anc5", "ANC first"),
        catalogRow("s_anc5", "ANC second"),
      ],
    });
    const app = buildApp({ db });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/kpis",
      });

      assert.equal(response.statusCode, 503);
      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog rejects blank effective machine identities in live and active modes",

  async (t) => {
    const candidates: readonly {
      readonly name: string;
      readonly key: unknown;
      readonly allowed: boolean;
    }[] = [
      { name: "empty", key: "", allowed: false },
      { name: "spaces", key: "   ", allowed: false },
      { name: "tabs and newline", key: "\t\n", allowed: false },
      { name: "null", key: null, allowed: false },
      { name: "number", key: 101, allowed: false },
      { name: "normal key", key: "s_kpi_anc12", allowed: true },
      { name: "padded nonblank", key: "  s_kpi_anc12  ", allowed: true },
    ];

    for (const mode of ["live", "active"] as const) {
      for (const scenario of candidates) {
        await t.test(
          `${mode}: ${scenario.name}`,
          async () => {
            const row = {
              active_sync_run_id: mode === "active" ? "42" : null,
              snapshot_definition_present: mode === "active",
              snapshot_definition_match_count: mode === "active" ? 1 : 0,
              kpi_key: scenario.key,
              title: "ANC",
              target_value: "75",
              sort_order: 1,
              link: null,
              category_code: "kpi_master",
              category_name: "ตัวชี้วัดพื้นฐาน",
              category_order: 1,
              subgroup: "",
              is_quarterly: false,
              target_months: null,
              effective_quarter: null,
            };

            const app = buildApp({
              db: createFakeDatabase({ kpiRows: [row] }),
            });

            try {
              const response = await app.inject({
                method: "GET",
                url: "/api/v1/kpis",
              });

              if (!scenario.allowed) {
                assert.equal(response.statusCode, 503);
                assert.equal(
                  response.body,
                  '{"error":"service_unavailable"}',
                );
                assert.equal(response.body.includes("ANC"), false);
              } else {
                assert.equal(response.statusCode, 200);
                const body = response.json() as {
                  readonly kpis: readonly {
                    readonly key: string;
                    readonly subgroup: string | null;
                  }[];
                };
                assert.equal(body.kpis.length, 1);
                assert.equal(body.kpis[0]?.key, scenario.key);
                assert.equal(body.kpis[0]?.subgroup, "");
              }
            } finally {
              await app.close();
            }
          },
        );
      }
    }
  },
);

test(
  "KPI catalog does not leak earlier members when a later key is blank",

  async () => {
    const row = (key: string) => ({
      active_sync_run_id: "42",
      snapshot_definition_present: true,
      snapshot_definition_match_count: 1,
      kpi_key: key,
      title: "Valid title",
      target_value: "75",
      sort_order: 1,
      link: null,
      category_code: "kpi_master",
      category_name: "ตัวชี้วัดพื้นฐาน",
      category_order: 1,
      subgroup: null,
      is_quarterly: false,
      target_months: null,
      effective_quarter: null,
    });

    const app = buildApp({
      db: createFakeDatabase({
        kpiRows: [
          row("s_kpi_anc12"),
          row("   "),
        ],
      }),
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/kpis",
      });
      assert.equal(response.statusCode, 503);
      assert.equal(response.body, '{"error":"service_unavailable"}');
      assert.equal(response.body.includes("s_kpi_anc12"), false);
      assert.equal(response.body.includes("Valid title"), false);
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog enforces nonblank live display fields in preactivation and active modes",

  async (t) => {
    const fields = [
      { sql: "title", publicName: "title" },
      { sql: "category_code", publicName: "categoryCode" },
      { sql: "category_name", publicName: "category" },
    ] as const;

    const candidates: readonly {
      readonly name: string;
      readonly value: unknown;
      readonly valid: boolean;
    }[] = [
      { name: "empty string", value: "", valid: false },
      { name: "spaces only", value: "   ", valid: false },
      { name: "tabs and newlines only", value: "\t\n", valid: false },
      { name: "non-string", value: 42, valid: false },
      { name: "null", value: null, valid: false },
      { name: "ordinary text", value: "Thai health KPI", valid: true },
      { name: "padded nonblank text", value: "  KPI Name  ", valid: true },
    ];

    for (const mode of ["live", "active"] as const) {
      for (const field of fields) {
        for (const candidate of candidates) {
          await t.test(
            `${mode} ${field.publicName}: ${candidate.name}`,
            async () => {
              const row: Record<string, unknown> = {
                active_sync_run_id: mode === "active" ? "42" : null,
                snapshot_definition_present: mode === "active",
                snapshot_definition_match_count: mode === "active" ? 1 : 0,
                kpi_key: "s_kpi_anc12",
                title: "ANC",
                target_value: "75",
                sort_order: 1,
                link: "",
                category_code: "kpi_master",
                category_name: "ตัวชี้วัดพื้นฐาน",
                category_order: 1,
                subgroup: "",
                is_quarterly: false,
                target_months: null,
                effective_quarter: null,
              };
              row[field.sql] = candidate.value;

              const app = buildApp({
                db: createFakeDatabase({ kpiRows: [row] }),
              });
              try {
                const response = await app.inject({
                  method: "GET",
                  url: "/api/v1/kpis",
                });

                if (!candidate.valid) {
                  assert.equal(response.statusCode, 503);
                  assert.equal(
                    response.body,
                    '{"error":"service_unavailable"}',
                  );
                  assert.equal(response.body.includes("s_kpi_anc12"), false);
                } else {
                  assert.equal(response.statusCode, 200);
                  const payload = response.json() as {
                    readonly kpis: readonly Record<string, unknown>[];
                  };
                  assert.equal(payload.kpis.length, 1);
                  assert.equal(
                    payload.kpis[0]?.[field.publicName],
                    candidate.value,
                  );
                  assert.equal(payload.kpis[0]?.subgroup, "");
                  assert.equal(payload.kpis[0]?.link, "");
                }
              } finally {
                await app.close();
              }
            },
          );
        }
      }
    }
  },
);

test(
  "KPI catalog rejects one invalid selected display field without partial output",

  async () => {
    const makeRow = (key: string, title: string) => ({
      active_sync_run_id: "42",
      snapshot_definition_present: true,
      snapshot_definition_match_count: 1,
      kpi_key: key,
      title,
      target_value: "75",
      sort_order: 1,
      link: null,
      category_code: "kpi_master",
      category_name: "ตัวชี้วัดพื้นฐาน",
      category_order: 1,
      subgroup: null,
      is_quarterly: false,
      target_months: null,
      effective_quarter: null,
    });

    const app = buildApp({
      db: createFakeDatabase({
        kpiRows: [
          makeRow("s_kpi_anc12", "ANC"),
          makeRow("s_kpi_food", "  "),
        ],
      }),
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/kpis",
      });
      assert.equal(response.statusCode, 503);
      assert.equal(response.body, '{"error":"service_unavailable"}');
      assert.equal(response.body.includes("s_kpi_anc12"), false);
      assert.equal(response.body.includes("ANC"), false);
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog accepts only frontend-compatible external links in live and active modes",

  async (t) => {
    const scenarios: readonly {
      readonly name: string;
      readonly value: unknown;
      readonly valid: boolean;
    }[] = [
      { name: "null", value: null, valid: true },
      { name: "empty string", value: "", valid: true },
      {
        name: "HTTPS path query and fragment",
        value: "https://example.test/kpi?foo=1#section",
        valid: true,
      },
      {
        name: "HTTP absolute URL",
        value: "http://example.test/detail",
        valid: true,
      },
      {
        name: "localhost URL stays accepted by current contract",
        value: "http://127.0.0.1:8080/detail",
        valid: true,
      },
      {
        name: "javascript scheme",
        value: "javascript:alert(1)",
        valid: false,
      },
      {
        name: "data scheme",
        value: "data:text/html,<h1>x</h1>",
        valid: false,
      },
      {
        name: "file scheme",
        value: "file:///tmp/detail",
        valid: false,
      },
      {
        name: "ftp scheme",
        value: "ftp://example.test/file",
        valid: false,
      },
      {
        name: "absolute path",
        value: "/detail",
        valid: false,
      },
      {
        name: "relative path",
        value: "detail/1",
        valid: false,
      },
      {
        name: "malformed HTTPS",
        value: "https://",
        valid: false,
      },
      {
        name: "whitespace only",
        value: "   ",
        valid: false,
      },
      {
        name: "padded prefix",
        value: " https://example.test/kpi",
        valid: false,
      },
      {
        name: "padded suffix",
        value: "https://example.test/kpi ",
        valid: false,
      },
      { name: "number", value: 123, valid: false },
      { name: "boolean", value: true, valid: false },
      { name: "object", value: {}, valid: false },
    ];

    for (const mode of ["live", "active"] as const) {
      for (const scenario of scenarios) {
        await t.test(
          `${mode}: ${scenario.name}`,
          async () => {
            const db = createFakeDatabase({
              kpiRows: [{
                active_sync_run_id:
                  mode === "active" ? "42" : null,
                snapshot_definition_present:
                  mode === "active",
                snapshot_definition_match_count:
                  mode === "active" ? 1 : 0,
                kpi_key: "s_kpi_anc12",
                title: "ANC",
                target_value: "75",
                sort_order: 1,
                link: scenario.value,
                category_code: "kpi_master",
                category_name: "ตัวชี้วัดพื้นฐาน",
                category_order: 1,
                subgroup: "",
                is_quarterly: false,
                target_months: null,
                effective_quarter: null,
              }],
            });
            const app = buildApp({ db });
            try {
              const response = await app.inject({
                method: "GET",
                url: "/api/v1/kpis",
              });
              if (!scenario.valid) {
                assert.equal(response.statusCode, 503);
                assert.equal(
                  response.body,
                  '{"error":"service_unavailable"}',
                );
              } else {
                assert.equal(response.statusCode, 200);
                const body = response.json() as {
                  readonly kpis: readonly {
                    readonly link: string | null;
                    readonly subgroup: string | null;
                  }[];
                };
                assert.equal(body.kpis.length, 1);
                assert.equal(body.kpis[0]?.link, scenario.value);
                assert.equal(body.kpis[0]?.subgroup, "");
              }
            } finally {
              await app.close();
            }
          },
        );
      }
    }
  },
);

test(
  "KPI catalog refuses partial responses when a selected link is invalid",

  async () => {
    const makeRow = (key: string, link: string) => ({
      active_sync_run_id: "42",
      snapshot_definition_present: true,
      snapshot_definition_match_count: 1,
      kpi_key: key,
      title: "KPI",
      target_value: "75",
      sort_order: 1,
      link,
      category_code: "kpi_master",
      category_name: "ตัวชี้วัดพื้นฐาน",
      category_order: 1,
      subgroup: null,
      is_quarterly: false,
      target_months: null,
      effective_quarter: null,
    });

    const db = createFakeDatabase({
      kpiRows: [
        makeRow("s_kpi_anc12", "https://example.test/valid"),
        makeRow("s_kpi_food", "javascript:alert(1)"),
      ],
    });

    const app = buildApp({ db });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/kpis",
      });
      assert.equal(response.statusCode, 503);
      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
      assert.equal(response.body.includes("s_kpi_anc12"), false);
      assert.equal(response.body.includes("javascript:"), false);
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog fails closed without leaking database errors",

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
          url: "/api/v1/kpis",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
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

      assert.equal(
        response.body.includes(
          "pa_admin",
        ),
        false,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog enforces percentage target bounds in live and frozen modes",

  async (t) => {
    for (const mode of ["live", "active"] as const) {
      for (const candidate of [
        { target: null, expected: null },
        { target: "0", expected: 0 },
        { target: "85", expected: 85 },
        { target: "100", expected: 100 },
        { target: "-5", expected: undefined },
        { target: "150", expected: undefined },
      ]) {
        await t.test(
          `${mode} target ${String(candidate.target)}`,
          async () => {
            const db = createFakeDatabase({
              kpiRows: [{
                active_sync_run_id:
                  mode === "active" ? "42" : null,
                snapshot_definition_present:
                  mode === "active",
                snapshot_definition_match_count:
                  mode === "active" ? 1 : 0,
                kpi_key: "s_kpi_anc12",
                title: "ANC",
                target_value: candidate.target,
                sort_order: 1,
                link: null,
                category_code: "kpi_master",
                category_name: "ตัวชี้วัดพื้นฐาน",
                category_order: 1,
                subgroup: null,
                is_quarterly: false,
                target_months: null,
                effective_quarter: null,
              }],
            });
            const app = buildApp({ db });

            try {
              const response = await app.inject({
                method: "GET",
                url: "/api/v1/kpis",
              });

              if (candidate.expected === undefined) {
                assert.equal(response.statusCode, 503);
                assert.equal(
                  response.body,
                  '{"error":"service_unavailable"}',
                );
              } else {
                assert.equal(response.statusCode, 200);
                const body = response.json() as {
                  readonly kpis:
                    readonly { readonly target: number | null }[];
                };
                assert.equal(
                  body.kpis[0]?.target,
                  candidate.expected,
                );
              }
            } finally {
              await app.close();
            }
          },
        );
      }
    }
  },
);

test(
  "KPI catalog validates period metadata bounds for live and active effective values",

  async (t) => {
    const scenarios = [
      {
        name: "null period metadata",
        months: null,
        quarter: null,
        allowed: true,
      },
      {
        name: "lower bounds",
        months: 1,
        quarter: 1,
        allowed: true,
      },
      {
        name: "non-quarter month count",
        months: 8,
        quarter: 2,
        allowed: true,
      },
      {
        name: "upper bounds",
        months: 12,
        quarter: 4,
        allowed: true,
      },
      {
        name: "months zero",
        months: 0,
        quarter: 2,
        allowed: false,
      },
      {
        name: "months negative",
        months: -3,
        quarter: 2,
        allowed: false,
      },
      {
        name: "months above twelve",
        months: 13,
        quarter: 2,
        allowed: false,
      },
      {
        name: "quarter zero",
        months: 8,
        quarter: 0,
        allowed: false,
      },
      {
        name: "quarter negative",
        months: 8,
        quarter: -1,
        allowed: false,
      },
      {
        name: "quarter above four",
        months: 8,
        quarter: 5,
        allowed: false,
      },
      {
        name: "months non-integer",
        months: 1.5,
        quarter: 2,
        allowed: false,
      },
      {
        name: "quarter non-integer",
        months: 8,
        quarter: 1.5,
        allowed: false,
      },
      {
        name: "months wrong type",
        months: "8",
        quarter: 2,
        allowed: false,
      },
      {
        name: "quarter wrong type",
        months: 8,
        quarter: "2",
        allowed: false,
      },
    ] as const;

    for (const mode of ["live", "active"] as const) {
      for (const scenario of scenarios) {
        await t.test(
          `${mode}: ${scenario.name}`,
          async () => {
            const db = createFakeDatabase({
              kpiRows: [{
                active_sync_run_id:
                  mode === "active" ? "42" : null,
                snapshot_definition_present:
                  mode === "active",
                snapshot_definition_match_count:
                  mode === "active" ? 1 : 0,
                kpi_key: "s_kpi_anc12",
                title: "ANC",
                target_value: "75",
                sort_order: 1,
                link: null,
                category_code: "kpi_master",
                category_name: "ตัวชี้วัดพื้นฐาน",
                category_order: 1,
                subgroup: null,
                is_quarterly: true,
                target_months: scenario.months,
                effective_quarter: scenario.quarter,
              }],
            });

            const app = buildApp({ db });
            try {
              const response = await app.inject({
                method: "GET",
                url: "/api/v1/kpis",
              });
              if (!scenario.allowed) {
                assert.equal(response.statusCode, 503);
                assert.equal(
                  response.body,
                  '{"error":"service_unavailable"}',
                );
              } else {
                assert.equal(response.statusCode, 200);
                const payload = response.json() as {
                  readonly kpis: readonly {
                    readonly targetMonths: number | null;
                    readonly effectiveQuarter: number | null;
                  }[];
                };
                assert.equal(payload.kpis.length, 1);
                assert.equal(
                  payload.kpis[0]?.targetMonths,
                  scenario.months,
                );
                assert.equal(
                  payload.kpis[0]?.effectiveQuarter,
                  scenario.quarter,
                );
              }
            } finally {
              await app.close();
            }
          },
        );
      }
    }
  },
);

test(
  "KPI catalog rejects one malformed active period member without partial response",

  async () => {
    const makeRow = (key: string, months: number) => ({
      active_sync_run_id: "42",
      snapshot_definition_present: true,
      snapshot_definition_match_count: 1,
      kpi_key: key,
      title: "Valid title",
      target_value: "75",
      sort_order: 1,
      link: null,
      category_code: "kpi_master",
      category_name: "ตัวชี้วัดพื้นฐาน",
      category_order: 1,
      subgroup: null,
      is_quarterly: true,
      target_months: months,
      effective_quarter: 2,
    });
    const db = createFakeDatabase({
      kpiRows: [
        makeRow("s_kpi_anc12", 8),
        makeRow("s_kpi_food", 13),
      ],
    });
    const app = buildApp({ db });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/kpis",
      });
      assert.equal(response.statusCode, 503);
      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
      assert.equal(
        response.body.includes("s_kpi_anc12"),
        false,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog fails closed when a target cannot become a finite number",

  async () => {
    const db =
      createFakeDatabase({
        kpiRows: [
          {
            kpi_key:
              "s_kpi_broken_target",
            title:
              "Broken target",
            target_value:
              "not-a-number",
            sort_order: 1,
            link: null,
            category_code:
              "kpi_master",
            category_name:
              "ตัวชี้วัดพื้นฐาน",
            category_order: 1,
            subgroup: null,
            is_quarterly: false,
            target_months: null,
            effective_quarter: null,
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
          url: "/api/v1/kpis",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog fails closed when an active member lacks a snapshot definition",

  async () => {
    const db =
      createFakeDatabase({
        kpiRows: [
          {
            active_sync_run_id:
              "42",
            snapshot_definition_present:
              false,
            snapshot_definition_match_count:
              0,
            kpi_key:
              "s_kpi_anc12",
            title:
              "ANC 12 weeks",
            target_value:
              "75",
            sort_order: 1,
            link: null,
            category_code:
              "kpi_master",
            category_name:
              "ตัวชี้วัดพื้นฐาน",
            category_order: 1,
            subgroup: null,
            is_quarterly: false,
            target_months: null,
            effective_quarter: null,
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
          url: "/api/v1/kpis",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "KPI catalog fails closed when an active member has duplicate snapshot definitions",

  async () => {
    const db =
      createFakeDatabase({
        kpiRows: [
          {
            active_sync_run_id:
              "42",
            snapshot_definition_present:
              true,
            snapshot_definition_match_count:
              2,
            kpi_key:
              "s_kpi_anc12",
            title:
              "ANC 12 weeks",
            target_value:
              "75",
            sort_order: 1,
            link: null,
            category_code:
              "kpi_master",
            category_name:
              "ตัวชี้วัดพื้นฐาน",
            category_order: 1,
            subgroup: null,
            is_quarterly: false,
            target_months: null,
            effective_quarter: null,
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
          url: "/api/v1/kpis",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "sync status reports no history when the singleton has no runs",

  async () => {
    const db =
      createFakeDatabase({
        syncRows: [
          {
            active_sync_run_id:
              null,
            latest_id: null,
            latest_status: null,
            latest_fiscal_year:
              null,
            latest_current_quarter:
              null,
            latest_expected_source_count:
              null,
            latest_completed_source_count:
              null,
            latest_failed_source_count:
              null,
            latest_started_at:
              null,
            latest_finished_at:
              null,
            latest_activated_at:
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
          url: "/api/v1/sync-status",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"activeSyncRunId":null,"latestRun":null}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "sync status keeps the active dataset distinct from a newer failed run",

  async () => {
    const startedAt = new Date(
      "2026-09-18T02:00:00.000Z",
    );

    const finishedAt = new Date(
      "2026-09-18T02:05:00.000Z",
    );

    const db =
      createFakeDatabase({
        syncRows: [
          {
            active_sync_run_id:
              "42",
            latest_id: "43",
            latest_status: "failed",
            latest_fiscal_year:
              2569,
            latest_current_quarter:
              4,
            latest_expected_source_count:
              2,
            latest_completed_source_count:
              0,
            latest_failed_source_count:
              2,
            latest_started_at:
              startedAt,
            latest_finished_at:
              finishedAt,
            latest_activated_at:
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
          url: "/api/v1/sync-status",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.deepEqual(
        response.json(),
        {
          activeSyncRunId:
            "42",
          latestRun: {
            id: "43",
            status: "failed",
            fiscalYear: 2569,
            currentQuarter: 4,
            expectedSourceCount:
              2,
            completedSourceCount:
              0,
            failedSourceCount:
              2,
            startedAt:
              startedAt.toISOString(),
            finishedAt:
              finishedAt.toISOString(),
            activatedAt: null,
          },
        },
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "sync status preserves BIGINT identifiers as exact strings",

  async () => {
    const db =
      createFakeDatabase({
        syncRows: [
          {
            active_sync_run_id:
              42,
            latest_id:
              "9007199254740993",
            latest_status:
              "succeeded",
            latest_fiscal_year:
              2569,
            latest_current_quarter:
              4,
            latest_expected_source_count:
              1,
            latest_completed_source_count:
              1,
            latest_failed_source_count:
              0,
            latest_started_at:
              new Date(
                "2026-09-18T01:00:00.000Z",
              ),
            latest_finished_at:
              new Date(
                "2026-09-18T01:05:00.000Z",
              ),
            latest_activated_at:
              new Date(
                "2026-09-18T01:06:00.000Z",
              ),
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
          url: "/api/v1/sync-status",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      const body =
        response.json() as {
          readonly activeSyncRunId:
            string | null;
          readonly latestRun: {
            readonly id: string;
            readonly activatedAt:
              string | null;
          } | null;
        };

      assert.equal(
        body.activeSyncRunId,
        "42",
      );

      assert.equal(
        body.latestRun?.id,
        "9007199254740993",
      );

      assert.equal(
        typeof body.latestRun
          ?.id,
        "string",
      );

      assert.equal(
        body.latestRun
          ?.activatedAt,
        "2026-09-18T01:06:00.000Z",
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "sync status fails closed without leaking database errors",

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
          url: "/api/v1/sync-status",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
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
  "sync status fails closed when the app_state singleton is missing",

  async () => {
    const db =
      createFakeDatabase({
        syncRows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/sync-status",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "sync status fails closed on malformed runtime rows",

  async (t) => {
    const baseRow = {
      active_sync_run_id:
        "42",
      latest_id: "43",
      latest_fiscal_year:
        2569,
      latest_current_quarter:
        4,
      latest_expected_source_count:
        1,
      latest_completed_source_count:
        1,
      latest_failed_source_count:
        0,
      latest_started_at:
        new Date(
          "2026-09-18T01:00:00.000Z",
        ),
      latest_finished_at:
        new Date(
          "2026-09-18T01:05:00.000Z",
        ),
      latest_activated_at:
        null,
    };

    const malformedRows = [
      {
        reason:
          "invalid status",
        row: {
          ...baseRow,
          latest_status:
            "exploded",
        },
      },
      {
        reason:
          "string timestamp",
        row: {
          ...baseRow,
          latest_status:
            "succeeded",
          latest_started_at:
            "2026-09-18T01:00:00.000Z",
        },
      },
      {
        reason:
          "invalid timestamp",
        row: {
          ...baseRow,
          latest_status:
            "succeeded",
          latest_started_at:
            new Date(
              "not-a-timestamp",
            ),
        },
      },
    ];

    for (
      const malformed
      of malformedRows
    ) {
      await t.test(
        malformed.reason,

        async () => {
          const db =
            createFakeDatabase({
              syncRows: [
                malformed.row,
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/sync-status",
              });

            assert.equal(
              response.statusCode,
              503,
            );

            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
          } finally {
            await app.close();
          }
        },
      );
    }
  },
);

test(
  "facilities endpoint returns only public fields in SQL order",

  async () => {
    const db =
      createFakeDatabase({
        facilityRows: [
          {
            hospcode: "06413",
            hospname: "บ้านหนุน",
            tambon_id:
              "540601",
          },
          {
            hospcode: "10702",
            hospname:
              "โรงพยาบาลท่าวังทอง",
            tambon_id:
              "540602",
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
          url: "/api/v1/facilities",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.deepEqual(
        response.json(),
        {
          facilities: [
            {
              hospcode:
                "06413",
              hospname:
                "บ้านหนุน",
              tambonId:
                "540601",
            },
            {
              hospcode:
                "10702",
              hospname:
                "โรงพยาบาลท่าวังทอง",
              tambonId:
                "540602",
            },
          ],
        },
      );

      const body =
        response.body;

      assert.equal(
        body.includes(
          "tambon_id",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "metadata",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "updated_at",
        ),
        false,
      );

      const facilities =
        (response.json() as {
          readonly facilities:
            readonly Record<
              string,
              unknown
            >[];
        }).facilities;

      assert.deepEqual(
        Object.keys(
          facilities[0] ?? {},
        ).sort(),
        [
          "hospcode",
          "hospname",
          "tambonId",
        ],
      );

      const queries =
        db.getQueries();

      assert.equal(
        queries.length,
        1,
      );

      const sql = (queries[0] ??
        "").replace(/\s+/g, " ");

      assert.ok(
        sql.includes(
          "SELECT hospcode, hospname, tambon_id",
        ),
      );

      assert.ok(
        sql.includes(
          "FROM facilities",
        ),
      );

      assert.ok(
        sql.includes(
          "ORDER BY hospcode ASC",
        ),
      );

      assert.equal(
        sql.includes(
          "metadata",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "updated_at",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "district_id",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "zip_code",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "JOIN",
        ),
        false,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "facilities endpoint returns an empty catalog without rows",

  async () => {
    const db =
      createFakeDatabase({
        facilityRows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/facilities",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"facilities":[]}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "facilities endpoint fails closed without leaking database errors",

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
          url: "/api/v1/facilities",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
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
  "facilities endpoint fails closed on malformed reference rows",

  async (t) => {
    const validRow = {
      hospcode: "06413",
      hospname: "บ้านหนุน",
      tambon_id: "540601",
    };

    const malformedRows = [
      {
        reason:
          "hospcode too short",
        row: {
          ...validRow,
          hospcode: "6413",
        },
      },
      {
        reason:
          "hospcode not numeric",
        row: {
          ...validRow,
          hospcode: "abcde",
        },
      },
      {
        reason:
          "hospcode not a string",
        row: {
          ...validRow,
          hospcode: 6413,
        },
      },
      {
        reason:
          "blank hospname",
        row: {
          ...validRow,
          hospname: "   ",
        },
      },
      {
        reason:
          "null tambon_id",
        row: {
          ...validRow,
          tambon_id: null,
        },
      },
      {
        reason:
          "invalid tambon_id",
        row: {
          ...validRow,
          tambon_id:
            "54060",
        },
      },
    ];

    for (
      const malformed
      of malformedRows
    ) {
      await t.test(
        malformed.reason,

        async () => {
          const db =
            createFakeDatabase({
              facilityRows: [
                validRow,
                malformed.row,
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/facilities",
              });

            assert.equal(
              response.statusCode,
              503,
            );

            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
          } finally {
            await app.close();
          }
        },
      );
    }
  },
);

test(
  "tambons endpoint returns only public fields in SQL order",

  async () => {
    const db =
      createFakeDatabase({
        tambonRows: [
          {
            id: "540601",
            name_th: "บ้านหนุน",
          },
          {
            id: "540602",
            name_th:
              "บ้านกลาง",
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
          url: "/api/v1/tambons",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.deepEqual(
        response.json(),
        {
          tambons: [
            {
              id: "540601",
              nameTh:
                "บ้านหนุน",
            },
            {
              id: "540602",
              nameTh:
                "บ้านกลาง",
            },
          ],
        },
      );

      const body =
        response.body;

      assert.equal(
        body.includes(
          "name_th",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "district_id",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "districtId",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "zip_code",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "zipCode",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "metadata",
        ),
        false,
      );

      assert.equal(
        body.includes(
          "updated_at",
        ),
        false,
      );

      const tambons =
        (response.json() as {
          readonly tambons:
            readonly Record<
              string,
              unknown
            >[];
        }).tambons;

      assert.deepEqual(
        Object.keys(
          tambons[0] ?? {},
        ).sort(),
        [
          "id",
          "nameTh",
        ],
      );

      const queries =
        db.getQueries();

      assert.equal(
        queries.length,
        1,
      );

      const sql = (queries[0] ??
        "").replace(/\s+/g, " ");

      assert.ok(
        sql.includes(
          "SELECT id, name_th",
        ),
      );

      assert.ok(
        sql.includes(
          "FROM tambons",
        ),
      );

      assert.ok(
        sql.includes(
          "ORDER BY id ASC",
        ),
      );

      assert.equal(
        sql.includes(
          "district_id",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "zip_code",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "metadata",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "updated_at",
        ),
        false,
      );

      assert.equal(
        sql.includes(
          "JOIN",
        ),
        false,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "tambons endpoint returns an empty catalog without rows",

  async () => {
    const db =
      createFakeDatabase({
        tambonRows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/tambons",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"tambons":[]}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "tambons endpoint fails closed without leaking database errors",

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
          url: "/api/v1/tambons",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
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
  "tambons endpoint fails closed on malformed reference rows",

  async (t) => {
    const validRow = {
      id: "540601",
      name_th: "บ้านหนุน",
    };

    const malformedRows = [
      {
        reason: "id too long",
        row: {
          ...validRow,
          id: "5406011",
        },
      },
      {
        reason:
          "id not numeric",
        row: {
          ...validRow,
          id: "5406ab",
        },
      },
      {
        reason: "null id",
        row: {
          ...validRow,
          id: null,
        },
      },
      {
        reason:
          "blank name_th",
        row: {
          ...validRow,
          name_th: "",
        },
      },
      {
        reason:
          "whitespace name_th",
        row: {
          ...validRow,
          name_th: "   ",
        },
      },
    ];

    for (
      const malformed
      of malformedRows
    ) {
      await t.test(
        malformed.reason,

        async () => {
          const db =
            createFakeDatabase({
              tambonRows: [
                validRow,
                malformed.row,
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/tambons",
              });

            assert.equal(
              response.statusCode,
              503,
            );

            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
          } finally {
            await app.close();
          }
        },
      );
    }
  },
);

test(
  "dashboard returns the active dataset with the exact public shape",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow(),
          createDashboardRow({
            definition_sort_order: 2,
            kpi_key: "s_anc5",
            period_code: "q1",
            areacode: "54060101",
            hospcode: null,
            target: "87.5",
            result: "60.5",
          }),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      const body =
        response.json() as {
          readonly dataset: {
            readonly syncRunId: string;
            readonly sourceLastUpdated:
              string | null;
          };
          readonly results:
            readonly {
              readonly target: number;
              readonly result: number;
            }[];
        };

      assert.equal(
        typeof body.results[0]
          ?.target,
        "number",
      );

      assert.deepEqual(
        response.json(),
        {
          dataset: {
            syncRunId: "42",
            fiscalYear: 2569,
            currentQuarter: 4,
            activatedAt:
              "2026-09-27T01:30:00.000Z",
            sourceLastUpdated:
              "202609261230",
          },
          results: [
            {
              kpiKey:
                "s_kpi_anc12",
              periodCode: "q2",
              areacode:
                "54060101",
              hospcode:
                "06413",
              target: 100,
              result: 80,
            },
            {
              kpiKey: "s_anc5",
              periodCode: "q1",
              areacode:
                "54060101",
              hospcode: null,
              target: 87.5,
              result: 60.5,
            },
          ],
        },
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard preserves BIGINT sync run identity as an exact string",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow({
            active_sync_run_id:
              "9007199254740993",
            run_id:
              "9007199254740993",
          }),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      const body =
        response.json() as {
          readonly dataset: {
            readonly syncRunId: string;
          };
        };

      assert.equal(
        body.dataset.syncRunId,
        "9007199254740993",
      );

      assert.equal(
        typeof body.dataset
          .syncRunId,
        "string",
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard exposes only public dataset and result fields",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow(),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      const body =
        response.json() as {
          readonly dataset:
            Record<string, unknown>;
          readonly results:
            readonly Record<
              string,
              unknown
            >[];
        };

      assert.deepEqual(
        Object.keys(
          body.dataset,
        ).sort(),
        [
          "activatedAt",
          "currentQuarter",
          "fiscalYear",
          "sourceLastUpdated",
          "syncRunId",
        ],
      );

      assert.deepEqual(
        Object.keys(
          body.results[0] ?? {},
        ).sort(),
        [
          "areacode",
          "hospcode",
          "kpiKey",
          "periodCode",
          "result",
          "target",
        ],
      );

      for (
        const privateFragment
        of [
          "active_sync_run_id",
          "run_id",
          "run_status",
          "status",
          "expected_source_count",
          "expectedSourceCount",
          "completed_source_count",
          "completedSourceCount",
          "failed_source_count",
          "failedSourceCount",
          "finished_at",
          "finishedAt",
          "started_at",
          "startedAt",
          "config_snapshot",
          "configSnapshot",
          "error_summary",
          "errorSummary",
          "kpi_definition_id",
          "kpiDefinitionId",
          "details",
          "raw_payload",
          "rawPayload",
          "payload",
          "calculated_at",
          "calculatedAt",
          "sort_order",
          "definition_sort_order",
          "source_last_updated",
        ]
      ) {
        assert.equal(
          response.body.includes(
            privateFragment,
          ),
          false,
          `Dashboard payload must not expose: ${privateFragment}`,
        );
      }
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard query observes the whole active dataset in one bounded statement",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow(),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      await app.inject({
        method: "GET",
        url: "/api/v1/dashboard",
      });

      const queries =
        db.getQueries();

      assert.equal(
        queries.length,
        1,
      );

      const sql = (queries[0] ??
        "").replace(/\s+/g, " ");

      assert.ok(
        sql.includes(
          "FROM app_state",
        ),
      );

      assert.ok(
        sql.includes(
          "active_sync_run_id",
        ),
      );

      assert.ok(
        sql.includes(
          "FROM sync_runs",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi_results",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi_definitions",
        ),
      );

      assert.ok(
        sql.includes(
          "config_snapshot",
        ),
      );

      assert.ok(
        sql.includes(
          "jsonb_array_elements",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition IS NOT NULL AS snapshot_definition_present",
        ),
      );

      assert.ok(
        sql.includes(
          "COUNT(*) OVER ()::INTEGER AS definition_match_count",
        ),
      );

      assert.ok(
        sql.includes(
          "WITH ORDINALITY",
        ),
      );

      assert.ok(
        sql.includes(
          "COALESCE( snapshot.definition_match_count, 0 ) AS snapshot_definition_match_count",
        ),
      );

      assert.ok(
        sql.includes(
          "snapshot.definition ? 'kpiKey'",
        ),
      );

      assert.ok(
        sql.includes(
          "ELSE definition.kpi_key",
        ),
      );

      assert.ok(
        sql.includes(
          "source_records",
        ),
      );

      assert.ok(
        sql.includes(
          "date_com",
        ),
      );

      assert.ok(
        sql.includes(
          "MAX(source.date_com)",
        ),
      );

      assert.ok(sql.includes("kpi.fiscal_year AS result_fiscal_year"));

      assert.ok(
        sql.includes(
          "kpi.kpi_definition_id::TEXT AS kpi_definition_id",
        ),
        "Dashboard must retain private definition identity for key-collision checks",
      );

      assert.ok(
        sql.includes(
          "kpi.sync_run_id = state.active_sync_run_id",
        ),
        "Results must be restricted to the active run",
      );

      assert.ok(
        sql.includes(
          "source.sync_run_id = state.active_sync_run_id",
        ),
        "Freshness must be restricted to the active run",
      );

      assert.ok(
        sql.includes(
          "ORDER BY",
        ),
      );

      assert.ok(
        sql.includes(
          "definition.sort_order ASC",
        ),
      );

      assert.ok(
        sql.includes(
          "definition.kpi_key ASC",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi.period_code ASC",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi.areacode ASC",
        ),
      );

      assert.ok(
        sql.includes(
          "kpi.hospcode ASC NULLS FIRST",
        ),
      );

      for (
        const forbiddenFragment
        of [
          "raw_payload",
          "error_summary",
          "started_at",
          "details",
        ]
      ) {
        assert.equal(
          sql.includes(
            forbiddenFragment,
          ),
          false,
          `Dashboard statement must not read: ${forbiddenFragment}`,
        );
      }
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard returns the normal empty state when no dataset is activated",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          {
            active_sync_run_id:
              null,
            run_id: null,
            run_status: null,
            fiscal_year: null,
            current_quarter: null,
            expected_source_count:
              null,
            completed_source_count:
              null,
            failed_source_count:
              null,
            finished_at: null,
            activated_at: null,
            source_last_updated:
              null,
            definition_sort_order:
              null,
            kpi_key: null,
            period_code: null,
            areacode: null,
            hospcode: null,
            target: null,
            result: null,
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
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        200,
      );

      assert.equal(
        response.body,
        '{"dataset":null,"results":[]}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard fails closed when an active result lacks a snapshot definition",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow({
            snapshot_definition_present:
              false,
            snapshot_definition_match_count:
              0,
          }),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard fails closed when an active result has duplicate snapshot definitions",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow({
            snapshot_definition_match_count:
              2,
          }),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test("dashboard fails closed for mismatched result fiscal years", async (t) => {
  for (const candidate of [2570, 2568, "2569", null, 2569.5, undefined]) {
    await t.test(String(candidate), async () => {
      const app = buildApp({ db: createFakeDatabase({
        dashboardRows: [
          createDashboardRow({ hospcode: "06413" }),
          createDashboardRow({ hospcode: "10702", result_fiscal_year: candidate }),
        ],
      }) });
      try {
        const response = await app.inject({ method: "GET", url: "/api/v1/dashboard" });
        assert.equal(response.statusCode, 503);
        assert.equal(response.body, '{"error":"service_unavailable"}');
      } finally {
        await app.close();
      }
    });
  }
});

test(
  "dashboard rejects machine-key collisions across distinct active definition IDs",

  async () => {
    const db = createFakeDatabase({
      dashboardRows: [
        createDashboardRow({
          kpi_definition_id: "101",
          kpi_key: "s_anc5",
        }),
        createDashboardRow({
          kpi_definition_id: "102",
          kpi_key: "s_anc5",
          hospcode: "10702",
        }),
      ],
    });
    const app = buildApp({ db });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/dashboard",
      });

      assert.equal(response.statusCode, 503);
      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard permits repeated result rows for one definition ID",

  async () => {
    const db = createFakeDatabase({
      dashboardRows: [
        createDashboardRow({
          kpi_definition_id: "101",
          hospcode: "06413",
        }),
        createDashboardRow({
          kpi_definition_id: "101",
          hospcode: "10702",
        }),
      ],
    });
    const app = buildApp({ db });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/dashboard",
      });

      assert.equal(response.statusCode, 200);
      assert.equal(
        (response.json() as {
          readonly results: readonly unknown[];
        }).results.length,
        2,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard fails closed without leaking database errors",

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
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
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
  "dashboard fails closed when the app_state singleton is missing",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard fails closed when the active run is malformed or ineligible",

  async (t) => {
    const ineligibleRows = [
      {
        reason:
          "running run",
        overrides: {
          run_status: "running",
        },
      },
      {
        reason: "failed run",
        overrides: {
          run_status: "failed",
        },
      },
      {
        reason:
          "active run metadata missing",
        overrides: {
          run_id: null,
          run_status: null,
        },
      },
      {
        reason:
          "run id not decimal",
        overrides: {
          run_id: "sync-42",
        },
      },
      {
        reason:
          "empty run id",
        overrides: {
          run_id: "",
        },
      },
      {
        reason:
          "fiscal year not an integer",
        overrides: {
          fiscal_year: "2569",
        },
      },
      {
        reason:
          "quarter below range",
        overrides: {
          current_quarter: 0,
        },
      },
      {
        reason:
          "quarter above range",
        overrides: {
          current_quarter: 5,
        },
      },
      {
        reason:
          "quarter not an integer",
        overrides: {
          current_quarter: 4.5,
        },
      },
      {
        reason:
          "zero expected sources",
        overrides: {
          expected_source_count: 0,
          completed_source_count: 0,
        },
      },
      {
        reason:
          "incomplete run",
        overrides: {
          completed_source_count: 0,
        },
      },
      {
        reason:
          "run with failed sources",
        overrides: {
          failed_source_count: 1,
        },
      },
      {
        reason:
          "null finished timestamp",
        overrides: {
          finished_at: null,
        },
      },
      {
        reason:
          "string finished timestamp",
        overrides: {
          finished_at:
            "2026-09-27T01:25:00.000Z",
        },
      },
      {
        reason:
          "null activated timestamp",
        overrides: {
          activated_at: null,
        },
      },
      {
        reason:
          "invalid activated timestamp",
        overrides: {
          activated_at: new Date(
            "not-a-timestamp",
          ),
        },
      },
      {
        reason:
          "string activated timestamp",
        overrides: {
          activated_at:
            "2026-09-27T01:30:00.000Z",
        },
      },
    ];

    for (
      const ineligible
      of ineligibleRows
    ) {
      await t.test(
        ineligible.reason,

        async () => {
          const db =
            createFakeDatabase({
              dashboardRows: [
                createDashboardRow(
                  ineligible.overrides,
                ),
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/dashboard",
              });

            assert.equal(
              response.statusCode,
              503,
            );

            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
          } finally {
            await app.close();
          }
        },
      );
    }
  },
);

test(
  "dashboard fails closed when the active dataset has zero results",

  async () => {
    const db =
      createFakeDatabase({
        dashboardRows: [
          createDashboardRow({
            definition_sort_order:
              null,
            kpi_key: null,
            period_code: null,
            areacode: null,
            hospcode: null,
            target: null,
            result: null,
          }),
        ],
      });

    const app = buildApp({
      db,
    });

    try {
      const response =
        await app.inject({
          method: "GET",
          url: "/api/v1/dashboard",
        });

      assert.equal(
        response.statusCode,
        503,
      );

      assert.equal(
        response.body,
        '{"error":"service_unavailable"}',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard fails closed on malformed result rows without partial output",

  async (t) => {
    const malformedRows = [
      {
        reason:
          "blank kpi key",
        overrides: {
          kpi_key: "",
        },
      },
      {
        reason:
          "whitespace kpi key",
        overrides: {
          kpi_key: "   ",
        },
      },
      {
        reason:
          "invalid period",
        overrides: {
          period_code: "monthly",
        },
      },
      {
        reason:
          "uppercase period",
        overrides: {
          period_code: "Q2",
        },
      },
      {
        reason:
          "numeric period",
        overrides: {
          period_code: 2,
        },
      },
      {
        reason:
          "null period",
        overrides: {
          period_code: null,
        },
      },
      {
        reason:
          "blank areacode",
        overrides: {
          areacode: "",
        },
      },
      {
        reason:
          "whitespace areacode",
        overrides: {
          areacode: "   ",
        },
      },
      {
        reason:
          "null areacode",
        overrides: {
          areacode: null,
        },
      },
      {
        reason:
          "numeric areacode",
        overrides: {
          areacode: 54060101,
        },
      },
      {
        reason:
          "blank hospcode",
        overrides: {
          hospcode: "  ",
        },
      },
      {
        reason:
          "numeric hospcode",
        overrides: {
          hospcode: 6413,
        },
      },
      {
        reason:
          "non-numeric target",
        overrides: {
          target: "not-a-number",
        },
      },
      {
        reason:
          "blank target",
        overrides: {
          target: "  ",
        },
      },
      {
        reason:
          "null target",
        overrides: {
          target: null,
        },
      },
      {
        reason:
          "boolean target",
        overrides: {
          target: true,
        },
      },
      {
        reason:
          "object target",
        overrides: {
          target: {
            value: 100,
          },
        },
      },
      {
        reason:
          "null result",
        overrides: {
          result: null,
        },
      },
      {
        reason:
          "non-numeric result",
        overrides: {
          result: "eighty",
        },
      },
      {
        reason:
          "boolean result",
        overrides: {
          result: false,
        },
      },
    ];

    for (
      const malformed
      of malformedRows
    ) {
      await t.test(
        malformed.reason,

        async () => {
          const db =
            createFakeDatabase({
              dashboardRows: [
                createDashboardRow(),
                createDashboardRow(
                  malformed.overrides,
                ),
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/dashboard",
              });

            assert.equal(
              response.statusCode,
              503,
            );

            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
          } finally {
            await app.close();
          }
        },
      );
    }
  },
);

test(
  "dashboard fails closed on calendar-invalid source freshness markers",

  async (t) => {
    const cases: readonly {
      readonly name: string;
      readonly marker: unknown;
      readonly valid: boolean;
    }[] = [
      { name: "null", marker: null, valid: true },
      { name: "12-digit date", marker: "202609261230", valid: true },
      { name: "14-digit date", marker: "20260926123045", valid: true },
      { name: "2000 century leap day", marker: "20000229120000", valid: true },
      { name: "2028 leap day", marker: "202802291230", valid: true },
      { name: "2400 century leap day", marker: "24000229120000", valid: true },
      { name: "midnight", marker: "20260101000000", valid: true },
      { name: "last second", marker: "20261231235959", valid: true },
      { name: "month zero", marker: "202600011200", valid: false },
      { name: "month thirteen", marker: "202613011200", valid: false },
      { name: "day zero", marker: "202610001200", valid: false },
      { name: "April day 31", marker: "202604311200", valid: false },
      { name: "February day 30", marker: "202602301200", valid: false },
      { name: "nonleap February 29", marker: "202702291200", valid: false },
      { name: "1900 nonleap century", marker: "19000229120000", valid: false },
      { name: "2100 nonleap century", marker: "21000229120000", valid: false },
      { name: "hour 24", marker: "202610072400", valid: false },
      { name: "minute 60", marker: "202610071260", valid: false },
      { name: "second 60", marker: "20261007120060", valid: false },
      { name: "lexically dominant invalid month", marker: "202699011200", valid: false },
    ];

    for (const scenario of cases) {
      await t.test(scenario.name, async () => {
        const db = createFakeDatabase({
          dashboardRows: [
            createDashboardRow({ source_last_updated: scenario.marker }),
          ],
        });
        const app = buildApp({ db });

        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard",
          });
          if (!scenario.valid) {
            assert.equal(response.statusCode, 503);
            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
            assert.equal(response.body.includes("s_kpi_anc12"), false);
          } else {
            assert.equal(response.statusCode, 200);
            const body = response.json() as {
              readonly dataset: {
                readonly sourceLastUpdated: string | null;
              };
            };
            assert.equal(body.dataset.sourceLastUpdated, scenario.marker);
          }
        } finally {
          await app.close();
        }
      });
    }
  },
);

test(
  "dashboard SQL restricts active-run freshness to valid Gregorian calendar candidates",

  async () => {
    const db = createFakeDatabase({
      dashboardRows: [createDashboardRow()],
    });
    const app = buildApp({ db });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/dashboard",
      });
      assert.equal(response.statusCode, 200);
      const queries = db.getQueries();
      assert.equal(queries.length, 1);
      const sql = queries[0];
      assert.ok(sql);
      assert.ok(sql.includes("MAX(source.date_com)"));
      assert.ok(sql.includes("source.sync_run_id"));
      assert.ok(sql.includes("state.active_sync_run_id"));
      assert.ok(sql.includes("^[0-9]{12}([0-9]{2})?$"));
      assert.ok(sql.includes("SUBSTRING(source.date_com FROM 5 FOR 2)"));
      assert.ok(sql.includes("SUBSTRING(source.date_com FROM 7 FOR 2)"));
      assert.ok(sql.includes("SUBSTRING(source.date_com FROM 9 FOR 2)"));
      assert.ok(sql.includes("SUBSTRING(source.date_com FROM 11 FOR 2)"));
      assert.ok(sql.includes("SUBSTRING(source.date_com FROM 13 FOR 2)"));
      assert.ok(sql.includes("SUBSTRING(source.date_com FROM 1 FOR 4)"));
      assert.ok(sql.includes("% 400"));
      assert.ok(sql.includes("% 100"));
      assert.ok(sql.includes("% 4"));
      assert.ok(sql.includes("THEN 29"));
      assert.ok(sql.includes("ELSE 28"));
      assert.ok(sql.includes("ELSE FALSE"));
    } finally {
      await app.close();
    }
  },
);

test(
  "dashboard derives sourceLastUpdated only from valid source markers",

  async (t) => {
    const markerCases = [
      {
        reason:
          "valid 12-digit marker",
        marker:
          "202609261230",
      },
      {
        reason:
          "valid 14-digit marker",
        marker:
          "20260926123045",
      },
      {
        reason:
          "null marker",
        marker: null,
      },
    ];

    for (
      const markerCase
      of markerCases
    ) {
      await t.test(
        markerCase.reason,

        async () => {
          const db =
            createFakeDatabase({
              dashboardRows: [
                createDashboardRow({
                  source_last_updated:
                    markerCase.marker,
                }),
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/dashboard",
              });

            assert.equal(
              response.statusCode,
              200,
            );

            const body =
              response.json() as {
                readonly dataset: {
                  readonly sourceLastUpdated:
                    string | null;
                };
              };

            assert.equal(
              body.dataset
                .sourceLastUpdated,
              markerCase.marker,
            );
          } finally {
            await app.close();
          }
        },
      );
    }

    await t.test(
      "invalid marker lengths fail closed",

      async () => {
        for (
          const invalidMarker
          of [
            "2026092612304",
            "20260926",
            "2026092612304599",
            "2026-09-26 12:30",
            202609261230,
          ]
        ) {
          const db =
            createFakeDatabase({
              dashboardRows: [
                createDashboardRow({
                  source_last_updated:
                    invalidMarker,
                }),
              ],
            });

          const app = buildApp({
            db,
          });

          try {
            const response =
              await app.inject({
                method: "GET",
                url: "/api/v1/dashboard",
              });

            assert.equal(
              response.statusCode,
              503,
            );

            assert.equal(
              response.body,
              '{"error":"service_unavailable"}',
            );
          } finally {
            await app.close();
          }
        }
      },
    );
  },
);

test(
  "liveness remains available through buildApp without database access",

  async () => {
    const db =
      createFakeDatabase({});

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
        db.getQueries().length,
        0,
      );
    } finally {
      await app.close();
    }
  },
);
