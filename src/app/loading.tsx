export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-pulse">
           <div>
             <div className="h-8 w-64 bg-slate-200 rounded mb-2"></div>
             <div className="h-5 w-48 bg-slate-200 rounded"></div>
           </div>
           <div className="h-4 w-32 bg-slate-200 rounded"></div>
        </div>

        {/* Table Skeleton */}
        <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-4 bg-slate-100 border-b border-slate-200">
                <div className="h-6 w-40 bg-slate-200 rounded"></div>
             </div>
             
             <div className="overflow-x-auto p-4">
                <div className="space-y-4">
                   {/* Table Header */}
                   <div className="flex gap-4">
                      <div className="h-10 w-12 bg-slate-200 rounded shrink-0"></div>
                      <div className="h-10 w-64 bg-slate-200 rounded shrink-0"></div>
                      <div className="h-10 w-24 bg-slate-200 rounded shrink-0"></div>
                      <div className="h-10 w-full bg-slate-200 rounded"></div>
                   </div>
                   
                   {/* Table Rows */}
                   {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="h-16 w-12 bg-slate-100 rounded shrink-0"></div>
                        <div className="h-16 w-64 bg-slate-100 rounded shrink-0"></div>
                        <div className="h-16 w-24 bg-slate-100 rounded shrink-0"></div>
                        <div className="h-16 w-full bg-slate-100 rounded"></div>
                      </div>
                   ))}
                </div>
             </div>
        </div>

      </div>
    </main>
  );
}
