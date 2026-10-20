'use client';

import React, { useState } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';

export const ROLES = [
  {
    id: 'Frontend Engineer',
    label: 'Frontend Engineer',
    desc: 'UI, performance, accessibility',
  },
  {
    id: 'Backend Engineer',
    label: 'Backend Engineer',
    desc: 'APIs, databases, reliability',
  },
  {
    id: 'Full Stack Engineer',
    label: 'Full Stack Engineer',
    desc: 'End-to-end product delivery',
  },
  {
    id: 'DevOps / SRE',
    label: 'DevOps / SRE',
    desc: 'Infra, CI/CD, observability',
  },
  {
    id: 'Data Engineer',
    label: 'Data Engineer',
    desc: 'Pipelines, warehousing, quality',
  },
  {
    id: 'Engineering Manager',
    label: 'Engineering Manager',
    desc: 'Leadership, delivery, people',
  },
  {
    id: 'Mobile Engineer',
    label: 'Mobile Engineer',
    desc: 'iOS, Android, cross-platform',
  },
];

export const INTERVIEW_TYPES = [
  {
    id: 'Full loop',
    label: 'Full loop',
    desc: 'Blend of technical, design, coding and behavioral',
  },
  {
    id: 'Technical',
    label: 'Technical',
    desc: 'Role-specific concepts and trade-offs',
  },
  {
    id: 'System design',
    label: 'System design',
    desc: 'Architecture and scale discussions',
  },
  {
    id: 'Coding',
    label: 'Coding',
    desc: 'Talk through algorithms and write code',
  },
  {
    id: 'Behavioral',
    label: 'Behavioral',
    desc: 'STAR stories and collaboration',
  },
];

export const EXPERIENCES = ['Junior', 'Mid-level', 'Senior', 'Staff+'];
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export interface JobDescriptionInputProps {
  role: string;
  experience: string;
  difficulty: string;
  interviewType: string;
  techStack: string[];
  jobDescription: string;
  onChange: (
    fields: Partial<{
      role: string;
      experience: string;
      difficulty: string;
      interviewType: string;
      techStack: string[];
      jobDescription: string;
    }>,
  ) => void;
}

/**
 * Component for role selection, experience level, tech stack tags, and job description input.
 */
export function JobDescriptionInput({
  role,
  experience,
  difficulty,
  interviewType,
  techStack,
  jobDescription,
  onChange,
}: JobDescriptionInputProps) {
  const [techInput, setTechInput] = useState('');

  const handleAddTech = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (
      (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') ||
      !techInput.trim()
    )
      return;
    e.preventDefault();
    if (!techStack.includes(techInput.trim()) && techStack.length < 8) {
      onChange({ techStack: [...techStack, techInput.trim()] });
    }
    setTechInput('');
  };

  const handleRemoveTech = (tech: string) => {
    onChange({ techStack: techStack.filter((t) => t !== tech) });
  };

  return (
    <div className="space-y-8">
      {/* ── ROLE SELECTION ── */}
      <section>
        <h2 className="text-sm font-bold text-white mb-4">Target Role</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {ROLES.map((r) => {
            const isSelected = role === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onChange({ role: r.id })}
                type="button"
                className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-brand-500/10 border-brand-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                }`}
              >
                <p className="font-semibold text-sm text-white">{r.label}</p>
                <p className="text-[11px] text-white/40 mt-1 line-clamp-1">
                  {r.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── EXPERIENCE & DIFFICULTY ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-bold text-white mb-3">Seniority Level</h2>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCES.map((exp) => (
              <button
                key={exp}
                onClick={() => onChange({ experience: exp })}
                type="button"
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  experience === exp
                    ? 'bg-brand-500 text-white border-brand-400'
                    : 'bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/[0.05]'
                }`}
              >
                {exp}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-white mb-3">Difficulty</h2>
          <div className="flex gap-2">
            {DIFFICULTIES.map((diff) => (
              <button
                key={diff}
                onClick={() => onChange({ difficulty: diff })}
                type="button"
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  difficulty === diff
                    ? 'bg-brand-500 text-white border-brand-400'
                    : 'bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/[0.05]'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTERVIEW TYPE ── */}
      <section>
        <h2 className="text-sm font-bold text-white mb-4">Interview Type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {INTERVIEW_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ interviewType: t.id })}
              type="button"
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                interviewType === t.id
                  ? 'bg-brand-500/10 border-brand-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
              }`}
            >
              <h3 className="font-semibold text-sm text-white mb-1">
                {t.label}
              </h3>
              <p className="text-xs text-white/40 leading-relaxed">{t.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── TECH STACK TAGS ── */}
      <section>
        <div className="flex justify-between items-end mb-3">
          <h2 className="text-sm font-bold text-white">Tech Stack Focus</h2>
          <span className="text-xs text-white/40">
            {techStack.length}/8 selected
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <AnimatePresence>
            {techStack.map((tech) => (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                key={tech}
                className="px-3 py-1.5 bg-white/10 border border-white/10 rounded-full text-xs font-medium text-white/90 flex items-center gap-2 group"
              >
                {tech}
                <button
                  onClick={() => handleRemoveTech(tech)}
                  type="button"
                  className="text-white/40 group-hover:text-white/90 transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        {techStack.length < 8 && (
          <div className="flex gap-2 max-w-xs">
            <input
              type="text"
              placeholder="e.g. Next.js, Docker, Redis"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={handleAddTech}
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={handleAddTech}
              disabled={!techInput.trim()}
              type="button"
              className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white/90 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}
      </section>

      {/* ── JOB DESCRIPTION ── */}
      <section>
        <h2 className="text-sm font-bold text-white mb-2">
          Job Description{' '}
          <span className="text-white/30 font-normal">(optional)</span>
        </h2>
        <textarea
          placeholder="Paste the job posting requirements here..."
          value={jobDescription}
          onChange={(e) => onChange({ jobDescription: e.target.value })}
          className="w-full h-28 bg-white/[0.02] border border-white/10 rounded-xl p-4 text-xs text-white placeholder-white/30 focus:outline-none focus:border-brand-500 resize-y"
        />
        <p className="text-[11px] text-white/40 mt-1.5">
          Paste the job description and our AI will simulate interview questions
          tailored to the position.
        </p>
      </section>
    </div>
  );
}
