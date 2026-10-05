'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABEL, type InterviewStatus } from '@/lib/types';
import { useUser } from '@/components/user-context';

interface Dossier {
  id: string;
  status: InterviewStatus;
  candidate: { name: string };
  skill: { id: string; name: string };
  rubric: { version: number; competencies: { key: string; name: string; kind: string; weight: number; levels: Record<string, string> }[] };
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  activeMs: number;
  turns: { seq: number; speaker: 'AGENT' | 'CANDIDATE'; block: string; text: string; startMs: number }[];
  evidences: { id: string; competencyKey: string; turnSeq: number; startMs: number; quote: string; note: string | null; source: string }[];
  scores: { competencyKey: string; score: number | null; justification: string; evidenceIds: string[] }[];
  report: {
    weightedScore: number | null;
    coverage: number;
    summary: string;
    overallScore: number | null;
    opinion: string | null;
    technicalAnalysis: { correct: string[]; incorrect: string[]; gaps: string[] } | null;
    pointsToCheck: string[];
    model: string;
    promptVersion: string;
  } | null;
  reviews: { id: string; reviewerId: string; decision: string; notes: string | null; adjustments: unknown; createdAt: string }[];
  contestations: { id: string; text: string; status: string; dueAt: string }[];
  events: { id: string; type: string; payload: unknown; at: string }[];
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const [d, setD] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Dossier>(`/interviews/${id}/report`).then(setD).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (user && user.role !== 'CANDIDATE') load();
  }, [user, load]);

  if (!user || user.role === 'CANDIDATE') return <p className="text-gray-600">Entre como revisora ou admin.</p>;
  if (error) return <p className="text-red-700">{error}</p>;
  if (!d) return null;

  const evidenceById = new Map(d.evidences.map((e) => [e.id, e]));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-gray-500">
          {d.skill.name} · rubrica v{d.rubric.version} · {STATUS_LABEL[d.status]}
        </p>
        <h1 className="text-2xl font-semibold">{d.candidate.name}</h1>
        <p className="text-sm text-gray-600">
          Duração {mmss(d.activeMs)} · encerrada por {d.endReason ?? '—'}
          {d.report ? ` · avaliador ${d.report.model} (${d.report.promptVersion})` : ''}
        </p>
      </header>

      {d.report ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200 sm:col-span-3">
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-semibold">{d.report.overallScore ?? '—'}</p>
              <p className="text-sm text-gray-500">nota técnica de 1 a 10, só pelo acerto das respostas</p>
            </div>
            {d.report.opinion ? <p className="mt-3 text-sm text-gray-800">{d.report.opinion}</p> : null}
            {d.report.technicalAnalysis ? (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                {(
                  [
                    ['Acertos', d.report.technicalAnalysis.correct, 'text-green-800'],
                    ['Erros ou imprecisões', d.report.technicalAnalysis.incorrect, 'text-red-800'],
                    ['Lacunas', d.report.technicalAnalysis.gaps, 'text-amber-800'],
                  ] as const
                ).map(([title, items, color]) => (
                  <div key={title}>
                    <p className={`font-medium ${color}`}>{title}</p>
                    <ul className="list-disc pl-4 text-gray-700">
                      {items.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">Nota ponderada</p>
            <p className="text-3xl font-semibold">{d.report.weightedScore ?? '—'}</p>
            <p className="text-xs text-gray-500">de 1 a 4, só sobre competências pontuadas</p>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">Cobertura</p>
            <p className="text-3xl font-semibold">{Math.round(d.report.coverage * 100)}%</p>
            <p className="text-xs text-gray-500">do peso da rubrica efetivamente explorado</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-gray-200 sm:row-span-2">
            <p className="mb-2 font-medium">Pontos para conferir</p>
            <ul className="list-disc space-y-1 pl-4 text-gray-700">
              {d.report.pointsToCheck.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
          <p className="rounded-xl bg-white p-4 text-sm text-gray-700 ring-1 ring-gray-200 sm:col-span-2">{d.report.summary}</p>
        </section>
      ) : (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">O dossiê ainda não foi gerado.</p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Competências</h2>
        {d.rubric.competencies.map((c) => {
          const s = d.scores.find((x) => x.competencyKey === c.key);
          return (
            <article key={c.key} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
              <div className="flex items-baseline gap-3">
                <h3 className="font-medium">{c.name}</h3>
                <span className="text-xs text-gray-500">peso {c.weight}</span>
                <span className="ml-auto text-xl font-semibold">{s?.score ?? 'N/A'}</span>
              </div>
              {s ? <p className="mt-1 text-sm text-gray-700">{s.justification}</p> : null}
              <ul className="mt-2 space-y-1 text-sm">
                {s?.evidenceIds.map((eid) => {
                  const e = evidenceById.get(eid);
                  return e ? (
                    <li key={eid} className="border-l-2 border-brand-500 pl-2 text-gray-800">
                      “{e.quote}”{' '}
                      <a href={`#turno-${e.turnSeq}`} className="text-xs text-brand-600 underline">
                        turno {e.turnSeq} · {mmss(e.startMs)}
                      </a>
                    </li>
                  ) : null;
                })}
              </ul>
              <details className="mt-2 text-xs text-gray-600">
                <summary className="cursor-pointer">Descritores de nível</summary>
                <ol className="mt-1 space-y-1">
                  {Object.entries(c.levels).map(([lvl, txt]) => (
                    <li key={lvl}>
                      <strong>{lvl}.</strong> {txt}
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          );
        })}
      </section>

      {['READY_FOR_REVIEW', 'REVIEWED'].includes(d.status) ? <ReviewForm d={d} onDone={load} /> : null}

      {d.reviews.length || d.contestations.length ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-lg font-semibold">Revisões</h2>
            <ul className="space-y-2 text-sm">
              {d.reviews.map((r) => (
                <li key={r.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-200">
                  <strong>{r.decision}</strong> por {r.reviewerId} em {new Date(r.createdAt).toLocaleString('pt-BR')}
                  {r.notes ? <p className="text-gray-600">{r.notes}</p> : null}
                  {r.adjustments ? <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{JSON.stringify(r.adjustments, null, 1)}</pre> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-lg font-semibold">Contestações</h2>
            <ul className="space-y-2 text-sm">
              {d.contestations.map((c) => (
                <li key={c.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-200">
                  <p>{c.text}</p>
                  <p className="text-xs text-gray-500">
                    {c.status} · responder até {new Date(c.dueAt).toLocaleDateString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Transcrição</h2>
        <ol className="space-y-2 rounded-xl bg-white p-4 text-sm ring-1 ring-gray-200">
          {d.turns.map((t) => (
            <li key={t.seq} id={`turno-${t.seq}`} className="scroll-mt-20">
              <span className="font-mono text-xs text-gray-400">
                #{t.seq} {mmss(t.startMs)} {t.block}
              </span>{' '}
              <strong className={t.speaker === 'AGENT' ? 'text-gray-500' : 'text-gray-900'}>
                {t.speaker === 'AGENT' ? 'Entrevistador' : 'Profissional'}:
              </strong>{' '}
              <span className="whitespace-pre-wrap">{t.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex items-center gap-4 text-sm">
        <details className="flex-1">
          <summary className="cursor-pointer text-gray-600">Log de auditoria ({d.events.length} eventos)</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
            {d.events.map((e) => `${e.at} ${e.type} ${JSON.stringify(e.payload)}`).join('\n')}
          </pre>
        </details>
        <button
          onClick={async () => {
            await api(`/interviews/${d.id}/reevaluate`, { method: 'POST' });
            alert('Reavaliação enfileirada. Recarregue em alguns segundos.');
          }}
          className="self-start rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
        >
          Reprocessar avaliação
        </button>
      </section>
    </div>
  );
}

function ReviewForm({ d, onDone }: { d: Dossier; onDone: () => void }) {
  const [decision, setDecision] = useState<'CONFIRMED' | 'ADJUSTED' | 'INVALIDATED'>('CONFIRMED');
  const [adj, setAdj] = useState<Record<string, { score: string; reason: string }>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    setError(null);
    const adjustments = Object.entries(adj)
      .filter(([, v]) => v.score !== '')
      .map(([competencyKey, v]) => ({ competencyKey, score: v.score === 'na' ? null : Number(v.score), reason: v.reason }));
    try {
      await api(`/interviews/${d.id}/review`, {
        method: 'POST',
        body: { decision, adjustments: decision === 'ADJUSTED' ? adjustments : undefined, notes: notes || undefined },
      });
      setSaved(true);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <h2 className="text-lg font-semibold">Sua revisão</h2>
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ['CONFIRMED', 'Confirmar notas'],
            ['ADJUSTED', 'Ajustar notas'],
            ['INVALIDATED', 'Invalidar entrevista'],
          ] as const
        ).map(([v, label]) => (
          <label key={v}>
            <input type="radio" name="decision" checked={decision === v} onChange={() => setDecision(v)} className="mr-1" />
            {label}
          </label>
        ))}
      </div>
      {decision === 'ADJUSTED' ? (
        <div className="space-y-2 text-sm">
          {d.rubric.competencies.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center gap-2">
              <span className="w-64">{c.name}</span>
              <select
                value={adj[c.key]?.score ?? ''}
                onChange={(e) => setAdj({ ...adj, [c.key]: { score: e.target.value, reason: adj[c.key]?.reason ?? '' } })}
                className="rounded border border-gray-300 px-2 py-1"
              >
                <option value="">manter</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="na">N/A</option>
              </select>
              {adj[c.key]?.score ? (
                <input
                  value={adj[c.key]?.reason ?? ''}
                  onChange={(e) => setAdj({ ...adj, [c.key]: { ...adj[c.key], reason: e.target.value } })}
                  placeholder="motivo do ajuste"
                  className="flex-1 rounded border border-gray-300 px-2 py-1"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Observações (opcional)"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700">Revisão registrada.</p> : null}
      <button onClick={submit} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Registrar revisão
      </button>
    </section>
  );
}
