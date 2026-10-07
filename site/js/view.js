import {
  filterSummaries,
  getAggregate,
  getCategories,
  getDashboardStats,
  resolveTarget,
} from "./model.js";

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text) {
    node.textContent = text;
  }

  return node;
}

function append(parent, ...children) {
  parent.append(...children);
  return parent;
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function createStatusBadge(label, tone = "neutral") {
  const badge = element("span", `badge badge--${tone}`, label);
  return badge;
}

function createMetricCard(label, value, detail, tone = "neutral") {
  const card = element("article", `metric metric--${tone}`);
  const labelNode = element("p", "metric__label", label);
  const valueNode = element("strong", "metric__value", value);
  const detailNode = element("p", "metric__detail", detail);

  return append(card, labelNode, valueNode, detailNode);
}

function createFacilityOptions(select, model) {
  select.append(element("option", "", "ทุกหน่วยบริการ"));
  select.firstElementChild.value = "";

  const facilities = [...model.facilities].sort((a, b) =>
    a.hospname.localeCompare(b.hospname, "th"),
  );

  for (const facility of facilities) {
    const tambonName = model.tambonMap[facility.tambonId] || facility.tambonId;
    const option = element(
      "option",
      "",
      `${facility.hospname} · ต.${tambonName}`,
    );

    option.value = facility.hospcode;
    select.append(option);
  }
}

function createCategoryButton(category, active, onClick) {
  const button = element(
    "button",
    active ? "category-chip is-active" : "category-chip",
    category.name,
  );

  button.type = "button";
  button.dataset.category = category.code;
  button.setAttribute("aria-pressed", active ? "true" : "false");

  const count = element("span", "category-chip__count", String(category.count));
  button.append(count);
  button.addEventListener("click", onClick);

  return button;
}

function createBreakdown(summary, model) {
  if (summary.totalTarget === 0) {
    return null;
  }

  const entries = Object.entries(summary.breakdown)
    .filter(([code]) => model.facilityMap[code])
    .map(([code, aggregate]) => ({
      code,
      aggregate,
      name: model.facilityMap[code].name,
    }))
    .sort(
      (a, b) =>
        b.aggregate.percentage - a.aggregate.percentage ||
        a.name.localeCompare(b.name, "th"),
    );

  if (entries.length === 0) {
    return null;
  }

  const details = element("details", "kpi-detail");
  const summaryNode = element("summary", "kpi-detail__summary", "ดูผลรายหน่วยบริการ");
  const tableWrap = element("div", "table-wrap");
  const table = element("table", "facility-table");
  const thead = element("thead");
  const headerRow = element("tr");

  for (const label of ["หน่วยบริการ", "ผลงาน", "เป้าหมาย", "ร้อยละ"]) {
    headerRow.append(element("th", "", label));
  }

  thead.append(headerRow);

  const tbody = element("tbody");

  for (const entry of entries) {
    const row = element("tr");
    const target = resolveTarget(summary);
    const pass = entry.aggregate.percentage >= target;

    row.append(
      element("td", "facility-table__name", entry.name),
      element("td", "", formatNumber(entry.aggregate.result)),
      element("td", "", formatNumber(entry.aggregate.target)),
      element(
        "td",
        pass ? "numeric is-pass" : "numeric is-attention",
        `${formatPercent(entry.aggregate.percentage)}%`,
      ),
    );

    tbody.append(row);
  }

  table.append(thead, tbody);
  tableWrap.append(table);
  details.append(summaryNode, tableWrap);

  return details;
}

function createKpiCard(summary, model, facilityCode) {
  const aggregate = getAggregate(summary, facilityCode);
  const target = resolveTarget(summary);
  const rawCount = summary.totalTarget === 0;
  const passed = aggregate.percentage >= target;

  const card = element(
    "article",
    passed ? "kpi-card is-pass" : "kpi-card is-attention",
  );

  const top = element("div", "kpi-card__top");
  const heading = element("div", "kpi-card__heading");
  const title = element("h3", "kpi-card__title", summary.title);
  const badges = element("div", "kpi-card__badges");

  badges.append(
    createStatusBadge(
      passed ? "ผ่านเกณฑ์" : "ต้องติดตาม",
      passed ? "success" : "attention",
    ),
    createStatusBadge(summary.category, "soft"),
    createStatusBadge(summary.periodLabel, "neutral"),
  );

  if (summary.subgroup) {
    badges.append(createStatusBadge(summary.subgroup, "neutral"));
  }

  heading.append(title, badges);

  if (summary.link) {
    const link = element("a", "kpi-card__link", "รายละเอียด");
    link.href = summary.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `เปิดรายละเอียด ${summary.title}`);
    top.append(heading, link);
  } else {
    top.append(heading);
  }

  const body = element("div", "kpi-card__body");
  const performance = element("div", "performance");

  const performanceLabel = element(
    "span",
    "performance__label",
    rawCount ? "ผลงานสะสม" : "ผลการดำเนินงาน",
  );

  const performanceValue = element(
    "strong",
    passed ? "performance__value is-pass" : "performance__value is-attention",
    rawCount
      ? formatNumber(aggregate.result)
      : `${formatPercent(aggregate.percentage)}%`,
  );

  performance.append(performanceLabel, performanceValue);

  const context = element("div", "kpi-context");
  const targetText = rawCount
    ? "ตัวชี้วัดแบบจำนวน"
    : `เกณฑ์ ≥ ${formatNumber(target)}%`;

  context.append(
    element("span", "kpi-context__target", targetText),
    element(
      "span",
      "kpi-context__fraction",
      rawCount
        ? `R ${formatNumber(aggregate.result)}`
        : `R ${formatNumber(aggregate.result)} / T ${formatNumber(aggregate.target)}`,
    ),
  );

  body.append(performance, context);

  if (!rawCount) {
    const progress = element("div", "progress");
    const bar = element("span", passed ? "progress__bar is-pass" : "progress__bar is-attention");
    bar.style.width = `${Math.max(0, Math.min(aggregate.percentage, 100))}%`;
    progress.setAttribute(
      "aria-label",
      `ผลการดำเนินงาน ${formatPercent(aggregate.percentage)} เปอร์เซ็นต์`,
    );
    progress.append(bar);
    body.append(progress);
  }

  card.append(top, body);

  if (!facilityCode) {
    const breakdown = createBreakdown(summary, model);

    if (breakdown) {
      card.append(breakdown);
    }
  }

  return card;
}

function renderKpiSections(container, summaries, model, facilityCode) {
  container.replaceChildren();

  if (summaries.length === 0) {
    const empty = element("div", "empty-state");
    empty.append(
      element("strong", "", "ไม่พบตัวชี้วัดที่ตรงกับตัวกรอง"),
      element("p", "", "ลองเปลี่ยนหมวด หน่วยบริการ หรือคำค้นหา"),
    );
    container.append(empty);
    return;
  }

  const sections = new Map();

  for (const summary of summaries) {
    if (!sections.has(summary.categoryCode)) {
      sections.set(summary.categoryCode, {
        name: summary.category,
        items: [],
      });
    }

    sections.get(summary.categoryCode).items.push(summary);
  }

  for (const section of sections.values()) {
    const wrapper = element("section", "kpi-section");
    const heading = element("div", "kpi-section__heading");
    heading.append(
      element("h2", "", section.name),
      element("span", "", `${section.items.length} ตัวชี้วัด`),
    );

    const grid = element("div", "kpi-grid");

    for (const summary of section.items) {
      grid.append(createKpiCard(summary, model, facilityCode));
    }

    wrapper.append(heading, grid);
    container.append(wrapper);
  }
}

export function renderLoading(root) {
  root.replaceChildren();

  const shell = element("main", "state-shell");
  const spinner = element("span", "spinner");
  spinner.setAttribute("aria-hidden", "true");

  shell.append(
    spinner,
    element("h1", "", "กำลังโหลด PA Dashboard"),
    element("p", "", "กำลังอ่านข้อมูลล่าสุดจากระบบ Fedora"),
  );

  root.append(shell);
}

export function renderError(root) {
  root.replaceChildren();

  const shell = element("main", "state-shell state-shell--error");
  shell.append(
    element("span", "state-mark", "!"),
    element("h1", "", "ไม่สามารถโหลดข้อมูลได้"),
    element(
      "p",
      "",
      "ระบบไม่สามารถอ่านข้อมูล PA ได้ในขณะนี้ กรุณาลองใหม่อีกครั้งภายหลัง",
    ),
  );

  const retry = element("button", "button", "ลองใหม่");
  retry.type = "button";
  retry.addEventListener("click", () => window.location.reload());

  shell.append(retry);
  root.append(shell);
}

export function renderNoData(root) {
  root.replaceChildren();

  const shell = element("main", "state-shell");
  shell.append(
    element("span", "state-mark state-mark--neutral", "—"),
    element("h1", "", "ยังไม่มีชุดข้อมูลที่เปิดใช้งาน"),
    element(
      "p",
      "",
      "Backend พร้อมใช้งานแล้ว แต่ยังไม่มีชุดข้อมูล PA ที่ผ่านการเปิดใช้งานสำหรับแสดงผล",
    ),
  );

  root.append(shell);
}

export function mountDashboard(root, model) {
  root.replaceChildren();

  const state = {
    facilityCode: "",
    categoryCode: "",
    query: "",
  };

  const app = element("div", "app-shell");

  const hero = element("header", "hero");
  const heroMain = element("div", "hero__main");
  const eyebrow = element("p", "eyebrow", "สำนักงานสาธารณสุขอำเภอสอง");
  const title = element("h1", "", "PA Dashboard");
  const lead = element(
    "p",
    "hero__lead",
    "ติดตามผลการดำเนินงานตัวชี้วัดของเครือข่ายสุขภาพอำเภอสองจากชุดข้อมูลที่ผ่านการตรวจสอบแล้ว",
  );

  heroMain.append(eyebrow, title, lead);

  const datasetMeta = element("div", "dataset-meta");
  datasetMeta.append(
    createStatusBadge(`ปีงบประมาณ ${model.dataset.fiscalYear}`, "inverse"),
    createStatusBadge(`ไตรมาส ${model.dataset.currentQuarter}`, "inverse"),
  );

  if (model.lastUpdated) {
    datasetMeta.append(
      createStatusBadge(`ข้อมูลล่าสุด ${model.lastUpdated}`, "inverse-soft"),
    );
  }

  hero.append(heroMain, datasetMeta);

  const main = element("main", "dashboard");
  const metrics = element("section", "metrics");
  metrics.setAttribute("aria-label", "สรุปตัวชี้วัด");

  const controls = element("section", "controls");
  const controlGrid = element("div", "controls__grid");

  const searchGroup = element("label", "field");
  searchGroup.append(element("span", "field__label", "ค้นหาตัวชี้วัด"));
  const search = element("input", "field__control");
  search.type = "search";
  search.placeholder = "ชื่อ KPI, หมวด หรือกลุ่มย่อย";
  search.autocomplete = "off";
  searchGroup.append(search);

  const facilityGroup = element("label", "field");
  facilityGroup.append(element("span", "field__label", "หน่วยบริการ"));
  const facility = element("select", "field__control");
  createFacilityOptions(facility, model);
  facilityGroup.append(facility);

  controlGrid.append(searchGroup, facilityGroup);

  const categories = element("div", "categories");
  categories.setAttribute("aria-label", "กรองตามหมวดตัวชี้วัด");

  const filterContext = element("div", "filter-context");
  const filterContextText = element("p", "filter-context__text");
  const clearFilters = element(
    "button",
    "filter-context__clear",
    "ล้างตัวกรอง",
  );
  clearFilters.type = "button";

  filterContext.append(filterContextText, clearFilters);
  controls.append(controlGrid, categories, filterContext);

  const resultHeader = element("div", "results-header");
  const resultTitle = element("h2", "", "ตัวชี้วัด");
  const resultCount = element("span", "results-header__count");
  resultHeader.append(resultTitle, resultCount);

  const list = element("div", "dashboard-results");

  main.append(metrics, controls, resultHeader, list);

  const footer = element("footer", "site-footer");
  footer.append(
    element(
      "p",
      "",
      "S2Health PA · ข้อมูลคำนวณโดย Backend-v2 · Frontend ไม่คำนวณค่า KPI ใหม่",
    ),
  );

  app.append(hero, main, footer);
  root.append(app);

  const refresh = () => {
    const visible = filterSummaries(model.summaries, {
      categoryCode: state.categoryCode,
      query: state.query,
    });

    const stats = getDashboardStats(visible, state.facilityCode);

    const hasFilters =
      Boolean(state.facilityCode) ||
      Boolean(state.categoryCode) ||
      Boolean(state.query.trim());

    const categoryName =
      state.categoryCode
        ? getCategories(model.summaries).find(
            (category) => category.code === state.categoryCode,
          )?.name || state.categoryCode
        : "ทุกหมวด";

    const facilityName =
      state.facilityCode
        ? model.facilityMap[state.facilityCode]?.name || state.facilityCode
        : "ภาพรวมอำเภอ";

    const contextParts = [
      facilityName,
      categoryName,
    ];

    if (state.query.trim()) {
      contextParts.push(`ค้นหา “${state.query.trim()}”`);
    }

    filterContextText.textContent =
      `กำลังดู · ${contextParts.join(" · ")}`;

    clearFilters.hidden = !hasFilters;

    metrics.replaceChildren(
      createMetricCard(
        "ตัวชี้วัดทั้งหมด",
        formatNumber(stats.total),
        hasFilters
          ? `จากทั้งหมด ${model.summaries.length} ตัวชี้วัด`
          : "ทุกหมวด",
      ),
      createMetricCard(
        "อัตราผ่านเกณฑ์",
        `${formatPercent(stats.passRate)}%`,
        "เทียบเกณฑ์ที่กำหนด",
        "brand",
      ),
      createMetricCard(
        "ผ่านเกณฑ์",
        formatNumber(stats.passed),
        "ตัวชี้วัด",
        "success",
      ),
      createMetricCard(
        "ต้องติดตาม",
        formatNumber(stats.attention),
        "ตัวชี้วัด",
        "attention",
      ),
    );

    categories.replaceChildren();

    const allButton = createCategoryButton(
      {
        code: "",
        name: "ทั้งหมด",
        count: model.summaries.length,
      },
      state.categoryCode === "",
      () => {
        state.categoryCode = "";
        refresh();
      },
    );

    categories.append(allButton);

    for (const category of getCategories(model.summaries)) {
      categories.append(
        createCategoryButton(
          category,
          state.categoryCode === category.code,
          () => {
            state.categoryCode =
              state.categoryCode === category.code ? "" : category.code;
            refresh();
          },
        ),
      );
    }

    resultCount.textContent = `แสดง ${visible.length} จาก ${model.summaries.length} ตัวชี้วัด`;

    renderKpiSections(list, visible, model, state.facilityCode);
  };

  search.addEventListener("input", (event) => {
    state.query = event.currentTarget.value;
    refresh();
  });

  facility.addEventListener("change", (event) => {
    state.facilityCode = event.currentTarget.value;
    refresh();
  });

  clearFilters.addEventListener("click", () => {
    state.facilityCode = "";
    state.categoryCode = "";
    state.query = "";
    search.value = "";
    facility.value = "";
    refresh();
  });

  refresh();
}
