'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const USER_KEY = 'whizz.mockUser';

/** Login simulado: o id do usuário fica no navegador e vai no header x-user-id. */
export function getUserId(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function setUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(USER_KEY, id);
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* sem armazenamento: o usuário escolhe de novo */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-user-id': getUserId() ?? '' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    keepalive: init.keepalive,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
    } catch {
      /* corpo vazio */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export interface StreamHandlers {
  onDelta(text: string): void;
  onTool?(name: string, ok: boolean): void;
}

export interface MessageResult {
  block: string;
  ended: boolean;
  status: string;
}

/** Envia a fala e lê a resposta do agente em SSE (sobre POST). */
export async function sendMessage(interviewId: string, text: string, handlers: StreamHandlers): Promise<MessageResult> {
  const res = await fetch(`${API_URL}/interviews/${interviewId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': getUserId() ?? '' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: MessageResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === 'delta') handlers.onDelta(payload.text);
      else if (event === 'tool') handlers.onTool?.(payload.name, payload.ok);
      else if (event === 'done') result = payload;
      else if (event === 'error') throw new ApiError(payload.status, payload.message);
    }
  }
  if (!result) throw new ApiError(500, 'A conexão caiu antes da resposta terminar');
  return result;
}
