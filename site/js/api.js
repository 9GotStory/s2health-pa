import {
  parseDashboardResponse,
  parseFacilitiesResponse,
  parseKpiCatalogResponse,
  parseTambonsResponse,
} from "./contracts.js";

const REQUEST_TIMEOUT_MS = 10_000;

export function readRuntimeConfig(globalObject = window) {
  const raw = globalObject.S2HEALTH_CONFIG;

  if (typeof raw !== "object" || raw === null) {
    throw new Error("runtime_config_missing");
  }

  const value =
    typeof raw.apiBaseUrl === "string"
      ? raw.apiBaseUrl.trim().replace(/\/+$/, "")
      : "";

  if (!value) {
    throw new Error("api_base_url_missing");
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("api_base_url_invalid");
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("api_base_url_must_use_https");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("api_base_url_must_be_origin_only");
  }

  return Object.freeze({
    apiBaseUrl: url.origin,
  });
}

async function fetchJson(apiBaseUrl, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiBaseUrl + path, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("unexpected_content_type");
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadPublicDashboard(apiBaseUrl) {
  const [dashboardBody, kpiBody, facilityBody, tambonBody] = await Promise.all([
    fetchJson(apiBaseUrl, "/api/v1/dashboard"),
    fetchJson(apiBaseUrl, "/api/v1/kpis"),
    fetchJson(apiBaseUrl, "/api/v1/facilities"),
    fetchJson(apiBaseUrl, "/api/v1/tambons"),
  ]);

  return Object.freeze({
    dashboard: parseDashboardResponse(dashboardBody),
    kpis: parseKpiCatalogResponse(kpiBody),
    facilities: parseFacilitiesResponse(facilityBody),
    tambons: parseTambonsResponse(tambonBody),
  });
}
