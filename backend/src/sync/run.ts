import {
  createDatabasePool,
} from "../db/client.js";

import {
  runMophSynchronization,
} from "./orchestrator.js";

const MAX_ERROR_MESSAGE_LENGTH = 500;

async function runSyncOnce(): Promise<void> {
  const pool =
    createDatabasePool();

  try {
    const summary =
      await runMophSynchronization(
        pool,
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
