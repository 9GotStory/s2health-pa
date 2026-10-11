export class DatabaseConfigError extends Error {
  override readonly name = "DatabaseConfigError";
}

export function getDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.DATABASE_URL?.trim();

  if (!raw) {
    throw new DatabaseConfigError(
      "DATABASE_URL is required",
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new DatabaseConfigError(
      "DATABASE_URL must be a valid PostgreSQL URL",
    );
  }

  if (
    parsed.protocol !== "postgres:" &&
    parsed.protocol !== "postgresql:"
  ) {
    throw new DatabaseConfigError(
      "DATABASE_URL must use postgres or postgresql protocol",
    );
  }

  if (!parsed.hostname) {
    throw new DatabaseConfigError(
      "DATABASE_URL must contain a database host",
    );
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    throw new DatabaseConfigError(
      "DATABASE_URL must contain a database name",
    );
  }

  return raw;
}
