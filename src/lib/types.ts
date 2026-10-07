export type DashboardPeriodCode =
  | "annual"
  | "q1"
  | "q2"
  | "q3"
  | "q4";

/**
 * One backend-calculated KPI result row, normalized from
 * /api/v1/dashboard. The backend is the calculation authority — the
 * frontend reads target/result as-is and never recomputes them.
 */
export interface DashboardResultRow {
  kpiKey: string;
  periodCode: DashboardPeriodCode;
  areacode: string;
  hospcode: string | null;
  target: number;
  result: number;
}

/** Metadata of the currently active dataset. */
export interface DashboardDataset {
  syncRunId: string;
  fiscalYear: number;
  currentQuarter: number;
  activatedAt: string;
  sourceLastUpdated: string | null;
}

/**
 * Authoritative list of KPI table names. Physical sync units must match
 * `รหัส.js` `CONFIG.KPIS` + kpi_master `source_sheet` values. Names with
 * `__` are virtual KPIs computed by GAS from a source table (EPI vaccines:
 * `s_epi2__dtp4` = s_epi2 columns dtp4_01..12; `s_epi_complete__1y` =
 * s_epi_complete rows filtered by HDC report GUID). The `(string & {})`
 * tail keeps literal autocomplete while allowing kpi_master-only additions
 * (e.g. a future table) without editing this file — verified safe: nothing
 * switches exhaustively on this union.
 */
export type KPIReportType =
  | 's_kpi_anc12'
  | 's_anc5'
  | 's_kpi_food'
  | 's_kpi_childdev4'
  | 's_kpi_childdev2'
  | 's_aged9'
  | 's_dm_screen'
  | 's_ht_screen'
  | 's_ncd_screen_repleate1'
  | 's_ht_screen_follow'
  | 's_dental_0_5_cavity_free'
  | 's_kpi_dental28'
  | 's_kpi_dental33'
  // EPI virtual KPIs — เด็กครบ 1 ปี (source: s_epi1)
  | 's_epi1__bcg' | 's_epi1__dtp1' | 's_epi1__dtp2' | 's_epi1__dtp_hb3'
  | 's_epi1__hbv' | 's_epi1__hbv2' | 's_epi1__hbv3' | 's_epi1__hbv4'
  | 's_epi1__hib1' | 's_epi1__hib2' | 's_epi1__hib3'
  | 's_epi1__ipv' | 's_epi1__ipv1' | 's_epi1__mmr' | 's_epi1__opv3'
  | 's_epi1__pcv1' | 's_epi1__pcv2' | 's_epi1__pcv3'
  | 's_epi1__rota' | 's_epi1__rota1'
  // เด็กครบ 2 ปี (source: s_epi2)
  | 's_epi2__dtp4' | 's_epi2__opv4' | 's_epi2__mmr1' | 's_epi2__mmr2'
  | 's_epi2__je2' | 's_epi2__pcv4'
  // เด็กครบ 3 ปี (source: s_epi3)
  | 's_epi3__je3' | 's_epi3__mmr2'
  // เด็กครบ 5 ปี (source: s_epi5)
  | 's_epi5__dtp5' | 's_epi5__opv5'
  // Fully immunized ต่อกลุ่มอายุ (source: s_epi_complete, GUID-filtered)
  | 's_epi_complete__1y' | 's_epi_complete__2y'
  | 's_epi_complete__3y' | 's_epi_complete__5y'
  | (string & {});

export interface KPISummary {
  title: string;
  tableName: KPIReportType;
  totalTarget: number;
  totalResult: number;
  percentage: number;
  data: DashboardResultRow[];
  breakdown: Record<string, { target: number; result: number; percentage: number }>;
  targetValue: number | null; // Explicit goal from the API; null uses DEFAULT_TARGET
  targetMonths: number; // Resolved target period in months — annual=12, quarterly=currentQuarter×3
  link?: string;
  period?: string; // e.g. "Q2"
  order?: number; // kpi_master order — used for display sorting only
  // Grouping (from kpi_master; undefined/empty on stale cached payloads)
  category?: string;
  subgroup?: string;
  categoryOrder?: number;
}

export interface KPIMaster {
  table_name: string;
  title: string;
  target: number | null;
  order: number;
  link?: string;
  // Grouping columns from the kpi_master sheet. All optional — the 13
  // original KPIs were backfilled, but stale caches may lack them.
  category?: string;
  subgroup?: string;
  category_order?: number;
  // Virtual-KPI wiring (server-side concern; kept for completeness)
  source_sheet?: string;
  value_prefix?: string;
  source_id?: string;
}
