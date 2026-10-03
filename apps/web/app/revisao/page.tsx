'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABEL, type InterviewListItem, type InterviewStatus } from '@/lib/types';
import { useUser } from '@/components/user-context';

const FILTERS: (InterviewStatus | '')[] = ['READY_FOR_REVIEW', 'REVIEWED', 'EVALUATING', 'IN_PROGRESS', ''];

export default function ReviewList() {
  const { user } = useUser();
  const [status, setStatus] = useState<InterviewStatus | ''>('READY_FOR_REVIEW');
  const [rows, setRows] = useState<InterviewListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role === 'CANDIDATE') return;
    api<InterviewListItem[]>(`/interviews${status ? `?status=${status}` : ''}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [user, status]);

  if (!user || user.role === 'CANDIDATE') return <p className="text-gray-600">Entre como revisora ou admin.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Revisão de dossiês</h1>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setStatus(f)}
            className={`rounded-full px-3 py-1 text-sm ${status === f ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'}`}
          >
            {f ? STATUS_LABEL[f] : 'Todas'}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <table className="w-full overflow-hidden rounded-xl bg-white text-sm ring-1 ring-gray-200">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">Profissional</th>
            <th className="px-3 py-2">Skill</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2 text-right">Nota</th>
            <th className="px-3 py-2 text-right">Cobertura</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.candidate.name}</td>
              <td className="px-3 py-2">
                {r.skill.name} <span className="text-gray-400">v{r.rubricVersion}</span>
              </td>
              <td className="px-3 py-2">{STATUS_LABEL[r.status]}</td>
              <td className="px-3 py-2 text-right">{r.weightedScore ?? '—'}</td>
              <td className="px-3 py-2 text-right">{r.coverage != null ? `${Math.round(r.coverage * 100)}%` : '—'}</td>
              <td className="px-3 py-2 text-right">
                <Link href={`/revisao/${r.id}`} className="text-brand-600 underline">
                  Abrir dossiê
                </Link>
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                Nada por aqui.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
