function guardFinite(value, what) {
  if (!Number.isFinite(value)) {
    throw new Error(`${what} overflowed to a non-finite number`);
  }

  return value;
}

export function formatSourceLastUpdated(value) {
  if (value === null) {
    return "";
  }

  const marker = value.substring(0, 12);

  const date = new Date(
    Number.parseInt(marker.substring(0, 4), 10),
    Number.parseInt(marker.substring(4, 6), 10) - 1,
    Number.parseInt(marker.substring(6, 8), 10),
    Number.parseInt(marker.substring(8, 10), 10),
    Number.parseInt(marker.substring(10, 12), 10),
  );

  return (
    date.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " น."
  );
}

function buildPeriodPresentation(kpi, periodCode) {
  if (!kpi.isQuarterly && periodCode !== "annual") {
    throw new Error(`Annual KPI ${kpi.key} has period ${periodCode}`);
  }

  if (kpi.isQuarterly && periodCode === "annual") {
    throw new Error(`Quarterly KPI ${kpi.key} has period annual`);
  }

  if (
    kpi.effectiveQuarter !== null &&
    periodCode !== `q${kpi.effectiveQuarter}`
  ) {
    throw new Error(
      `KPI ${kpi.key} must use effective quarter q${kpi.effectiveQuarter}, got ${periodCode}`,
    );
  }

  if (kpi.targetMonths !== null) {
    return {
      targetMonths: kpi.targetMonths,
      periodLabel: `สะสม ${kpi.targetMonths} เดือน`,
    };
  }

  if (periodCode === "annual") {
    return {
      targetMonths: 12,
      periodLabel: "รายปี",
    };
  }

  const quarter = Number(periodCode.substring(1));

  return {
    targetMonths: quarter * 3,
    periodLabel: `สะสม ${quarter * 3} เดือน (Q${quarter})`,
  };
}

export function buildDashboardModel({
  dataset,
  results,
  kpis,
  facilities,
  tambons,
}) {
  const tambonMap = Object.create(null);

  for (const tambon of tambons) {
    tambonMap[tambon.id] = tambon.nameTh;
  }

  const facilityMap = Object.create(null);

  for (const facility of facilities) {
    if (!(facility.tambonId in tambonMap)) {
      throw new Error(
        `Facility ${facility.hospcode} references unknown tambon ${facility.tambonId}`,
      );
    }

    facilityMap[facility.hospcode] = Object.freeze({
      name: facility.hospname,
      tambonId: facility.tambonId,
    });
  }

  const rowsByKpi = new Map();

  for (const row of results) {
    const rows = rowsByKpi.get(row.kpiKey);

    if (rows) {
      rows.push(row);
    } else {
      rowsByKpi.set(row.kpiKey, [row]);
    }
  }

  const catalogKeys = new Set(kpis.map((kpi) => kpi.key));

  for (const key of rowsByKpi.keys()) {
    if (!catalogKeys.has(key)) {
      throw new Error(`Dashboard result references unknown KPI: ${key}`);
    }
  }

  for (const key of catalogKeys) {
    if (!rowsByKpi.has(key)) {
      throw new Error(`Catalog KPI has no active result rows: ${key}`);
    }
  }

  const summaries = kpis.map((kpi) => {
    const rows = rowsByKpi.get(kpi.key);
    const periodCode = rows[0].periodCode;

    for (const row of rows) {
      if (row.periodCode !== periodCode) {
        throw new Error(`KPI ${kpi.key} has mixed period codes`);
      }
    }

    const { targetMonths, periodLabel } = buildPeriodPresentation(
      kpi,
      periodCode,
    );

    let totalTarget = 0;
    let totalResult = 0;
    const buckets = new Map();

    for (const row of rows) {
      totalTarget = guardFinite(
        totalTarget + row.target,
        `KPI ${kpi.key} total target`,
      );

      totalResult = guardFinite(
        totalResult + row.result,
        `KPI ${kpi.key} total result`,
      );

      const key = row.hospcode || row.areacode;
      const existing = buckets.get(key) || { target: 0, result: 0 };

      existing.target = guardFinite(
        existing.target + row.target,
        `KPI ${kpi.key} breakdown ${key} target`,
      );

      existing.result = guardFinite(
        existing.result + row.result,
        `KPI ${kpi.key} breakdown ${key} result`,
      );

      buckets.set(key, existing);
    }

    const percentage = guardFinite(
      totalTarget > 0 ? (totalResult / totalTarget) * 100 : 0,
      `KPI ${kpi.key} percentage`,
    );

    const breakdown = Object.create(null);

    for (const [key, bucket] of buckets) {
      breakdown[key] = Object.freeze({
        target: bucket.target,
        result: bucket.result,
        percentage: guardFinite(
          bucket.target > 0 ? (bucket.result / bucket.target) * 100 : 0,
          `KPI ${kpi.key} breakdown ${key} percentage`,
        ),
      });
    }

    return Object.freeze({
      key: kpi.key,
      title: kpi.title,
      targetValue: kpi.target ?? 0,
      totalTarget,
      totalResult,
      percentage,
      rows: Object.freeze([...rows]),
      breakdown,
      periodCode,
      periodLabel,
      targetMonths,
      link: kpi.link,
      categoryCode: kpi.categoryCode,
      category: kpi.category,
      categoryOrder: kpi.categoryOrder,
      subgroup: kpi.subgroup || "",
      order: kpi.order,
    });
  });

  return Object.freeze({
    dataset,
    summaries: Object.freeze(summaries),
    facilities: Object.freeze([...facilities]),
    tambons: Object.freeze([...tambons]),
    facilityMap,
    tambonMap,
    lastUpdated: formatSourceLastUpdated(dataset.sourceLastUpdated),
  });
}

export function getAggregate(summary, facilityCode = "") {
  if (!facilityCode) {
    return {
      target: summary.totalTarget,
      result: summary.totalResult,
      percentage: summary.percentage,
    };
  }

  return (
    summary.breakdown[facilityCode] || {
      target: 0,
      result: 0,
      percentage: 0,
    }
  );
}

export function getDashboardStats(summaries, facilityCode = "") {
  let passed = 0;
  let attention = 0;

  for (const summary of summaries) {
    const aggregate = getAggregate(summary, facilityCode);
    const isRawCount = aggregate.target === 0;
    const isPass = isRawCount || aggregate.percentage >= summary.targetValue;

    if (isPass) {
      passed += 1;
    } else {
      attention += 1;
    }
  }

  const total = summaries.length;

  return Object.freeze({
    total,
    passed,
    attention,
    passRate: total > 0 ? (passed / total) * 100 : 0,
  });
}

export function getCategories(summaries) {
  const byCode = new Map();

  for (const summary of summaries) {
    if (!byCode.has(summary.categoryCode)) {
      byCode.set(summary.categoryCode, {
        code: summary.categoryCode,
        name: summary.category,
        order: summary.categoryOrder,
        count: 0,
      });
    }

    byCode.get(summary.categoryCode).count += 1;
  }

  return Object.freeze(
    [...byCode.values()]
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
      .map((entry) => Object.freeze(entry)),
  );
}

export function filterSummaries(
  summaries,
  { categoryCode = "", query = "" } = {},
) {
  const normalized = query.trim().toLocaleLowerCase("th");

  return summaries.filter((summary) => {
    if (categoryCode && summary.categoryCode !== categoryCode) {
      return false;
    }

    if (!normalized) {
      return true;
    }

    return (
      summary.title.toLocaleLowerCase("th").includes(normalized) ||
      summary.category.toLocaleLowerCase("th").includes(normalized) ||
      summary.subgroup.toLocaleLowerCase("th").includes(normalized)
    );
  });
}
