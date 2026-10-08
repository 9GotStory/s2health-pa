import { useState, type MouseEvent } from "react";
import type { KPISummary } from "@/lib/types";
import {
  computeAggregate,
  evaluateKPI,
  formatPct,
  isRawCountKPI,
  resolveKpiTarget,
} from "@/lib/kpi-utils";
import {
  ExternalLink,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface KPICardProps {
  kpi: KPISummary;
  onClick: (kpi: KPISummary) => void;
  selectedFacilities?: string[];
  hospitalMap?: Record<string, { name: string; tambon_id: string }>;
}

export function KPICard({
  kpi,
  onClick,
  selectedFacilities = [],
  hospitalMap = {},
}: KPICardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine Stats based on Filter (shared with table + summary views)
  const { totalTarget, totalResult, percentage } = computeAggregate(
    kpi,
    selectedFacilities,
  );

  const isRawCount = isRawCountKPI(kpi);
  const hasPercentageValue = !isRawCount && totalTarget > 0;
  const targetVal = resolveKpiTarget(kpi);
  const evaluation = evaluateKPI(kpi, selectedFacilities);
  const isPass = evaluation === "pass";
  const evaluationStatusText =
    evaluation === "not-applicable"
      ? isRawCount
        ? "ตัวชี้วัดแบบจำนวน ไม่ประเมินผ่านหรือไม่ผ่าน"
        : "ไม่มีฐานประเมินสำหรับหน่วยบริการที่เลือก จึงไม่ประเมินผ่านหรือไม่ผ่าน"
      : isPass
        ? "ผ่านเกณฑ์"
        : "ต้องปรับปรุง";

  const period = kpi.period;
  const isQuarter = period && period.includes("(Q");

  // Facility Ranking Logic — React Compiler (enabled via reactCompiler: true
  // in next.config.ts) auto-memoizes this computation, so no manual useMemo.
  const topFacilities = (() => {
    if (!kpi.breakdown) return [];

    let entries = Object.entries(kpi.breakdown);
    if (selectedFacilities.length > 0) {
      entries = entries.filter(([code]) => selectedFacilities.includes(code));
    }

    return entries
      .map(([code, stats]) => ({
        code,
        name: hospitalMap[code]?.name || code,
        ...stats,
      }))
      .sort((a, b) =>
        isRawCount
          ? b.result - a.result
          : b.percentage - a.percentage,
      );
  })();

  const handleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      onClick={() => onClick(kpi)}
      className="bg-white rounded-lg border border-neutral-200 shadow-sm cursor-pointer overflow-hidden hover:border-brand-200 transition-colors"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex justify-between items-start gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-start gap-2">
              <h3 className="text-sm font-semibold text-neutral-800 font-prompt leading-tight line-clamp-2">
                {kpi.title}
              </h3>
              {kpi.link && (
                <a
                  href={kpi.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`เปิดรายละเอียดภายนอกของ ${kpi.title}`}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 -m-1 hover:bg-neutral-100 rounded-full transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-accent-500 shrink-0" />
                </a>
              )}
            </div>
            {/* Period Badge */}
            {period && (
              <div className="flex items-center gap-1.5 mt-2">
                {isQuarter ? (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-info-50 text-info-700 ring-1 ring-inset ring-info-600/20">
                    <CalendarClock className="w-3 h-3" />
                    {period}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20">
                    <Calendar className="w-3 h-3" />
                    {period}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Pass/Fail Indicator Icon */}
          <div
            aria-hidden="true"
            className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${
              evaluation === "not-applicable"
                ? "bg-neutral-400"
                : isPass
                  ? "bg-success-500"
                  : "bg-error-500"
            }`}
          />
          <span className="sr-only">{evaluationStatusText}</span>
        </div>

        {/* Main Stats */}
        <div className="flex items-end justify-between border-t border-neutral-50 pt-3">
          <div>
            <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">
              Performance
            </p>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-bold font-prompt ${
                  isRawCount || !hasPercentageValue
                    ? "text-neutral-700"
                    : isPass
                      ? "text-success-600"
                      : "text-error-600"
                }`}
              >
                {isRawCount
                  ? totalResult.toLocaleString()
                  : hasPercentageValue
                    ? formatPct(percentage)
                    : "—"}
              </span>
              {hasPercentageValue && (
                <span className="text-xs text-neutral-500 font-medium">%</span>
              )}
            </div>
          </div>

          <div className="text-right">
            {isRawCount ? (
              <>
                <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">
                  ตัวชี้วัดแบบจำนวน
                </p>
                <div className="text-xs text-neutral-600 mt-0.5 font-medium">
                  ผลงาน: {totalResult.toLocaleString()}
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">
                  Target ≥ {targetVal}{" "}
                  <span className="normal-case tracking-normal">
                    ({kpi.targetMonths} เดือน)
                  </span>
                </p>
                <div className="text-xs text-neutral-600 mt-0.5 font-medium flex items-center justify-end gap-1">
                  <span>R: {totalResult.toLocaleString()}</span>
                  <span className="text-neutral-300">/</span>
                  <span>T: {totalTarget.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClick(kpi);
            }}
            className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            ดูรายละเอียด
          </button>
        </div>
      </div>

      {/* Footer / Expand Button */}
      {(selectedFacilities.length === 0 || selectedFacilities.length > 1) && (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={handleExpand}
          className={`w-full min-h-11 bg-neutral-50 border-t border-neutral-100 px-4 py-2 flex items-center justify-center cursor-pointer hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${isExpanded ? "border-b" : ""}`}
        >
          <span className="text-xs font-medium text-neutral-500 flex items-center gap-1">
            {isExpanded ? "ซ่อนรายชื่อหน่วยบริการ" : "ดูรายชื่อหน่วยบริการ"}
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
        </button>
      )}

      {/* Expanded List */}
      {isExpanded &&
        (selectedFacilities.length === 0 || selectedFacilities.length > 1) && (
          <div
            className="bg-neutral-50 px-4 py-2 border-t border-neutral-200 max-h-[300px] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <table className="w-full text-xs">
              <thead className="text-neutral-400 font-medium border-b border-neutral-200">
                <tr>
                  <th className="py-2 text-left w-[60%]">หน่วยบริการ</th>
                  <th className="py-2 text-right">ผลงาน</th>
                  <th className="py-2 text-right">
                    {isRawCount ? "—" : "%"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/50">
                {topFacilities.map((fac) => {
                  const facHasPercentage = !isRawCount && fac.target > 0;
                  const facPass =
                    facHasPercentage && fac.percentage >= targetVal;
                  return (
                    <tr key={fac.code}>
                      <td className="py-2 pr-2 text-neutral-700 truncate max-w-[150px]">
                        {fac.name}
                      </td>
                      <td className="py-2 text-right text-neutral-600">
                        {fac.result.toLocaleString()}
                      </td>
                      <td
                        className={
                          !facHasPercentage
                            ? "py-2 text-right font-medium text-neutral-400"
                            : `py-2 text-right font-bold ${facPass ? "text-success-600" : "text-error-600"}`
                        }
                      >
                        {facHasPercentage ? `${formatPct(fac.percentage)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
