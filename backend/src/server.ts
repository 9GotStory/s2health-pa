import {
  fileURLToPath,
} from "node:url";

import {
  resolve,
} from "node:path";

import {
  buildApp,
} from "./app.js";

import {
  loadServerConfig,
} from "./config/server.js";

import {
  createDatabasePool,
} from "./db/client.js";

async function startServer(): Promise<void> {
  const config =
    loadServerConfig();

  const pool =
    createDatabasePool();

  const app = buildApp({
    db: pool,
    corsOrigins:
      config.corsOrigins,
  });

  let resourcesClosed = false;

  const closeOwnedResources =
    async (): Promise<void> => {
      if (resourcesClosed) {
        return;
      }

      resourcesClosed = true;

      try {
        await app.close();
      } finally {
        await pool.end();
      }
    };

  for (const signal of [
    "SIGINT",
    "SIGTERM",
  ] as const) {
    process.once(
      signal,

      () => {
        closeOwnedResources().catch(
          (error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : `Failed to shut down after ${signal}`;

            console.error(message);

            process.exitCode = 1;
          },
        );
      },
    );
  }

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Backend failed to start";

    console.error(message);

    process.exitCode = 1;

    await closeOwnedResources();
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
  startServer().catch(
    (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Backend startup failed";

      console.error(message);

      process.exitCode = 1;
    },
  );
}
