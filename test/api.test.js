import test from "node:test";
import assert from "node:assert/strict";

import { readRuntimeConfig } from "../site/js/api.js";

test("runtime config accepts the production HTTPS origin with a port", () => {
  assert.deepEqual(
    readRuntimeConfig({
      S2HEALTH_CONFIG: {
        apiBaseUrl: "https://example.test:10000/",
      },
    }),
    {
      apiBaseUrl: "https://example.test:10000",
    },
  );
});

test("runtime config permits HTTP only for local development", () => {
  assert.deepEqual(
    readRuntimeConfig({
      S2HEALTH_CONFIG: {
        apiBaseUrl: "http://127.0.0.1:13001",
      },
    }),
    {
      apiBaseUrl: "http://127.0.0.1:13001",
    },
  );

  assert.throws(
    () =>
      readRuntimeConfig({
        S2HEALTH_CONFIG: {
          apiBaseUrl: "http://example.test",
        },
      }),
    /https/,
  );
});

test("runtime config rejects paths, credentials, query and fragment", () => {
  for (const apiBaseUrl of [
    "https://example.test/api",
    "https://user:password@example.test",
    "https://example.test/?mode=test",
    "https://example.test/#fragment",
  ]) {
    assert.throws(
      () =>
        readRuntimeConfig({
          S2HEALTH_CONFIG: {
            apiBaseUrl,
          },
        }),
      /origin_only/,
    );
  }
});

test("runtime config fails closed when missing", () => {
  assert.throws(
    () => readRuntimeConfig({}),
    /runtime_config_missing/,
  );

  assert.throws(
    () =>
      readRuntimeConfig({
        S2HEALTH_CONFIG: {
          apiBaseUrl: "",
        },
      }),
    /api_base_url_missing/,
  );
});
