import { loadPublicDashboard, readRuntimeConfig } from "./api.js";
import { buildDashboardModel } from "./model.js";
import {
  mountDashboard,
  renderError,
  renderLoading,
  renderNoData,
} from "./view.js";

const root = document.getElementById("app");

async function start() {
  renderLoading(root);

  try {
    const config = readRuntimeConfig();
    const payload = await loadPublicDashboard(config.apiBaseUrl);

    if (payload.dashboard.dataset === null) {
      renderNoData(root);
      return;
    }

    const model = buildDashboardModel({
      dataset: payload.dashboard.dataset,
      results: payload.dashboard.results,
      kpis: payload.kpis,
      facilities: payload.facilities,
      tambons: payload.tambons,
    });

    mountDashboard(root, model);
  } catch (error) {
    console.error("s2health_pa_dashboard_load_failed", error);
    renderError(root);
  }
}

start();
