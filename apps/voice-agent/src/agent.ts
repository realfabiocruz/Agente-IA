import { fileURLToPath } from 'node:url';
import { type JobContext, ServerOptions, cli, defineAgent, inference, llm, voice } from '@livekit/agents';
import { post, streamMessage, turnCount } from './backend.js';

// Vozes pt-BR do Gradium (LiveKit Inference). O id da masculina (Mateus) vem
// da biblioteca de vozes do Gradium; sem ele, usa a feminina.
const FEMALE_VOICE = process.env.VOICE_FEMALE_ID ?? '4SZHfMpw-p23BW89';
const MALE_VOICE = process.env.VOICE_MALE_ID ?? FEMALE_VOICE;

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

class InterviewAgent extends voice.Agent {
  ended = false;

  constructor(private meta: RoomMeta) {
    // As instruções ficam no backend (rubrica, blocos, tempo); aqui só um rótulo.
    super({ instructions: 'Entrevistador Whizz. A conversa é conduzida pela API da entrevista.' });
  }

  override async llmNode(chatCtx: llm.ChatContext) {
    const lastUser = [...chatCtx.items].reverse().find((i) => i.type === 'message' && i.role === 'user');
    const text = lastUser && lastUser.type === 'message' ? (lastUser.textContent ?? '').trim() : '';
    const { meta } = this;
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
      turnHandling: { preemptiveGeneration: { enabled: false } },
      tts: new inference.TTS({ model: 'gradium/default', voice: pickVoice(meta.voicePref, meta.interviewId), language: 'pt' }),
    });
    const agent = new InterviewAgent(meta);

    // Fechar a aba ou perder a conexão pausa a entrevista, como no modo texto.
    ctx.room.on('participantDisconnected', () => {
      void post(meta.userId, `/interviews/${meta.interviewId}/pause`);
      ctx.shutdown('candidato saiu');
    });

    // Depois da despedida, encerra a sala quando o agente terminar de falar.
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (agent.ended && ev.newState === 'listening') ctx.shutdown('entrevista encerrada');
    });

    await session.start({ agent, room: ctx.room });
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
    // Em serviço web do Render o processo precisa abrir a porta $PORT.
    port: Number(process.env.PORT ?? 8081),
  }),
);
