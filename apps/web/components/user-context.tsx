'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api, getUserId, setUserId } from '@/lib/api';
import type { MockUser } from '@/lib/types';

interface UserCtx {
  user: MockUser | null;
  users: MockUser[];
  ready: boolean;
  select(id: string | null): void;
}

const Ctx = createContext<UserCtx>({ user: null, users: [], ready: false, select: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<MockUser[]>([]);
  const [userId, setId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setId(getUserId());
    api<MockUser[]>('/mock-users')
      .then(setUsers)
      .catch(() => setError('Não foi possível falar com a API. Confira se ela está rodando (npm run dev:api).'))
      .finally(() => setReady(true));
  }, []);

  const select = (id: string | null) => {
    setUserId(id);
    setId(id);
  };

  const user = users.find((u) => u.id === userId) ?? null;
  return (
    <Ctx.Provider value={{ user, users, ready, select }}>
      {error ? <div className="bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div> : null}
      {children}
    </Ctx.Provider>
  );
}

export const useUser = () => useContext(Ctx);
