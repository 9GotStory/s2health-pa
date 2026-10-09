import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDashboardModel,
  formatSourceLastUpdated,
  loadConsistentDashboard,
  parseKpiCatalogSnapshot,
  parseDashboardResponse,
  parseFacilitiesResponse,
  parseKpiCatalogResponse,
  parseTambonsResponse,
} from './dashboard-data.ts';

/**
 * Pure contract tests for the Backend v2 dashboard read path. Wire fixtures
 * mirror what /api/v1/* returns; assertions check resulting behavior.
 */

type Wire = Record<string, unknown>;

function wireDataset(overrides: Wire = {}): Wire {
  return {
    syncRunId: '42',
    fiscalYear: 2569,
    currentQuarter: 3,
    activatedAt: '2026-09-01T00:00:00.000Z',
    sourceLastUpdated: '202608301230',
    ...overrides,
  };
}

function wireRow(overrides: Wire = {}): Wire {
  return {
    kpiKey: 's_anc5',
    periodCode: 'q3',
    areacode: '54060199',
    hospcode: '10755',
    target: 10,
    result: 8,
    ...overrides,
  };
}

function wireKpi(overrides: Wire = {}): Wire {
  return {
    key: 's_anc5',
    title: 'ANC 5 ครั้ง',
    target: 70,
    order: 1,
    link: null,
    categoryCode: 'basic',
    category: 'ตัวชี้วัดพื้นฐาน',
    categoryOrder: 1,
    subgroup: null,
    isQuarterly: true,
    targetMonths: null,
    effectiveQuarter: null,
    ...overrides,
  };
}

function wireFacility(overrides: Wire = {}): Wire {
  return {
    hospcode: '10755',
    hospname: 'รพ.สต.ทดสอบ',
    tambonId: '540601',
    ...overrides,
  };
}

function wireTambon(overrides: Wire = {}): Wire {
  return { id: '540601', nameTh: 'ทดสอบ', ...overrides };
}

/** Run the full pipeline (parse all four payloads + cross-validate). */
function buildModel(opts: {
  kpis?: Wire[];
  rows?: Wire[];
  facilities?: Wire[];
  tambons?: Wire[];
  dataset?: Wire;
} = {}) {
  const parsed = parseDashboardResponse({
    dataset: opts.dataset ?? wireDataset(),
    results: opts.rows ?? [wireRow()],
  });
  assert.notEqual(parsed.dataset, null, 'test fixture must be an active dataset');
  return buildDashboardModel({
    dataset: parsed.dataset!,
    results: parsed.results,
    kpis: parseKpiCatalogResponse({ kpis: opts.kpis ?? [wireKpi()] }),
    facilities: parseFacilitiesResponse({
      facilities: opts.facilities ?? [wireFacility()],
    }),
    tambons: parseTambonsResponse({ tambons: opts.tambons ?? [wireTambon()] }),
  });
}

test('A: valid active dataset builds KPISummary and reference maps', () => {
  const model = buildModel();
  assert.equal(model.summaries.length, 1);
  const s = model.summaries[0];
  assert.equal(s.tableName, 's_anc5');
  assert.equal(s.title, 'ANC 5 ครั้ง');
  assert.equal(s.data.length, 1);
  assert.deepEqual(model.hospitalMap['10755'], {
    name: 'รพ.สต.ทดสอบ',
    tambon_id: '540601',
  });
  assert.equal(model.tambonMap['540601'], 'ทดสอบ');
  assert.ok(model.lastUpdated.length > 0);
});

test('B: result target/result are used directly as calculation authority', () => {
  const model = buildModel({ rows: [wireRow({ target: 7.5, result: 3.25 })] });
  const s = model.summaries[0];
  assert.equal(s.totalTarget, 7.5);
  assert.equal(s.totalResult, 3.25);
  assert.ok(Math.abs(s.percentage - (3.25 / 7.5) * 100) < 1e-9);
});

test('C: totals are aggregated across all rows', () => {
  const model = buildModel({
    rows: [
      wireRow({ hospcode: '10755', target: 10, result: 5 }),
      wireRow({ hospcode: '10756', target: 20, result: 10 }),
      wireRow({ hospcode: null, areacode: '54069999', target: 10, result: 10 }),
    ],
  });
  const s = model.summaries[0];
  assert.equal(s.totalTarget, 40);
  assert.equal(s.totalResult, 25);
  assert.ok(Math.abs(s.percentage - 62.5) < 1e-9);
});

test('D: facility breakdown is aggregated per hospcode-or-areacode key', () => {
  const model = buildModel({
    rows: [
      wireRow({ hospcode: '10755', target: 10, result: 5 }),
      wireRow({ hospcode: '10755', target: 5, result: 5 }),
      wireRow({ hospcode: null, areacode: '54069999', target: 4, result: 2 }),
    ],
    facilities: [wireFacility()],
  });
  const b = model.summaries[0].breakdown;
  assert.equal(b['10755'].target, 15);
  assert.equal(b['10755'].result, 10);
  assert.ok(Math.abs(b['10755'].percentage - (10 / 15) * 100) < 1e-9);
  // Null-hospcode rows bucket by areacode.
  assert.deepEqual(b['54069999'], { target: 4, result: 2, percentage: 50 });
});

test('E: catalog order is preserved regardless of order values', () => {
  const model = buildModel({
    kpis: [
      wireKpi({ key: 'kpi_c', order: 3 }),
      wireKpi({ key: 'kpi_a', order: 1 }),
      wireKpi({ key: 'kpi_b', order: 2 }),
    ],
    rows: [
      wireRow({ kpiKey: 'kpi_a' }),
      wireRow({ kpiKey: 'kpi_b' }),
      wireRow({ kpiKey: 'kpi_c' }),
    ],
  });
  assert.deepEqual(
    model.summaries.map((s) => s.tableName),
    ['kpi_c', 'kpi_a', 'kpi_b'],
  );
});

test('F: catalog metadata maps onto KPISummary', () => {
  const model = buildModel({
    kpis: [
      wireKpi({
        key: 'with_meta',
        title: 'มีเป้าหมาย',
        target: 85,
        order: 7,
        link: 'https://example.test/kpi',
        categoryCode: 'epi',
        category: 'สร้างเสริมภูมิคุ้มกันโรค',
        categoryOrder: 2,
        subgroup: 'กลุ่มอายุ 2 ปี',
      }),
      wireKpi({ key: 'minimal', target: null, link: null, subgroup: null }),
    ],
    rows: [wireRow({ kpiKey: 'with_meta' }), wireRow({ kpiKey: 'minimal' })],
  });
  const [withMeta, minimal] = model.summaries;
  assert.equal(withMeta.title, 'มีเป้าหมาย');
  assert.equal(withMeta.targetValue, 85);
  assert.equal(withMeta.link, 'https://example.test/kpi');
  assert.equal(withMeta.order, 7);
  assert.equal(withMeta.category, 'สร้างเสริมภูมิคุ้มกันโรค');
  assert.equal(withMeta.subgroup, 'กลุ่มอายุ 2 ปี');
  assert.equal(withMeta.categoryOrder, 2);
  // Null catalog target stays distinguishable from an explicit numeric target.
  assert.equal(minimal.targetValue, null);
  assert.equal(minimal.link, undefined);
  assert.equal(minimal.subgroup, '');
});

test('F2: explicit zero KPI target is preserved in the presentation model', () => {
  const model = buildModel({
    kpis: [wireKpi({ target: 0 })],
  });
  assert.equal(model.summaries[0].targetValue, 0);
});



test('F3: KPI catalog target accepts null and percentage range 0..100', () => {
  for (const target of [null, 0, 85, 100]) {
    const parsed = parseKpiCatalogResponse({
      kpis: [wireKpi({ target })],
    });
    assert.equal(parsed[0].target, target);
  }
});

test('F4: KPI catalog target rejects values outside percentage range', () => {
  for (const target of [-1, -0.01, 100.01, 101, 150]) {
    assert.throws(() =>
      parseKpiCatalogResponse({
        kpis: [wireKpi({ target })],
      }),
    );
  }
});

test('F5: dashboard result-row target remains an unrestricted denominator count', () => {
  const model = buildModel({
    rows: [wireRow({ target: 250, result: 125 })],
  });
  assert.equal(model.summaries[0].totalTarget, 250);
  assert.equal(model.summaries[0].totalResult, 125);
  assert.equal(model.summaries[0].percentage, 50);
});

test('G: annual KPI presents 12 months / รายปี', () => {
  const model = buildModel({
    kpis: [wireKpi({ isQuarterly: false })],
    rows: [wireRow({ periodCode: 'annual' })],
  });
  assert.equal(model.summaries[0].targetMonths, 12);
  assert.equal(model.summaries[0].period, 'รายปี');
});

test('H: quarterly months derive from result periodCode, not dataset.currentQuarter', () => {
  const model = buildModel({
    dataset: wireDataset({ currentQuarter: 3 }),
    kpis: [wireKpi({ isQuarterly: true })],
    rows: [wireRow({ periodCode: 'q2' })],
  });
  assert.equal(model.summaries[0].targetMonths, 6);
  assert.equal(model.summaries[0].period, 'สะสม 6 เดือน (Q2)');
});

test('I: catalog targetMonths override wins for display period', () => {
  const model = buildModel({
    kpis: [wireKpi({ isQuarterly: true, targetMonths: 8 })],
    rows: [wireRow({ periodCode: 'q2' })],
  });
  assert.equal(model.summaries[0].targetMonths, 8);
  assert.equal(model.summaries[0].period, 'สะสม 8 เดือน');
});



test('I2: catalog targetMonths accepts null and integer months 1..12', () => {
  for (const targetMonths of [null, 1, 8, 12]) {
    const parsed = parseKpiCatalogResponse({
      kpis: [wireKpi({ targetMonths })],
    });
    assert.equal(parsed[0].targetMonths, targetMonths);
  }
});

test('I3: catalog targetMonths rejects invalid month counts', () => {
  for (const targetMonths of [0, -1, -3, 13, 99, 1.5]) {
    assert.throws(() =>
      parseKpiCatalogResponse({
        kpis: [wireKpi({ targetMonths })],
      }),
    );
  }

  for (const targetMonths of ['8', true, {}, []]) {
    assert.throws(() =>
      parseKpiCatalogResponse({
        kpis: [wireKpi({ targetMonths })],
      }),
    );
  }
});

test('J: effectiveQuarter must agree with active result periodCode', () => {
  assert.throws(() =>
    buildModel({
      kpis: [wireKpi({ effectiveQuarter: 3 })],
      rows: [wireRow({ periodCode: 'q2' })],
    }),
  );
  // Agreeing pair is accepted and derives months from the result period.
  const ok = buildModel({
    kpis: [wireKpi({ effectiveQuarter: 2 })],
    rows: [wireRow({ periodCode: 'q2' })],
  });
  assert.equal(ok.summaries[0].targetMonths, 6);
});

test('K: one KPI with multiple period codes is rejected', () => {
  assert.throws(() =>
    buildModel({
      rows: [wireRow({ periodCode: 'q1' }), wireRow({ periodCode: 'q2' })],
    }),
  );
});

test('L: unknown dashboard KPI is rejected', () => {
  assert.throws(() =>
    buildModel({ rows: [wireRow({ kpiKey: 'ghost_kpi' })] }),
  );
});

test('M: catalog KPI without result rows is rejected', () => {
  assert.throws(() =>
    buildModel({
      kpis: [wireKpi({ key: 'has_rows' }), wireKpi({ key: 'no_rows' })],
      rows: [wireRow({ kpiKey: 'has_rows' })],
    }),
  );
});

test('N: duplicate catalog KPI key is rejected', () => {
  assert.throws(() =>
    parseKpiCatalogResponse({ kpis: [wireKpi(), wireKpi()] }),
  );
});

test('O: malformed target/result is rejected (no coercion)', () => {
  for (const bad of [
    { target: '10' },
    { target: true },
    { target: null },
    { result: '8' },
    { result: false },
    { result: undefined },
  ]) {
    assert.throws(() =>
      parseDashboardResponse({
        dataset: wireDataset(),
        results: [wireRow(bad)],
      }),
    );
  }
});

test('P: dataset null with results is rejected', () => {
  assert.throws(() =>
    parseDashboardResponse({ dataset: null, results: [wireRow()] }),
  );
});

test('Q: valid dataset null + empty results is accepted', () => {
  const parsed = parseDashboardResponse({ dataset: null, results: [] });
  assert.equal(parsed.dataset, null);
  assert.deepEqual(parsed.results, []);
});

test('R: duplicate facility hospcode is rejected', () => {
  assert.throws(() =>
    parseFacilitiesResponse({
      facilities: [wireFacility(), wireFacility()],
    }),
  );
});

test('S: duplicate tambon id is rejected', () => {
  assert.throws(() =>
    parseTambonsResponse({ tambons: [wireTambon(), wireTambon()] }),
  );
});

test('T: facility referring to missing tambon is rejected', () => {
  assert.throws(() =>
    buildModel({
      facilities: [wireFacility({ tambonId: '540602' })],
      tambons: [wireTambon()],
    }),
  );
});

test('U: sourceLastUpdated 12-digit formats as Thai datetime', () => {
  const formatted = formatSourceLastUpdated('202602021245');
  assert.ok(formatted.endsWith(' น.'));
  assert.ok(formatted.includes('กุมภาพันธ์'), formatted); // February
  assert.ok(formatted.includes('2569'), formatted); // Buddhist-era 2026
  assert.ok(formatted.includes('12:45'), formatted);
  // The model exposes the same dataset-level freshness.
  const model = buildModel({ dataset: wireDataset({ sourceLastUpdated: '202602021245' }) });
  assert.equal(model.lastUpdated, formatted);
});

test('V: sourceLastUpdated 14-digit drops seconds for display', () => {
  assert.equal(
    formatSourceLastUpdated('20260202124530'),
    formatSourceLastUpdated('202602021245'),
  );
});



test('V2: sourceLastUpdated validates Gregorian calendar and clock ranges', () => {
  const valid = [
    '202402290000',
    '202602282359',
    '20260228235959',
  ];
  for (const sourceLastUpdated of valid) {
    assert.doesNotThrow(() =>
      parseDashboardResponse({
        dataset: wireDataset({ sourceLastUpdated }),
        results: [wireRow()],
      }),
    );
    assert.doesNotThrow(() => formatSourceLastUpdated(sourceLastUpdated));
  }

  const invalid = [
    '202600011200',
    '202613011200',
    '202602001200',
    '202602301200',
    '202302291200',
    '202601012400',
    '202601012360',
    '20260101235960',
    '2026010112AA',
    '2026010112000',
  ];

  for (const sourceLastUpdated of invalid) {
    assert.throws(() =>
      parseDashboardResponse({
        dataset: wireDataset({ sourceLastUpdated }),
        results: [wireRow()],
      }),
    );
    assert.throws(() => formatSourceLastUpdated(sourceLastUpdated));
  }
});

test('W: sourceLastUpdated null is accepted and formats empty', () => {
  assert.equal(formatSourceLastUpdated(null), '');
  const model = buildModel({ dataset: wireDataset({ sourceLastUpdated: null }) });
  assert.equal(model.lastUpdated, '');
});

test('X: rows outside the district prefix are still counted (no 5406 client filter)', () => {
  const model = buildModel({
    rows: [
      wireRow({ hospcode: '10755', areacode: '54060199', target: 10, result: 5 }),
      wireRow({ hospcode: '10756', areacode: '99990199', target: 30, result: 15 }),
    ],
    facilities: [
      wireFacility(),
      wireFacility({ hospcode: '10756', hospname: 'นอกเขต', tambonId: '540601' }),
    ],
  });
  assert.equal(model.summaries[0].totalTarget, 40);
  assert.equal(model.summaries[0].totalResult, 20);
});

test('Y: raw-count KPI (target 0) stays valid with zero percentage', () => {
  const model = buildModel({
    rows: [
      wireRow({ hospcode: '10755', target: 0, result: 4 }),
      wireRow({ hospcode: '10756', target: 0, result: 6 }),
    ],
    facilities: [wireFacility(), wireFacility({ hospcode: '10756' })],
  });
  const s = model.summaries[0];
  assert.equal(s.totalTarget, 0);
  assert.equal(s.totalResult, 10);
  assert.equal(s.percentage, 0);
  assert.equal(s.breakdown['10755'].percentage, 0);
});

test('dashboard dataset field validation rejects out-of-range and malformed values', () => {
  for (const bad of [
    { currentQuarter: 0 },
    { currentQuarter: 5 },
    { syncRunId: '' },
    { syncRunId: 'abc' },
    { activatedAt: 'not-a-date' },
    { sourceLastUpdated: '20260202' },
    { fiscalYear: '2569' },
  ]) {
    assert.throws(() =>
      parseDashboardResponse({ dataset: wireDataset(bad), results: [wireRow()] }),
    );
  }
  // Missing envelope keys / wrong shapes.
  assert.throws(() => parseDashboardResponse({ dataset: wireDataset() }));
  assert.throws(() => parseDashboardResponse({ results: [] }));
  assert.throws(() =>
    parseDashboardResponse({ dataset: wireDataset(), results: {} }),
  );
  // Active dataset must carry results.
  assert.throws(() =>
    parseDashboardResponse({ dataset: wireDataset(), results: [] }),
  );
});

test('catalog / facility / tambon wire shapes are strictly validated', () => {
  assert.throws(() => parseKpiCatalogResponse({ kpis: {} }));
  assert.throws(() => parseKpiCatalogResponse([]));
  // target must be a number or null — strings are not coerced.
  assert.throws(() =>
    parseKpiCatalogResponse({ kpis: [wireKpi({ target: '70' })] }),
  );
  assert.throws(() =>
    parseKpiCatalogResponse({ kpis: [wireKpi({ isQuarterly: 1 })] }),
  );
  assert.throws(() =>
    parseKpiCatalogResponse({ kpis: [wireKpi({ effectiveQuarter: 5 })] }),
  );

  assert.throws(() =>
    parseFacilitiesResponse({ facilities: [wireFacility({ hospcode: '1075' })] }),
  );
  assert.throws(() =>
    parseFacilitiesResponse({ facilities: [wireFacility({ tambonId: '5406011' })] }),
  );
  assert.throws(() =>
    parseFacilitiesResponse({ facilities: [wireFacility({ hospname: '  ' })] }),
  );

  assert.throws(() =>
    parseTambonsResponse({ tambons: [wireTambon({ id: '5406' })] }),
  );
  assert.throws(() =>
    parseTambonsResponse({ tambons: [wireTambon({ nameTh: '' })] }),
  );
});

test('period authority: annual catalog entry rejects quarterly result and vice versa', () => {
  assert.throws(() =>
    buildModel({
      kpis: [wireKpi({ isQuarterly: false })],
      rows: [wireRow({ periodCode: 'q3' })],
    }),
  );
  assert.throws(() =>
    buildModel({
      kpis: [wireKpi({ isQuarterly: true })],
      rows: [wireRow({ periodCode: 'annual' })],
    }),
  );
});

// R1-02 regression: link/subgroup are nullable plain strings — "" is a
// valid value and must survive parsing and presentation-model building.
test('R1-02 A/B: catalog accepts and preserves empty-string link and subgroup', () => {
  const kpis = parseKpiCatalogResponse({
    kpis: [
      wireKpi({ key: 'empty_strs', link: '', subgroup: '' }),
      wireKpi({ key: 'null_strs', link: null, subgroup: null }),
    ],
  });
  assert.equal(kpis[0].link, '');
  assert.equal(kpis[0].subgroup, '');
  assert.equal(kpis[1].link, null);
  assert.equal(kpis[1].subgroup, null);
});

test('R1-02 C: empty subgroup builds a valid presentation model with subgroup ""', () => {
  const model = buildModel({
    kpis: [wireKpi({ key: 'empty_sub', subgroup: '' })],
    rows: [wireRow({ kpiKey: 'empty_sub' })],
  });
  assert.equal(model.summaries[0].subgroup, '');
});



test('R1-03 A/B: catalog link accepts empty/null and absolute HTTP(S) URLs without rewriting', () => {
  for (const link of [
    null,
    '',
    'https://example.test/kpi?foo=1#section',
    'http://example.test/detail',
  ]) {
    const parsed = parseKpiCatalogResponse({
      kpis: [wireKpi({ link })],
    });
    assert.equal(parsed[0].link, link);
  }
});

test('R1-03 C/D/E: catalog link rejects unsafe, relative, malformed, and padded URLs', () => {
  for (const link of [
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'file:///tmp/detail',
    '/detail',
    'detail/1',
    'https://',
    '   ',
    ' https://example.test/kpi',
    'https://example.test/kpi ',
  ]) {
    assert.throws(() =>
      parseKpiCatalogResponse({
        kpis: [wireKpi({ link })],
      }),
    );
  }
});

test('R1-02 D/E: non-string non-null link and subgroup are still rejected', () => {
  for (const bad of [1, true, {}, []]) {
    assert.throws(() =>
      parseKpiCatalogResponse({ kpis: [wireKpi({ link: bad })] }),
    );
    assert.throws(() =>
      parseKpiCatalogResponse({ kpis: [wireKpi({ subgroup: bad })] }),
    );
  }
});

// R2-01 regression: hospcode is contractually any nonblank string, so
// "__proto__"/"constructor" must aggregate as ordinary data keys without
// touching prototypes.
test('R2-01 A/B/D: "__proto__" and "constructor" hospcodes are ordinary breakdown keys with expected values', () => {
  const model = buildModel({
    rows: [
      wireRow({ hospcode: '__proto__', areacode: '54060101', target: 10, result: 4 }),
      wireRow({ hospcode: 'constructor', areacode: '54060102', target: 5, result: 5 }),
      wireRow({ hospcode: '__proto__', areacode: '54060103', target: 2, result: 1 }),
    ],
  });
  const breakdown = model.summaries[0].breakdown;
  // Own-key lookup finds the data bucket (not Object.prototype / the Object
  // constructor) and the rows aggregated into it correctly.
  assert.equal(breakdown['__proto__'].target, 12);
  assert.equal(breakdown['__proto__'].result, 5);
  assert.ok(Math.abs(breakdown['__proto__'].percentage - (5 / 12) * 100) < 1e-9);
  assert.deepEqual(
    ['percentage', 'result', 'target'],
    Object.keys(breakdown['__proto__']).sort(),
  );
  assert.deepEqual(breakdown['constructor'], { target: 5, result: 5, percentage: 100 });
  // Both appear as own record keys alongside the null-hospcode fallback.
  assert.ok(Object.keys(breakdown).includes('__proto__'));
  assert.ok(Object.keys(breakdown).includes('constructor'));
  assert.equal(model.summaries[0].totalTarget, 17);
});

test('R2-01 C: prototype-key rows do not mutate Object.prototype, Object, or plain objects', () => {
  buildModel({
    rows: [
      wireRow({ hospcode: '__proto__', target: 1, result: 1 }),
      wireRow({ hospcode: 'constructor', target: 2, result: 2 }),
      wireRow({ hospcode: 'toString', target: 3, result: 3 }),
    ],
  });
  assert.equal(Object.prototype.hasOwnProperty('target'), false);
  assert.equal(Object.prototype.hasOwnProperty('result'), false);
  const probe: Record<string, unknown> = {};
  assert.equal(probe.target, undefined);
  assert.equal(probe.result, undefined);
  assert.equal(Object.keys(probe).length, 0);
  // Inherited methods and the Object constructor stay intact.
  assert.equal(typeof probe.toString, 'function');
  assert.equal(
    (Object as unknown as Record<string, unknown>).result,
    undefined,
  );
});

// R2-02 regression: bucket accumulation itself must stay finite even when
// the interleaved global total remains finite.
test('R2-02 E: per-bucket target overflow is rejected while the global total stays finite', () => {
  const MAX = Number.MAX_VALUE;
  assert.throws(() =>
    buildModel({
      rows: [
        wireRow({ hospcode: 'overflow_a', target: MAX, result: 0 }),
        wireRow({ hospcode: 'sink_b', target: -MAX, result: 0 }),
        wireRow({ hospcode: 'overflow_a', target: MAX, result: 0 }),
      ],
    }),
  );
});

test('R2-02 F: per-bucket result overflow is rejected while the global result stays finite', () => {
  const MAX = Number.MAX_VALUE;
  assert.throws(() =>
    buildModel({
      rows: [
        wireRow({ hospcode: 'overflow_r', target: 0, result: MAX }),
        wireRow({ hospcode: 'sink_r', target: 0, result: -MAX }),
        wireRow({ hospcode: 'overflow_r', target: 0, result: MAX }),
      ],
    }),
  );
});

test('catalog snapshot requires an exact nullable decimal run identity', () => {
  const valid = parseKpiCatalogSnapshot({
    activeSyncRunId: '42', kpis: [wireKpi({ target: 0 })],
  });
  assert.equal(valid.activeSyncRunId, '42');
  assert.equal(valid.kpis[0]?.target, 0);
  assert.deepEqual(parseKpiCatalogSnapshot({ activeSyncRunId: null, kpis: [] }), {
    activeSyncRunId: null, kpis: [],
  });
  for (const bad of [undefined, '', ' ', 'run-42', 42, false, {}, '42.0']) {
    assert.throws(() => parseKpiCatalogSnapshot({
      activeSyncRunId: bad, kpis: [wireKpi()],
    }));
  }
});

test('snapshot loader rejects A/B race then composes only B/B', async () => {
  const ids = ['42', '43'];
  let dashboards = 0;
  let catalogs = 0;
  const signals: string[] = [];
  const load = async (endpoint: string): Promise<unknown> => {
    signals.push(endpoint);
    if (endpoint === 'dashboard') {
      return {
        dataset: wireDataset({ syncRunId: ids[ Math.min(dashboards++, 1) ] }),
        results: [wireRow()],
      };
    }
    if (endpoint === 'kpis') {
      catalogs += 1;
      return {
        activeSyncRunId: '43',
        kpis: [wireKpi({ target: 95 })],
      };
    }
    if (endpoint === 'facilities') return { facilities: [wireFacility()] };
    if (endpoint === 'tambons') return { tambons: [wireTambon()] };
    throw new Error('Unexpected endpoint');
  };
  const result = await loadConsistentDashboard(load, new AbortController().signal);
  assert.notEqual(result.dataset, null);
  if (!('model' in result)) throw new Error('Expected an active dashboard model');
  assert.equal(result.dataset.syncRunId, '43');
  assert.equal(result.model.summaries[0]?.targetValue, 95);
  assert.equal(dashboards, 2);
  assert.equal(catalogs, 2);
  assert.deepEqual(signals.slice(0, 2), ['dashboard', 'kpis']);
});

test('snapshot loader bounds repeated A/B identity mismatches', async () => {
  let dashboardCalls = 0;
  const fetcher = async (endpoint: string): Promise<unknown> => {
    if (endpoint === 'dashboard') {
      dashboardCalls += 1;
      return { dataset: wireDataset({ syncRunId: '42' }), results: [wireRow()] };
    }
    if (endpoint === 'kpis') {
      return { activeSyncRunId: '43', kpis: [wireKpi({ target: 95 })] };
    }
    if (endpoint === 'facilities') return { facilities: [wireFacility()] };
    return { tambons: [wireTambon()] };
  };
  await assert.rejects(loadConsistentDashboard(fetcher, new AbortController().signal));
  assert.equal(dashboardCalls, 2);
});

test('snapshot loader accepts stable run and rejects same-run malformed catalog without retry', async () => {
  for (const target of [0, null, 85]) {
    let dashboardCalls = 0;
    const fetcher = async (endpoint: string): Promise<unknown> => {
      if (endpoint === 'dashboard') {
        dashboardCalls++;
        return { dataset: wireDataset(), results: [wireRow()] };
      }
      if (endpoint === 'kpis') return {
        activeSyncRunId: '42', kpis: [wireKpi({ target })],
      };
      if (endpoint === 'facilities') return { facilities: [wireFacility()] };
      return { tambons: [wireTambon()] };
    };
    const result = await loadConsistentDashboard(fetcher, new AbortController().signal);
    assert.notEqual(result.dataset, null);
    if (!('model' in result)) throw new Error('Expected an active dashboard model');
    assert.equal(result.model.summaries[0]?.targetValue, target);
    assert.equal(dashboardCalls, 1);
  }
  let count = 0;
  const bad = async (endpoint: string): Promise<unknown> => {
    if (endpoint === 'dashboard') {
      count++;
      return { dataset: wireDataset(), results: [wireRow()] };
    }
    if (endpoint === 'kpis') return { activeSyncRunId: '42', kpis: [wireKpi({ key: 'alien' })] };
    if (endpoint === 'facilities') return { facilities: [wireFacility()] };
    return { tambons: [wireTambon()] };
  };
  await assert.rejects(loadConsistentDashboard(bad, new AbortController().signal));
  assert.equal(count, 1);
});

test('snapshot loader respects no-active and aborted reload', async () => {
  let nonDashboard = 0;
  const inactive = await loadConsistentDashboard(async (endpoint) => {
    if (endpoint !== 'dashboard') nonDashboard += 1;
    return { dataset: null, results: [] };
  }, new AbortController().signal);
  assert.equal(inactive.dataset, null);
  assert.equal(nonDashboard, 0);

  const controller = new AbortController();
  let count = 0;
  const interleaved = async (endpoint: string): Promise<unknown> => {
    if (endpoint === 'dashboard') {
      count++;
      return { dataset: wireDataset(), results: [wireRow()] };
    }
    if (endpoint === 'kpis') {
      controller.abort();
      return { activeSyncRunId: '43', kpis: [wireKpi()] };
    }
    if (endpoint === 'facilities') return { facilities: [wireFacility()] };
    return { tambons: [wireTambon()] };
  };
  await assert.rejects(loadConsistentDashboard(interleaved, controller.signal), {
    name: 'AbortError',
  });
  assert.equal(count, 1);
});

test('changed catalog membership on activation triggers a full reload', async () => {
  let dashboards = 0;
  let catalogs = 0;
  const fetcher = async (endpoint: string): Promise<unknown> => {
    if (endpoint === 'dashboard') {
      dashboards++;
      return {
        dataset: wireDataset({ syncRunId: dashboards === 1 ? '42' : '43' }),
        results: [wireRow({ kpiKey: dashboards === 1 ? 's_anc5' : 's_new' })],
      };
    }
    if (endpoint === 'kpis') {
      catalogs++;
      return { activeSyncRunId: '43', kpis: [wireKpi({ key: 's_new', target: 90 })] };
    }
    if (endpoint === 'facilities') return { facilities: [wireFacility()] };
    return { tambons: [wireTambon()] };
  };
  const value = await loadConsistentDashboard(fetcher, new AbortController().signal);
  assert.notEqual(value.dataset, null);
  if (!('model' in value)) throw new Error('Expected an active dashboard model');
  assert.equal(value.dataset.syncRunId, '43');
  assert.equal(value.model.summaries[0]?.tableName, 's_new');
  assert.equal(dashboards, 2);
  assert.equal(catalogs, 2);
});
