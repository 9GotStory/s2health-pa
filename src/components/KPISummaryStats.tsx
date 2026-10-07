import type { KPISummary } from "@/lib/types";
import { computeAggregate, DEFAULT_TARGET } from "@/lib/kpi-utils";
import { Target, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

interface KPISummaryStatsProps {
  data: KPISummary[];
  selectedFacilities?: string[];
}

export default function KPISummaryStats({
  data,
  selectedFacilities = [],
}: KPISummaryStatsProps) {
  const total = data.length;

  // Calculate Passed/Failed based on Selected Facilities (shared logic)
  const passed = data.filter((kpi) => {
    const { percentage } = computeAggregate(kpi, selectedFacilities);
    const target = kpi.targetValue || DEFAULT_TARGET;
    return percentage >= target;
  }).length;

  const failed = total - passed;
  const successRate = total > 0 ? (passed / total) * 100 : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {/* 1. Total Indicators */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
            ตัวชี้วัดทั้งหมด
          </p>
          <p className="text-2xl font-bold text-neutral-800 font-prompt">
            {total}
          </p>
        </div>
      </div>

      {/* 2. Success Rate */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center text-accent-600">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
            อัตราผ่านเกณฑ์
          </p>
          <p className="text-2xl font-bold text-accent-700 font-prompt">
            {successRate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* 3. Passed */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center text-success-600">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
            ผ่านเกณฑ์
          </p>
          <p className="text-2xl font-bold text-success-700 font-prompt">
            {passed}
          </p>
        </div>
      </div>

      {/* 4. Failed */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-error-50 flex items-center justify-center text-error-600">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
            ต้องปรับปรุง
          </p>
          <p className="text-2xl font-bold text-error-700 font-prompt">
            {failed}
          </p>
        </div>
      </div>
    </div>
  );
}
