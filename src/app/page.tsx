"use client";

import { useState, useMemo, useEffect } from "react";
import { CalendarClock, LayoutGrid } from "lucide-react";
import KPITable from "@/components/KPITable";
import KPICardList from "@/components/KPICardList";
import KPISummaryStats from "@/components/KPISummaryStats";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import DashboardFilter from "@/components/DashboardFilter";

import DataStatusNotifier from "@/components/DataStatusNotifier";
import { useKPIData } from "@/lib/useKPIData";
import type { KPIMaster } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Home() {
  const {
    dataset,
    data,
    hospitalMap,
    tambonMap,
    isLoading,
    error,
    lastUpdated,
  } = useKPIData();

  // Multi-Checkbox Filter States
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>([]);

  // Active category tab: "" = ทั้งหมด, otherwise a category name. Derived
  // from the data (kpi_registry manifest), so future categories appear as
  // tabs automatically. Synced to ?cat= for shareable deep links. Lazy-init
  // from the URL: safe even under SSR because the first paint is always the
  // loading skeleton (tabs render only after client-side data arrives).
  const [activeCategory, setActiveCategory] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("cat") ?? ""
      : "",
  );

  // Categories in display order (category_order → first appearance).
  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    data.forEach((kpi) => {
      const cat = kpi.category ?? "";
      if (!cat || seen.has(cat)) return;
      seen.set(cat, kpi.categoryOrder ?? 999);
    });
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }, [data]);

  // Derived guard: if the selected category no longer exists (data reload,
  // registry edit), view falls back to ทั้งหมด without a state reset.
  const currentCategory =
    activeCategory && categories.length > 0 && !categories.includes(activeCategory)
      ? ""
      : activeCategory;

  // Persist tab to URL (external system sync — no setState here).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (currentCategory) params.set("cat", currentCategory);
    else params.delete("cat");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [currentCategory]);

  // Filter Data based on Selected KPIs
  const filteredData = useMemo(() => {
    if (selectedKPIs.length === 0) return data;
    return data.filter((kpi) => selectedKPIs.includes(kpi.tableName));
  }, [data, selectedKPIs]);

  // What the current tab shows (summary stats + table/cards follow the tab).
  const tabData = useMemo(
    () =>
      currentCategory
        ? filteredData.filter((kpi) => (kpi.category ?? "") === currentCategory)
        : filteredData,
    [filteredData, currentCategory],
  );

  // Derive the KPI list for the filter from the loaded reports. useKPIData
  // used to expose kpiMasterList but the state was never populated (always []),
  // so this derivation has always been the effective path. Grouping fields
  // ride along so the filter can render category/subgroup sections.
  // NOTE: must run before any early return — React Hooks order rule.
  const dynamicKPIList: KPIMaster[] = useMemo(
    () =>
      data.map((d) => ({
        table_name: d.tableName,
        title: d.title,
        target: d.targetValue,
        order: d.order ?? 0,
        category: d.category ?? "",
        subgroup: d.subgroup ?? "",
        category_order: d.categoryOrder ?? 999,
      })),
    [data],
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50/50 font-[family-name:var(--font-geist-sans)]">
        <div className="w-[98%] max-w-none mx-auto px-2 md:px-4 pb-12">
          <DashboardSkeleton />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50/50 font-[family-name:var(--font-geist-sans)]">
        <div className="w-[98%] max-w-none mx-auto px-2 md:px-4 pb-12">
          <div className="mt-20 text-center">
            <p className="text-error-600 font-medium">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              ลองใหม่
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Authoritative "no active dataset" state — a normal empty dashboard, not
  // a connection error or stale cache. No KPI tables/cards, no success toast.
  if (dataset === null) {
    return (
      <main className="min-h-screen bg-slate-50/50 font-[family-name:var(--font-geist-sans)]">
        <div className="w-[98%] max-w-none mx-auto px-2 md:px-4 pb-12">
          <div className="mt-20 text-center">
            <p className="text-slate-500 font-medium font-prompt">
              ยังไม่มีชุดข้อมูลที่พร้อมใช้งาน
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/50 font-[family-name:var(--font-geist-sans)]">
      <div className="w-[98%] max-w-none mx-auto px-2 md:px-4 pb-12">
        <DataStatusNotifier recordCount={data.length} />

        {/* 1. HEADER & LAST-UPDATED META */}
        <div className="mt-6 mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-3 text-center md:text-left">
          <div>
            <h1 className="text-2xl font-bold text-brand-700 font-prompt tracking-tight">
              PA Dashboard
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-0.5">
              คณะกรรมการประสานงานสาธารณสุขระดับอำเภอสอง
            </p>
          </div>
          <div className="flex justify-center md:justify-end opacity-80 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1.5 bg-white/50 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm backdrop-blur-sm">
              <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 font-prompt">
                อัปเดตล่าสุด: {lastUpdated || "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* MULTI-CHECKBOX FILTER */}
        <DashboardFilter
          hospitalMap={hospitalMap}
          kpiList={dynamicKPIList}
          selectedFacilities={selectedFacilities}
          selectedKPIs={selectedKPIs}
          onFacilitiesChange={setSelectedFacilities}
          onKPIsChange={setSelectedKPIs}
        />

        {/* CATEGORY TABS — one per registry tab + ทั้งหมด */}
        {categories.length > 1 && (
          <div className="mb-6 flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            <button
              onClick={() => setActiveCategory("")}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-all shadow-sm border font-prompt",
                currentCategory === ""
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              ทั้งหมด
            </button>
            {categories.map((cat) => {
              const count = data.filter((k) => (k.category ?? "") === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-all shadow-sm border font-prompt",
                    currentCategory === cat
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {cat}
                  <span
                    className={cn(
                      "ml-1.5 text-[10px] font-medium",
                      currentCategory === cat ? "text-white/80" : "text-slate-400",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 2. SUMMARY STATS — follows the active tab */}
        <KPISummaryStats
          data={tabData}
          selectedFacilities={selectedFacilities}
        />

        {/* 3. DETAILED REPORT (Inverted Pyramid Level 2) */}
        {/* Desktop: KPITable renders its own toolbar + one card per category.
            Mobile: gray backdrop panel behind the KPI cards. */}
        <div className="hidden md:block">
          <KPITable
            data={tabData}
            hospitalMap={hospitalMap}
            tambonMap={tambonMap}
            selectedFacilities={selectedFacilities}
            lastUpdated={lastUpdated}
          />
        </div>

        <div className="block md:hidden p-4 bg-slate-50/50 rounded-xl">
          <KPICardList
            data={tabData}
            hospitalMap={hospitalMap}
            tambonMap={tambonMap}
            selectedFacilities={selectedFacilities}
            lastUpdated={lastUpdated}
          />
        </div>

      </div>
    </main>
  );
}
