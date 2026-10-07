import { Loader2 } from "lucide-react";

export default function DashboardSkeleton() {
  return (
    <div className="w-full relative min-h-[60vh]">
      {/* Loading Indicator Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl">
        <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
          <div className="p-3 bg-brand-50 rounded-full">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
          <div className="text-center">
            <span className="block text-sm font-semibold text-slate-700 font-prompt">
              กำลังโหลดข้อมูล...
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">
              กรุณารอสักครู่
            </span>
          </div>
        </div>
      </div>

      <div className="w-full animate-pulse space-y-8 opacity-40">
        {/* 1. Header Skeleton */}
        <div className="space-y-2 mt-6">
          <div className="h-8 bg-slate-200 rounded w-48 md:w-64"></div>
          <div className="h-4 bg-slate-200 rounded w-32 md:w-48"></div>
        </div>

        {/* 2. Summary Stats Skeleton (Grid of 4) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-[100px] flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                <div className="h-8 w-8 bg-slate-100 rounded-lg"></div>
              </div>
              <div className="h-6 bg-slate-200 rounded w-1/3 mt-2"></div>
            </div>
          ))}
        </div>

        {/* 3. Main Data Table Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Table Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
            <div className="h-6 bg-slate-200 rounded w-32"></div>
            <div className="h-8 bg-slate-100 rounded w-24"></div>
          </div>

          {/* Table Content */}
          <div className="p-0">
            {/* Mock Column Headers */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="w-12 h-10 border-r border-slate-200"></div>
              <div className="w-64 h-10 border-r border-slate-200"></div>
              <div className="flex-1 h-10"></div>
            </div>

            {/* Mock Rows */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="flex border-b border-slate-100 h-[45px] items-center"
              >
                <div className="w-12 h-full border-r border-slate-100 bg-slate-50/50"></div>
                <div className="w-64 px-4">
                  <div className="h-3 bg-slate-100 rounded w-3/4"></div>
                </div>
                <div className="flex-1 px-4 flex gap-4">
                  <div className="h-3 bg-slate-100 rounded w-full"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Meta */}
        <div className="flex justify-center pt-4">
          <div className="h-6 bg-slate-200 rounded-full w-40"></div>
        </div>
      </div>
    </div>
  );
}
