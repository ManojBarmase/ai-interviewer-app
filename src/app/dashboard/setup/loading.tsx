/**
 * Enterprise Setup Wizard Streaming Skeleton
 *
 * Rendered while configuring role requirements, resume parsing, and persona selectors.
 */
export default function SetupLoading() {
  const roleSkeletons = [
    'role-skel-1',
    'role-skel-2',
    'role-skel-3',
    'role-skel-4',
    'role-skel-5',
    'role-skel-6',
  ];
  const personaSkeletons = [
    'persona-skel-1',
    'persona-skel-2',
    'persona-skel-3',
    'persona-skel-4',
  ];

  return (
    <div className="w-full max-w-4xl mx-auto p-6 md:p-8 space-y-8 animate-pulse text-slate-100">
      {/* ── Wizard Progress Bar Skeleton ─────────────────────────────────── */}
      <div className="flex items-center justify-center gap-6 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center" />
          <div className="h-4 w-28 bg-white/10 rounded-md" />
        </div>
        <div className="h-0.5 w-16 bg-white/10" />
        <div className="flex items-center gap-3 opacity-50">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" />
          <div className="h-4 w-28 bg-white/10 rounded-md" />
        </div>
      </div>

      {/* ── Section Title Skeleton ──────────────────────────────────────── */}
      <div className="text-center space-y-2 max-w-md mx-auto">
        <div className="h-7 w-64 bg-white/15 rounded-xl mx-auto" />
        <div className="h-4 w-80 bg-white/5 rounded-md mx-auto" />
      </div>

      {/* ── Role Selector Pills Skeleton ────────────────────────────────── */}
      <div className="bg-[#12131a] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="h-4 w-32 bg-white/10 rounded-md" />
        <div className="flex flex-wrap gap-2.5">
          {roleSkeletons.map((key) => (
            <div
              key={key}
              className="h-9 w-32 bg-white/5 border border-white/5 rounded-xl"
            />
          ))}
        </div>
      </div>

      {/* ── Resume Upload Dropzone Skeleton ─────────────────────────────── */}
      <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-[#12131a]/50">
        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center" />
        <div className="h-4 w-52 bg-white/10 rounded-md" />
        <div className="h-3 w-36 bg-white/5 rounded-md" />
      </div>

      {/* ── Interviewer Persona Grid Skeleton ───────────────────────────── */}
      <div className="space-y-4">
        <div className="h-4 w-40 bg-white/10 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {personaSkeletons.map((key) => (
            <div
              key={key}
              className="bg-[#12131a] border border-white/5 rounded-2xl p-5 flex flex-col items-center text-center space-y-3"
            >
              <div className="w-16 h-16 rounded-full bg-white/10" />
              <div className="space-y-1.5 w-full">
                <div className="h-4 w-24 bg-white/15 rounded-md mx-auto" />
                <div className="h-3 w-32 bg-white/5 rounded-md mx-auto" />
              </div>
              <div className="h-5 w-16 bg-white/5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
