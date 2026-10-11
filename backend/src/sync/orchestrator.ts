import type {
  Pool,
  PoolClient,
  QueryResultRow,
} from "pg";

import {
  calculateKpiResults,
  type CalculatedKpiResult,
} from "./calculation.js";

import {
  loadSyncConfigSnapshot,
  type SyncConfigSnapshot,
} from "./config.js";

import {
  withSyncSessionLock,
} from "./lock.js";

import {
  createMophClient,
  type MophClient,
  type MophRow,
} from "./moph-client.js";

const DISTRICT_AREA_PREFIX_PATTERN =
  /^\d{4}$/;

const MAX_ERROR_MESSAGE_LENGTH = 500;

const SOURCE_RECORD_INSERT_BATCH_SIZE = 64;

const KPI_RESULT_INSERT_BATCH_SIZE = 64;

export interface SyncOrchestratorDependencies {
  readonly mophClient?: MophClient;
  readonly now?: () => Date;
}

export interface SyncRunSummary {
  readonly syncRunId: string;
  readonly status: "succeeded";
  readonly activated: true;
  readonly completedSourceCount: number;
  readonly resultCount: number;
}

export class SyncOrchestrationError
  extends Error {
  override readonly name: string =
    "SyncOrchestrationError";
}

export class SyncActivationError
  extends SyncOrchestrationError {
  override readonly name: string =
    "SyncActivationError";
}

interface SyncRunIdRow
  extends QueryResultRow {
  readonly id: string;
}

interface DistrictScopeRow
  extends QueryResultRow {
  readonly value: unknown;
}

interface ActivationTargetRow
  extends QueryResultRow {
  readonly status: string;
  readonly finished_at: Date | null;
  readonly completed_source_count: number;
  readonly failed_source_count: number;
  readonly activated_at: Date | null;
}

interface AppStateRow
  extends QueryResultRow {
  readonly singleton_id: number;
}

interface SourceFailureEvidence {
  readonly sourceName: string;
  readonly errorName: string;
  readonly message: string;
}

type RunErrorSummary =
  | {
      readonly phase: "sources";
      readonly sources:
        readonly SourceFailureEvidence[];
    }
  | {
      readonly phase:
        "calculation"
        | "persistence";
      readonly message: string;
    };

function boundMessage(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    normalized.length === 0
  ) {
    return "unknown failure";
  }

  return (
    normalized.length <=
    MAX_ERROR_MESSAGE_LENGTH
      ? normalized
      : normalized.slice(
          0,
          MAX_ERROR_MESSAGE_LENGTH,
        )
  );
}

function describeError(
  error: unknown,
): {
  readonly errorName: string;
  readonly message: string;
} {
  const errorName =
    error instanceof Error &&
    error.name.length > 0
      ? error.name
      : "UnknownError";

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown failure";

  return {
    errorName,
    message:
      boundMessage(
        rawMessage,
      ),
  };
}

async function rollbackQuietly(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // Preserve the original transaction failure.
  }
}

async function loadDistrictAreaPrefix(
  client: PoolClient,
): Promise<string> {
  const result =
    await client.query<DistrictScopeRow>(
      `
        SELECT value
        FROM app_settings
        WHERE key = $1
      `,
      [
        "district_area_prefix",
      ],
    );

  const value =
    result.rows[0]?.value;

  if (
    typeof value !== "string" ||
    !DISTRICT_AREA_PREFIX_PATTERN.test(
      value,
    )
  ) {
    throw new SyncOrchestrationError(
      "app_settings.district_area_prefix must be a string of exactly four decimal digits",
    );
  }

  return value;
}

function freezeRunConfiguration(
  snapshot: SyncConfigSnapshot,
  districtAreaPrefix: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    currentYear:
      snapshot.currentYear,
    fiscalYear:
      snapshot.fiscalYear,
    provinceCode:
      snapshot.provinceCode,
    currentQuarter:
      snapshot.currentQuarter,
    districtAreaPrefix,
    definitionCount:
      snapshot.definitions.length,
    physicalSourceCount:
      snapshot.physicalDefinitions
        .length,

    definitions:
      snapshot.definitions.map(
        (definition) => ({
          id: definition.id,
          kpiKey:
            definition.kpiKey,
          kind: definition.kind,
          sourceSheet:
            definition.sourceSheet,
          sourceId:
            definition.sourceId,
          valuePrefix:
            definition.valuePrefix,
          targetValue:
            definition.targetValue,
          isQuarterly:
            definition.isQuarterly,
          targetMonths:
            definition.targetMonths,
          effectiveQuarter:
            definition.effectiveQuarter,
          sortOrder:
            definition.sortOrder,
          sourceOnly:
            definition.sourceOnly,
          sourceLimit:
            definition.sourceLimit,
        }),
      ),
  });
}

async function createRunningSyncRun(
  client: PoolClient,
  snapshot: SyncConfigSnapshot,
  runConfiguration:
    Readonly<Record<string, unknown>>,
  startedAt: Date,
): Promise<string> {
  const result =
    await client.query<SyncRunIdRow>(
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
          started_at
        )
        VALUES (
          'running',
          $1,
          $2,
          $3,
          $4,
          0,
          0,
          $5::JSONB,
          $6
        )
        RETURNING id::TEXT AS id
      `,
      [
        snapshot.provinceCode,
        snapshot.fiscalYear,
        snapshot.currentQuarter,
        snapshot
          .physicalDefinitions
          .length,
        JSON.stringify(
          runConfiguration,
        ),
        startedAt,
      ],
    );

  const id =
    result.rows[0]?.id;

  if (id === undefined) {
    throw new SyncOrchestrationError(
      "Synchronization run creation returned no identity",
    );
  }

  return id;
}

function normalizeOptionalText(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function normalizeOptionalInteger(
  value: unknown,
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const converted =
    Number(value);

  return Number.isFinite(
    converted,
  ) &&
  Number.isInteger(
    converted,
  )
    ? converted
    : null;
}

function normalizeOptionalNumber(
  value: unknown,
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const converted =
    Number(value);

  return Number.isFinite(
    converted,
  )
    ? converted
    : null;
}

function tuplePlaceholders(
  start: number,
  count: number,
): string {
  const parts: string[] = [];

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

async function persistSourceRecords(
  client: PoolClient,
  syncRunId: string,
  sourceName: string,
  rows: readonly MophRow[],
): Promise<void> {
  for (
    let offset = 0;
    offset < rows.length;
    offset +=
      SOURCE_RECORD_INSERT_BATCH_SIZE
  ) {
    const batch =
      rows.slice(
        offset,
        offset +
          SOURCE_RECORD_INSERT_BATCH_SIZE,
      );

    const parameters: unknown[] =
      [];

    const tuples: string[] = [];

    batch.forEach(
      (
        row,
        index,
      ) => {
        const start =
          index * 10;

        tuples.push(
          `(${tuplePlaceholders(start + 1, 9)}, $${start + 10}::JSONB)`,
        );

        parameters.push(
          syncRunId,
          sourceName,
          offset + index + 1,
          normalizeOptionalText(
            row.hospcode,
          ),
          normalizeOptionalText(
            row.areacode,
          ),
          normalizeOptionalText(
            row.date_com,
          ),
          normalizeOptionalInteger(
            row.b_year,
          ),
          normalizeOptionalNumber(
            row.target,
          ),
          normalizeOptionalNumber(
            row.result,
          ),
          JSON.stringify(row),
        );
      },
    );

    await client.query(
      `
        INSERT INTO source_records (
          sync_run_id,
          source_name,
          source_sequence,
          hospcode,
          areacode,
          date_com,
          b_year,
          target,
          result,
          raw_payload
        )
        VALUES ${tuples.join(", ")}
      `,
      parameters,
    );
  }
}

async function markSyncRunFailed(
  client: PoolClient,
  syncRunId: string,
  finishedAt: Date,
  completedSourceCount: number,
  failedSourceCount: number,
  errorSummary: RunErrorSummary,
): Promise<void> {
  const result =
    await client.query(
      `
        UPDATE sync_runs
        SET
          status = 'failed',
          completed_source_count = $2,
          failed_source_count = $3,
          finished_at = $4,
          error_summary = $5::JSONB
        WHERE id = $1
          AND status = 'running'
      `,
      [
        syncRunId,
        completedSourceCount,
        failedSourceCount,
        finishedAt,
        JSON.stringify(
          errorSummary,
        ),
      ],
    );

  if (
    result.rowCount !== 1
  ) {
    throw new SyncOrchestrationError(
      `Synchronization run ${syncRunId} could not transition from running to failed`,
    );
  }
}

async function persistKpiResultsAndComplete(
  client: PoolClient,
  syncRunId: string,
  results:
    readonly CalculatedKpiResult[],
  expectedSourceCount: number,
  completedAt: Date,
): Promise<void> {
  await client.query(
    "BEGIN",
  );

  try {
    for (
      let offset = 0;
      offset < results.length;
      offset +=
        KPI_RESULT_INSERT_BATCH_SIZE
    ) {
      const batch =
        results.slice(
          offset,
          offset +
            KPI_RESULT_INSERT_BATCH_SIZE,
        );

      const parameters: unknown[] =
        [];

      const tuples: string[] =
        [];

      batch.forEach(
        (
          result,
          index,
        ) => {
          const start =
            index * 10;

          tuples.push(
            `(${tuplePlaceholders(start + 1, 8)}, $${start + 9}::JSONB, $${start + 10})`,
          );

          parameters.push(
            syncRunId,
            result.kpiDefinitionId,
            result.fiscalYear,
            result.periodCode,
            result.areacode,
            result.hospcode,
            result.target,
            result.result,
            "{}",
            completedAt,
          );
        },
      );

      await client.query(
        `
          INSERT INTO kpi_results (
            sync_run_id,
            kpi_definition_id,
            fiscal_year,
            period_code,
            areacode,
            hospcode,
            target,
            result,
            details,
            calculated_at
          )
          VALUES ${tuples.join(", ")}
        `,
        parameters,
      );
    }

    const completion =
      await client.query(
        `
          UPDATE sync_runs
          SET
            status = 'succeeded',
            completed_source_count = $2,
            failed_source_count = 0,
            finished_at = $3,
            error_summary = NULL
          WHERE id = $1
            AND status = 'running'
        `,
        [
          syncRunId,
          expectedSourceCount,
          completedAt,
        ],
      );

    if (
      completion.rowCount !== 1
    ) {
      throw new SyncOrchestrationError(
        `Synchronization run ${syncRunId} could not transition from running to succeeded`,
      );
    }

    await client.query(
      "COMMIT",
    );
  } catch (error) {
    await rollbackQuietly(
      client,
    );

    throw error;
  }
}

async function activateCompletedRun(
  client: PoolClient,
  syncRunId: string,
  expectedSourceCount: number,
  activatedAt: Date,
): Promise<void> {
  await client.query(
    "BEGIN",
  );

  try {
    const target =
      await client.query<ActivationTargetRow>(
        `
          SELECT
            status,
            finished_at,
            completed_source_count,
            failed_source_count,
            activated_at
          FROM sync_runs
          WHERE id = $1
          FOR UPDATE
        `,
        [
          syncRunId,
        ],
      );

    const run =
      target.rows[0];

    if (
      run === undefined ||
      run.status !==
        "succeeded" ||
      run.finished_at ===
        null ||
      run.completed_source_count !==
        expectedSourceCount ||
      run.failed_source_count !==
        0 ||
      run.activated_at !==
        null
    ) {
      throw new SyncActivationError(
        `Synchronization run ${syncRunId} is not eligible for dataset activation`,
      );
    }

    const state =
      await client.query<AppStateRow>(
        `
          SELECT singleton_id
          FROM app_state
          WHERE singleton_id = 1
          FOR UPDATE
        `,
      );

    if (
      state.rows.length !== 1
    ) {
      throw new SyncActivationError(
        "app_state singleton row is missing",
      );
    }

    await client.query(
      `
        UPDATE app_state
        SET
          active_sync_run_id = $1,
          updated_at = $2
        WHERE singleton_id = 1
      `,
      [
        syncRunId,
        activatedAt,
      ],
    );

    const activation =
      await client.query(
        `
          UPDATE sync_runs
          SET activated_at = $2
          WHERE id = $1
            AND activated_at IS NULL
        `,
        [
          syncRunId,
          activatedAt,
        ],
      );

    if (
      activation.rowCount !== 1
    ) {
      throw new SyncActivationError(
        `Synchronization run ${syncRunId} activation did not update exactly one row`,
      );
    }

    await client.query(
      "COMMIT",
    );
  } catch (error) {
    await rollbackQuietly(
      client,
    );

    throw error;
  }
}

export async function runMophSynchronization(
  pool: Pool,
  dependencies?:
    SyncOrchestratorDependencies,
): Promise<SyncRunSummary> {
  const mophClient =
    dependencies?.mophClient ??
    createMophClient();

  const now =
    dependencies?.now ??
    (() => new Date());

  return withSyncSessionLock(
    pool,
    async (client) => {
      const snapshot =
        await loadSyncConfigSnapshot(
          client,
        );

      const districtAreaPrefix =
        await loadDistrictAreaPrefix(
          client,
        );

      const expectedSourceCount =
        snapshot
          .physicalDefinitions
          .length;

      const syncRunId =
        await createRunningSyncRun(
          client,
          snapshot,
          freezeRunConfiguration(
            snapshot,
            districtAreaPrefix,
          ),
          now(),
        );

      const sourceRowsBySheet:
        Record<
          string,
          readonly MophRow[]
        > = {};

      const sourceFailures:
        SourceFailureEvidence[] =
        [];

      let completedSourceCount = 0;

      let sourceIndex = 0;

      for (
        const definition
        of snapshot
          .physicalDefinitions
      ) {
        const isFinalSource =
          sourceIndex ===
          expectedSourceCount - 1;

        try {
          const rows =
            await mophClient.fetchSource(
              {
                tableName:
                  definition.sourceSheet,
                year:
                  snapshot.currentYear,
                province:
                  snapshot.provinceCode,
                limit:
                  definition.sourceLimit,
              },
            );

          await persistSourceRecords(
            client,
            syncRunId,
            definition.sourceSheet,
            rows,
          );

          sourceRowsBySheet[
            definition.sourceSheet
          ] = rows;

          completedSourceCount +=
            1;
        } catch (error) {
          const described =
            describeError(
              error,
            );

          sourceFailures.push(
            {
              sourceName:
                definition.sourceSheet,
              errorName:
                described.errorName,
              message:
                described.message,
            },
          );
        }

        if (
          !isFinalSource
        ) {
          await mophClient.waitBetweenSources();
        }

        sourceIndex += 1;
      }

      const failedSourceCount =
        sourceFailures.length;

      if (
        failedSourceCount > 0
      ) {
        await markSyncRunFailed(
          client,
          syncRunId,
          now(),
          completedSourceCount,
          failedSourceCount,
          {
            phase: "sources",
            sources:
              sourceFailures,
          },
        );

        throw new SyncOrchestrationError(
          `Synchronization run ${syncRunId} failed: ${failedSourceCount} of ${expectedSourceCount} physical sources failed`,
        );
      }

      let results:
        readonly CalculatedKpiResult[];

      try {
        results =
          calculateKpiResults(
            snapshot,
            sourceRowsBySheet,
            districtAreaPrefix,
          );
      } catch (error) {
        await markSyncRunFailed(
          client,
          syncRunId,
          now(),
          completedSourceCount,
          0,
          {
            phase:
              "calculation",
            message:
              describeError(
                error,
              ).message,
          },
        );

        throw new SyncOrchestrationError(
          `Synchronization run ${syncRunId} failed during KPI calculation`,
          {
            cause: error,
          },
        );
      }

      try {
        await persistKpiResultsAndComplete(
          client,
          syncRunId,
          results,
          expectedSourceCount,
          now(),
        );
      } catch (error) {
        try {
          await markSyncRunFailed(
            client,
            syncRunId,
            now(),
            completedSourceCount,
            0,
            {
              phase:
                "persistence",
              message:
                describeError(
                  error,
                )
                  .message,
            },
          );
        } catch {
          // The primary persistence failure takes precedence.
        }

        throw new SyncOrchestrationError(
          `Synchronization run ${syncRunId} failed during KPI result persistence`,
          {
            cause: error,
          },
        );
      }

      try {
        await activateCompletedRun(
          client,
          syncRunId,
          expectedSourceCount,
          now(),
        );
      } catch (error) {
        if (
          error instanceof
          SyncActivationError
        ) {
          throw error;
        }

        throw new SyncActivationError(
          `Synchronization run ${syncRunId} failed during dataset activation`,
          {
            cause: error,
          },
        );
      }

      return Object.freeze({
        syncRunId,
        status:
          "succeeded" as const,
        activated:
          true as const,
        completedSourceCount,
        resultCount:
          results.length,
      });
    },
  );
}
