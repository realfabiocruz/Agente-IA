// Cliente da API do entrevistador. O agente de voz não decide nada sobre a
// entrevista: cada fala transcrita vai para o mesmo endpoint do modo texto,
// que valida ferramentas, controla o tempo e guarda a transcrição.
const API_URL = process.env.INTERVIEW_API_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

export interface TurnResult {
  block: string;
  ended: boolean;
  status: string;
}

function headers(userId: string) {
  return { 'content-type': 'application/json', 'x-user-id': userId };
}

/** Envia a fala do candidato e repassa os trechos da resposta conforme chegam. */
export async function streamMessage(
  userId: string,
  interviewId: string,
  text: string,
  onDelta: (t: string) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  // A API processa uma fala por vez. Se uma chamada anterior (interrompida pelo
  // candidato) ainda está terminando, espera um pouco e tenta de novo.
  for (let attempt = 0; ; attempt++) {
    try {
      return await streamOnce(userId, interviewId, text, onDelta, signal);
    } catch (e) {
      const busy = e instanceof Error && e.message.includes('Aguarde a resposta anterior');
      if (!busy || attempt >= 30 || signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function streamOnce(
  userId: string,
  interviewId: string,
  text: string,
  onDelta: (t: string) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const res = await fetch(`${API_URL}/interviews/${interviewId}/messages`, {
    method: 'POST',
    headers: headers(userId),
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`API ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: TurnResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === 'delta') onDelta(payload.text);
      else if (event === 'done') result = payload;
      else if (event === 'error') throw new Error(payload.message);
    }
  }
  if (!result) throw new Error('A conexão com a API caiu antes de a resposta terminar');
  return result;
}

export async function post(userId: string, path: string): Promise<void> {
  await fetch(`${API_URL}${path}`, { method: 'POST', headers: headers(userId), body: '{}' }).catch(() => {});
}

export async function turnCount(userId: string, interviewId: string): Promise<number> {
  const res = await fetch(`${API_URL}/interviews/${interviewId}`, { headers: headers(userId) });
  if (!res.ok) return 0;
  const state = (await res.json()) as { turns?: unknown[] };
  return state.turns?.length ?? 0;
}
