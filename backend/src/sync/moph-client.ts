export const MOPH_REPORT_URL =
  "https://opendata.moph.go.th/api/report_data";

const MAX_ATTEMPTS = 3;

export interface MophFetchInit {
  readonly method: "POST";
  readonly headers:
    Record<string, string>;
  readonly body: string;
}

export interface MophFetchResponse {
  readonly ok: boolean;
  readonly status: number;

  json():
    Promise<unknown>;
}

export type MophFetch =
  (
    url: string,
    init: MophFetchInit,
  ) => Promise<MophFetchResponse>;

export type Sleep =
  (
    milliseconds: number,
  ) => Promise<void>;

export type Random =
  () => number;

export interface MophSourceRequest {
  readonly tableName: string;
  readonly year: string;
  readonly province: string;
  readonly limit?: number | null;
}

export type MophRow =
  Readonly<
    Record<string, unknown>
  >;

export interface MophClient {
  fetchSource(
    request: MophSourceRequest,
  ): Promise<readonly MophRow[]>;

  waitBetweenSources():
    Promise<void>;
}

export interface MophClientDependencies {
  readonly fetch: MophFetch;
  readonly sleep: Sleep;
  readonly random: Random;
}

export class MophTransportError
  extends Error {
  override readonly name: string =
    "MophTransportError";
}

export class MophSourceDataError
  extends Error {
  override readonly name: string =
    "MophSourceDataError";
}

const defaultFetch: MophFetch =
  async (
    url,
    init,
  ) => {
    const response =
      await fetch(
        url,
        {
          method: init.method,
          headers: init.headers,
          body: init.body,
        },
      );

    return {
      ok: response.ok,
      status: response.status,

      json:
        async () =>
          response.json(),
    };
  };

const defaultSleep: Sleep =
  async (milliseconds) => {
    await new Promise<void>(
      (resolve) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  };

function validateRequest(
  request: MophSourceRequest,
): void {
  if (
    request.tableName.trim().length === 0
  ) {
    throw new RangeError(
      "MOPH tableName must not be blank",
    );
  }

  if (
    !/^\d{4}$/.test(
      request.year,
    )
  ) {
    throw new RangeError(
      "MOPH year must be a four-digit string",
    );
  }

  if (
    !/^\d{2}$/.test(
      request.province,
    )
  ) {
    throw new RangeError(
      "MOPH province must be a two-digit string",
    );
  }

  if (
    request.limit !== undefined &&
    request.limit !== null &&
    (
      !Number.isInteger(
        request.limit,
      ) ||
      request.limit < 1
    )
  ) {
    throw new RangeError(
      "MOPH limit must be a positive integer",
    );
  }
}

function buildBody(
  request: MophSourceRequest,
): Record<string, unknown> {
  const body:
    Record<string, unknown> = {
      tableName:
        request.tableName,

      year:
        request.year,

      province:
        request.province,

      type:
        "json",
    };

  if (
    request.limit !== undefined &&
    request.limit !== null
  ) {
    body.limit =
      request.limit;
  }

  return body;
}

function unwrapRows(
  payload: unknown,
): unknown[] {
  if (
    Array.isArray(payload)
  ) {
    return payload;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    "data" in payload
  ) {
    const data =
      (
        payload as {
          readonly data?: unknown;
        }
      ).data;

    if (
      Array.isArray(data)
    ) {
      return data;
    }
  }

  throw new MophTransportError(
    "MOPH response has an unexpected JSON shape",
  );
}

function validateRows(
  tableName: string,
  rows: readonly unknown[],
): readonly MophRow[] {
  if (rows.length === 0) {
    throw new MophSourceDataError(
      `MOPH returned zero rows for ${tableName}`,
    );
  }

  const validated =
    rows.map(
      (
        row,
        index,
      ): MophRow => {
        if (
          typeof row !== "object" ||
          row === null ||
          Array.isArray(row)
        ) {
          throw new MophSourceDataError(
            `MOPH row ${index + 1} for ${tableName} is not a JSON object`,
          );
        }

        return Object.freeze({
          ...row,
        });
      },
    );

  return Object.freeze(
    validated,
  );
}

function normalizeTransportError(
  tableName: string,
  error: unknown,
): MophTransportError {
  if (
    error instanceof
    MophTransportError
  ) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : "unknown transport failure";

  return new MophTransportError(
    `MOPH request failed for ${tableName}: ${message}`,
    {
      cause: error,
    },
  );
}

async function fetchTransportRows(
  dependencies:
    MophClientDependencies,
  request: MophSourceRequest,
): Promise<unknown[]> {
  let lastError:
    MophTransportError | undefined;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const response =
        await dependencies.fetch(
          MOPH_REPORT_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                buildBody(
                  request,
                ),
              ),
          },
        );

      if (!response.ok) {
        throw new MophTransportError(
          `MOPH HTTP ${response.status} for ${request.tableName}`,
        );
      }

      const payload =
        await response.json();

      return unwrapRows(
        payload,
      );
    } catch (error) {
      lastError =
        normalizeTransportError(
          request.tableName,
          error,
        );

      if (
        attempt ===
        MAX_ATTEMPTS
      ) {
        break;
      }

      await dependencies.sleep(
        5000 * attempt,
      );
    }
  }

  throw (
    lastError ??
    new MophTransportError(
      `MOPH request failed for ${request.tableName}`,
    )
  );
}

export function getInterSourceDelayMs(
  random: Random,
): number {
  const value = random();

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    throw new RangeError(
      "Random jitter source must return a value from 0 inclusive to 1 exclusive",
    );
  }

  return (
    4000 +
    Math.floor(
      value * 3000,
    )
  );
}

export function createMophClient(
  overrides:
    Partial<MophClientDependencies> = {},
): MophClient {
  const dependencies:
    MophClientDependencies = {
      fetch:
        overrides.fetch ??
        defaultFetch,

      sleep:
        overrides.sleep ??
        defaultSleep,

      random:
        overrides.random ??
        Math.random,
    };

  return Object.freeze({
    async fetchSource(
      request: MophSourceRequest,
    ): Promise<
      readonly MophRow[]
    > {
      validateRequest(
        request,
      );

      const rows =
        await fetchTransportRows(
          dependencies,
          request,
        );

      return validateRows(
        request.tableName,
        rows,
      );
    },

    async waitBetweenSources():
      Promise<void> {
      await dependencies.sleep(
        getInterSourceDelayMs(
          dependencies.random,
        ),
      );
    },
  });
}
