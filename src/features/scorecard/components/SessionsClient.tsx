'use client';

import { useState, useEffect } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Search,
  ChevronRight,
  Trash2,
  Plus,
  AlertTriangle,
} from 'lucide-react';

import {
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui';

export interface SerializedSession {
  id: string;
  title: string;
  interviewType: string;
  status: string;
  durationSeconds: number | null;
  createdAt: string;
  answeredCount: number;
  totalQuestions: number;
  scorecard: {
    overallScore: number | null;
    recommendation: string;
  } | null;
}

export function SessionsClient({
  initialSessions,
}: {
  initialSessions: SerializedSession[];
}) {
  const router = useRouter();

  // Bust Next.js client-side router cache to ensure newly completed sessions show up
  useEffect(() => {
    router.refresh();
  }, [router]);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'length'>('recent');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const sessions = initialSessions.filter((s) => !deletedIds.has(s.id));

  const filteredSessions = sessions
    .filter((s) => {
      const matchesSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.interviewType.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesRole = true;
      if (roleFilter !== 'All roles') {
        matchesRole = s.title.toLowerCase().includes(roleFilter.toLowerCase());
      }

      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else if (sortBy === 'score') {
        const scoreA = a.scorecard?.overallScore || 0;
        const scoreB = b.scorecard?.overallScore || 0;
        return scoreB - scoreA;
      } else if (sortBy === 'length') {
        const durationA = a.durationSeconds || 0;
        const durationB = b.durationSeconds || 0;
        return durationB - durationA;
      }
      return 0;
    });

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSessionToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    const id = sessionToDelete;
    setSessionToDelete(null);

    // Optimistic UI update
    setDeletedIds((prev) => new Set(prev).add(id));

    try {
      const res = await fetch(`/api/interview/session/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete');
      }
    } catch (err) {
      console.error('Failed to delete session', err);
      // Revert if API call fails
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const getSignalStyle = (recommendation: string) => {
    switch (recommendation?.toUpperCase()) {
      case 'STRONG HIRE':
      case 'HIRE':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'NO HIRE':
      case 'NOT YET READY':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      {/* Header section */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Sessions</h1>
          <p className="text-white/50">
            {sessions.length} saved on this device.
          </p>
        </div>
        <Link
          href="/dashboard/setup"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/25"
        >
          <Plus size={18} />
          New interview
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1 relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            type="text"
            placeholder="Search role, type, stack or result"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#161821] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/30"
          />
        </div>
        <div className="flex gap-4">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-[#161821] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 appearance-none min-w-[140px]"
          >
            <option>All roles</option>
            <option>Frontend</option>
            <option>Backend</option>
            <option>Full Stack</option>
            <option>Data Engineer</option>
          </select>
          <div className="flex bg-[#161821] border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'recent'
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 text-white/60'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy('score')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'score'
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 text-white/60'
              }`}
            >
              Score
            </button>
            <button
              onClick={() => setSortBy('length')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'length'
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 text-white/60'
              }`}
            >
              Length
            </button>
          </div>
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-[#161821] border border-white/10 rounded-2xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 text-xs font-bold text-white/40 tracking-wider">
          <div className="col-span-2">DATE</div>
          <div className="col-span-4">INTERVIEW</div>
          <div className="col-span-2">ANSWERED</div>
          <div className="col-span-1">LENGTH</div>
          <div className="col-span-1">SCORE</div>
          <div className="col-span-2">SIGNAL</div>
        </div>

        {/* Table Body */}
        <div className="flex flex-col divide-y divide-white/5">
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-white/40">
              No sessions found.
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => router.push(`/dashboard/report/${session.id}`)}
                className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-white/5 cursor-pointer transition-colors group"
              >
                <div className="col-span-2 text-sm text-white/80 font-medium">
                  {formatDate(session.createdAt)}
                </div>

                <div className="col-span-4 flex flex-col">
                  <span className="text-white font-semibold text-sm">
                    {session.title}
                  </span>
                  <span className="text-white/40 text-xs mt-1 capitalize">
                    {session.interviewType.toLowerCase()} ·{' '}
                    {session.status.toLowerCase()}
                  </span>
                </div>

                <div className="col-span-2 text-sm text-white/60">
                  {session.answeredCount} / {session.totalQuestions || 5}
                </div>

                <div className="col-span-1 text-sm text-white/60">
                  {session.durationSeconds && session.durationSeconds > 0
                    ? `${Math.max(1, Math.round(session.durationSeconds / 60))} min`
                    : '1 min'}
                </div>

                <div
                  className={`col-span-1 font-bold ${
                    !session.scorecard?.overallScore
                      ? 'text-white/40'
                      : session.scorecard.overallScore >= 70 ||
                          (session.scorecard.overallScore <= 10 &&
                            session.scorecard.overallScore >= 7)
                        ? 'text-emerald-400'
                        : session.scorecard.overallScore >= 50 ||
                            (session.scorecard.overallScore <= 10 &&
                              session.scorecard.overallScore >= 5)
                          ? 'text-amber-400'
                          : 'text-red-400'
                  }`}
                >
                  {session.scorecard?.overallScore
                    ? session.scorecard.overallScore <= 10
                      ? (session.scorecard.overallScore * 10).toFixed(0)
                      : session.scorecard.overallScore.toFixed(0)
                    : '--'}
                </div>

                <div className="col-span-2 flex items-center justify-between pr-2">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-bold border ${getSignalStyle(
                      session.scorecard?.recommendation || '',
                    )}`}
                  >
                    {session.scorecard?.recommendation || 'Not yet ready'}
                  </span>

                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDeleteClick(e, session.id)}
                      className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                      title="Delete session"
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={16} className="text-white/40" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Accessible Confirmation Modal */}
      <Modal
        isOpen={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        variant="danger"
        size="sm"
      >
        <ModalHeader
          title="Delete Session"
          description="Are you sure you want to permanently delete this interview session? This action cannot be undone."
        />
        <ModalBody>
          <div className="flex items-center gap-3 text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-xs">
            <AlertTriangle size={16} className="shrink-0" />
            <span>
              All scorecards and transcript records for this session will be
              archived.
            </span>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSessionToDelete(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirmDelete}
            leadingIcon={<Trash2 size={14} />}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default SessionsClient;
