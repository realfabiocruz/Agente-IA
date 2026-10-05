-- CreateEnum
CREATE TYPE "QuestionMode" AS ENUM ('AI_DRIVEN', 'GUIDED');

-- AlterTable
ALTER TABLE "SkillRubric" ADD COLUMN     "questionMode" "QuestionMode" NOT NULL DEFAULT 'AI_DRIVEN',
ADD COLUMN     "standardQuestions" JSONB NOT NULL DEFAULT '[]';
