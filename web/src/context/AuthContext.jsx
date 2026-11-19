import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../lib/api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!tokenStore.get());

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, []);
  useEffect(() => { window.addEventListener('rg:unauthorized', logout); return () => window.removeEventListener('rg:unauthorized', logout); }, [logout]);

  const value = useMemo(() => ({
    user, ready, logout,
    login: async (b) => { const r = await api.login(b); tokenStore.set(r.token); setUser(r.user); },
    register: async (b) => { const r = await api.register(b); tokenStore.set(r.token); setUser(r.user); },
  }), [user, ready, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
