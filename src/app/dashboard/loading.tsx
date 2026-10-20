/**
 * Enterprise Dashboard Streaming Skeleton
 *
 * Automatically rendered by Next.js Suspense while server components in /dashboard fetch
 * database metrics, Prisma analytics, and user session data.
 */
export default function DashboardLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto p-6 md:p-8 space-y-8 animate-pulse text-slate-100">
      {/* ── Header Skeleton ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div className="space-y-2.5">
          <div className="h-8 w-64 bg-white/10 rounded-xl" />
          <div className="h-4 w-96 bg-white/5 rounded-lg" />
        </div>
        <div className="h-11 w-44 bg-blue-600/30 rounded-xl" />
      </div>

      {/* ── 4 KPI Stats Cards Skeleton ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {['stat-card-1', 'stat-card-2', 'stat-card-3', 'stat-card-4'].map(
          (cardKey) => (
            <div
              key={cardKey}
              className="bg-[#12131a] border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-24 bg-white/10 rounded-md" />
                <div className="w-9 h-9 rounded-xl bg-white/5" />
              </div>
              <div className="space-y-2">
                <div className="h-8 w-20 bg-white/15 rounded-lg" />
                <div className="h-3 w-32 bg-white/5 rounded-md" />
              </div>
            </div>
          ),
        )}
      </div>

      {/* ── Main Analytics Grid Skeleton ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Trend Chart Placeholder (2 Cols) */}
        <div className="lg:col-span-2 bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-5 w-40 bg-white/10 rounded-md" />
              <div className="h-3.5 w-60 bg-white/5 rounded-md" />
            </div>
            <div className="h-8 w-28 bg-white/5 rounded-lg" />
          </div>
          {/* Chart waveform simulation */}
          <div className="h-64 w-full bg-[#0b0c10]/50 rounded-xl border border-white/5 flex items-end justify-between p-6 gap-3">
            {[
              { id: 'bar-mon', height: 40 },
              { id: 'bar-tue', height: 65 },
              { id: 'bar-wed', height: 55 },
              { id: 'bar-thu', height: 80 },
              { id: 'bar-fri', height: 70 },
              { id: 'bar-sat', height: 90 },
              { id: 'bar-sun', height: 85 },
            ].map((bar) => (
              <div
                key={bar.id}
                className="flex-1 bg-white/5 rounded-t-lg transition-all"
                style={{ height: `${bar.height}%` }}
              />
            ))}
          </div>
        </div>

        {/* Weekly Goals & Streak (1 Col) */}
        <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-5">
          <div className="h-5 w-36 bg-white/10 rounded-md" />
          <div className="space-y-4">
            {['goal-1', 'goal-2', 'goal-3'].map((goalKey) => (
              <div
                key={goalKey}
                className="bg-[#0b0c10] border border-white/5 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 bg-white/10 rounded-md" />
                    <div className="h-3 w-20 bg-white/5 rounded-md" />
                  </div>
                </div>
                <div className="h-6 w-12 bg-white/10 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Sessions Table Skeleton ──────────────────────────────── */}
      <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="h-5 w-36 bg-white/10 rounded-md" />
          <div className="h-4 w-20 bg-white/5 rounded-md" />
        </div>
        <div className="space-y-3">
          {[
            'session-skel-1',
            'session-skel-2',
            'session-skel-3',
            'session-skel-4',
          ].map((skelKey) => (
            <div
              key={skelKey}
              className="flex items-center justify-between p-3.5 bg-[#0b0c10] border border-white/5 rounded-xl"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-40 bg-white/10 rounded-md" />
                  <div className="h-3 w-24 bg-white/5 rounded-md" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-6 w-16 bg-white/10 rounded-lg hidden sm:block" />
                <div className="h-6 w-20 bg-white/10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
