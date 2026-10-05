'use client';

import Link from 'next/link';
import { useUser } from './user-context';

const ROLE_LABEL = { CANDIDATE: 'Profissional', REVIEWER: 'Revisora', ADMIN: 'Admin' } as const;

export function Header() {
  const { user, users, select } = useUser();
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold text-brand-700">
          Whizz · Entrevistas
        </Link>
        <nav className="flex gap-4 text-sm text-gray-600">
          {user?.role !== 'CANDIDATE' && user ? <Link href="/revisao">Revisão</Link> : null}
          {user?.role === 'ADMIN' ? <Link href="/admin">Rubricas</Link> : null}
        </nav>
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">login simulado</span>
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1"
            value={user?.id ?? ''}
            onChange={(e) => select(e.target.value || null)}
          >
            <option value="">Escolha um usuário</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_LABEL[u.role]})
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
