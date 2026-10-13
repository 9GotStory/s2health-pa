import {
  createDatabasePool,
} from "../db/client.js";

import {
  runMophSynchronization,
} from "./orchestrator.js";

import {
  createLocalFileSyncApprovalProvider,
  SyncAuthorizationError,
} from "./authorization.js";

const MAX_ERROR_MESSAGE_LENGTH = 500;

async function runSyncOnce(): Promise<void> {
  const runMode = process.env.PA_SYNC_RUN_MODE;
  if (runMode !== "manual" && runMode !== "scheduled") {
    throw new SyncAuthorizationError(
      "Sync approval rejected: PA_SYNC_RUN_MODE must be manual or scheduled",
    );
  }
  const pool =
    createDatabasePool();

  try {
    const summary =
      await runMophSynchronization(
        pool,
        {
          runMode,
          approvalProvider:
            createLocalFileSyncApprovalProvider(
              process.env.PA_SYNC_APPROVAL_FILE,
            ),
        },
      );

    console.log(
      `Synchronization run ${summary.syncRunId} ${summary.status}: ` +
        `${summary.completedSourceCount} sources completed, ` +
        `${summary.resultCount} KPI results, ` +
        `activated=${summary.activated}`,
    );
  } finally {
    await pool.end();
  }
}

runSyncOnce().catch(
  (error: unknown) => {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "MOPH synchronization failed";

    const message =
      rawMessage.trim().length === 0
        ? "MOPH synchronization failed"
        : rawMessage.trim().slice(
            0,
            MAX_ERROR_MESSAGE_LENGTH,
          );

    console.error(message);

    process.exit(1);
  },
);
