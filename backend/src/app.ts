import Fastify from "fastify";

import type {
  FastifyInstance,
} from "fastify";

import {
  registerCors,
} from "./http/cors.js";

import {
  registerHealthRoutes,
  type HealthDatabase,
} from "./observability/health.js";

import {
  registerReadApiRoutes,
  type ReadApiDatabase,
} from "./modules/read-api.js";

export interface AppDependencies {
  readonly db:
    HealthDatabase
    & ReadApiDatabase;

  readonly corsOrigins?:
    readonly string[];
}

export function buildApp(
  dependencies: AppDependencies,
): FastifyInstance {
  const app = Fastify();

  registerCors(
    app,
    dependencies.corsOrigins ?? [],
  );

  registerHealthRoutes(
    app,
    dependencies.db,
  );

  registerReadApiRoutes(
    app,
    dependencies.db,
  );

  return app;
}
