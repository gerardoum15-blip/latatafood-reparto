import { useCallback, useEffect, useState } from 'react';
import { api, savedSession, SessionExpired, storeSession } from './api';
import type { Session } from './types';
import { Login } from './screens/Login';
import { Admin } from './screens/Admin';
import { Driver } from './screens/Driver';
import { Track } from './screens/Track';

const trackCode = () => location.hash.match(/^#seguir[/-]([A-Za-z0-9_-]+)/)?.[1] ?? null;

export function App() {
  const [code, setCode] = useState(trackCode);
  const [session, setSession] = useState<Session | null>(savedSession);
  useEffect(() => {
    const h = () => setCode(trackCode());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  // Confirma que la sesión guardada siga vigente (y su rol actual).
  useEffect(() => {
    if (!session || code) return;
    api.me(session.token).then((s) => { setSession(s); storeSession(s); }).catch((e) => {
      if (e instanceof SessionExpired) { storeSession(null); setSession(null); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const out = useCallback(() => setSession(null), []);

  if (code) return <Track code={code} />;
  if (!session) return <Login onIn={(s) => { storeSession(s); setSession(s); }} />;
  return session.role === 'admin' ? <Admin session={session} onOut={out} /> : <Driver session={session} onOut={out} />;
}
