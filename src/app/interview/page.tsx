'use client';

import { useState } from 'react';

import { ActiveInterviewRoom, WaitingRoom } from '@/features/interview';

export default function InterviewSessionPage() {
  const [joined, setJoined] = useState(false);

  return (
    <main className="min-h-screen bg-background">
      {!joined ? (
        <WaitingRoom onJoin={() => setJoined(true)} />
      ) : (
        <ActiveInterviewRoom />
      )}
    </main>
  );
}
