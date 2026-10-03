import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export type LlmMode = 'live' | 'mock';

/**
 * Cliente único da API Claude. Sem ANTHROPIC_API_KEY (ou com LLM_MODE=mock) a PoC
 * usa entrevistador e avaliador roteirizados, para rodar sem custo e em testes.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  readonly mode: LlmMode;
  readonly client: Anthropic | null;

  readonly models = {
    interviewer: process.env.INTERVIEWER_MODEL ?? 'claude-sonnet-5-5',
    evaluator: process.env.EVALUATOR_MODEL ?? 'claude-opus-5-5',
    rubric: process.env.RUBRIC_MODEL ?? 'claude-opus-5-5',
  };

  /** Fallback do lado do servidor quando um classificador recusa a resposta. */
  readonly fallback = {
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
  };

  constructor() {
    const forced = process.env.LLM_MODE as LlmMode | undefined;
    this.mode = forced === 'mock' || forced === 'live' ? forced : process.env.ANTHROPIC_API_KEY ? 'live' : 'mock';
    this.client = this.mode === 'live' ? new Anthropic() : null;
    this.logger.log(`Modo do LLM: ${this.mode}`);
  }

  requireClient(): Anthropic {
    if (!this.client) throw new Error('Cliente Claude indisponível em modo mock');
    return this.client;
  }
}
