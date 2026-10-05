-- AlterTable
ALTER TABLE "InterviewReport" ADD COLUMN     "overallScore" INTEGER,
ADD COLUMN     "opinion" TEXT,
ADD COLUMN     "technicalAnalysis" JSONB;
