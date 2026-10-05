'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABEL, type InterviewListItem, type Skill } from '@/lib/types';
import { useUser } from '@/components/user-context';

export default function Home() {
  const { user, ready } = useUser();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mine, setMine] = useState<InterviewListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<Skill[]>('/skills').then(setSkills).catch((e) => setError(e.message));
    api<InterviewListItem[]>('/interviews').then(setMine).catch((e) => setError(e.message));
  }, [user]);

  if (!ready) return null;
  if (!user) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Entrevistas por skill</h1>
        <p className="text-gray-600">
          Prova de conceito do agente entrevistador em modo texto. O login é simulado: escolha um usuário no topo da
          página. Ana e Bruno são profissionais; Rita revisa dossiês; Admin cuida das rubricas.
        </p>
      </section>
    );
  }

  const start = async (skillId: string) => {
    setStarting(skillId);
    try {
      const { id } = await api<{ id: string }>('/interviews', { method: 'POST', body: { skillId } });
      router.push(`/entrevistas/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="space-y-10">
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {user.role === 'CANDIDATE' ? (
        <section>
          <h1 className="mb-1 text-2xl font-semibold">Olá, {user.name.split(' ')[0]}</h1>
          <p className="mb-4 text-gray-600">Escolha um skill para fazer a entrevista com o agente. Cada skill tem sua própria entrevista curta.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {skills.map((s) => (
              <div key={s.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="font-semibold">{s.name}</h2>
                <p className="mb-4 flex-1 text-sm text-gray-600">{s.description}</p>
                <button
                  onClick={() => start(s.id)}
                  disabled={!s.approvedRubricVersion || starting === s.id}
                  className="self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  {s.approvedRubricVersion ? 'Fazer entrevista' : 'Rubrica em preparação'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold">Olá, {user.name.split(' ')[0]}</h1>
          <p className="text-gray-600">
            Confira os dossiês em <Link href="/revisao" className="text-brand-600 underline">Revisão</Link>
            {user.role === 'ADMIN' ? (
              <>
                {' '}e prepare rubricas em <Link href="/admin" className="text-brand-600 underline">Rubricas</Link>
              </>
            ) : null}
            . Ranking por skill:{' '}
            {skills.map((s, i) => (
              <span key={s.id}>
                {i ? ', ' : ''}
                <Link href={`/ranking/${s.id}`} className="text-brand-600 underline">
                  {s.name}
                </Link>
              </span>
            ))}
            .
          </p>
        </section>
      )}

      {user.role === 'CANDIDATE' && mine.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Minhas entrevistas</h2>
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {mine.map((iv) => (
              <li key={iv.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">{iv.skill.name}</span>
                <span className="text-gray-500">{new Date(iv.createdAt).toLocaleString('pt-BR')}</span>
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs">{STATUS_LABEL[iv.status]}</span>
                <Link href={`/entrevistas/${iv.id}`} className="text-brand-600 underline">
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
