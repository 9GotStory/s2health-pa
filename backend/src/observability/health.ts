import type {
  FastifyInstance,
} from "fastify";

export interface AppStateRow {
  readonly active_sync_run_id:
    | number
    | null;
}

export interface AppStateQueryResult {
  readonly rows: readonly AppStateRow[];
}

export interface HealthDatabase {
  query(
    text: string,
  ): Promise<AppStateQueryResult>;
}

const READINESS_QUERY = `
  SELECT
    active_sync_run_id
  FROM app_state
  WHERE singleton_id = 1
`;

export function registerHealthRoutes(
  app: FastifyInstance,
  db: HealthDatabase,
): void {
  app.get(
    "/api/v1/health/live",

    async () => ({
      status: "ok",
    }),
  );

  app.get(
    "/api/v1/health/ready",

    async (request, reply) => {
      let rows:
        readonly AppStateRow[];

      try {
        const result =
          await db.query(
            READINESS_QUERY,
          );

        rows = result.rows;
      } catch (error) {
        request.log.error(
          error,
          "Readiness database query failed",
        );

        reply.code(503);

        return {
          status: "not_ready",
        };
      }

      if (rows.length !== 1) {
        request.log.warn(
          "app_state singleton row is missing",
        );

        reply.code(503);

        return {
          status: "not_ready",
        };
      }

      return {
        status: "ready",
      };
    },
  );
}
