import { useCallback } from 'react';
import { api, DEMO, SessionExpired, storeSession } from '../api';
import { BUSINESS } from '../config';
import type { Session } from '../types';
import { toast } from '../components/ui';
import logo from '../assets/logo-round.webp';
import type { ReactNode } from 'react';

export function TopBar({ session, onOut, extra }: { session: Session; onOut: () => void; extra?: ReactNode }) {
  const out = async () => {
    if (!confirm('¿Cerrar sesión en este celular?')) return;
    try { await api.logout(session.token); } catch { /* igual se sale */ }
    storeSession(null); onOut();
  };
  return (
    <header className="topbar">
      <img src={logo} alt="" width={36} height={36} />
      <div className="grow">
        <b>{BUSINESS} · Reparto</b>
        <div className="small muted">{session.name} · {session.role === 'admin' ? 'Administrador' : 'Motorizado'}{DEMO ? ' · DEMO' : ''}</div>
      </div>
      {extra}
      <button className="btn small ghost" onClick={out}>Salir</button>
    </header>
  );
}

/** Si la sesión venció, vuelve al ingreso con PIN. */
export function useSessionGuard(onOut: () => void) {
  return useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    try { return await p; } catch (e) {
      if (e instanceof SessionExpired) { storeSession(null); toast(e.message, 'err'); onOut(); }
      throw e;
    }
  }, [onOut]);
}
