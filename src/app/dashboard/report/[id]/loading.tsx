/**
 * Enterprise Scorecard Streaming Skeleton
 *
 * Rendered while fetching interview scorecard, radar metrics, and AI evaluation feedback.
 */
export default function ScorecardLoading() {
  return (
    <div className="w-full max-w-6xl mx-auto p-6 md:p-8 space-y-8 animate-pulse text-slate-100">
      {/* ── Back Navigation Skeleton ────────────────────────────────────── */}
      <div className="h-5 w-32 bg-white/10 rounded-md" />

      {/* ── Scorecard Hero Header Skeleton ──────────────────────────────── */}
      <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-6 w-24 bg-blue-500/20 rounded-full" />
            <div className="h-4 w-32 bg-white/10 rounded-md" />
          </div>
          <div className="h-8 w-72 bg-white/15 rounded-xl" />
          <div className="h-4 w-48 bg-white/5 rounded-md" />
        </div>

        {/* Big Overall Grade Badge */}
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center p-3">
            <div className="h-8 w-12 bg-white/20 rounded-lg mb-1" />
            <div className="h-3 w-16 bg-white/10 rounded-md" />
          </div>
          <div className="space-y-2 hidden sm:block">
            <div className="h-9 w-28 bg-white/10 rounded-xl" />
            <div className="h-9 w-28 bg-white/5 rounded-xl" />
          </div>
        </div>
      </div>

      {/* ── Score Radar & Key Competencies Grid Skeleton ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar/Radial Chart Card (1 Col) */}
        <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px]">
          <div className="h-4 w-36 bg-white/10 rounded-md mb-6" />
          <div className="w-48 h-48 rounded-full border-4 border-dashed border-white/10 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-white/5" />
          </div>
        </div>

        {/* Competency Bars Breakdown (2 Cols) */}
        <div className="lg:col-span-2 bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-5">
          <div className="h-5 w-44 bg-white/10 rounded-md" />
          <div className="space-y-4">
            {['comp-skel-1', 'comp-skel-2', 'comp-skel-3', 'comp-skel-4'].map(
              (key, i) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-white/10 rounded-md" />
                    <div className="h-4 w-12 bg-white/15 rounded-md" />
                  </div>
                  <div className="h-3 w-full bg-[#0b0c10] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/15 rounded-full"
                      style={{ width: `${60 + i * 10}%` }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {/* ── Key Strengths & Growth Areas Skeleton ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-4">
          <div className="h-5 w-32 bg-emerald-500/20 rounded-md" />
          <div className="space-y-2.5">
            <div className="h-4 w-full bg-white/5 rounded-md" />
            <div className="h-4 w-5/6 bg-white/5 rounded-md" />
            <div className="h-4 w-4/6 bg-white/5 rounded-md" />
          </div>
        </div>
        <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-4">
          <div className="h-5 w-36 bg-amber-500/20 rounded-md" />
          <div className="space-y-2.5">
            <div className="h-4 w-full bg-white/5 rounded-md" />
            <div className="h-4 w-5/6 bg-white/5 rounded-md" />
            <div className="h-4 w-4/6 bg-white/5 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
