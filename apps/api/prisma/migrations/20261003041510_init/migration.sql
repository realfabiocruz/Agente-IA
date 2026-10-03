-- CreateEnum
CREATE TYPE "RubricStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('CREATED', 'CONSENTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'EVALUATING', 'READY_FOR_REVIEW', 'REVIEWED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('TEXT', 'VOICE');

-- CreateEnum
CREATE TYPE "VoicePref" AS ENUM ('MALE', 'FEMALE', 'RANDOM');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('AGENT', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "Block" AS ENUM ('OPENING', 'TRAJECTORY', 'TECHNICAL', 'CULTURAL', 'EXPECTATION', 'CLOSING');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('CONFIRMED', 'ADJUSTED', 'INVALIDATED');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillRubric" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RubricStatus" NOT NULL DEFAULT 'DRAFT',
    "promptVersion" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "levels" JSONB NOT NULL,
    "anchorQuestions" JSONB NOT NULL,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "jobOpeningId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'CREATED',
    "mode" "InterviewMode" NOT NULL DEFAULT 'TEXT',
    "voicePref" "VoicePref",
    "consentAt" TIMESTAMP(3),
    "consentText" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "roomName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "currentBlock" "Block" NOT NULL DEFAULT 'OPENING',
    "blockStartMs" INTEGER NOT NULL DEFAULT 0,
    "activeMs" INTEGER NOT NULL DEFAULT 0,
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTurn" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "block" "Block" NOT NULL,
    "text" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,

    CONSTRAINT "InterviewTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyScore" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "score" INTEGER,
    "justification" TEXT NOT NULL,
    "evidenceIds" TEXT[],

    CONSTRAINT "CompetencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewReport" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "weightedScore" DECIMAL(4,2),
    "coverage" DECIMAL(4,3) NOT NULL,
    "summary" TEXT NOT NULL,
    "pointsToCheck" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReview" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "adjustments" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" BIGSERIAL NOT NULL,
    "interviewId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "deleteAfter" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contestation" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "history" JSONB NOT NULL,

    CONSTRAINT "MockUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SkillRubric_skillId_version_key" ON "SkillRubric"("skillId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_rubricId_key_key" ON "Competency"("rubricId", "key");

-- CreateIndex
CREATE INDEX "Interview_skillId_status_idx" ON "Interview"("skillId", "status");

-- CreateIndex
CREATE INDEX "Interview_candidateId_idx" ON "Interview"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewTurn_interviewId_seq_key" ON "InterviewTurn"("interviewId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyScore_interviewId_competencyId_key" ON "CompetencyScore"("interviewId", "competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewReport_interviewId_key" ON "InterviewReport"("interviewId");

-- CreateIndex
CREATE INDEX "AgentEvent_interviewId_at_idx" ON "AgentEvent"("interviewId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_interviewId_key" ON "Recording"("interviewId");

-- AddForeignKey
ALTER TABLE "SkillRubric" ADD CONSTRAINT "SkillRubric_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competency" ADD CONSTRAINT "Competency_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "SkillRubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "SkillRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTurn" ADD CONSTRAINT "InterviewTurn_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "InterviewTurn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyScore" ADD CONSTRAINT "CompetencyScore_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyScore" ADD CONSTRAINT "CompetencyScore_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contestation" ADD CONSTRAINT "Contestation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
