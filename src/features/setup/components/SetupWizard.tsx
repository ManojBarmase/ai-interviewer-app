'use client';

import { useState, useRef, useEffect } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  Mic,
  Volume2,
  Play,
  Activity,
  Wifi,
  Video,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

import {
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
  useInterviewStore,
} from '@/features/interview';

import { ConfigurationSliders } from './ConfigurationSliders';
import { InterviewerPicker } from './InterviewerPicker';
import { JobDescriptionInput } from './JobDescriptionInput';
import { ResumeUploadSection } from './ResumeUploadSection';

type Step = 1 | 2; // 1 = Role Setup, 2 = Tech Check

export interface SetupFormData {
  role: string;
  experience: string;
  difficulty: string;
  interviewType: string;
  techStack: string[];
  interviewerId: string;
  numQuestions: number;
  timeLimit: string;
  allowFollowUps: boolean;
  jobDescription: string;
  resumeText?: string | undefined;
}

/**
 * Enterprise Setup Wizard Client Component
 *
 * Orchestrates interview configuration (Step 1) and hardware readiness check (Step 2).
 * Decomposed into modular components for high testability and clean separation of concerns.
 */
export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Form State
  const [formData, setFormData] = useState<SetupFormData>({
    role: 'Frontend Engineer',
    experience: 'Senior',
    difficulty: 'Medium',
    interviewType: 'Full loop',
    techStack: ['React', 'TypeScript', 'Next.js'],
    interviewerId: 'priya',
    numQuestions: 6,
    timeLimit: 'None',
    allowFollowUps: true,
    jobDescription: '',
  });

  const selectedInterviewer =
    INTERVIEWERS_MAP[formData.interviewerId] ?? DEFAULT_INTERVIEWER;

  // Resume Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleResumeFileSelect = async (file: File) => {
    setUploadError(null);

    // 1. Client-side Size Validation (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setUploadError(
        `The selected file is too large (${sizeMb}MB). Resumes must be 5MB or smaller.`,
      );
      return;
    }

    // 2. Client-side MIME / Extension validation
    const isPdfType =
      file.type === 'application/pdf' || file.type === 'application/x-pdf';
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType && !isPdfExt) {
      setUploadError(
        'Invalid file format. Please upload a genuine PDF document (.pdf).',
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(20);
    const payload = new FormData();
    payload.append('file', file);

    try {
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: payload,
      });
      setUploadProgress(70);

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(
          errData?.error || `Server responded with status ${res.status}`,
        );
      }

      const data = await res.json();
      setFormData((p) => ({ ...p, resumeText: data.text }));
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setResumeUploaded(true);
      }, 500);
    } catch (err: unknown) {
      console.error('[RESUME_UPLOAD_FAILED]', err);
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Failed to read the resume. Please ensure it is a valid PDF and try again.',
      );
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // ── WebRTC Setup (Mic + Camera) for Step 2 ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const [micVolume, setMicVolume] = useState(0);
  const [mediaGranted, setMediaGranted] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [isRequesting, setIsRequesting] = useState(false);

  const setupMedia = async () => {
    setIsRequesting(true);
    try {
      setPermissionDenied(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setMediaGranted(true);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const AudioCtxClass =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioCtxClass) {
        throw new Error('AudioContext not supported');
      }

      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMic = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] ?? 0;
        setMicVolume(
          Math.min(100, Math.round((sum / dataArray.length / 128) * 100)),
        );
        rafRef.current = requestAnimationFrame(updateMic);
      };
      updateMic();

      const enumerated = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = enumerated.filter((d) => d.kind === 'audioinput');
      setDevices(audioInputs);
      if (audioInputs.length > 0 && audioInputs[0]) {
        setSelectedAudioInput(audioInputs[0].deviceId);
      }
    } catch {
      console.warn(
        'Camera/Microphone permission was denied by the browser or user.',
      );
      setPermissionDenied(true);
      setMediaGranted(false);
      setIsRequesting(false);
    }
  };

  const handleRetryDevices = () => {
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    setMediaGranted(false);
    setTimeout(() => setupMedia(), 500);
  };

  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const playSampleAudio = async () => {
    if (isPlayingSample) return;
    setIsPlayingSample(true);

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      if (ctx.state === 'suspended') await ctx.resume();

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = 'sine';
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.1);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);

      setTimeout(() => {
        setIsPlayingSample(false);
        ctx.close();
      }, 500);
    } catch (e) {
      console.error('Audio playback failed:', e);
      setIsPlayingSample(false);
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleStartInterview = () => {
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();

    useInterviewStore.getState().setCandidateContext({
      role: formData.role,
      experience: formData.experience,
      techStack: formData.techStack,
      resumeText: formData.resumeText || formData.jobDescription,
      interviewerId: formData.interviewerId,
      numQuestions: formData.numQuestions,
      interviewType: formData.interviewType,
    });
    router.push('/interview');
  };

  return (
    <div className="min-h-screen bg-[hsl(222,28%,7%)] text-slate-100 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      {/* ── Global Header (Stepper) ── */}
      <div className="w-full max-w-6xl flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {step === 1 ? 'New interview' : 'Tech check'}
          </h1>
          <p className="text-sm text-white/50">
            {step === 1
              ? "Tell us what you're preparing for. Everything below shapes your questions."
              : `Make sure ${selectedInterviewer.name} can see and hear you. Takes about 30 seconds.`}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 p-1.5 rounded-xl self-start sm:self-auto">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              step === 1 ? 'bg-white/10 text-white' : 'text-white/40'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-[10px]">
              1
            </span>
            Role & Setup
          </div>
          <ChevronRight size={14} className="text-white/20" />
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              step === 2 ? 'bg-white/10 text-white' : 'text-white/40'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 2
                  ? 'bg-brand-500 text-white'
                  : 'bg-white/10 text-white/40'
              }`}
            >
              2
            </span>
            Tech check
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── STEP 1: ROLE SETUP (MODULAR DECOMPOSED STEPS) ── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-6xl flex flex-col xl:flex-row gap-8 items-start"
          >
            {/* Left Main Form Column */}
            <div className="flex-1 w-full bg-[hsl(222,24%,11%)] border border-white/5 rounded-3xl p-6 sm:p-8 space-y-10 shadow-xl">
              {/* 1. Role, Seniority, Tech Stack & JD Input */}
              <JobDescriptionInput
                role={formData.role}
                experience={formData.experience}
                difficulty={formData.difficulty}
                interviewType={formData.interviewType}
                techStack={formData.techStack}
                jobDescription={formData.jobDescription}
                onChange={(fields) =>
                  setFormData((prev) => ({ ...prev, ...fields }))
                }
              />

              {/* 2. Candidate Resume Upload & PDF Parsing */}
              <div className="space-y-3">
                {uploadError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
                  >
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
                <ResumeUploadSection
                  resumeText={formData.resumeText}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                  resumeUploaded={resumeUploaded}
                  onFileSelect={handleResumeFileSelect}
                  onRemoveResume={() => {
                    setFormData((prev) => ({ ...prev, resumeText: undefined }));
                    setResumeUploaded(false);
                    setUploadError(null);
                  }}
                />
              </div>

              {/* 3. Interviewer Persona Selection */}
              <InterviewerPicker
                selectedInterviewerId={formData.interviewerId}
                onSelectInterviewer={(id) =>
                  setFormData((prev) => ({ ...prev, interviewerId: id }))
                }
              />

              {/* 4. Configuration Sliders & Proceed Button */}
              <ConfigurationSliders
                numQuestions={formData.numQuestions}
                timeLimit={formData.timeLimit}
                allowFollowUps={formData.allowFollowUps}
                onNumQuestionsChange={(n) =>
                  setFormData((prev) => ({ ...prev, numQuestions: n }))
                }
                onTimeLimitChange={(l) =>
                  setFormData((prev) => ({ ...prev, timeLimit: l }))
                }
                onToggleFollowUps={() =>
                  setFormData((prev) => ({
                    ...prev,
                    allowFollowUps: !prev.allowFollowUps,
                  }))
                }
                onProceed={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setStep(2);
                }}
              />
            </div>

            {/* Right Sticky Summary Sidebar */}
            <div className="w-full xl:w-[320px] shrink-0 sticky top-8 pb-16">
              <div className="bg-[hsl(222,24%,11%)] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-5 border-b border-white/5 flex items-center gap-4 bg-white/[0.02]">
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-brand-900 shrink-0 border border-white/10">
                    <Image
                      src={selectedInterviewer.avatar}
                      alt={selectedInterviewer.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {selectedInterviewer.name}{' '}
                      {selectedInterviewer.id === 'priya' ? 'Nair' : ''}
                    </h3>
                    <p className="text-xs text-white/40 leading-snug line-clamp-2 mt-0.5">
                      {selectedInterviewer.title}
                    </p>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-white/40 font-medium">Role</span>
                    <span className="text-white font-semibold text-right">
                      {formData.role}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-white/40 font-medium">Level</span>
                    <span className="text-white font-semibold text-right">
                      {formData.experience}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-white/40 font-medium">Type</span>
                    <span className="text-white font-semibold text-right">
                      {formData.interviewType}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-white/40 font-medium">
                      Difficulty
                    </span>
                    <span className="text-white font-semibold text-right">
                      {formData.difficulty}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-white/40 font-medium">Questions</span>
                    <span className="text-white font-semibold text-right">
                      {formData.numQuestions}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-white/40 font-medium">
                      Est. length
                    </span>
                    <span className="text-white font-semibold text-right">
                      ~{Math.max(5, formData.numQuestions * 4 + 2)} min
                    </span>
                  </div>
                </div>

                <div className="p-5 pt-0 mt-2 space-y-3">
                  <button
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      setStep(2);
                    }}
                    type="button"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-brand-500/25 cursor-pointer"
                  >
                    Continue to tech check <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => router.push('/dashboard')}
                    type="button"
                    className="w-full py-2.5 text-white/50 hover:text-white text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: TECH CHECK ── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-6xl"
          >
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left Column: Camera Feed */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${mediaGranted ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {!mediaGranted && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 p-4 text-center">
                      <Video className="w-12 h-12 mb-4 opacity-50" />
                      {permissionDenied ? (
                        <>
                          <p className="text-red-400 mb-4 font-medium">
                            Camera/Microphone access blocked.
                          </p>
                          <button
                            onClick={setupMedia}
                            type="button"
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                          >
                            Click to allow permissions
                          </button>
                        </>
                      ) : isRequesting ? (
                        <p>Requesting camera access...</p>
                      ) : (
                        <>
                          <p className="mb-4 font-medium">
                            We need access to your camera and mic.
                          </p>
                          <button
                            onClick={setupMedia}
                            type="button"
                            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-brand-500/25 cursor-pointer"
                          >
                            Start Tech Check
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleRetryDevices}
                  type="button"
                  className="flex items-center gap-2 self-start px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-white/70 transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} /> Retry devices
                </button>
              </div>

              {/* Right Column: Hardware Checks */}
              <div className="w-full lg:w-[480px] shrink-0 flex flex-col gap-4">
                {/* Microphone */}
                <div className="bg-[hsl(222,24%,11%)] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Mic className="text-white/70 w-5 h-5" />
                      <span className="font-semibold text-white">
                        Microphone
                      </span>
                    </div>
                    {mediaGranted ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{' '}
                        Working
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{' '}
                        Pending
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-75"
                        style={{
                          width: `${mediaGranted ? Math.max(2, micVolume) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-white/40">We can hear you.</p>
                  </div>

                  <select
                    value={selectedAudioInput}
                    onChange={(e) => setSelectedAudioInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/80 appearance-none focus:outline-none focus:border-brand-500"
                  >
                    {devices.length === 0 && (
                      <option>Default Microphone</option>
                    )}
                    {devices.map((device, i) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speaker */}
                <div className="bg-[hsl(222,24%,11%)] border border-white/5 rounded-xl p-5 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Volume2 className="text-white/70 w-5 h-5" />
                    <span className="font-semibold text-white">Speaker</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{' '}
                      Working
                    </span>
                    <button
                      onClick={playSampleAudio}
                      disabled={isPlayingSample}
                      type="button"
                      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isPlayingSample
                          ? 'bg-brand-500/20 border-brand-500/50 text-brand-400 cursor-wait'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                      }`}
                    >
                      <Play
                        size={12}
                        className={isPlayingSample ? 'animate-pulse' : ''}
                      />
                      {isPlayingSample ? 'Playing...' : 'Play sample'}
                    </button>
                  </div>
                </div>

                {/* Speech Recognition */}
                <div className="bg-[hsl(222,24%,11%)] border border-white/5 rounded-xl p-5 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Activity className="text-white/70 w-5 h-5" />
                    <span className="font-semibold text-white">
                      Speech recognition
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{' '}
                    Supported
                  </span>
                </div>

                {/* Connection */}
                <div className="bg-[hsl(222,24%,11%)] border border-white/5 rounded-xl p-5 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Wifi className="text-white/70 w-5 h-5" />
                    <span className="font-semibold text-white">Connection</span>
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{' '}
                    Online
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between mt-8 border-t border-white/10 pt-6">
              <button
                onClick={() => setStep(1)}
                type="button"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-white transition-colors border border-white/10 cursor-pointer"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={handleStartInterview}
                disabled={!mediaGranted}
                type="button"
                className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-semibold text-white transition-colors shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Video size={16} /> Join interview
              </button>
            </div>
            <div className="h-16" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SetupWizard;
