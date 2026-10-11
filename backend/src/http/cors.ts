import type {
  FastifyInstance,
} from "fastify";

const API_PREFIX =
  "/api/v1/";

const ALLOWED_REQUEST_HEADERS =
  new Set([
    "accept",
    "content-type",
  ]);

function isApiV1Request(
  url: string,
): boolean {
  const pathname =
    url.split("?", 1)[0] ?? "";

  return (
    pathname === "/api/v1" ||
    pathname.startsWith(
      API_PREFIX,
    )
  );
}

function requestedHeadersAllowed(
  raw:
    | string
    | undefined,
): boolean {
  if (raw === undefined) {
    return true;
  }

  const names =
    raw
      .split(",")
      .map((value) =>
        value.trim().toLowerCase(),
      )
      .filter(Boolean);

  return names.every(
    (name) =>
      ALLOWED_REQUEST_HEADERS.has(
        name,
      ),
  );
}

export function registerCors(
  app: FastifyInstance,
  allowedOrigins:
    readonly string[],
): void {
  if (allowedOrigins.length === 0) {
    return;
  }

  const origins =
    new Set(allowedOrigins);

  app.addHook(
    "onSend",

    async (
      request,
      reply,
      payload,
    ) => {
      if (
        request.method !==
          "OPTIONS" &&
        isApiV1Request(
          request.url,
        )
      ) {
        const origin =
          request.headers.origin;

        if (
          origin !== undefined &&
          origins.has(origin)
        ) {
          reply.header(
            "Access-Control-Allow-Origin",
            origin,
          );

          reply.header(
            "Vary",
            "Origin",
          );
        }
      }

      return payload;
    },
  );

  app.options(
    "/api/v1/*",

    async (request, reply) => {
      const origin =
        request.headers.origin;

      const requestedMethod =
        request.headers[
          "access-control-request-method"
        ];

      const requestedHeaders =
        request.headers[
          "access-control-request-headers"
        ];

      if (
        origin === undefined ||
        !origins.has(origin) ||
        requestedMethod
          ?.toUpperCase() !==
          "GET" ||
        !requestedHeadersAllowed(
          requestedHeaders,
        )
      ) {
        return reply
          .code(403)
          .send({
            error: "forbidden",
          });
      }

      return reply
        .header(
          "Access-Control-Allow-Origin",
          origin,
        )
        .header(
          "Access-Control-Allow-Methods",
          "GET, OPTIONS",
        )
        .header(
          "Access-Control-Allow-Headers",
          "Accept, Content-Type",
        )
        .header(
          "Access-Control-Max-Age",
          "600",
        )
        .header(
          "Vary",
          "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
        )
        .code(204)
        .send();
    },
  );
}
