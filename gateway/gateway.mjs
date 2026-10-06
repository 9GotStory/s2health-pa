import http from 'node:http';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const upstreamOrigin = required('UPSTREAM_ORIGIN').replace(/\/+$/, '');
const allowedOrigin = required('ALLOWED_ORIGIN').replace(/\/+$/, '');
const listenHost = process.env.GATEWAY_HOST?.trim() || '0.0.0.0';
const listenPort = Number(process.env.GATEWAY_PORT || '8080');
const timeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || '10000');
const maxResponseBytes = Number(process.env.MAX_RESPONSE_BYTES || String(8 * 1024 * 1024));

if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) {
  throw new Error('GATEWAY_PORT must be an unprivileged TCP port');
}
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
  throw new Error('UPSTREAM_TIMEOUT_MS is out of range');
}
if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 64 * 1024 * 1024) {
  throw new Error('MAX_RESPONSE_BYTES is out of range');
}

const allowedPaths = new Set([
  '/api/v1/health/ready',
  '/api/v1/kpis',
  '/api/v1/facilities',
  '/api/v1/tambons',
  '/api/v1/dashboard',
]);

function applyCommonHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (origin === allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Vary', 'Origin');
    return true;
  }
  return origin === undefined;
}

function sendJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', String(payload.length));
  response.end(payload);
}

const server = http.createServer(async (request, response) => {
  applyCommonHeaders(response);

  let url;
  try {
    url = new URL(request.url || '/', 'http://gateway.invalid');
  } catch {
    sendJson(response, 400, { error: 'bad_request' });
    return;
  }

  if (!allowedPaths.has(url.pathname)) {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  if (url.search) {
    sendJson(response, 400, { error: 'query_not_allowed' });
    return;
  }

  if (request.method === 'OPTIONS') {
    const origin = request.headers.origin;
    const requestedMethod = request.headers['access-control-request-method'];

    if (origin !== allowedOrigin || requestedMethod !== 'GET') {
      sendJson(response, 403, { error: 'forbidden' });
      return;
    }

    response.statusCode = 204;
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    response.setHeader('Access-Control-Max-Age', '600');
    response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    response.end();
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!applyCors(request, response)) {
    sendJson(response, 403, { error: 'forbidden' });
    return;
  }

  try {
    const upstream = await fetch(upstreamOrigin + url.pathname, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      sendJson(response, 502, { error: 'bad_gateway' });
      return;
    }

    const declaredLength = Number(upstream.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      sendJson(response, 502, { error: 'response_too_large' });
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > maxResponseBytes) {
      sendJson(response, 502, { error: 'response_too_large' });
      return;
    }

    response.statusCode = upstream.status;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', String(body.length));
    response.end(body);
  } catch (error) {
    console.error('gateway_upstream_error', {
      path: url.pathname,
      name: error?.name || 'Error',
      message: error?.message || 'upstream failure',
    });
    sendJson(response, 503, { error: 'service_unavailable' });
  }
});

server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

const shutdown = () => {
  server.close((error) => {
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(listenPort, listenHost, () => {
  console.log(`s2health-pa gateway listening on ${listenHost}:${listenPort}`);
});
