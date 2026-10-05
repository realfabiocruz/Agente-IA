import { fileURLToPath } from 'node:url';
import { type JobContext, ServerOptions, cli, defineAgent, inference, llm, voice } from '@livekit/agents';
import { post, streamMessage, turnCount } from './backend.js';

// Vozes pt-BR do Gradium (LiveKit Inference): Bianca e Mateus, da biblioteca de
// vozes do Gradium. Dá para trocar por variável de ambiente.
const FEMALE_VOICE = process.env.VOICE_FEMALE_ID ?? 'uCqxlQCKi8sPHwG2';
const MALE_VOICE = process.env.VOICE_MALE_ID ?? 'AByHrwi1S-yLzW-s';

interface RoomMeta {
  interviewId: string;
  userId: string;
  voicePref?: 'MALE' | 'FEMALE' | 'RANDOM' | null;
}

function pickVoice(pref: RoomMeta['voicePref'], interviewId: string) {
  if (pref === 'MALE') return MALE_VOICE;
  if (pref === 'FEMALE') return FEMALE_VOICE;
  // "Aleatória": estável por entrevista, para a voz não mudar ao retomar.
  return interviewId.charCodeAt(0) % 2 ? MALE_VOICE : FEMALE_VOICE;
}

// Depois que a vez fecha, espera mais um pouco antes de mandar a resposta para a API. Se a pessoa
// voltar a falar nesse intervalo (uma pausa para respirar), a fala é somada à anterior e a IA não responde ainda.
const RESUME_GRACE_MS = 1500;

class InterviewAgent extends voice.Agent {
  ended = false;
  /** Última atividade da pessoa (início de fala ou transcrição), em ms. */
  lastUserActivity = 0;
  /** Falas já fechadas que ainda não foram enviadas à API porque a pessoa continuou falando. */
  private pending = '';
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  /** Chamado se a pessoa 'retomou' mas ninguém falou depois (transcrição atrasada): responde mesmo assim. */
  onStall: () => void = () => {};

  constructor(private meta: RoomMeta) {
    // As instruções ficam no backend (rubrica, blocos, tempo); aqui só um rótulo.
    super({ instructions: 'Entrevistador Whizz. A conversa é conduzida pela API da entrevista.' });
  }

  override async llmNode(chatCtx: llm.ChatContext) {
    const lastUser = [...chatCtx.items].reverse().find((i) => i.type === 'message' && i.role === 'user');
    let text = lastUser && lastUser.type === 'message' ? (lastUser.textContent ?? '').trim() : '';
    const { meta } = this;
    clearTimeout(this.stallTimer);
    if (text) {
      const waitFrom = Date.now();
      while (Date.now() - waitFrom < RESUME_GRACE_MS && this.lastUserActivity <= waitFrom) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.lastUserActivity > waitFrom) {
        // A pessoa continuou: guarda o que já disse e não responde; a próxima vez fechada envia tudo junto.
        this.pending = text.startsWith(this.pending) ? text : `${this.pending} ${text}`.trim();
        this.stallTimer = setTimeout(() => this.onStall(), 6000);
        return new ReadableStream<string>({ start: (c) => c.close() }) as unknown as Awaited<ReturnType<voice.Agent['llmNode']>>;
      }
      if (this.pending && !text.startsWith(this.pending)) text = `${this.pending} ${text}`.trim();
      this.pending = '';
    }
    const abort = new AbortController();
    let closed = false;
    const stream = new ReadableStream<string>({
      start: async (controller) => {
        const push = (t: string) => {
          if (!closed) controller.enqueue(t);
        };
        try {
          const result = await streamMessage(meta.userId, meta.interviewId, text, push, abort.signal);
          this.ended = result.ended;
        } catch (e) {
          if (!abort.signal.aborted) {
            console.error('[voz] falha ao falar com a API', e);
            push('Tive um problema de conexão. Pode repetir, por favor?');
          }
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel: () => {
        closed = true;
        abort.abort();
      },
    });
    return stream as unknown as Awaited<ReturnType<voice.Agent['llmNode']>>;
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const meta = JSON.parse(participant.metadata || ctx.room.metadata || '{}') as RoomMeta;
    if (!meta.interviewId || !meta.userId) {
      console.error('[voz] sala sem interviewId/userId nos metadados');
      return;
    }

    const session = new voice.AgentSession({
      stt: new inference.STT({ model: 'deepgram/nova-3', language: 'pt-BR' }),
      // O LLM é obrigatório no pipeline, mas llmNode o substitui pela API.
      llm: new inference.LLM({ model: 'openai/gpt-4.1-mini' }),
      // O backend guarda cada fala e não é idempotente: nada de gerar resposta antes de a vez fechar.
      // CPU pequena: sem o VAD local (Silero) e sem gravação (ffmpeg); o fim da fala vem da transcrição.
      vad: null,
      // Entrevista: o candidato responde com calma e precisa poder respirar. Espera 2,5s de silêncio para
      // fechar a vez (o padrão de 0,5s picotava a resposta) e o llmNode ainda dá mais 1,5s de tolerância.
      turnHandling: {
        turnDetection: 'stt',
        endpointing: { mode: 'fixed', minDelay: 2500, maxDelay: 8000 },
        // Se a pessoa volta a falar com a IA já respondendo, a IA cala e ouve. Sem VAD local, quem decide é a
        // transcrição: só vale a partir de 3 palavras (ruído e "hum" não cortam). Se a pessoa calar logo depois,
        // a IA retoma de onde parou.
        interruption: { enabled: true, mode: 'vad', minWords: 3, minDuration: 300, falseInterruptionTimeout: 2000, resumeFalseInterruption: true },
        preemptiveGeneration: { enabled: false },
      },
      tts: new inference.TTS({ model: 'gradium/default', voice: pickVoice(meta.voicePref, meta.interviewId), language: 'pt' }),
    });
    const agent = new InterviewAgent(meta);
    agent.onStall = () => session.generateReply();

    // Qualquer sinal de fala da pessoa marca atividade, para o llmNode saber se ela retomou a fala.
    const touch = () => {
      agent.lastUserActivity = Date.now();
    };
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, touch);
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.newState === 'speaking') touch();
    });

    // Fechar a aba ou perder a conexão pausa a entrevista, como no modo texto.
    ctx.room.on('participantDisconnected', () => {
      void post(meta.userId, `/interviews/${meta.interviewId}/pause`);
      ctx.shutdown('candidato saiu');
    });

    // Depois da despedida, encerra a sala quando o agente terminar de falar.
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (agent.ended && ev.newState === 'listening') ctx.shutdown('entrevista encerrada');
    });

    await session.start({ agent, room: ctx.room, record: false });
    if ((await turnCount(meta.userId, meta.interviewId)) === 0) {
      // Abertura: texto vazio faz o backend iniciar a conversa.
      session.generateReply();
    } else {
      session.say('Voltamos à nossa conversa. Quando quiser, pode continuar de onde parou.');
    }
  },
});

// Instância pequena (pouca CPU e memória): um processo de trabalho pré-aquecido
// e tempo folgado para ele iniciar, senão a inicialização estoura os 10s padrão.
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    numIdleProcesses: 1,
    initializeProcessTimeout: 120_000,
    // Num deploy, a versão antiga não fica meia hora esperando as salas abertas.
    drainTimeout: 15_000,
    // Em serviço web do Render o processo precisa abrir a porta $PORT.
    port: Number(process.env.PORT ?? 8081),
  }),
);
