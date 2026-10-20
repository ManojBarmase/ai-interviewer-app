'use client';

export interface AudioWaveformVisualizerProps {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  className?: string;
}

/**
 * Animated audio waveform visualizer:
 * Reacts to current phase (listening vs speaking vs processing)
 * with animated frequency height bars.
 */
const BARS = [
  { id: 'bar-1', height: 40 },
  { id: 'bar-2', height: 75 },
  { id: 'bar-3', height: 50 },
  { id: 'bar-4', height: 90 },
  { id: 'bar-5', height: 60 },
  { id: 'bar-6', height: 85 },
  { id: 'bar-7', height: 45 },
  { id: 'bar-8', height: 95 },
  { id: 'bar-9', height: 70 },
  { id: 'bar-10', height: 50 },
  { id: 'bar-11', height: 80 },
  { id: 'bar-12', height: 65 },
] as const;

export function AudioWaveformVisualizer({
  isActive,
  isListening,
  isSpeaking,
  isProcessing,
  className = '',
}: AudioWaveformVisualizerProps) {
  const getBarColor = () => {
    if (isListening) return 'bg-emerald-400';
    if (isSpeaking) return 'bg-indigo-400';
    if (isProcessing) return 'bg-amber-400';
    return 'bg-white/20';
  };

  return (
    <div
      className={`flex items-center justify-center gap-1.5 h-8 px-3 py-1 bg-white/5 rounded-full border border-white/5 ${className}`}
      aria-label="Voice Activity Indicator"
    >
      {BARS.map((bar, idx) => {
        const height = isActive ? bar.height : 20;
        return (
          <span
            key={bar.id}
            className={`w-1 rounded-full transition-all duration-150 ${getBarColor()}`}
            style={{
              height: `${height}%`,
              animationDelay: `${idx * 0.08}s`,
              animationDuration: isActive ? '0.6s' : '0s',
            }}
          />
        );
      })}
    </div>
  );
}
