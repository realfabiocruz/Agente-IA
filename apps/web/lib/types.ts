export type Role = 'CANDIDATE' | 'REVIEWER' | 'ADMIN';
export interface MockUser {
  id: string;
  name: string;
  role: Role;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  approvedRubricVersion: number | null;
}

export type InterviewStatus =
  | 'CREATED'
  | 'CONSENTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'EVALUATING'
  | 'READY_FOR_REVIEW'
  | 'REVIEWED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface InterviewListItem {
  id: string;
  status: InterviewStatus;
  skill: { id: string; name: string };
  rubricVersion: number;
  candidate: { id: string; name: string };
  createdAt: string;
  endedAt: string | null;
  weightedScore?: number | null;
  coverage?: number;
}

export interface InterviewState {
  id: string;
  status: InterviewStatus;
  skill: { id: string; name: string };
  rubricVersion: number;
  block: string;
  blockLabel: string;
  blockStartMs: number;
  plan: { block: string; minutes: number; label: string }[];
  totalMinutes: number;
  elapsedMs: number;
  running: boolean;
  expiresAt: string;
  endReason: string | null;
  consent: { version: string; text: string; acceptedAt: string | null };
  turns: { seq: number; speaker: 'AGENT' | 'CANDIDATE'; block: string; text: string }[];
}

export const STATUS_LABEL: Record<InterviewStatus, string> = {
  CREATED: 'Não iniciada',
  CONSENTED: 'Pronta para começar',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  EVALUATING: 'Em avaliação',
  READY_FOR_REVIEW: 'Aguardando revisão',
  REVIEWED: 'Revisada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};
