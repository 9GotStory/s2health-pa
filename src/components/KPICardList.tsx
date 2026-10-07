"use client";

import { useState } from "react";
import type { KPISummary, DashboardResultRow } from "@/lib/types";
import { matchesFacilityFilter, resolveKpiTarget } from "@/lib/kpi-utils";
import { partitionByCategory } from "@/lib/kpi-grouping";
import { KPICard } from "./KPICard";
import { KPIDetailModal } from "./KPIDetailModal";

interface KPICardListProps {
  data: KPISummary[];
  hospitalMap?: Record<string, { name: string; tambon_id: string }>;
  tambonMap?: Record<string, string>;
  selectedFacilities?: string[];
  lastUpdated?: string;
}

export default function KPICardList({
  data,
  hospitalMap = {},
  tambonMap = {},
  selectedFacilities = [],
  lastUpdated = "",
}: KPICardListProps) {
  // Helper to get Hospital Name
  const getFacilityName = (code: string) => {
    return hospitalMap[code]?.name || code;
  };

  // Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    facilityName: string;
    data: DashboardResultRow[];
    targetValue: number;
  }>({
    isOpen: false,
    title: "",
    facilityName: "",
    data: [],
    targetValue: 0,
  });

  const openDrillDown = (kpi: KPISummary) => {
    let modalData = kpi.data;
    let modalTitle = "ภาพรวมอำเภอ";

    if (selectedFacilities.length > 0) {
      // Match the same hospcode-or-areacode breakdown key used by the model,
      // including contract-valid rows without facility master metadata.
      modalData = kpi.data.filter((row) =>
        matchesFacilityFilter(row, selectedFacilities),
      );
      if (selectedFacilities.length === 1) {
        modalTitle = getFacilityName(selectedFacilities[0]);
      } else {
        modalTitle = `ข้อมูล ${selectedFacilities.length} หน่วยบริการ`;
      }
    }

    setModalState({
      isOpen: true,
      title: kpi.title,
      facilityName: modalTitle,
      data: modalData,
      targetValue: resolveKpiTarget(kpi),
    });
  };

  return (
    <>
      <div className="flex flex-col gap-5 pb-8">
        {partitionByCategory(data).map((block, _blockIndex, all) => (
          <div
            key={block.key}
            className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          >
            {/* Title hidden when only one category is in view (the tab
                already labels it). */}
            {all.length > 1 && (
              <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="w-1 h-4 rounded-full bg-brand-600"
                  />
                  <h3 className="font-prompt text-sm font-bold text-brand-800">
                    {block.label || "ตัวชี้วัด"}
                  </h3>
                </div>
                <span className="text-[11px] font-medium text-slate-500 font-prompt">
                  {block.count} ตัวชี้วัด
                </span>
              </div>
            )}
            <div className="flex flex-col gap-3 p-3">
              {block.items.map((item) => {
                if (item.type === "subgroup") {
                  return (
                    <div
                      key={item.key}
                      className="pb-1 px-1 font-prompt text-xs font-semibold text-slate-500"
                    >
                      {item.label}
                    </div>
                  );
                }
                if (item.type !== "kpi") return null; // category headers never occur inside a block
                return (
                  <KPICard
                    key={item.key}
                    kpi={item.kpi}
                    hospitalMap={hospitalMap}
                    selectedFacilities={selectedFacilities}
                    onClick={() => openDrillDown(item.kpi)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <KPIDetailModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        facilityName={modalState.facilityName}
        data={modalState.data}
        targetValue={modalState.targetValue}
        tambonMap={tambonMap}
        lastUpdated={lastUpdated}
      />
    </>
  );
}
