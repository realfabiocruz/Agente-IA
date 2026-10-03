'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, sendMessage } from '@/lib/api';
import { STATUS_LABEL, type InterviewState } from '@/lib/types';
import { useUser } from './user-context';

type Bubble = { key: string; speaker: 'AGENT' | 'CANDIDATE'; text: string; pending?: boolean };

const DONE_STATUSES = ['COMPLETED', 'EVALUATING', 'READY_FOR_REVIEW', 'REVIEWED'];

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Tela cheia da entrevista. A mesma tela serve à rota interceptada (sobreposta)
 * e à página direta (recarregar ou link do convite).
 */
export function InterviewScreen({ id, overlay = false }: { id: string; overlay?: boolean }) {
  const router = useRouter();
  const { user, ready } = useUser();
  const [state, setState] = useState<InterviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const kickedOff = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<InterviewState>(`/interviews/${id}`);
      setState(s);
      setLoadedAt(Date.now());
      setBubbles(s.turns.map((t) => ({ key: `t${t.seq}`, speaker: t.speaker, text: t.text })));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Escolha um usuário no topo da página.' : String((e as Error).message));
    }
  }, [id]);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  // Relógio discreto: só anda enquanto a entrevista está ativa.
  useEffect(() => {
    if (!state?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state?.running]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles]);

  // Fechar a aba ou sair da página deixa a entrevista pausada (retomável pela mesma URL).
  useEffect(() => {
    if (state?.status !== 'IN_PROGRESS') return;
    const onHide = () => {
      api(`/interviews/${id}/pause`, { method: 'POST', keepalive: true }).catch(() => {});
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [state?.status, id]);

  const talk = useCallback(
    async (text: string) => {
      setSending(true);
      setError(null);
      const agentKey = `a${Date.now()}`;
      setBubbles((b) => [
        ...b,
        ...(text ? [{ key: `c${Date.now()}`, speaker: 'CANDIDATE' as const, text }] : []),
        { key: agentKey, speaker: 'AGENT', text: '', pending: true },
      ]);
      try {
        await sendMessage(id, text, {
          onDelta: (d) => setBubbles((b) => b.map((x) => (x.key === agentKey ? { ...x, text: x.text + d } : x))),
        });
        await load();
      } catch (e) {
        setError((e as Error).message);
        setBubbles((b) => b.filter((x) => !(x.key === agentKey && !x.text)));
        if (text) setDraft(text);
      } finally {
        setSending(false);
      }
    },
    [id, load],
  );

  // Depois do consentimento, o agente abre a conversa.
  useEffect(() => {
    if (state?.status === 'CONSENTED' && !kickedOff.current) {
      kickedOff.current = true;
      talk('');
    }
  }, [state?.status, talk]);

  const close = async () => {
    if (state?.status === 'IN_PROGRESS') {
      const ok = window.confirm('Sair agora? A entrevista fica pausada e você pode retomar por este mesmo link até ' + new Date(state.expiresAt).toLocaleDateString('pt-BR') + '.');
      if (!ok) return;
      await api(`/interviews/${id}/pause`, { method: 'POST' }).catch(() => {});
    }
    if (overlay) router.back();
    else router.push('/');
  };

  const finish = async (reason: 'pedido_do_candidato' | 'rota_humana') => {
    const msg =
      reason === 'rota_humana'
        ? 'Encerrar com o agente e pedir avaliação com uma pessoa?'
        : 'Encerrar a entrevista agora? O que já foi conversado será avaliado.';
    if (!window.confirm(msg)) return;
    try {
      await api(`/interviews/${id}/finish`, { method: 'POST', body: { reason } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    talk(text);
  };

  const elapsed = state ? state.elapsedMs + (state.running ? now - loadedAt : 0) : 0;
  const blockIdx = state ? state.plan.findIndex((p) => p.block === state.block) : -1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Entrevista">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-500">Entrevista com agente de IA</p>
          <h1 className="truncate font-semibold">{state?.skill.name ?? 'Carregando…'}</h1>
        </div>
        {state?.status === 'IN_PROGRESS' || state?.status === 'PAUSED' ? (
          <div className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Blocos da entrevista">
            {state.plan.map((p, i) => (
              <span
                key={p.block}
                title={`${p.label} (~${p.minutes} min)`}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  i < blockIdx ? 'bg-brand-100 text-brand-700' : i === blockIdx ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {p.label}
              </span>
            ))}
          </div>
        ) : null}
        {state?.status === 'IN_PROGRESS' ? (
          <span className="ml-auto font-mono text-sm text-gray-500 sm:ml-2" title="Tempo de conversa">
            {clock(elapsed)} / {state.totalMinutes}:00
          </span>
        ) : null}
        <button
          onClick={close}
          className={`${state?.status === 'IN_PROGRESS' ? '' : 'ml-auto'} rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100`}
        >
          {state?.status === 'IN_PROGRESS' ? 'Pausar e sair' : 'Fechar'}
        </button>
      </div>

      {error ? <div className="bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div> : null}

      {!ready || (!state && !error) ? (
        <p className="m-auto text-gray-500">Carregando…</p>
      ) : !user ? (
        <p className="m-auto text-gray-600">Escolha um usuário no topo da página para continuar.</p>
      ) : state?.status === 'CREATED' ? (
        <Consent state={state} onDone={load} onHuman={() => finish('rota_humana')} />
      ) : state?.status === 'PAUSED' ? (
        <div className="m-auto max-w-md space-y-4 p-6 text-center">
          <h2 className="text-lg font-semibold">Entrevista pausada</h2>
          <p className="text-gray-600">
            Você parou no bloco <strong>{state.blockLabel}</strong>. Pode retomar até{' '}
            {new Date(state.expiresAt).toLocaleDateString('pt-BR')}.
          </p>
          <button
            onClick={async () => {
              await api(`/interviews/${id}/resume`, { method: 'POST' });
              await load();
            }}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Retomar entrevista
          </button>
        </div>
      ) : state && ['EXPIRED', 'CANCELLED'].includes(state.status) ? (
        <div className="m-auto max-w-md space-y-2 p-6 text-center">
          <h2 className="text-lg font-semibold">{STATUS_LABEL[state.status]}</h2>
          <p className="text-gray-600">
            {state.endReason === 'rota_humana'
              ? 'Você pediu avaliação com uma pessoa. As orientações ficam em "Minhas avaliações" na plataforma.'
              : 'Esta entrevista não está mais disponível. Você pode iniciar outra para o mesmo skill.'}
          </p>
        </div>
      ) : state ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-3" aria-live="polite">
              {bubbles.map((b) => (
                <div
                  key={b.key}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 leading-relaxed ${
                    b.speaker === 'AGENT' ? 'self-start bg-gray-100 text-gray-900' : 'self-end bg-brand-600 text-white'
                  }`}
                >
                  {b.text || (b.pending ? <span className="animate-pulse text-gray-500">digitando…</span> : null)}
                </div>
              ))}
              {DONE_STATUSES.includes(state.status) ? <Finished state={state} id={id} /> : null}
            </div>
          </div>

          {state.status === 'IN_PROGRESS' || state.status === 'CONSENTED' ? (
            <div className="border-t border-gray-200 bg-white px-4 py-3">
              <div className="mx-auto flex max-w-2xl flex-col gap-2">
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Escreva sua resposta (Enter envia, Shift+Enter quebra linha)"
                    className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
                    disabled={sending}
                    aria-label="Sua resposta"
                  />
                  <button
                    onClick={submit}
                    disabled={sending || !draft.trim()}
                    className="self-end rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                  >
                    Enviar
                  </button>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <button onClick={() => finish('rota_humana')} className="underline hover:text-gray-800">
                    Prefiro falar com uma pessoa
                  </button>
                  <button onClick={() => finish('pedido_do_candidato')} className="underline hover:text-gray-800">
                    Encerrar entrevista
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Consent({ state, onDone, onHuman }: { state: InterviewState; onDone: () => void; onHuman: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [voicePref, setVoicePref] = useState<'MALE' | 'FEMALE' | 'RANDOM'>('RANDOM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    try {
      await api(`/interviews/${state.id}/consent`, { method: 'POST', body: { accepted: true, mode: 'TEXT', voicePref } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
          Você vai conversar com um <strong>agente de inteligência artificial</strong>. A conversa leva cerca de{' '}
          {state.totalMinutes} minutos, uma pergunta por vez, e é sempre conferida por uma pessoa.
        </div>
        <section>
          <h2 className="mb-2 font-semibold">Termo de consentimento</h2>
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-4 text-sm text-gray-700">
            {state.consent.text.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Modo</legend>
            <label className="mr-4 text-sm">
              <input type="radio" checked readOnly className="mr-1" /> Texto
            </label>
            <label className="text-sm text-gray-400" title="Disponível na próxima etapa da PoC">
              <input type="radio" disabled className="mr-1" /> Voz (em breve)
            </label>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Voz do agente (para o modo voz)</legend>
            {(
              [
                ['FEMALE', 'Feminina'],
                ['MALE', 'Masculina'],
                ['RANDOM', 'Aleatória'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="mr-4 text-sm">
                <input type="radio" name="voice" checked={voicePref === v} onChange={() => setVoicePref(v)} className="mr-1" />
                {label}
              </label>
            ))}
          </fieldset>
        </section>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
          Li o termo acima e aceito fazer a entrevista com o agente de IA.
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={start}
            disabled={!accepted || busy}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Começar entrevista
          </button>
          <button onClick={onHuman} className="text-sm text-gray-600 underline">
            Prefiro ser avaliado por uma pessoa
          </button>
        </div>
      </div>
    </div>
  );
}

function Finished({ state, id }: { state: InterviewState; id: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-gray-200 p-4 text-sm">
      <p className="font-medium">Entrevista concluída · {STATUS_LABEL[state.status]}</p>
      <p className="text-gray-600">
        O resultado passa por revisão humana antes de aparecer no seu perfil. Prazos e próximos passos ficam em
        &quot;Minhas avaliações&quot; na plataforma.
      </p>
      {sent ? (
        <p className="text-green-700">Contestação registrada. A resposta aparece na plataforma.</p>
      ) : open ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 px-2 py-1"
            placeholder="Conte o que você quer que seja revisto"
          />
          {error ? <p className="text-red-700">{error}</p> : null}
          <button
            onClick={async () => {
              try {
                await api(`/interviews/${id}/contestations`, { method: 'POST', body: { text } });
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            disabled={text.trim().length < 10}
            className="rounded bg-gray-800 px-3 py-1.5 text-white disabled:opacity-40"
          >
            Enviar contestação
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-gray-600 underline">
          Quero contestar o resultado
        </button>
      )}
    </div>
  );
}
