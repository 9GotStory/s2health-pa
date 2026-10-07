"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type Row,
} from "@tanstack/react-table";
import type { KPISummary, DashboardResultRow } from "@/lib/types";
import { KPIDetailModal } from "./KPIDetailModal";
import { exportToExcel } from "@/lib/excel-export";
import { computeAggregate, DEFAULT_TARGET, formatPct } from "@/lib/kpi-utils";
import { partitionByCategory } from "@/lib/kpi-grouping";
import {
  ExternalLink,
  CalendarClock,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Type-safe meta for column definitions (replaces `any` casts).
// TValue is required by @tanstack/react-table v8's ColumnMeta signature
// (v9 adds TFeatures as a 3rd param). We don't use it here, but it must
// appear in the augmentation to match the library's interface arity.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    headerClassName?: string;
    getHeaderClassName?: () => string;
    getCellClassName?: (row: Row<TData>) => string;
  }
}

const columnHelper = createColumnHelper<KPISummary>();

interface KPITableProps {
  data: KPISummary[];
  hospitalMap?: Record<string, { name: string; tambon_id: string }>;
  tambonMap?: Record<string, string>;
  selectedFacilities?: string[];
  lastUpdated?: string;
}

export default function KPITable({
  data,
  hospitalMap = {},
  tambonMap = {},
  selectedFacilities = [],
  lastUpdated = "",
}: KPITableProps) {
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

  // Extract facility keys and sort by Tambon ID
  const facilityKeys = useMemo(() => {
    const allKeys = new Set<string>();
    data.forEach((kpi) => {
      if (kpi.breakdown) {
        Object.keys(kpi.breakdown).forEach((k) => allKeys.add(k));
      }
    });

    return Array.from(allKeys).sort((a, b) => {
      const hA = hospitalMap[a];
      const hB = hospitalMap[b];

      // Sort by Tambon ID first
      if (hA?.tambon_id && hB?.tambon_id) {
        if (hA.tambon_id !== hB.tambon_id) {
          return hA.tambon_id.localeCompare(hB.tambon_id);
        }
      }

      // Then by Code (numeric value if possible)
      return a.localeCompare(b);
    });
  }, [data, hospitalMap]);

  // If specific facilities are selected, filter the keys to show
  const displayConfigKeys = useMemo(() => {
    if (!selectedFacilities || selectedFacilities.length === 0)
      return facilityKeys;
    return facilityKeys.filter((key) => selectedFacilities.includes(key));
  }, [facilityKeys, selectedFacilities]);

  const openDrillDown = useCallback(
    (kpi: KPISummary, facilityKey: string) => {
      const facilityRawData = kpi.data.filter(
        (d) => d.hospcode === facilityKey || d.areacode === facilityKey,
      );
      const facilityInfo = hospitalMap[facilityKey];
      const facilityName = facilityInfo ? facilityInfo.name : facilityKey;

      setModalState({
        isOpen: true,
        title: kpi.title,
        facilityName: facilityName,
        data: facilityRawData,
        targetValue: kpi.targetValue || DEFAULT_TARGET,
      });
    },
    [hospitalMap],
  );

  const columns = useMemo(() => {
    return [
      columnHelper.display({
        id: "index",
        header: "#",
        cell: (info) => info.row.index + 1,
        meta: {
          className:
            "md:sticky left-0 z-20 bg-white min-w-[24px] w-[24px] max-w-[24px] text-center pb-4 px-1 font-medium text-neutral-500 text-xs border-r border-neutral-200",
          headerClassName:
            "md:sticky left-0 z-30 bg-slate-50 w-[24px] max-w-[24px] text-center pb-4 px-1 border-r border-slate-200",
        },
      }),
      columnHelper.accessor("title", {
        header: "ตัวชี้วัด",
        cell: (info) => {
          const title = info.getValue();
          const link = info.row.original.link;
          const period = info.row.original.period; // "สะสม 6 เดือน (Q2)" or "รายปี"

          return (
            <div className="w-full py-1.5">
              <div className="flex items-start flex-col gap-1">
                {/* KPI Title */}
                <div className="flex items-start gap-2">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-800 hover:text-accent-700 hover:underline font-medium text-sm leading-relaxed group transition-all block whitespace-normal"
                    >
                      {title}{" "}
                      <ExternalLink className="w-3.5 h-3.5 inline text-neutral-400 group-hover:text-accent-500 ml-1 transform -translate-y-px transition-colors" />
                    </a>
                  ) : (
                    <span className="text-neutral-800 font-medium text-sm leading-relaxed block whitespace-normal">
                      {title}
                    </span>
                  )}
                </div>

                {/* DATA PERIOD BADGE */}
                {period && (
                  <span
                    className={cn(
                      "text-xs font-semibold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap border",
                      period.includes("รายปี")
                        ? "bg-brand-50 text-brand-700 border-brand-200"
                        : "bg-warning-50 text-warning-700 border-warning-200",
                    )}
                  >
                    <CalendarClock
                      className={cn(
                        "w-3 h-3",
                        period.includes("รายปี")
                          ? "text-brand-600"
                          : "text-warning-600",
                      )}
                    />
                    {period}
                  </span>
                )}
              </div>
            </div>
          );
        },
        meta: {
          className:
            "md:sticky left-[24px] z-20 bg-white w-[250px] min-w-[250px] text-left align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-neutral-200 px-2 py-2",
          headerClassName:
            "md:sticky left-[24px] z-30 bg-slate-50 w-[250px] min-w-[250px] text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200 px-2",
        },
      }),
      columnHelper.accessor("percentage", {
        id: "result",
        header: "ผลงาน",
        cell: (info) => {
          const kpi = info.row.original;
          const { totalTarget, totalResult, percentage } = computeAggregate(
            kpi,
            selectedFacilities,
          );
          const isRawCount = totalTarget === 0;

          return (
            <div className="w-full text-center">
              <span className="font-bold text-sm tracking-tight">
                {isRawCount
                  ? totalResult.toLocaleString()
                  : `${formatPct(percentage)}%`}
              </span>
            </div>
          );
        },
        meta: {
          // Sticky Position = 24 (Index) + 250 (Title) = 274px
          getHeaderClassName: () =>
            "md:sticky left-[274px] z-40 bg-slate-50 w-[75px] min-w-[75px] text-center border-r-[3px] border-slate-200 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.15)]",
          getCellClassName: (row: Row<KPISummary>) => {
            const kpi = row.original;
            const { totalTarget, percentage } = computeAggregate(
              kpi,
              selectedFacilities,
            );
            const targetVal = kpi.targetValue || DEFAULT_TARGET;
            const isRawCount = totalTarget === 0;

            // Common Sticky Style + Separator
            const stickyStyle =
              "md:sticky left-[274px] z-30 w-[75px] min-w-[75px] border-r-[3px] border-slate-200 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.15)]";

            if (isRawCount) {
              return `${stickyStyle} bg-neutral-100 text-center font-medium text-neutral-600`;
            }

            const totalPass = percentage >= targetVal;
            // Soft Background Heatmap Logic
            return `${stickyStyle} text-center font-bold ${
              totalPass
                ? "bg-success-100 text-success-900"
                : "bg-error-100 text-error-900"
            }`;
          },
        },
      }),
      // Dynamic Facility Columns
      ...displayConfigKeys.map((key) =>
        columnHelper.accessor((row) => row.breakdown?.[key], {
          id: key,
          header: () => (
            <div className="w-full flex items-center justify-center">
              <span className="whitespace-nowrap text-xs truncate max-w-17.5 font-bold text-slate-700 text-left line-clamp-1">
                {hospitalMap[key]?.name?.replace(
                  "โรงพยาบาลส่งเสริมสุขภาพตำบล",
                  "รพ.สต.",
                ) || key}
              </span>
            </div>
          ),
          cell: (info) => {
            const facilityData = info.getValue();
            const kpi = info.row.original;

            if (!facilityData)
              return <span className="text-neutral-300 text-[10px]">-</span>;

            const isRawCount = kpi.totalTarget === 0;

            return (
              <button
                type="button"
                onClick={() => openDrillDown(kpi, key)}
                aria-label={`รายละเอียด ${kpi.title} ของ ${hospitalMap[key]?.name ?? key}: Target ${facilityData.target.toLocaleString()}, Result ${facilityData.result.toLocaleString()}`}
                title={`Target: ${facilityData.target.toLocaleString()}\nResult: ${facilityData.result.toLocaleString()}`}
                className="w-full h-full flex items-center justify-center cursor-pointer bg-transparent border-0 p-0"
              >
                {isRawCount ? (
                  <span className="text-xs text-neutral-600 font-medium">
                    {facilityData.result.toLocaleString()}
                  </span>
                ) : facilityData.target === 0 ? (
                  <span className="text-neutral-300 text-[10px]">-</span>
                ) : (
                  <span className="text-xs font-bold">
                    {formatPct(facilityData.percentage)}%
                  </span>
                )}
              </button>
            );
          },
          meta: {
            headerClassName:
              "px-2 py-2 text-center min-w-17.5 w-17.5 bg-slate-50 border-b border-slate-200 align-middle overflow-hidden",
            getCellClassName: (row: Row<KPISummary>) => {
              const kpi = row.original;
              const targetVal = kpi.targetValue || DEFAULT_TARGET;
              const facilityData = kpi.breakdown?.[key];
              const isRawCount = kpi.totalTarget === 0;

              // No Data / Empty -> Gray
              if (!facilityData || facilityData.target === 0) {
                return "p-0 text-center bg-neutral-50/50";
              }

              if (isRawCount) {
                return "p-0 text-center bg-white hover:bg-neutral-100 cursor-pointer transition-colors border-r border-neutral-100/50";
              }

              const fPass = facilityData.percentage >= targetVal;

              // Soft Heatmap Logic
              // Pass: Success-100, Fail: Error-100
              // Hover effects to darken slightly
              return `p-0 text-center cursor-pointer transition-colors border-r border-neutral-100/50 ${
                fPass
                  ? "bg-success-50 hover:bg-success-100 text-success-900/90"
                  : "bg-error-50 hover:bg-error-100 text-error-900/90"
              }`;
            },
          },
        }),
      ),
      columnHelper.accessor("targetValue", {
        id: "target",
        header: "Target",
        cell: (info) => (
          <span className="text-xs">
            ≥{info.getValue() || DEFAULT_TARGET}
            <span className="block text-[9px] font-normal text-warning-600/80">
              ({info.row.original.targetMonths} เดือน)
            </span>
          </span>
        ),
        meta: {
          // DISTINCT TARGET COLUMN -- SOLID BG + WALL EFFECT
          className:
            "md:sticky right-0 z-50 bg-warning-50 text-center text-xs w-[80px] min-w-[80px] font-bold text-warning-700 border-l-[3px] border-slate-200 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)]",
          headerClassName:
            "md:sticky right-0 z-50 bg-slate-50 w-[80px] text-center min-w-[80px] text-warning-800 border-l-[3px] border-slate-200 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)]",
        },
      }),
    ];
  }, [displayConfigKeys, selectedFacilities, hospitalMap, openDrillDown]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Render as one self-contained block per category: each block carries its
  // own section title and table (own scroll container so per-block sticky
  // headers behave), while columns/facilities stay computed from ALL data.
  // Subgroup header rows interleave inside each block's body (not injected
  // into tanstack's data — accessors stay typed).
  const blocks = useMemo(() => partitionByCategory(data), [data]);
  const columnCount = table.getAllLeafColumns().length;
  const rowModel = table.getRowModel();
  // Identity map KPI → tanstack row: block item dataIndexes are per-slice,
  // so look rows up by object instead of by global index.
  const rowByKpi = useMemo(
    () => new Map(rowModel.rows.map((row) => [row.original, row])),
    [rowModel],
  );

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await exportToExcel(data, hospitalMap, facilityKeys);
    } catch (err) {
      console.error("Export failed", err);
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Table Actions Header — standalone toolbar above the category cards */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 font-prompt text-lg">
              ผลการดำเนินงาน
            </h3>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`flex items-center gap-1 px-3 py-1.5 text-slate-600 bg-white border border-slate-200 text-xs font-medium rounded-lg shadow-sm transition-all hover:bg-slate-50 active:scale-95 font-prompt ${
              isExporting ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isExporting ? (
              <>
                <span className="hidden md:inline">Exporting...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden md:inline">Export Excel</span>
              </>
            )}
          </button>
        </div>

        {blocks.map((block) => (
          <div
            key={block.key}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
          >
            {/* Block title bar — one per category. Hidden when only one
                category is in view (the tab already labels it). */}
            {blocks.length > 1 && (
              <div className="px-6 py-3 bg-brand-600 border-b border-brand-700 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="w-1 h-5 rounded-full bg-white/60"
                  />
                  <h4 className="font-prompt text-base font-bold text-white">
                    {block.label || "ตัวชี้วัด"}
                  </h4>
                </div>
                <span className="text-xs font-medium text-white/80 font-prompt">
                  {block.count} ตัวชี้วัด
                </span>
              </div>
            )}
            <div className="relative w-full overflow-auto">
              <Table className="w-full table-fixed text-sm text-left border-separate border-spacing-0">
                <TableHeader className="bg-slate-50 sticky top-0 z-40 shadow-sm">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="h-auto hover:bg-transparent border-b border-slate-200"
                    >
                      {headerGroup.headers.map((header) => {
                        const meta = header.column.columnDef.meta;
                        const className = meta?.getHeaderClassName
                          ? meta.getHeaderClassName()
                          : meta?.headerClassName;

                        return (
                          <TableHead
                            key={header.id}
                            className={cn(
                              "h-auto px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide",
                              className,
                            )}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {block.items.map((item) => {
                    if (item.type === "subgroup") {
                      return (
                        <TableRow key={item.key} className="bg-accent-50 hover:bg-accent-50 border-b border-accent-100">
                          <TableCell colSpan={columnCount} className="py-1.5 pl-6 font-prompt text-xs font-semibold text-accent-700 border-l-4 border-accent-500">
                            {item.label}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (item.type !== "kpi") return null; // category headers never occur inside a block
                    const row = rowByKpi.get(item.kpi);
                    if (!row) return null;
                    return (
                      <TableRow
                        key={row.id}
                        className="bg-white hover:bg-slate-50 border-b border-slate-100 transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta;
                          const className = meta?.getCellClassName
                            ? meta.getCellClassName(row)
                            : meta?.className;

                          return (
                            <TableCell
                              key={cell.id}
                              className={cn("p-0 h-10", className)}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
