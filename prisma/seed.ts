/**
 * @file prisma/seed.ts
 * @description Database seeding script for onboarding, staging, and local development.
 * Populates demo users (Candidate, Interviewer, Admin) and 3 sample completed
 * interview sessions across different categories and score distributions.
 *
 * Execution:
 *   npx prisma db seed
 *   npm run db:seed
 */

import {
  PrismaClient,
  UserRole,
  SessionStatus,
  InterviewType,
  TranscriptStatus,
  HiringRecommendation,
  Prisma,
} from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

// Deterministic UUIDs for idempotent execution
const SEED_DATA = {
  users: {
    candidate: {
      email: 'demo@ai-interviewer.local',
      name: 'Alex Rivera (Demo Candidate)',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&h=256&fit=crop',
      role: UserRole.CANDIDATE,
    },
    interviewer: {
      email: 'interviewer@ai-interviewer.local',
      name: 'Sarah Chen (Staff Engineer & Interviewer)',
      avatarUrl:
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=256&h=256&fit=crop',
      role: UserRole.INTERVIEWER,
    },
    admin: {
      email: 'admin@ai-interviewer.local',
      name: 'Marcus Vance (Platform Administrator)',
      avatarUrl:
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=256&h=256&fit=crop',
      role: UserRole.ADMIN,
    },
  },
  sessions: {
    frontend: {
      id: 'a1111111-1111-4111-8111-111111111111',
      interviewType: InterviewType.TECHNICAL,
      title: 'Senior Frontend Architecture & React 19 Performance',
      durationSeconds: 2700, // 45 min
      daysAgo: 4,
      scorecard: {
        id: 'a1111111-1111-4111-8111-222222222222',
        technicalScore: new Prisma.Decimal('9.2'),
        communicationScore: new Prisma.Decimal('8.8'),
        problemSolvingScore: new Prisma.Decimal('9.0'),
        cultureFitScore: new Prisma.Decimal('8.5'),
        overallScore: new Prisma.Decimal('8.9'),
        recommendation: HiringRecommendation.STRONG_YES,
        strengths:
          'Deep mastery of React Server Components (RSC), hydration boundaries, and Core Web Vitals (INP/LCP) optimization. Articulate, structured explanation of performance telemetry using PerformanceObserver.',
        weaknesses:
          'Could discuss edge caching invalidation nuances in greater detail when combining streaming SSR with Incremental Static Regeneration (ISR).',
        detailedFeedback:
          'The candidate demonstrated senior-to-staff level depth in modern JavaScript runtimes, React internals, and client-side profiling. Provided immediate, production-grade architectural patterns for eliminating layout thrashing and managing large real-time canvas visualizations. High hiring confidence.',
        suggestedTopics: [
          'React 19 Server Actions',
          'Interaction to Next Paint (INP)',
          'Micro-Frontend Federation',
          'Web Worker Offloading',
        ],
        dimensionBreakdown: {
          react_internals: 9.5,
          performance_optimization: 9.2,
          system_architecture: 8.7,
          communication_clarity: 8.8,
          debugging_methodology: 9.0,
        },
      },
      transcripts: [
        {
          chunkIndex: 0,
          rawText:
            "Interviewer: Can you explain how React 19 server components change hydration boundaries and client bundle footprints compared to classic client-side rendering?",
          cleanedText:
            "Can you explain how React 19 server components change hydration boundaries and client bundle footprints compared to classic client-side rendering?",
          confidenceScore: new Prisma.Decimal('0.985'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'interviewer',
              start: 0.0,
              end: 4.8,
              text: "Can you explain how React 19 server components change hydration boundaries and client bundle footprints compared to classic client-side rendering?",
            },
          ],
        },
        {
          chunkIndex: 1,
          rawText:
            "Candidate: Server Components execute strictly on the server and stream a serialized component wire format (RSC protocol) to the browser. Unlike classic SSR where HTML is accompanied by the full JS bundle for hydration, Server Component code never ships to the client bundle. This allows zero-bundle-size data fetching dependencies and keeps client hydration limited strictly to client leaves.",
          cleanedText:
            "Server Components execute strictly on the server and stream a serialized component wire format (RSC protocol) to the browser. Unlike classic SSR where HTML is accompanied by the full JS bundle for hydration, Server Component code never ships to the client bundle. This allows zero-bundle-size data fetching dependencies and keeps client hydration limited strictly to client leaves.",
          confidenceScore: new Prisma.Decimal('0.965'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'candidate',
              start: 5.2,
              end: 18.4,
              text: "Server Components execute strictly on the server and stream a serialized component wire format (RSC protocol) to the browser...",
            },
          ],
        },
        {
          chunkIndex: 2,
          rawText:
            "Interviewer: Excellent. When diagnosing an Interaction to Next Paint (INP) regression above 200ms on a complex dashboard, what steps do you take to isolate long animation frames?",
          cleanedText:
            "Excellent. When diagnosing an Interaction to Next Paint (INP) regression above 200ms on a complex dashboard, what steps do you take to isolate long animation frames?",
          confidenceScore: new Prisma.Decimal('0.978'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'interviewer',
              start: 19.0,
              end: 25.6,
              text: "When diagnosing an Interaction to Next Paint (INP) regression above 200ms on a complex dashboard, what steps do you take to isolate long animation frames?",
            },
          ],
        },
      ],
    },
    systemDesign: {
      id: 'b2222222-2222-4222-8222-111111111111',
      interviewType: InterviewType.SYSTEM_DESIGN,
      title: 'Real-Time Collaborative Document Canvas Engine',
      durationSeconds: 2700, // 45 min
      daysAgo: 2,
      scorecard: {
        id: 'b2222222-2222-4222-8222-222222222222',
        technicalScore: new Prisma.Decimal('7.8'),
        communicationScore: new Prisma.Decimal('7.5'),
        problemSolvingScore: new Prisma.Decimal('7.2'),
        cultureFitScore: new Prisma.Decimal('7.5'),
        overallScore: new Prisma.Decimal('7.5'),
        recommendation: HiringRecommendation.YES,
        strengths:
          'Clear architectural separation between ephemeral cursor telemetry and persistent document state. Strong proposal of CRDT algorithms (Yjs) over Operational Transformation (OT) for decentralized topologies.',
        weaknesses:
          'Did not proactively compute back-of-the-envelope bandwidth calculations for 10,000 concurrent room participants until prompted; room partitioning logic could be more resilient to network splits.',
        detailedFeedback:
          'Solid distributed system foundations. The candidate understood the operational hazards of unbounded WebSocket connections, proposed sensible Redis cluster Pub/Sub sharding, and designed durable snapshotting using S3 and PostgreSQL WAL.',
        suggestedTopics: [
          'CRDT vs Operational Transformation',
          'WebTransport & HTTP/3 Telemetry',
          'Redis Cluster Hash Slot Sharding',
          'Back-of-the-envelope Capacity Planning',
        ],
        dimensionBreakdown: {
          distributed_systems: 7.8,
          scalability: 7.5,
          data_modeling: 7.6,
          clarity_and_tradeoffs: 7.4,
          capacity_planning: 7.0,
        },
      },
      transcripts: [
        {
          chunkIndex: 0,
          rawText:
            "Interviewer: Design a collaborative whiteboard application supporting 10,000 concurrent participants per canvas room with sub-50ms multi-cursor synchronization.",
          cleanedText:
            "Design a collaborative whiteboard application supporting 10,000 concurrent participants per canvas room with sub-50ms multi-cursor synchronization.",
          confidenceScore: new Prisma.Decimal('0.991'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'interviewer',
              start: 0.0,
              end: 5.1,
              text: "Design a collaborative whiteboard application supporting 10,000 concurrent participants per canvas room with sub-50ms multi-cursor synchronization.",
            },
          ],
        },
        {
          chunkIndex: 1,
          rawText:
            "Candidate: To achieve sub-50ms latency without crashing the server, we must isolate cursor telemetry from document mutation transactions. For cursor coordinates, we broadcast loss-tolerant UDP or binary WebSocket packets via edge-located Redis Pub/Sub channels with client-side dead reckoning interpolation. For canvas shape changes, we use Conflict-Free Replicated Data Types (CRDTs) to guarantee eventual consistency across network partitions.",
          cleanedText:
            "To achieve sub-50ms latency without crashing the server, we must isolate cursor telemetry from document mutation transactions. For cursor coordinates, we broadcast loss-tolerant UDP or binary WebSocket packets via edge-located Redis Pub/Sub channels with client-side dead reckoning interpolation. For canvas shape changes, we use Conflict-Free Replicated Data Types (CRDTs) to guarantee eventual consistency across network partitions.",
          confidenceScore: new Prisma.Decimal('0.952'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'candidate',
              start: 5.5,
              end: 22.0,
              text: "To achieve sub-50ms latency without crashing the server, we must isolate cursor telemetry...",
            },
          ],
        },
      ],
    },
    behavioral: {
      id: 'c3333333-3333-4333-8333-111111111111',
      interviewType: InterviewType.BEHAVIOURAL,
      title: 'Engineering Leadership, Prioritization & Conflict Resolution',
      durationSeconds: 2100, // 35 min
      daysAgo: 1,
      scorecard: {
        id: 'c3333333-3333-4333-8333-222222222222',
        technicalScore: new Prisma.Decimal('6.5'),
        communicationScore: new Prisma.Decimal('6.8'),
        problemSolvingScore: new Prisma.Decimal('6.0'),
        cultureFitScore: new Prisma.Decimal('6.2'),
        overallScore: new Prisma.Decimal('6.4'),
        recommendation: HiringRecommendation.NEUTRAL,
        strengths:
          'Demonstrated pragmatic stakeholder negotiation skills; used concrete business risk (revenue vulnerability during Q4 peak) rather than technical dogma to realign product priorities.',
        weaknesses:
          'Responses occasionally lapsed into describing collective team accomplishments rather than the candidate’s specific individual contributions (STAR Action component was somewhat vague). Missed presenting quantified retrospectives.',
        detailedFeedback:
          'The candidate shows healthy professional maturity and commercial awareness. However, answers remained high-level without specific insight into how interpersonal frictions within the engineering team were resolved during high-pressure milestones.',
        suggestedTopics: [
          'STAR Framework Precision',
          'Direct Peer Feedback & Coaching',
          'Quantified Project Retrospectives',
          'Cross-Functional Stakeholder Alignment',
        ],
        dimensionBreakdown: {
          stakeholder_alignment: 7.0,
          star_framework_rigor: 5.8,
          conflict_resolution: 6.2,
          ownership_and_accountability: 6.5,
          growth_mindset: 6.3,
        },
      },
      transcripts: [
        {
          chunkIndex: 0,
          rawText:
            "Interviewer: Tell me about a time when product leadership pushed for an aggressive deadline that risked serious architectural debt or system downtime.",
          cleanedText:
            "Tell me about a time when product leadership pushed for an aggressive deadline that risked serious architectural debt or system downtime.",
          confidenceScore: new Prisma.Decimal('0.988'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'interviewer',
              start: 0.0,
              end: 4.9,
              text: "Tell me about a time when product leadership pushed for an aggressive deadline that risked serious architectural debt or system downtime.",
            },
          ],
        },
        {
          chunkIndex: 1,
          rawText:
            "Candidate: In my previous role, product wanted to ship a new checkout tier before Black Friday which required refactoring our core ledger. I scheduled an alignment meeting with the VP of Product and walked through historical outage costs. Instead of a flat refusal, I presented a two-phase compromise: phase one leveraged an existing adapter behind a feature flag for 10% canary traffic, and phase two executed the deep ledger schema migration during Q1.",
          cleanedText:
            "In my previous role, product wanted to ship a new checkout tier before Black Friday which required refactoring our core ledger. I scheduled an alignment meeting with the VP of Product and walked through historical outage costs. Instead of a flat refusal, I presented a two-phase compromise: phase one leveraged an existing adapter behind a feature flag for 10% canary traffic, and phase two executed the deep ledger schema migration during Q1.",
          confidenceScore: new Prisma.Decimal('0.941'),
          status: TranscriptStatus.READY,
          speakerSegments: [
            {
              speaker: 'candidate',
              start: 5.3,
              end: 21.8,
              text: "In my previous role, product wanted to ship a new checkout tier before Black Friday...",
            },
          ],
        },
      ],
    },
  },
};

/**
 * Main seeding routine
 */
async function main() {
  console.log('============================================================');
  console.log('🌱 Starting database seed for AI Interviewer App');
  console.log('============================================================');

  // 1. Seed Users (Candidate, Interviewer, Admin)
  console.log('\n--- 1. Seeding Users ---');

  const candidate = await prisma.user.upsert({
    where: { email: SEED_DATA.users.candidate.email },
    update: {
      name: SEED_DATA.users.candidate.name,
      role: SEED_DATA.users.candidate.role,
      avatarUrl: SEED_DATA.users.candidate.avatarUrl,
      isDeleted: false,
    },
    create: {
      email: SEED_DATA.users.candidate.email,
      name: SEED_DATA.users.candidate.name,
      role: SEED_DATA.users.candidate.role,
      avatarUrl: SEED_DATA.users.candidate.avatarUrl,
    },
  });
  console.log(
    `✅ User [${candidate.role}] upserted: "${candidate.name}" (${candidate.email}) [ID: ${candidate.id}]`
  );

  const interviewer = await prisma.user.upsert({
    where: { email: SEED_DATA.users.interviewer.email },
    update: {
      name: SEED_DATA.users.interviewer.name,
      role: SEED_DATA.users.interviewer.role,
      avatarUrl: SEED_DATA.users.interviewer.avatarUrl,
      isDeleted: false,
    },
    create: {
      email: SEED_DATA.users.interviewer.email,
      name: SEED_DATA.users.interviewer.name,
      role: SEED_DATA.users.interviewer.role,
      avatarUrl: SEED_DATA.users.interviewer.avatarUrl,
    },
  });
  console.log(
    `✅ User [${interviewer.role}] upserted: "${interviewer.name}" (${interviewer.email}) [ID: ${interviewer.id}]`
  );

  const admin = await prisma.user.upsert({
    where: { email: SEED_DATA.users.admin.email },
    update: {
      name: SEED_DATA.users.admin.name,
      role: SEED_DATA.users.admin.role,
      avatarUrl: SEED_DATA.users.admin.avatarUrl,
      isDeleted: false,
    },
    create: {
      email: SEED_DATA.users.admin.email,
      name: SEED_DATA.users.admin.name,
      role: SEED_DATA.users.admin.role,
      avatarUrl: SEED_DATA.users.admin.avatarUrl,
    },
  });
  console.log(
    `✅ User [${admin.role}] upserted: "${admin.name}" (${admin.email}) [ID: ${admin.id}]`
  );

  // 2. Seed 3 Completed Sessions with Scorecards and Transcripts
  console.log('\n--- 2. Seeding Sample Completed Interview Sessions ---');

  const sessionConfigs = [
    SEED_DATA.sessions.frontend,
    SEED_DATA.sessions.systemDesign,
    SEED_DATA.sessions.behavioral,
  ];

  for (const sessionData of sessionConfigs) {
    const sessionDate = new Date(
      Date.now() - sessionData.daysAgo * 24 * 60 * 60 * 1000
    );
    const startDate = new Date(sessionDate.getTime() + 5 * 60 * 1000);
    const endDate = new Date(
      startDate.getTime() + sessionData.durationSeconds * 1000
    );

    // Upsert Session
    const session = await prisma.session.upsert({
      where: { id: sessionData.id },
      update: {
        userId: candidate.id,
        interviewType: sessionData.interviewType,
        status: SessionStatus.COMPLETED,
        title: sessionData.title,
        durationSeconds: sessionData.durationSeconds,
        scheduledAt: sessionDate,
        startedAt: startDate,
        endedAt: endDate,
        isDeleted: false,
      },
      create: {
        id: sessionData.id,
        userId: candidate.id,
        interviewType: sessionData.interviewType,
        status: SessionStatus.COMPLETED,
        title: sessionData.title,
        durationSeconds: sessionData.durationSeconds,
        scheduledAt: sessionDate,
        startedAt: startDate,
        endedAt: endDate,
      },
    });

    console.log(
      `\n📋 Session [${session.interviewType}] upserted: "${session.title}" [ID: ${session.id}]`
    );

    // Upsert Transcripts
    for (const transcriptChunk of sessionData.transcripts) {
      const transcript = await prisma.interviewTranscript.upsert({
        where: {
          sessionId_chunkIndex: {
            sessionId: session.id,
            chunkIndex: transcriptChunk.chunkIndex,
          },
        },
        update: {
          userId: candidate.id,
          rawText: transcriptChunk.rawText,
          cleanedText: transcriptChunk.cleanedText,
          confidenceScore: transcriptChunk.confidenceScore,
          status: transcriptChunk.status,
          speakerSegments: transcriptChunk.speakerSegments,
          wordCount: transcriptChunk.cleanedText.split(/\s+/).length,
          isDeleted: false,
        },
        create: {
          sessionId: session.id,
          userId: candidate.id,
          chunkIndex: transcriptChunk.chunkIndex,
          rawText: transcriptChunk.rawText,
          cleanedText: transcriptChunk.cleanedText,
          confidenceScore: transcriptChunk.confidenceScore,
          status: transcriptChunk.status,
          speakerSegments: transcriptChunk.speakerSegments,
          wordCount: transcriptChunk.cleanedText.split(/\s+/).length,
        },
      });

      console.log(
        `   ├─ Transcript Chunk #${transcript.chunkIndex} [ID: ${transcript.id}] (Confidence: ${transcript.confidenceScore})`
      );
    }

    // Upsert Scorecard
    const scorecardData = sessionData.scorecard;
    const scorecard = await prisma.scorecard.upsert({
      where: { sessionId: session.id },
      update: {
        userId: candidate.id,
        technicalScore: scorecardData.technicalScore,
        communicationScore: scorecardData.communicationScore,
        problemSolvingScore: scorecardData.problemSolvingScore,
        cultureFitScore: scorecardData.cultureFitScore,
        overallScore: scorecardData.overallScore,
        recommendation: scorecardData.recommendation,
        strengths: scorecardData.strengths,
        weaknesses: scorecardData.weaknesses,
        detailedFeedback: scorecardData.detailedFeedback,
        suggestedTopics: scorecardData.suggestedTopics,
        dimensionBreakdown: scorecardData.dimensionBreakdown,
        reviewedBy: interviewer.id,
        reviewedAt: new Date(endDate.getTime() + 60 * 60 * 1000),
        isDeleted: false,
      },
      create: {
        id: scorecardData.id,
        sessionId: session.id,
        userId: candidate.id,
        technicalScore: scorecardData.technicalScore,
        communicationScore: scorecardData.communicationScore,
        problemSolvingScore: scorecardData.problemSolvingScore,
        cultureFitScore: scorecardData.cultureFitScore,
        overallScore: scorecardData.overallScore,
        recommendation: scorecardData.recommendation,
        strengths: scorecardData.strengths,
        weaknesses: scorecardData.weaknesses,
        detailedFeedback: scorecardData.detailedFeedback,
        suggestedTopics: scorecardData.suggestedTopics,
        dimensionBreakdown: scorecardData.dimensionBreakdown,
        reviewedBy: interviewer.id,
        reviewedAt: new Date(endDate.getTime() + 60 * 60 * 1000),
      },
    });

    console.log(
      `   └─ Scorecard [ID: ${scorecard.id}] -> Overall: ${scorecard.overallScore}/10 | Signal: ${scorecard.recommendation} | Reviewer: ${interviewer.name}`
    );
  }

  console.log('\n============================================================');
  console.log('🎉 Database seeding completed successfully!');
  console.log('============================================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('\n❌ Database seed failed with error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
