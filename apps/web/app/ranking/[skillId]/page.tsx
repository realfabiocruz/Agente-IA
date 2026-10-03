'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/components/user-context';

interface Ranking {
  skill: { id: string; name: string };
  rubricVersion: number;
  rows: {
    interviewId: string;
    candidate: { name: string };
    weightedScore: number | null;
    coverage: number;
    notAssessed: string[];
    decision: string;
  }[];
}

export default function RankingPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = use(params);
  const { user } = useUser();
  const [data, setData] = useState<Ranking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role === 'CANDIDATE') return;
    api<Ranking>(`/skills/${skillId}/ranking`).then(setData).catch((e) => setError(e.message));
  }, [user, skillId]);

  if (!user || user.role === 'CANDIDATE') return <p className="text-gray-600">Entre como revisora ou admin.</p>;
  if (error) return <p className="text-red-700">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ranking · {data.skill.name}</h1>
      <p className="text-sm text-gray-600">
        Só entrevistas revisadas por uma pessoa, na rubrica versão {data.rubricVersion}. O ranking ajuda a comparar; a
        decisão continua sendo humana e não há corte automático.
      </p>
      <ol className="divide-y divide-gray-100 rounded-xl bg-white ring-1 ring-gray-200">
        {data.rows.map((r, i) => (
          <li key={r.interviewId} className="flex items-center gap-4 px-4 py-3 text-sm">
            <span className="w-6 text-gray-400">{i + 1}</span>
            <span className="font-medium">{r.candidate.name}</span>
            <span className="text-gray-500">
              cobertura {Math.round(r.coverage * 100)}%{r.notAssessed.length ? ` · N/A: ${r.notAssessed.join(', ')}` : ''}
            </span>
            <span className="ml-auto font-semibold">{r.weightedScore ?? '—'}</span>
            <Link href={`/revisao/${r.interviewId}`} className="text-brand-600 underline">
              dossiê
            </Link>
          </li>
        ))}
        {!data.rows.length ? <li className="px-4 py-6 text-center text-gray-500">Nenhuma entrevista revisada ainda.</li> : null}
      </ol>
    </div>
  );
}
