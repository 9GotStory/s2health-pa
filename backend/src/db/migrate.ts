import {
  createHash,
} from "node:crypto";

import {
  readdir,
  readFile,
} from "node:fs/promises";

import {
  fileURLToPath,
} from "node:url";

import {
  resolve,
} from "node:path";

import type {
  Pool,
  PoolClient,
} from "pg";

import {
  createDatabasePool,
} from "./client.js";

const MIGRATION_FILENAME =
  /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/;

const MIGRATION_LOCK_CLASS = 20260911;
const MIGRATION_LOCK_KEY = 2;

const backendRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);

export const defaultMigrationsDirectory = resolve(
  backendRoot,
  "migrations",
);

export interface Migration {
  readonly version: string;
  readonly filename: string;
  readonly sql: string;
  readonly checksumSha256: string;
}

export interface MigrationRunSummary {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

interface AppliedMigrationRow {
  readonly checksum_sha256: string;
}

export class MigrationError extends Error {
  override readonly name: string = "MigrationError";
}

export class MigrationChecksumError
  extends MigrationError {
  override readonly name: string = "MigrationChecksumError";
}

function checksumSha256(
  bytes: Uint8Array,
): string {
  return createHash("sha256")
    .update(bytes)
    .digest("hex");
}

function decodeUtf8(
  bytes: Uint8Array,
  filename: string,
): string {
  try {
    return new TextDecoder(
      "utf-8",
      {
        fatal: true,
      },
    ).decode(bytes);
  } catch {
    throw new MigrationError(
      `Migration ${filename} is not valid UTF-8`,
    );
  }
}

export async function loadMigrations(
  directory = defaultMigrationsDirectory,
): Promise<readonly Migration[]> {
  let entries;

  try {
    entries = await readdir(
      directory,
      {
        withFileTypes: true,
      },
    );
  } catch (error) {
    throw new MigrationError(
      `Unable to read migrations directory: ${
        error instanceof Error
          ? error.message
          : "unknown error"
      }`,
    );
  }

  const filenames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const migrations: Migration[] = [];
  const versions = new Set<string>();

  for (const filename of filenames) {
    const match = MIGRATION_FILENAME.exec(filename);

    if (!match) {
      throw new MigrationError(
        `Invalid migration filename: ${filename}`,
      );
    }

    const version = match[1];

    if (version === undefined) {
      throw new MigrationError(
        `Unable to determine migration version: ${filename}`,
      );
    }

    if (versions.has(version)) {
      throw new MigrationError(
        `Duplicate migration version: ${version}`,
      );
    }

    versions.add(version);

    const bytes = await readFile(
      resolve(directory, filename),
    );

    const sql = decodeUtf8(
      bytes,
      filename,
    );

    if (!sql.trim()) {
      throw new MigrationError(
        `Migration is empty: ${filename}`,
      );
    }

    migrations.push({
      version,
      filename,
      sql,
      checksumSha256:
        checksumSha256(bytes),
    });
  }

  return migrations;
}

async function acquireMigrationLock(
  client: PoolClient,
): Promise<void> {
  await client.query(
    `
      SELECT pg_advisory_xact_lock($1, $2)
    `,
    [
      MIGRATION_LOCK_CLASS,
      MIGRATION_LOCK_KEY,
    ],
  );
}

async function ensureMigrationLedger(
  client: PoolClient,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum_sha256 TEXT NOT NULL
        CHECK (
          checksum_sha256 ~ '^[0-9a-f]{64}$'
        ),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function rollbackQuietly(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original migration failure.
  }
}

async function bootstrapLedger(
  client: PoolClient,
): Promise<void> {
  await client.query("BEGIN");

  try {
    await acquireMigrationLock(client);
    await ensureMigrationLedger(client);
    await client.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  }
}

async function applyMigration(
  client: PoolClient,
  migration: Migration,
): Promise<"applied" | "skipped"> {
  await client.query("BEGIN");

  try {
    await acquireMigrationLock(client);
    await ensureMigrationLedger(client);

    const result =
      await client.query<AppliedMigrationRow>(
        `
          SELECT checksum_sha256
          FROM schema_migrations
          WHERE version = $1
        `,
        [
          migration.version,
        ],
      );

    const existing = result.rows[0];

    if (existing !== undefined) {
      if (
        existing.checksum_sha256 !==
        migration.checksumSha256
      ) {
        throw new MigrationChecksumError(
          `Checksum mismatch for migration ${
            migration.version
          }`,
        );
      }

      await client.query("COMMIT");
      return "skipped";
    }

    await client.query(migration.sql);

    await client.query(
      `
        INSERT INTO schema_migrations (
          version,
          checksum_sha256
        )
        VALUES ($1, $2)
      `,
      [
        migration.version,
        migration.checksumSha256,
      ],
    );

    await client.query("COMMIT");

    return "applied";
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  }
}

export async function runMigrations(
  pool: Pool,
  directory = defaultMigrationsDirectory,
): Promise<MigrationRunSummary> {
  const migrations =
    await loadMigrations(directory);

  const applied: string[] = [];
  const skipped: string[] = [];

  const client = await pool.connect();

  try {
    await bootstrapLedger(client);

    for (const migration of migrations) {
      const result =
        await applyMigration(
          client,
          migration,
        );

      if (result === "applied") {
        applied.push(migration.version);
      } else {
        skipped.push(migration.version);
      }
    }
  } finally {
    client.release();
  }

  return {
    applied,
    skipped,
  };
}

async function main(): Promise<void> {
  const pool = createDatabasePool();

  try {
    const summary =
      await runMigrations(pool);

    console.log(
      `Migrations applied: ${
        summary.applied.length
      }`,
    );

    console.log(
      `Migrations skipped: ${
        summary.skipped.length
      }`,
    );
  } finally {
    await pool.end();
  }
}

const directEntryPath =
  process.argv[1] === undefined
    ? undefined
    : resolve(process.argv[1]);

if (
  directEntryPath ===
  fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Migration failed";

    console.error(message);
    process.exitCode = 1;
  });
}
