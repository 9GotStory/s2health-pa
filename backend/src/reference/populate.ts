import {
  fileURLToPath,
} from "node:url";

import {
  resolve,
} from "node:path";

import {
  createDatabasePool,
} from "../db/client.js";

export const REFERENCE_LOCK_CLASS =
  20260913;

export const REFERENCE_LOCK_KEY =
  3;

const SOURCE_URL_ENV =
  "PA_REFERENCE_SOURCE_URL";

const HOSPITAL_SHEET =
  "hospitals";

const TAMBOON_SHEET =
  "tambon_master";

const EXPECTED_DISTRICT_ID =
  "5406";

const HOSPITAL_FIELDS = [
  "hospcode",
  "hospname",
  "tambon_id",
] as const;

const TAMBOON_FIELDS = [
  "id",
  "name_th",
  "district_id",
  "zip_code",
] as const;

const REQUEST_TIMEOUT_MS =
  30_000;

const INSERT_BATCH_SIZE = 64;

const SOURCE_URL_PATH_PATTERN =
  /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

const HOSPCODE_PATTERN =
  /^\d{5}$/;

const TAMBOON_ID_PATTERN =
  /^\d{6}$/;

const ZIP_CODE_PATTERN =
  /^\d{5}$/;

export class ReferencePopulationError
  extends Error {
  override readonly name: string =
    "ReferencePopulationError";
}

export class ReferenceSourceUrlError
  extends ReferencePopulationError {
  override readonly name: string =
    "ReferenceSourceUrlError";
}

export class ReferenceTransportError
  extends ReferencePopulationError {
  override readonly name: string =
    "ReferenceTransportError";
}

export class ReferenceSourceDataError
  extends ReferencePopulationError {
  override readonly name: string =
    "ReferenceSourceDataError";
}

export class ReferenceLockUnavailableError
  extends ReferencePopulationError {
  override readonly name: string =
    "ReferenceLockUnavailableError";
}

export interface ReferenceFetchInit {
  readonly method: "GET";
  readonly signal: AbortSignal;
}

export interface ReferenceFetchResponse {
  readonly ok: boolean;
  readonly status: number;

  json():
    Promise<unknown>;
}

export type ReferenceFetch =
  (
    url: string,
    init: ReferenceFetchInit,
  ) => Promise<ReferenceFetchResponse>;

export interface TambonReference {
  readonly id: string;
  readonly districtId: string;
  readonly nameTh: string;
  readonly zipCode:
    | string
    | null;
}

export interface FacilityReference {
  readonly hospcode: string;
  readonly hospname: string;
  readonly tambonId: string;
}

export interface ReferenceSnapshot {
  readonly tambons:
    readonly TambonReference[];

  readonly facilities:
    readonly FacilityReference[];
}

export interface ReferencePopulationSummary {
  readonly tambonCount: number;
  readonly facilityCount: number;
}

type Environment =
  Readonly<
    Record<
      string,
      string | undefined
    >
  >;

export interface ReferenceQueryResult {
  readonly rows:
    readonly {
      readonly acquired?: boolean;
    }[];
}

export interface ReferenceClient {
  query(
    text: string,
    values?:
      readonly unknown[],
  ): Promise<ReferenceQueryResult>;

  release(): void;
}

export type ReferencePool = {
  connect():
    Promise<ReferenceClient>;
};

export interface LoadReferenceSnapshotOptions {
  readonly sourceUrl: string;

  readonly fetch?:
    | ReferenceFetch
    | undefined;
}

export interface ReferencePopulationDependencies {
  readonly fetch?:
    | ReferenceFetch
    | undefined;

  readonly env?:
    | Environment
    | undefined;
}

const defaultFetch: ReferenceFetch =
  async (
    url,
    init,
  ) => {
    const response =
      await fetch(
        url,
        {
          method:
            init.method,
          signal:
            init.signal,
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

function sourceUrlError(
  message: string,
): never {
  throw new ReferenceSourceUrlError(
    message,
  );
}

function dataError(
  message: string,
): never {
  throw new ReferenceSourceDataError(
    message,
  );
}

export function getReferenceSourceUrl(
  env: Environment = process.env,
): string {
  const raw =
    env[SOURCE_URL_ENV]?.trim();

  if (
    raw === undefined ||
    raw.length === 0
  ) {
    return sourceUrlError(
      `${SOURCE_URL_ENV} is required`,
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return sourceUrlError(
      `${SOURCE_URL_ENV} must be a valid absolute URL`,
    );
  }

  if (
    parsed.protocol !== "https:"
  ) {
    return sourceUrlError(
      `${SOURCE_URL_ENV} must use the https protocol`,
    );
  }

  if (
    parsed.hostname !==
    "script.google.com"
  ) {
    return sourceUrlError(
      `${SOURCE_URL_ENV} hostname must be script.google.com`,
    );
  }

  if (
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return sourceUrlError(
      `${SOURCE_URL_ENV} must not contain credentials`,
    );
  }

  if (
    parsed.search !== ""
  ) {
    return sourceUrlError(
      `${SOURCE_URL_ENV} must not contain a query string`,
    );
  }

  if (parsed.hash !== "") {
    return sourceUrlError(
      `${SOURCE_URL_ENV} must not contain a fragment`,
    );
  }

  if (
    !SOURCE_URL_PATH_PATTERN.test(
      parsed.pathname,
    )
  ) {
    return sourceUrlError(
      `${SOURCE_URL_ENV} must be a Google Apps Script web-app URL`,
    );
  }

  return raw;
}

function buildSheetUrl(
  sourceUrl: string,
  sheet: string,
): string {
  const url =
    new URL(sourceUrl);

  url.searchParams.set(
    "sheet",
    sheet,
  );

  return url.toString();
}

type SourceRow =
  Readonly<
    Record<string, unknown>
  >;

function isPlainObject(
  value: unknown,
): value is SourceRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validateFields(
  row: SourceRow,
  expected:
    readonly string[],
  sheet: string,
): void {
  const keys =
    Object.keys(row).sort();

  const fields =
    [...expected].sort();

  if (
    keys.length !==
      fields.length ||
    keys.some(
      (
        key,
        index,
      ) =>
        key !== fields[index],
    )
  ) {
    return dataError(
      `${sheet} row fields must be exactly ${fields.join(", ")}`,
    );
  }
}

function validateRows(
  payload: unknown,
  sheet: string,
): readonly SourceRow[] {
  if (
    !Array.isArray(payload)
  ) {
    return dataError(
      `${sheet} payload must be a JSON array`,
    );
  }

  if (payload.length === 0) {
    return dataError(
      `${sheet} payload must not be empty`,
    );
  }

  return payload.map(
    (
      row,
      index,
    ) => {
      if (
        !isPlainObject(row)
      ) {
        return dataError(
          `${sheet} row ${index + 1} must be a JSON object`,
        );
      }

      return row;
    },
  );
}

function readString(
  row: SourceRow,
  field: string,
  label: string,
): string {
  const value = row[field];

  if (
    typeof value !== "string"
  ) {
    return dataError(
      `${label} field ${field} must be a string`,
    );
  }

  return value.trim();
}

function normalizeZipCode(
  row: SourceRow,
  label: string,
):
  | string
  | null {
  const value =
    row.zip_code;

  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    return dataError(
      `${label} zip_code must be a string or null`,
    );
  }

  const trimmed =
    value.trim();

  if (
    trimmed.length === 0
  ) {
    return null;
  }

  if (
    !ZIP_CODE_PATTERN.test(
      trimmed,
    )
  ) {
    return dataError(
      `${label} zip_code must be exactly five decimal digits`,
    );
  }

  return trimmed;
}

function normalizeHospitals(
  payload: unknown,
):
  readonly FacilityReference[] {
  const rows =
    validateRows(
      payload,
      HOSPITAL_SHEET,
    );

  const seen =
    new Set<string>();

  return rows.map(
    (
      row,
      index,
    ) => {
      validateFields(
        row,
        HOSPITAL_FIELDS,
        HOSPITAL_SHEET,
      );

      const label =
        `${HOSPITAL_SHEET} row ${index + 1}`;

      const hospcode =
        readString(
          row,
          "hospcode",
          label,
        );

      if (
        !HOSPCODE_PATTERN.test(
          hospcode,
        )
      ) {
        return dataError(
          `${label} hospcode must be exactly five decimal digits`,
        );
      }

      const hospname =
        readString(
          row,
          "hospname",
          label,
        );

      if (
        hospname.length === 0
      ) {
        return dataError(
          `${label} hospname must not be blank`,
        );
      }

      const tambonId =
        readString(
          row,
          "tambon_id",
          label,
        );

      if (
        !TAMBOON_ID_PATTERN.test(
          tambonId,
        )
      ) {
        return dataError(
          `${label} tambon_id must be exactly six decimal digits`,
        );
      }

      if (
        seen.has(hospcode)
      ) {
        return dataError(
          `${HOSPITAL_SHEET} contains duplicate hospcode: ${hospcode}`,
        );
      }

      seen.add(hospcode);

      return Object.freeze({
        hospcode,
        hospname,
        tambonId,
      });
    },
  );
}

function normalizeTambons(
  payload: unknown,
):
  readonly TambonReference[] {
  const rows =
    validateRows(
      payload,
      TAMBOON_SHEET,
    );

  const seen =
    new Set<string>();

  return rows.map(
    (
      row,
      index,
    ) => {
      validateFields(
        row,
        TAMBOON_FIELDS,
        TAMBOON_SHEET,
      );

      const label =
        `${TAMBOON_SHEET} row ${index + 1}`;

      const id =
        readString(
          row,
          "id",
          label,
        );

      if (
        !TAMBOON_ID_PATTERN.test(
          id,
        )
      ) {
        return dataError(
          `${label} id must be exactly six decimal digits`,
        );
      }

      const nameTh =
        readString(
          row,
          "name_th",
          label,
        );

      if (
        nameTh.length === 0
      ) {
        return dataError(
          `${label} name_th must not be blank`,
        );
      }

      const districtId =
        readString(
          row,
          "district_id",
          label,
        );

      if (
        districtId !==
        EXPECTED_DISTRICT_ID
      ) {
        return dataError(
          `${label} district_id must be ${EXPECTED_DISTRICT_ID}`,
        );
      }

      if (
        !id.startsWith(
          districtId,
        )
      ) {
        return dataError(
          `${label} id must start with district_id`,
        );
      }

      if (seen.has(id)) {
        return dataError(
          `${TAMBOON_SHEET} contains duplicate id: ${id}`,
        );
      }

      seen.add(id);

      return Object.freeze({
        id,
        districtId,
        nameTh,

        zipCode:
          normalizeZipCode(
            row,
            label,
          ),
      });
    },
  );
}

function compareByText(
  left: string,
  right: string,
): number {
  return (
    left < right
      ? -1
      : left > right
        ? 1
        : 0
  );
}

export function normalizeReferenceSnapshot(
  hospitalsPayload: unknown,
  tambonsPayload: unknown,
): ReferenceSnapshot {
  const tambons =
    normalizeTambons(
      tambonsPayload,
    );

  const facilities =
    normalizeHospitals(
      hospitalsPayload,
    );

  const tambonIds =
    new Set(
      tambons.map(
        (tambon) =>
          tambon.id,
      ),
    );

  for (
    const facility
    of facilities
  ) {
    if (
      !tambonIds.has(
        facility.tambonId,
      )
    ) {
      throw new ReferenceSourceDataError(
        `${HOSPITAL_SHEET} row references unknown tambon_id: ${facility.tambonId}`,
      );
    }
  }

  return Object.freeze({
    tambons:
      Object.freeze(
        [...tambons].sort(
          (
            left,
            right,
          ) =>
            compareByText(
              left.id,
              right.id,
            ),
        ),
      ),

    facilities:
      Object.freeze(
        [...facilities].sort(
          (
            left,
            right,
          ) =>
            compareByText(
              left.hospcode,
              right.hospcode,
            ),
        ),
      ),
  });
}

async function fetchSheetPayload(
  fetchImpl:
    ReferenceFetch,
  sourceUrl: string,
  sheet: string,
): Promise<unknown> {
  let response:
    ReferenceFetchResponse;

  try {
    response =
      await fetchImpl(
        buildSheetUrl(
          sourceUrl,
          sheet,
        ),
        {
          method: "GET",

          signal:
            AbortSignal.timeout(
              REQUEST_TIMEOUT_MS,
            ),
        },
      );
  } catch (error) {
    throw new ReferenceTransportError(
      `${sheet} request failed`,
      {
        cause: error,
      },
    );
  }

  if (!response.ok) {
    throw new ReferenceTransportError(
      `${sheet} request returned HTTP ${response.status}`,
    );
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ReferenceTransportError(
      `${sheet} response is not valid JSON`,
      {
        cause: error,
      },
    );
  }
}

export async function loadReferenceSnapshot(
  options:
    LoadReferenceSnapshotOptions,
): Promise<ReferenceSnapshot> {
  const fetchImpl =
    options.fetch ??
    defaultFetch;

  const payloads =
    await Promise.all([
      fetchSheetPayload(
        fetchImpl,
        options.sourceUrl,
        HOSPITAL_SHEET,
      ),

      fetchSheetPayload(
        fetchImpl,
        options.sourceUrl,
        TAMBOON_SHEET,
      ),
    ]);

  return normalizeReferenceSnapshot(
    payloads[0],
    payloads[1],
  );
}

async function rollbackQuietly(
  client: ReferenceClient,
): Promise<void> {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // Preserve the original replacement failure.
  }
}

function tuplePlaceholders(
  start: number,
  count: number,
): string {
  const parts: string[] =
    [];

  for (
    let position = 0;
    position < count;
    position += 1
  ) {
    parts.push(
      `$${start + position}`,
    );
  }

  return parts.join(
    ", ",
  );
}

async function insertTambons(
  client: ReferenceClient,
  tambons:
    readonly TambonReference[],
): Promise<void> {
  for (
    let offset = 0;
    offset < tambons.length;
    offset +=
      INSERT_BATCH_SIZE
  ) {
    const batch =
      tambons.slice(
        offset,
        offset +
          INSERT_BATCH_SIZE,
      );

    const parameters:
      unknown[] = [];

    const tuples: string[] =
      [];

    batch.forEach(
      (
        tambon,
        index,
      ) => {
        const start =
          index * 5;

        tuples.push(
          `(${tuplePlaceholders(start + 1, 4)}, $${start + 5}::JSONB, NOW())`,
        );

        parameters.push(
          tambon.id,
          tambon.districtId,
          tambon.nameTh,
          tambon.zipCode,
          "{}",
        );
      },
    );

    await client.query(
      `
        INSERT INTO tambons (
          id,
          district_id,
          name_th,
          zip_code,
          metadata,
          updated_at
        )
        VALUES ${tuples.join(", ")}
      `,
      parameters,
    );
  }
}

async function insertFacilities(
  client: ReferenceClient,
  facilities:
    readonly FacilityReference[],
): Promise<void> {
  for (
    let offset = 0;
    offset <
    facilities.length;
    offset +=
      INSERT_BATCH_SIZE
  ) {
    const batch =
      facilities.slice(
        offset,
        offset +
          INSERT_BATCH_SIZE,
      );

    const parameters:
      unknown[] = [];

    const tuples: string[] =
      [];

    batch.forEach(
      (
        facility,
        index,
      ) => {
        const start =
          index * 4;

        tuples.push(
          `(${tuplePlaceholders(start + 1, 3)}, $${start + 4}::JSONB, NOW())`,
        );

        parameters.push(
          facility.hospcode,
          facility.hospname,
          facility.tambonId,
          "{}",
        );
      },
    );

    await client.query(
      `
        INSERT INTO facilities (
          hospcode,
          hospname,
          tambon_id,
          metadata,
          updated_at
        )
        VALUES ${tuples.join(", ")}
      `,
      parameters,
    );
  }
}

async function tryAcquireReferenceLock(
  client: ReferenceClient,
): Promise<boolean> {
  const result =
    await client.query(
      `
        SELECT
          pg_try_advisory_xact_lock(
            $1,
            $2
          ) AS acquired
      `,
      [
        REFERENCE_LOCK_CLASS,
        REFERENCE_LOCK_KEY,
      ],
    );

  return (
    result.rows[0]?.acquired ===
    true
  );
}

export async function replaceReferenceSnapshot(
  pool: ReferencePool,
  snapshot: ReferenceSnapshot,
):
  Promise<ReferencePopulationSummary> {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    try {
      const acquired =
        await tryAcquireReferenceLock(
          client,
        );

      if (!acquired) {
        throw new ReferenceLockUnavailableError(
          "Another reference population invocation already holds the reference population lock",
        );
      }

      await client.query(
        "DELETE FROM facilities",
      );

      await client.query(
        "DELETE FROM tambons",
      );

      await insertTambons(
        client,
        snapshot.tambons,
      );

      await insertFacilities(
        client,
        snapshot.facilities,
      );

      await client.query(
        "COMMIT",
      );
    } catch (error) {
      await rollbackQuietly(
        client,
      );

      throw error;
    }
  } finally {
    client.release();
  }

  return Object.freeze({
    tambonCount:
      snapshot.tambons.length,

    facilityCount:
      snapshot.facilities
        .length,
  });
}

export async function populateReferenceMasters(
  pool: ReferencePool,
  dependencies:
    ReferencePopulationDependencies = {},
):
  Promise<ReferencePopulationSummary> {
  const sourceUrl =
    getReferenceSourceUrl(
      dependencies.env ??
        process.env,
    );

  const snapshot =
    await loadReferenceSnapshot({
      sourceUrl,

      fetch:
        dependencies.fetch,
    });

  return replaceReferenceSnapshot(
    pool,
    snapshot,
  );
}

async function main(): Promise<void> {
  getReferenceSourceUrl();

  const pool =
    createDatabasePool();

  try {
    const summary =
      await populateReferenceMasters(
        pool,
      );

    console.log(
      `Reference population complete: tambons=${summary.tambonCount} facilities=${summary.facilityCount}`,
    );
  } finally {
    await pool.end();
  }
}

const directEntryPath =
  process.argv[1] === undefined
    ? undefined
    : resolve(
        process.argv[1],
      );

if (
  directEntryPath ===
  fileURLToPath(
    import.meta.url,
  )
) {
  main().catch(
    (
      error: unknown,
    ) => {
      const message =
        error instanceof Error
          ? error.message
          : "Reference population failed";

      console.error(
        message,
      );

      process.exitCode = 1;
    },
  );
}
