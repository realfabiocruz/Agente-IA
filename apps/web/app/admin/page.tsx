'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Skill } from '@/lib/types';
import { useUser } from '@/components/user-context';

interface Rubric {
  id: string;
  version: number;
  status: 'DRAFT' | 'APPROVED' | 'RETIRED';
  promptVersion: string;
  approvedById: string | null;
  competencies: { key: string; name: string; kind: string; weight: number; levels: Record<string, string>; anchorQuestions: string[] }[];
}

export default function AdminPage() {
  const { user } = useUser();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'ADMIN') api<Skill[]>('/skills').then((s) => {
      setSkills(s);
      setSelected((cur) => cur ?? s[0]?.id ?? null);
    });
  }, [user]);

  if (user?.role !== 'ADMIN') return <p className="text-gray-600">Entre como admin.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Rubricas por skill</h1>
      <p className="text-sm text-gray-600">
        O Claude gera um rascunho; um especialista revisa, edita e aprova. Entrevistas só usam versões aprovadas, e cada
        entrevista fica presa à versão em que foi feita.
      </p>
      <div className="flex gap-2">
        {skills.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className={`rounded-full px-3 py-1 text-sm ${selected === s.id ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-gray-200'}`}
          >
            {s.name}
          </button>
        ))}
      </div>
      {selected ? <SkillRubrics skillId={selected} /> : null}
    </div>
  );
}

function SkillRubrics({ skillId }: { skillId: string }) {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ rubrics: Rubric[] }>(`/skills/${skillId}/rubrics`).then((s) => setRubrics(s.rubrics));
  }, [skillId]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        disabled={busy}
        onClick={() => run(() => api(`/skills/${skillId}/rubrics/draft`, { method: 'POST' }))}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
      >
        {busy ? 'Gerando…' : 'Gerar rascunho com IA'}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {rubrics.map((r) => (
        <RubricCard key={r.id} rubric={r} busy={busy} run={run} />
      ))}
      {!rubrics.length ? <p className="text-sm text-gray-500">Nenhuma rubrica ainda.</p> : null}
    </div>
  );
}

function RubricCard({ rubric, busy, run }: { rubric: Rubric; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [json, setJson] = useState(() =>
    JSON.stringify(
      rubric.competencies.map(({ key, name, kind, weight, levels, anchorQuestions }) => ({ key, name, kind, weight, levels, anchorQuestions })),
      null,
      2,
    ),
  );
  const [editing, setEditing] = useState(false);
  const badge = { DRAFT: 'bg-amber-100 text-amber-800', APPROVED: 'bg-green-100 text-green-800', RETIRED: 'bg-gray-100 text-gray-600' }[rubric.status];

  return (
    <article className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Versão {rubric.version}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${badge}`}>{rubric.status}</span>
        <span className="text-xs text-gray-500">{rubric.promptVersion}</span>
        {rubric.status === 'DRAFT' ? (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setEditing(!editing)} className="rounded border border-gray-300 px-3 py-1 text-sm">
              {editing ? 'Cancelar edição' : 'Editar'}
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => api(`/rubrics/${rubric.id}/approve`, { method: 'POST' }))}
              className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-40"
            >
              Aprovar versão
            </button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={20}
            className="w-full rounded border border-gray-300 p-2 font-mono text-xs"
          />
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(`/rubrics/${rubric.id}`, { method: 'PATCH', body: { competencies: JSON.parse(json) } });
                setEditing(false);
              })
            }
            className="rounded bg-gray-800 px-3 py-1 text-sm text-white"
          >
            Salvar rascunho
          </button>
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {rubric.competencies.map((c) => (
            <li key={c.key}>
              <strong>{c.name}</strong> <span className="text-gray-500">({c.key}, peso {c.weight})</span>
              <ul className="list-disc pl-5 text-gray-600">
                {c.anchorQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
