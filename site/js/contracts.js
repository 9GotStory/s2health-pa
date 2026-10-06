const PERIOD_CODES = new Set(["annual", "q1", "q2", "q3", "q4"]);

function asRecord(value, what) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }

  return value;
}

function requireString(record, field) {
  const value = record[field];

  if (typeof value !== "string") {
    throw new Error(`Field ${field} is not a string`);
  }

  return value;
}

function requireNonblankString(record, field) {
  const value = record[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Field ${field} is not a nonblank string`);
  }

  return value;
}

function optionalString(record, field) {
  const value = record[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Field ${field} is not a string or null`);
  }

  return value;
}

function optionalNonblankString(record, field) {
  const value = record[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Field ${field} is not a nonblank string or null`);
  }

  return value;
}

function requireInteger(record, field) {
  const value = record[field];

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Field ${field} is not an integer`);
  }

  return value;
}

function optionalInteger(record, field) {
  const value = record[field];

  if (value === null) {
    return null;
  }

  return requireInteger(record, field);
}

function requireFiniteNumber(record, field) {
  const value = record[field];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Field ${field} is not a finite number`);
  }

  return value;
}

function optionalFiniteNumber(record, field) {
  if (record[field] === null) {
    return null;
  }

  return requireFiniteNumber(record, field);
}

function requireBoolean(record, field) {
  const value = record[field];

  if (typeof value !== "boolean") {
    throw new Error(`Field ${field} is not a boolean`);
  }

  return value;
}

function requireDigitCode(record, field, length) {
  const value = record[field];

  if (
    typeof value !== "string" ||
    value.length !== length ||
    !/^\d+$/.test(value)
  ) {
    throw new Error(`Field ${field} is not a ${length}-digit code`);
  }

  return value;
}

function requirePeriodCode(record, field) {
  const value = record[field];

  if (typeof value !== "string" || !PERIOD_CODES.has(value)) {
    throw new Error(`Field ${field} is not a period code`);
  }

  return value;
}

function requireSourceLastUpdated(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" &&
    (/^\d{12}$/.test(value) || /^\d{14}$/.test(value))
  ) {
    return value;
  }

  throw new Error("Field sourceLastUpdated is not a 12/14-digit timestamp");
}

function parseDashboardResult(value) {
  const record = asRecord(value, "Dashboard result");

  return Object.freeze({
    kpiKey: requireNonblankString(record, "kpiKey"),
    periodCode: requirePeriodCode(record, "periodCode"),
    areacode: requireNonblankString(record, "areacode"),
    hospcode: optionalNonblankString(record, "hospcode"),
    target: requireFiniteNumber(record, "target"),
    result: requireFiniteNumber(record, "result"),
  });
}

export function parseDashboardResponse(value) {
  const root = asRecord(value, "Dashboard response");

  if (!("dataset" in root) || !("results" in root)) {
    throw new Error("Dashboard response must have dataset and results");
  }

  if (!Array.isArray(root.results)) {
    throw new Error("Dashboard results is not an array");
  }

  if (root.dataset === null) {
    if (root.results.length !== 0) {
      throw new Error("No-active dataset must not carry results");
    }

    return Object.freeze({
      dataset: null,
      results: Object.freeze([]),
    });
  }

  const dataset = asRecord(root.dataset, "Dashboard dataset");
  const syncRunId = requireString(dataset, "syncRunId");
  const currentQuarter = requireInteger(dataset, "currentQuarter");
  const activatedAt = requireString(dataset, "activatedAt");

  if (!/^\d+$/.test(syncRunId)) {
    throw new Error("Field syncRunId is not a decimal identity");
  }

  if (currentQuarter < 1 || currentQuarter > 4) {
    throw new Error("Field currentQuarter is out of range 1..4");
  }

  if (activatedAt.length === 0 || Number.isNaN(Date.parse(activatedAt))) {
    throw new Error("Field activatedAt is not a valid timestamp");
  }

  if (root.results.length === 0) {
    throw new Error("Active dataset must carry results");
  }

  return Object.freeze({
    dataset: Object.freeze({
      syncRunId,
      fiscalYear: requireInteger(dataset, "fiscalYear"),
      currentQuarter,
      activatedAt,
      sourceLastUpdated: requireSourceLastUpdated(dataset.sourceLastUpdated),
    }),
    results: Object.freeze(root.results.map(parseDashboardResult)),
  });
}

export function parseKpiCatalogResponse(value) {
  const root = asRecord(value, "KPI catalog response");

  if (!Array.isArray(root.kpis)) {
    throw new Error("KPI catalog response must be { kpis: [...] }");
  }

  const seen = new Set();

  return Object.freeze(
    root.kpis.map((entry) => {
      const record = asRecord(entry, "KPI catalog entry");
      const key = requireNonblankString(record, "key");

      if (seen.has(key)) {
        throw new Error(`Duplicate KPI key: ${key}`);
      }

      seen.add(key);

      const effectiveQuarter = optionalInteger(record, "effectiveQuarter");

      if (
        effectiveQuarter !== null &&
        (effectiveQuarter < 1 || effectiveQuarter > 4)
      ) {
        throw new Error("Field effectiveQuarter is out of range 1..4");
      }

      const targetMonths = optionalInteger(record, "targetMonths");

      if (targetMonths !== null && targetMonths <= 0) {
        throw new Error("Field targetMonths must be positive");
      }

      return Object.freeze({
        key,
        title: requireNonblankString(record, "title"),
        target: optionalFiniteNumber(record, "target"),
        order: requireInteger(record, "order"),
        link: optionalString(record, "link"),
        categoryCode: requireNonblankString(record, "categoryCode"),
        category: requireNonblankString(record, "category"),
        categoryOrder: requireInteger(record, "categoryOrder"),
        subgroup: optionalString(record, "subgroup"),
        isQuarterly: requireBoolean(record, "isQuarterly"),
        targetMonths,
        effectiveQuarter,
      });
    }),
  );
}

export function parseFacilitiesResponse(value) {
  const root = asRecord(value, "Facilities response");

  if (!Array.isArray(root.facilities)) {
    throw new Error("Facilities response must be { facilities: [...] }");
  }

  const seen = new Set();

  return Object.freeze(
    root.facilities.map((entry) => {
      const record = asRecord(entry, "Facility entry");
      const hospcode = requireDigitCode(record, "hospcode", 5);

      if (seen.has(hospcode)) {
        throw new Error(`Duplicate facility hospcode: ${hospcode}`);
      }

      seen.add(hospcode);

      return Object.freeze({
        hospcode,
        hospname: requireNonblankString(record, "hospname"),
        tambonId: requireDigitCode(record, "tambonId", 6),
      });
    }),
  );
}

export function parseTambonsResponse(value) {
  const root = asRecord(value, "Tambons response");

  if (!Array.isArray(root.tambons)) {
    throw new Error("Tambons response must be { tambons: [...] }");
  }

  const seen = new Set();

  return Object.freeze(
    root.tambons.map((entry) => {
      const record = asRecord(entry, "Tambon entry");
      const id = requireDigitCode(record, "id", 6);

      if (seen.has(id)) {
        throw new Error(`Duplicate tambon id: ${id}`);
      }

      seen.add(id);

      return Object.freeze({
        id,
        nameTh: requireNonblankString(record, "nameTh"),
      });
    }),
  );
}
