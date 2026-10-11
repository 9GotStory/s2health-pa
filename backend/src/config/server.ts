export class ServerConfigError extends Error {
  override readonly name = "ServerConfigError";
}

const DEFAULT_HOST = "127.0.0.1";

const DEFAULT_PORT = 3001;

const PORT_PATTERN = /^[0-9]+$/;

export interface ServerConfig {
  readonly host: string;

  readonly port: number;

  readonly corsOrigins:
    readonly string[];
}

function parseHost(
  raw: string | undefined,
): string {
  if (raw === undefined) {
    return DEFAULT_HOST;
  }

  const host = raw.trim();

  if (!host) {
    throw new ServerConfigError(
      "PA_API_HOST must not be blank",
    );
  }

  return host;
}

function parseCorsOrigins(
  raw: string | undefined,
): readonly string[] {
  if (raw === undefined) {
    return Object.freeze([]);
  }

  const value = raw.trim();

  if (!value) {
    throw new ServerConfigError(
      "PA_CORS_ORIGINS must not be blank when set",
    );
  }

  const origins: string[] = [];

  for (
    const item
    of value.split(",")
  ) {
    const candidate =
      item.trim();

    if (!candidate) {
      throw new ServerConfigError(
        "PA_CORS_ORIGINS must contain only nonblank origins",
      );
    }

    let parsed: URL;

    try {
      parsed = new URL(candidate);
    } catch {
      throw new ServerConfigError(
        `PA_CORS_ORIGINS contains an invalid origin: ${candidate}`,
      );
    }

    if (
      (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:"
      ) ||
      parsed.origin !== candidate
    ) {
      throw new ServerConfigError(
        `PA_CORS_ORIGINS must contain exact HTTP(S) origins without paths: ${candidate}`,
      );
    }

    if (!origins.includes(candidate)) {
      origins.push(candidate);
    }
  }

  return Object.freeze(origins);
}

function parsePort(
  raw: string | undefined,
): number {
  if (raw === undefined) {
    return DEFAULT_PORT;
  }

  const port = raw.trim();

  if (!port) {
    throw new ServerConfigError(
      "PA_API_PORT must not be blank",
    );
  }

  if (!PORT_PATTERN.test(port)) {
    throw new ServerConfigError(
      "PA_API_PORT must contain decimal digits only",
    );
  }

  const value =
    Number.parseInt(port, 10);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65535
  ) {
    throw new ServerConfigError(
      "PA_API_PORT must be between 1 and 65535",
    );
  }

  return value;
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return Object.freeze({
    host: parseHost(env.PA_API_HOST),

    port: parsePort(env.PA_API_PORT),

    corsOrigins:
      parseCorsOrigins(
        env.PA_CORS_ORIGINS,
      ),
  });
}
