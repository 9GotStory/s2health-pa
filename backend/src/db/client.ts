import {
  Pool,
  type PoolConfig,
} from "pg";

import {
  getDatabaseUrl,
} from "../config/database.js";

export interface DatabasePoolOptions {
  readonly connectionString?: string;
  readonly max?: number;
}

export function createDatabasePool(
  options: DatabasePoolOptions = {},
): Pool {
  const connectionString =
    options.connectionString ?? getDatabaseUrl();

  const config: PoolConfig = {
    connectionString,
  };

  if (options.max !== undefined) {
    if (
      !Number.isInteger(options.max) ||
      options.max < 1
    ) {
      throw new RangeError(
        "Database pool max must be a positive integer",
      );
    }

    config.max = options.max;
  }

  return new Pool(config);
}
