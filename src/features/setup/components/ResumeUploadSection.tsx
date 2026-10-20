'use client';

import React, { useRef } from 'react';

import { UploadCloud, CheckCircle2, RefreshCw, X } from 'lucide-react';

export interface ResumeUploadSectionProps {
  resumeText: string | undefined;
  isUploading: boolean;
  uploadProgress: number;
  resumeUploaded: boolean;
  onFileSelect: (file: File) => void;
  onRemoveResume: () => void;
}

/**
 * Enterprise Resume Upload Component
 *
 * Handles PDF binary selection, client-side 5MB limit verification,
 * animated upload progress bar, and parsed status display.
 */
export function ResumeUploadSection({
  resumeText,
  isUploading,
  uploadProgress,
  resumeUploaded,
  onFileSelect,
  onRemoveResume,
}: ResumeUploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) {
        onFileSelect(file);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-white">
          Candidate Resume{' '}
          <span className="text-white/40 font-normal">(optional)</span>
        </label>
        {resumeUploaded && (
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 size={13} /> Parsed successfully
          </span>
        )}
      </div>

      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={handleInputChange}
      />

      {/* Upload Dropzone */}
      {!resumeUploaded ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-white/10 hover:border-brand-500/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 bg-white/[0.01] hover:bg-white/[0.03] transition-all cursor-pointer group text-center"
        >
          {isUploading ? (
            <div className="w-full max-w-xs space-y-3 py-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-2">
                  <RefreshCw
                    size={14}
                    className="animate-spin text-brand-400"
                  />
                  Analyzing resume with AI...
                </span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-white/5 group-hover:bg-brand-500/10 group-hover:text-brand-400 flex items-center justify-center transition-colors text-white/60">
                <UploadCloud size={24} />
              </div>
              <p className="text-sm font-medium text-white/80">
                Drop your resume PDF here, or{' '}
                <span className="text-brand-400 font-semibold underline underline-offset-4">
                  browse files
                </span>
              </p>
              <p className="text-xs text-white/40">
                PDF up to 5MB · Auto-extracts your skills, projects & background
              </p>
            </>
          )}
        </div>
      ) : (
        /* Uploaded Preview Card */
        <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Resume attached & indexed
              </p>
              <p className="text-xs text-white/50">
                {resumeText
                  ? `${resumeText.split(/\s+/).length} words extracted for tailored questioning`
                  : 'Ready for interview'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onRemoveResume();
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            type="button"
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Remove resume"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
