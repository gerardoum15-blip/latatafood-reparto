import { useCallback, useEffect, useRef, useState } from 'react';

/** Consulta repetida (cada `ms`) que se pausa con la pantalla apagada y se refresca al volver. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const fnRef = useRef(fn); fnRef.current = fn;
  const alive = useRef(true);
  const run = useCallback(async () => {
    try {
      const r = await fnRef.current();
      if (!alive.current) return;
      setData(r); setError(null);
    } catch (e) { if (alive.current) setError(e); }
    finally { if (alive.current) setLoaded(true); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void run();
    const t = setInterval(() => { if (!document.hidden) void run(); }, ms);
    const vis = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', vis);
    // En modo demo, otras pestañas cambian los datos: refrescar al instante.
    const st = (e: StorageEvent) => { if (e.key === 'reparto-demo-db') void run(); };
    window.addEventListener('storage', st);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis); window.removeEventListener('storage', st); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loaded, refresh: run, setData };
}

/** Mantiene la pantalla encendida mientras `on` (si el navegador lo permite). */
export function useWakeLock(on: boolean) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) { setActive(false); return; }
    let lock: WakeLockSentinel | null = null; let alive = true;
    const get = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        setActive(true);
        lock.addEventListener('release', () => alive && setActive(false));
      } catch { setActive(false); }
    };
    void get();
    const vis = () => { if (!document.hidden && alive) void get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}); };
  }, [on]);
  return active;
}

export type GpsState = 'off' | 'waiting' | 'ok' | 'denied' | 'unavailable';

/**
 * GPS del motorizado: envía su ubicación cada vez que se mueve (máx. cada 4 s)
 * y al menos cada 20 s aunque esté detenido.
 */
export function useGps(on: boolean, send: (c: GeolocationCoordinates) => Promise<void>) {
  const [state, setState] = useState<GpsState>('off');
  const [last, setLast] = useState<{ at: number; acc: number } | null>(null);
  const sendRef = useRef(send); sendRef.current = send;
  useEffect(() => {
    if (!on) { setState('off'); return; }
    if (!('geolocation' in navigator)) { setState('unavailable'); return; }
    setState('waiting');
    let lastSent = 0; let latest: GeolocationCoordinates | null = null; let dirty = false; let busy = false;
    const push = async (force = false) => {
      if (!latest || busy) return;
      if (!force && (!dirty || Date.now() - lastSent < 4000)) return;
      busy = true; dirty = false;
      const c = latest;
      try { await sendRef.current(c); lastSent = Date.now(); setLast({ at: lastSent, acc: c.accuracy }); } catch { dirty = true; /* reintenta */ }
      busy = false;
    };
    const id = navigator.geolocation.watchPosition(
      (p) => { latest = p.coords; dirty = true; setState('ok'); void push(); },
      (e) => setState(e.code === e.PERMISSION_DENIED ? 'denied' : 'waiting'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    // Envía lo pendiente apenas pasan 4 s, y repite la última ubicación cada 20 s aunque no se mueva.
    const t = setInterval(() => { void push(Date.now() - lastSent > 20000); }, 1000);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(t); };
  }, [on]);
  return { state, last };
}
