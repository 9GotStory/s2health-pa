import type {
  Pool,
  PoolClient,
  QueryResultRow,
} from "pg";

export const SYNC_LOCK_CLASS =
  20260912;

export const SYNC_LOCK_KEY =
  1;

interface TryLockRow
  extends QueryResultRow {
  readonly acquired: boolean;
}

interface UnlockRow
  extends QueryResultRow {
  readonly released: boolean;
}

export class SyncLockUnavailableError
  extends Error {
  override readonly name: string =
    "SyncLockUnavailableError";
}

export class SyncLockReleaseError
  extends Error {
  override readonly name: string =
    "SyncLockReleaseError";
}

async function tryAcquire(
  client: PoolClient,
): Promise<boolean> {
  const result =
    await client.query<TryLockRow>(
      `
        SELECT
          pg_try_advisory_lock(
            $1,
            $2
          ) AS acquired
      `,
      [
        SYNC_LOCK_CLASS,
        SYNC_LOCK_KEY,
      ],
    );

  return (
    result.rows[0]?.acquired === true
  );
}

async function unlock(
  client: PoolClient,
): Promise<void> {
  const result =
    await client.query<UnlockRow>(
      `
        SELECT
          pg_advisory_unlock(
            $1,
            $2
          ) AS released
      `,
      [
        SYNC_LOCK_CLASS,
        SYNC_LOCK_KEY,
      ],
    );

  if (
    result.rows[0]?.released !== true
  ) {
    throw new SyncLockReleaseError(
      "Synchronization advisory lock was not held by its owner session",
    );
  }
}

export async function withSyncSessionLock<T>(
  pool: Pool,
  callback:
    (
      client: PoolClient,
    ) => Promise<T>,
): Promise<T> {
  const client =
    await pool.connect();

  let acquired = false;

  let result!: T;

  let hasPrimaryError = false;
  let primaryError: unknown;

  try {
    acquired =
      await tryAcquire(client);

    if (!acquired) {
      throw new SyncLockUnavailableError(
        "Another synchronization invocation already holds the synchronization lock",
      );
    }

    result =
      await callback(client);
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }

  let hasCleanupError = false;
  let cleanupError: unknown;

  if (acquired) {
    try {
      await unlock(client);
    } catch (error) {
      hasCleanupError = true;
      cleanupError = error;
    }
  }

  try {
    client.release();
  } catch (error) {
    if (!hasCleanupError) {
      hasCleanupError = true;
      cleanupError = error;
    }
  }

  if (
    hasPrimaryError &&
    hasCleanupError
  ) {
    throw new AggregateError(
      [
        primaryError,
        cleanupError,
      ],
      "Synchronization callback and lock cleanup both failed",
    );
  }

  if (hasPrimaryError) {
    throw primaryError;
  }

  if (hasCleanupError) {
    throw cleanupError;
  }

  return result;
}
