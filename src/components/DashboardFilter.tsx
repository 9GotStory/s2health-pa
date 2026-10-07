"use client";

import { useState, useMemo } from "react";
import {
  Filter,
  X,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  Building2,
  BarChart2,
} from "lucide-react";
import type { KPIMaster } from "@/lib/types";
import { sortKpisByGroup } from "@/lib/kpi-grouping";
import { cn } from "@/lib/utils";

interface DashboardFilterProps {
  hospitalMap: Record<string, { name: string; tambon_id: string }>;
  kpiList: KPIMaster[];
  selectedFacilities: string[];
  selectedKPIs: string[];
  onFacilitiesChange: (selected: string[]) => void;
  onKPIsChange: (selected: string[]) => void;
}

export default function DashboardFilter({
  hospitalMap,
  kpiList,
  selectedFacilities,
  selectedKPIs,
  onFacilitiesChange,
  onKPIsChange,
}: DashboardFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"facilities" | "kpis">(
    "facilities",
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Prepare Facility Options
  const facilityOptions = useMemo(() => {
    return Object.entries(hospitalMap)
      .map(([code, info]) => ({
        value: code,
        label: info.name.replace("โรงพยาบาลส่งเสริมสุขภาพตำบล", "รพ.สต."),
        group: info.tambon_id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [hospitalMap]);

  // Prepare KPI Options — grouped by category → subgroup. Entries keep
  // category/subgroup so the KPI tab can render sections; grouping fields
  // default to "" for stale lists that lack them.
  const kpiOptions = useMemo(() => {
    return sortKpisByGroup(kpiList).map((kpi) => ({
      value: kpi.table_name,
      label: kpi.title,
      category: kpi.category ?? "",
      subgroup: kpi.subgroup ?? "",
    }));
  }, [kpiList]);

  // Grouped view model for the KPI tab: category → subgroup → items.
  // With no categories present this yields a single unlabelled section —
  // identical to the previous flat list.
  const kpiGroups = useMemo(() => {
    const categories = new Set(kpiOptions.map((k) => k.category).filter(Boolean));
    const showCategories = categories.size >= 2;

    const groups: {
      category: string;
      showHeader: boolean;
      subgroups: { label: string; showHeader: boolean; items: typeof kpiOptions }[];
    }[] = [];
    kpiOptions.forEach((k) => {
      let group = groups.find((g) => g.category === k.category);
      if (!group) {
        group = { category: k.category, showHeader: showCategories && !!k.category, subgroups: [] };
        groups.push(group);
      }
      let sub = group.subgroups.find((s) => s.label === k.subgroup);
      if (!sub) {
        sub = { label: k.subgroup, showHeader: false, items: [] };
        group.subgroups.push(sub);
      }
      sub.items.push(k);
    });
    // Subgroup headers only when the category actually has ≥2 named subgroups
    groups.forEach((g) => {
      const named = g.subgroups.filter((s) => s.label);
      const showSubs = named.length >= 2;
      g.subgroups.forEach((s) => {
        s.showHeader = showSubs && !!s.label;
      });
    });
    return groups;
  }, [kpiOptions]);

  // Filtering Options based on Search
  const displayFacilities = facilityOptions.filter((f) =>
    f.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handlers
  const toggleFacility = (value: string) => {
    if (selectedFacilities.includes(value)) {
      onFacilitiesChange(selectedFacilities.filter((v) => v !== value));
    } else {
      onFacilitiesChange([...selectedFacilities, value]);
    }
  };

  const toggleKPI = (value: string) => {
    if (selectedKPIs.includes(value)) {
      onKPIsChange(selectedKPIs.filter((v) => v !== value));
    } else {
      onKPIsChange([...selectedKPIs, value]);
    }
  };

  const activeCount = selectedFacilities.length + selectedKPIs.length;

  return (
    <div className="mb-6">
      {/* TRIGGER BUTTON (Mobile & Desktop) */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm border",
            isOpen
              ? "bg-brand-50 border-brand-200 text-brand-700"
              : activeCount > 0
                ? "bg-brand-600 border-brand-600 text-white hover:bg-brand-700"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
          )}
        >
          <Filter className="w-4 h-4 sm:w-4 sm:h-4" />
          <span>ตัวกรองข้อมูล {activeCount > 0 && `(${activeCount})`}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 ml-1" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-1" />
          )}
        </button>

        {/* ACTIVE TAGS QUICK CLEAR */}
        {activeCount > 0 && !isOpen && (
          <div className="flex flex-wrap gap-1.5 items-center bg-white/50 px-2 py-1 rounded-lg border border-slate-100">
            {selectedFacilities.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-100">
                <Building2 className="w-3 h-3" />
                {selectedFacilities.length === facilityOptions.length
                  ? "ทุกหน่วยบริการ"
                  : `${selectedFacilities.length} หน่วยบริการ`}
              </span>
            )}
            {selectedKPIs.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-100">
                <BarChart2 className="w-3 h-3" />
                {selectedKPIs.length === kpiOptions.length
                  ? "ทุกตัวชี้วัด"
                  : `${selectedKPIs.length} ตัวชี้วัด`}
              </span>
            )}
            <button
              onClick={() => {
                onFacilitiesChange([]);
                onKPIsChange([]);
              }}
              className="text-[11px] text-slate-500 hover:text-error-600 hover:bg-error-50 px-2 py-1 rounded transition-colors ml-1"
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}
      </div>

      {/* EXPANDABLE PANEL */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen
            ? "grid-rows-[1fr] opacity-100 mt-3"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row max-h-[70vh] md:max-h-[500px]">
            {/* SIDEBAR TABS */}
            <div className="w-full md:w-48 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-row md:flex-col shrink-0 overflow-x-auto">
              <button
                onClick={() => {
                  setActiveTab("facilities");
                  setSearchQuery("");
                }}
                className={cn(
                  "flex-1 md:flex-none flex items-center gap-2 px-4 py-3 md:px-5 md:py-4 text-sm md:text-sm text-xs font-semibold transition-colors border-b-2 md:border-b-0 md:border-l-4 whitespace-nowrap",
                  activeTab === "facilities"
                    ? "bg-white text-brand-700 border-brand-500"
                    : "text-slate-600 border-transparent hover:bg-slate-100",
                )}
              >
                <Building2 className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover:text-brand-500" />
                หน่วยบริการ
                {selectedFacilities.length > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] bg-brand-100 text-brand-700 rounded-full">
                    {selectedFacilities.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("kpis");
                  setSearchQuery("");
                }}
                className={cn(
                  "flex-1 md:flex-none flex items-center gap-2 px-4 py-3 md:px-5 md:py-4 text-sm md:text-sm text-xs font-semibold transition-colors border-b-2 md:border-b-0 md:border-l-4 whitespace-nowrap",
                  activeTab === "kpis"
                    ? "bg-white text-brand-700 border-brand-500"
                    : "text-slate-600 border-transparent hover:bg-slate-100",
                )}
              >
                <BarChart2 className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover:text-brand-500" />
                ตัวชี้วัด
                {selectedKPIs.length > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] bg-brand-100 text-brand-700 rounded-full">
                    {selectedKPIs.length}
                  </span>
                )}
              </button>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 flex flex-col min-h-0 bg-white">
              {/* Header & Search */}
              <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white sticky top-0 z-10 shadow-sm">
                <div className="relative w-full sm:max-w-xs flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={`ค้นหา${activeTab === "facilities" ? "หน่วยบริการ" : "ตัวชี้วัด"}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 sm:gap-2 justify-end w-full sm:w-auto shrink-0">
                  <button
                    onClick={() => {
                      if (activeTab === "facilities") {
                        onFacilitiesChange(facilityOptions.map((f) => f.value));
                      } else {
                        onKPIsChange(kpiOptions.map((k) => k.value));
                      }
                    }}
                    className="text-[12px] sm:text-[13px] font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-2 py-1.5 rounded transition-colors"
                  >
                    เลือกทั้งหมด
                  </button>
                  <span className="text-slate-300 text-xs sm:text-sm">|</span>
                  <button
                    onClick={() => {
                      if (activeTab === "facilities") {
                        onFacilitiesChange([]);
                      } else {
                        onKPIsChange([]);
                      }
                    }}
                    className="text-[12px] sm:text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-2 py-1.5 rounded transition-colors"
                  >
                    ล้างตัวเลือก
                  </button>
                </div>
              </div>

              {/* LIST AREA */}
              <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
                {activeTab === "facilities" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                    {displayFacilities.length === 0 ? (
                      <div className="col-span-full py-10 text-center text-slate-500 text-sm">
                        ไม่พบข้อมูลที่ค้นหา
                      </div>
                    ) : (
                      displayFacilities.map((f) => (
                        <div
                          key={f.value}
                          onClick={() => toggleFacility(f.value)}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border border-transparent hover:bg-slate-50",
                            selectedFacilities.includes(f.value)
                              ? "bg-brand-50/50 border-brand-100"
                              : "",
                          )}
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex shrink-0 items-center justify-center w-5 h-5 rounded border transition-colors",
                              selectedFacilities.includes(f.value)
                                ? "bg-brand-600 border-brand-600 text-white"
                                : "border-slate-300 bg-white",
                            )}
                          >
                            {selectedFacilities.includes(f.value) && (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <span className="text-xs sm:text-sm leading-tight text-slate-700 select-none">
                            {f.label}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === "kpis" && (
                  <div className="flex flex-col gap-1 p-2">
                    {kpiGroups.length === 0 ||
                    kpiGroups.every((g) =>
                      g.subgroups.every((s) => s.items.length === 0),
                    ) ? (
                      <div className="py-10 text-center text-slate-500 text-sm">
                        ไม่พบข้อมูลที่ค้นหา
                      </div>
                    ) : (
                      kpiGroups.map((group) => {
                        // Search-aware view: filter subgroup items; a group
                        // with no surviving items is hidden entirely.
                        const subs = group.subgroups
                          .map((s) => ({
                            ...s,
                            items: s.items.filter((k) =>
                              k.label
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()),
                            ),
                          }))
                          .filter((s) => s.items.length > 0);
                        if (subs.length === 0) return null;

                        const categoryValues = subs.flatMap((s) =>
                          s.items.map((k) => k.value),
                        );
                        const allSelected =
                          categoryValues.length > 0 &&
                          categoryValues.every((v) => selectedKPIs.includes(v));

                        return (
                          <div key={group.category || "default"} className="mb-2">
                            {group.showHeader && (
                              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-50 border border-slate-100 sticky top-0 z-10">
                                <span className="font-prompt text-[13px] font-bold text-brand-800">
                                  {group.category}
                                  <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                                    ({categoryValues.length})
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    allSelected
                                      ? onKPIsChange(
                                          selectedKPIs.filter(
                                            (v) => !categoryValues.includes(v),
                                          ),
                                        )
                                      : onKPIsChange([
                                          ...new Set([
                                            ...selectedKPIs,
                                            ...categoryValues,
                                          ]),
                                        ])
                                  }
                                  className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-2 py-1 rounded transition-colors"
                                >
                                  {allSelected ? "เลิกเลือกหมวด" : "เลือกทั้งหมวด"}
                                </button>
                              </div>
                            )}
                            {subs.map((sub) => (
                              <div key={sub.label || "default"}>
                                {sub.showHeader && (
                                  <div className="px-2 pt-2 pb-1 font-prompt text-[11px] font-semibold text-slate-500">
                                    {sub.label}
                                  </div>
                                )}
                                {sub.items.map((k) => (
                                  <div
                                    key={k.value}
                                    onClick={() => toggleKPI(k.value)}
                                    className={cn(
                                      "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border border-transparent hover:bg-slate-50",
                                      selectedKPIs.includes(k.value)
                                        ? "bg-brand-50/50 border-brand-100"
                                        : "",
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "mt-0.5 flex shrink-0 items-center justify-center w-5 h-5 rounded border transition-colors",
                                        selectedKPIs.includes(k.value)
                                          ? "bg-brand-600 border-brand-600 text-white"
                                          : "border-slate-300 bg-white",
                                      )}
                                    >
                                      {selectedKPIs.includes(k.value) && (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                    </div>
                                    <span className="text-xs sm:text-sm leading-relaxed text-slate-700 select-none">
                                      {k.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
