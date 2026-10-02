-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CANDIDATE', 'INTERVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('TECHNICAL', 'BEHAVIOURAL', 'SYSTEM_DESIGN', 'HR', 'MIXED');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'REDACTED');

-- CreateEnum
CREATE TYPE "HiringRecommendation" AS ENUM ('STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CANDIDATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "interview_type" "InterviewType" NOT NULL DEFAULT 'TECHNICAL',
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "template_id" UUID,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_transcripts" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "audio_storage_path" TEXT,
    "audio_mime_type" TEXT,
    "audio_codec" TEXT,
    "audio_duration_ms" INTEGER,
    "audio_size_bytes" BIGINT,
    "audio_sample_rate" INTEGER,
    "audio_channels" INTEGER DEFAULT 1,
    "audio_url" TEXT,
    "confidence_score" DECIMAL(4,3),
    "raw_text" TEXT,
    "cleaned_text" TEXT,
    "language" TEXT DEFAULT 'en-US',
    "word_count" INTEGER,
    "status" "TranscriptStatus" NOT NULL DEFAULT 'UPLOADING',
    "speaker_segments" JSONB,
    "question_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "interview_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "technical_score" DECIMAL(3,1),
    "communication_score" DECIMAL(3,1),
    "problem_solving_score" DECIMAL(3,1),
    "culture_fit_score" DECIMAL(3,1),
    "overall_score" DECIMAL(3,1),
    "strengths" TEXT,
    "weaknesses" TEXT,
    "detailed_feedback" TEXT,
    "suggested_topics" TEXT[],
    "dimension_breakdown" JSONB,
    "recommendation" "HiringRecommendation",
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_is_deleted_created_at_idx" ON "users"("is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_is_deleted_created_at_idx" ON "sessions"("user_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sessions_user_id_interview_type_idx" ON "sessions"("user_id", "interview_type");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_scheduled_at_idx" ON "sessions"("scheduled_at");

-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "interview_transcripts_session_id_is_deleted_created_at_idx" ON "interview_transcripts"("session_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "interview_transcripts_user_id_session_id_idx" ON "interview_transcripts"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "interview_transcripts_user_id_created_at_idx" ON "interview_transcripts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "interview_transcripts_status_idx" ON "interview_transcripts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "interview_transcripts_session_id_chunk_index_key" ON "interview_transcripts"("session_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "scorecards_session_id_key" ON "scorecards"("session_id");

-- CreateIndex
CREATE INDEX "scorecards_user_id_is_deleted_created_at_idx" ON "scorecards"("user_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "scorecards_user_id_recommendation_idx" ON "scorecards"("user_id", "recommendation");

-- CreateIndex
CREATE INDEX "scorecards_recommendation_idx" ON "scorecards"("recommendation");

-- CreateIndex
CREATE INDEX "scorecards_overall_score_idx" ON "scorecards"("overall_score");

-- CreateIndex
CREATE INDEX "scorecards_created_at_idx" ON "scorecards"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
