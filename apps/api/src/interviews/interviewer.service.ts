import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Block, Competency, InterviewTurn } from '@prisma/client';
import { ClaudeService } from '../claude/claude.service';
import { PlatformService } from '../platform/platform.service';
import { INTERVIEWER_PROMPT_VERSION, KICKOFF_MESSAGE, interviewerTools } from './interviewer.prompt';
import { mockInterviewerTurn } from './mock-interviewer';
import { ToolExecutor } from './tool-executor';

export interface TurnSink {
  delta(text: string): void;
  tool(name: string, ok: boolean): void;
}

export interface TurnInput {
  systemPrompt: string;
  budgetNote: string;
  turns: InterviewTurn[];
  block: Block;
  competencies: Competency[];
  candidateName: string;
  skillName: string;
  executor: ToolExecutor;
}

export interface TurnOutput {
  text: string;
  events: { type: string; payload: object }[];
}

const MAX_TOOL_ROUNDS = 6;
const REFUSAL_TEXT = 'Desculpe, não consegui continuar esta parte. Podemos seguir para a próxima pergunta?';

@Injectable()
export class InterviewerService {
  private readonly logger = new Logger(InterviewerService.name);

  constructor(
    private readonly claude: ClaudeService,
    private readonly platform: PlatformService,
  ) {}

  async runTurn(input: TurnInput, sink: TurnSink): Promise<TurnOutput> {
    return this.claude.mode === 'live' ? this.runLive(input, sink) : this.runMock(input, sink);
  }

  /** Histórico só com o texto dos turnos gravados; a fala do candidato vai sempre como mensagem de usuário. */
  private history(turns: InterviewTurn[]): Anthropic.Beta.BetaMessageParam[] {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: KICKOFF_MESSAGE }];
    for (const t of turns) {
      const role = t.speaker === 'AGENT' ? 'assistant' : 'user';
      const prev = messages[messages.length - 1];
      if (prev.role === role && typeof prev.content === 'string') {
        prev.content = `${prev.content}\n\n${t.text}`;
      } else {
        messages.push({ role, content: t.text });
      }
    }
    return messages;
  }

  private async runLive(input: TurnInput, sink: TurnSink): Promise<TurnOutput> {
    const client = this.claude.requireClient();
    const model = this.claude.models.interviewer;
    const tools = interviewerTools(input.competencies.map((c) => c.key));
    const events: TurnOutput['events'] = [];
    const messages = this.history(input.turns);
    // Orçamento de tempo calculado pelo backend, como mensagem de sistema no meio
    // da conversa: não invalida o cache do bloco fixo.
    messages.push({ role: 'system', content: input.budgetNote });

    let text = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let roundHasText = false;
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 8000,
        system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
        output_config: { effort: (process.env.INTERVIEWER_EFFORT as 'low' | 'medium' | 'high') ?? 'low' },
        betas: this.claude.fallback.betas,
        fallbacks: this.claude.fallback.fallbacks,
      });
      stream.on('text', (delta) => {
        if (!roundHasText && text) {
          text += '\n\n';
          sink.delta('\n\n');
        }
        roundHasText = true;
        text += delta;
        sink.delta(delta);
      });
      const message = await stream.finalMessage();
      events.push({
        type: 'llm_call',
        payload: {
          role: 'interviewer',
          model: message.model,
          promptVersion: INTERVIEWER_PROMPT_VERSION,
          stopReason: message.stop_reason,
          usage: message.usage as unknown as object,
        },
      });

      if (message.stop_reason === 'refusal') {
        this.logger.warn(`Recusa do modelo: ${JSON.stringify(message.stop_details)}`);
        if (!text) {
          text = REFUSAL_TEXT;
          sink.delta(text);
        }
        break;
      }

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (toolUses.length === 0) break;
      if (message.stop_reason === 'max_tokens') {
        events.push({ type: 'error', payload: { message: 'entrada de ferramenta truncada (max_tokens)' } });
        break;
      }

      messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t) => {
        const r = input.executor.run(t.name, t.input);
        sink.tool(t.name, !r.isError);
        return { type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.isError };
      });
      messages.push({ role: 'user', content: results });

      // Despedida já escrita e encerramento pedido: não precisa de outra ida ao modelo.
      if (input.executor.ended && text.trim()) break;
    }
    return { text: text.trim(), events };
  }

  private async runMock(input: TurnInput, sink: TurnSink): Promise<TurnOutput> {
    const turn = mockInterviewerTurn({
      block: input.block,
      turns: input.turns,
      competencies: input.competencies,
      candidateName: input.candidateName,
      skillName: input.skillName,
      manual: (q) => this.platform.manualFor(q),
    });
    for (const a of turn.actions) {
      const r = input.executor.run(a.tool, a.input);
      sink.tool(a.tool, !r.isError);
    }
    // Simula streaming palavra a palavra.
    for (const word of turn.text.split(/(?<=\s)/)) {
      sink.delta(word);
      await new Promise((r) => setTimeout(r, 15));
    }
    return {
      text: turn.text,
      events: [{ type: 'llm_call', payload: { role: 'interviewer', model: 'mock', promptVersion: 'mock-v1' } }],
    };
  }
}
