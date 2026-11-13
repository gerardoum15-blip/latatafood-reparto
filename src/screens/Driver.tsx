import { useEffect, useState } from 'react';
import { api } from '../api';
import { BUSINESS } from '../config';
import { useGps, usePoll, useWakeLock, type GpsState } from '../hooks';
import type { Order, Session, Status } from '../types';
import { PAYMENT_ICON, PAYMENT_LABEL, STATUS_LABEL, chargeText, customerMessage, payLabel, mapsLink, money, orderNo, pad, telLink, time, waLink, wazeLink } from '../lib';
import { Badge, errMsg, toast } from '../components/ui';
import { TopBar, useSessionGuard } from './shared';

const GPS_KEY = 'reparto-gps';

export function Driver({ session, onOut }: { session: Session; onOut: () => void }) {
  const guard = useSessionGuard(onOut);
  const orders = usePoll(() => guard(api.listOrders(session.token)), 6000, [session.token]);
  const list = orders.data ?? [];
  const active = list.filter((o) => !['entregado', 'anulado'].includes(o.status));
  const done = list.filter((o) => o.status === 'entregado');
  const onRoute = active.some((o) => o.status === 'ruta' || o.status === 'despacho');

  // El GPS se enciende solo al salir a reparto; también se puede encender a mano.
  const [manual, setManual] = useState(() => { try { return localStorage.getItem(GPS_KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(GPS_KEY, manual ? '1' : '0'); } catch { /* */ } }, [manual]);
  const gpsOn = manual || onRoute;
  const gps = useGps(gpsOn, (c) => api.updateLocation(session.token, c));
  const awake = useWakeLock(gpsOn);

  // Aviso cuando llega un pedido nuevo asignado.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = new Set(orders.data.map((o) => o.id));
    if (seen && [...ids].some((id) => !seen.has(id))) { beep(); toast('🔔 Tienes un pedido nuevo'); }
    setSeen(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.data]);

  const setStatus = async (o: Order, s: Status) => {
    if (s === 'entregado' && !confirm(`¿Entregaste el pedido #${orderNo(o)}?\n${chargeText(o)}`)) return;
    try {
      const upd = await guard(api.setStatus(session.token, o.id, s));
      await orders.refresh();
      toast(`#${orderNo(o)} → ${STATUS_LABEL[s]}`);
      if (s === 'ruta') setTimeout(() => { if (confirm('¿Avisar al cliente por WhatsApp que vas en camino?')) window.open(waLink(o.customer_phone, customerMessage(upd, BUSINESS)), '_blank'); }, 100);
    } catch (e) { toast(errMsg(e), 'err'); }
  };

  const cash = done.filter((o) => o.payment === 'efectivo').reduce((a, o) => a + Number(o.amount), 0);

  return (
    <div className="app">
      <TopBar session={session} onOut={onOut} />
      <GpsBar state={gps.state} on={gpsOn} auto={onRoute} manual={manual} setManual={setManual} last={gps.last} awake={awake} />
      <main className="main">
        {Boolean(orders.error) && <p className="err-text">Sin conexión: {errMsg(orders.error)}</p>}
        {!orders.loaded && <p className="muted">Cargando…</p>}
        {orders.loaded && !active.length && <div className="empty">No tienes pedidos asignados. Te avisaremos con un sonido cuando llegue uno.</div>}
        <div className="cards">
          {active.map((o) => <DriverCard key={o.id} o={o} onStatus={(s) => setStatus(o, s)} />)}
        </div>
        {done.length > 0 && (
          <details className="card done-list">
            <summary><b>Entregados hoy: {done.length}</b>{cash > 0 ? ` · efectivo cobrado ${money(cash)}` : ''}</summary>
            <ul className="plain">
              {done.map((o) => (
                <li key={o.id} className="row between small">
                  <span>#{orderNo(o)} {o.customer_name}</span>
                  <span>{payLabel(o)} · {time(o.times.entregado)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
}

function DriverCard({ o, onStatus }: { o: Order; onStatus: (s: Status) => void }) {
  const hasDest = o.dest_lat != null && o.dest_lng != null;
  const action: { s: Status; label: string } | null =
    o.status === 'confirmado' || o.status === 'preparacion' ? { s: 'despacho', label: '📦 Recogí el pedido' }
      : o.status === 'despacho' ? { s: 'ruta', label: '🛵 Salir en ruta' }
      : o.status === 'ruta' ? { s: 'entregado', label: '✅ Marcar entregado' } : null;
  return (
    <article className={`card order driver st-${o.status}`}>
      <header className="row between">
        <div className="row gap"><b className="num">#{orderNo(o)}</b><Badge status={o.status} /></div>
        <span className="muted small">{time(o.created_at)}</span>
      </header>

      <section>
        <p className="big">{o.customer_name}</p>
        <div className="row gap">
          <a className="btn wa grow" href={waLink(o.customer_phone)} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="btn grow" href={telLink(o.customer_phone)}>📞 Llamar</a>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>{o.customer_phone}</p>
      </section>

      <section>
        <p>📍 <b>{o.address}</b></p>
        {o.reference && <p className="small">Ref.: {o.reference}</p>}
        <div className="row gap">
          <a className="btn maps grow" href={mapsLink(o)} target="_blank" rel="noreferrer">Google Maps</a>
          {hasDest && <a className="btn maps grow" href={wazeLink(o.dest_lat!, o.dest_lng!)} target="_blank" rel="noreferrer">Waze</a>}
        </div>
      </section>

      <section className={`pay pay-${o.payment}`}>
        <span className="pay-icon" aria-hidden>{PAYMENT_ICON[o.payment]}</span>
        <div>
          <b>{payLabel(o)}</b>
          <div className="small">{chargeText(o)}</div>
        </div>
      </section>

      {o.items && <section><p className="field-label">Pedido</p><p className="pre small">{o.items}</p></section>}
      {o.notes && <p className="note">📝 {o.notes}</p>}

      {(o.status === 'confirmado' || o.status === 'preparacion') && <p className="muted small">La cocina aún lo está preparando.</p>}
      {action && <button className={`btn block ${action.s === 'entregado' ? 'ok' : 'primary'} big-btn`} onClick={() => onStatus(action.s)}>{action.label}</button>}
      {o.status === 'ruta' && (
        <a className="btn block small" href={waLink(o.customer_phone, `Hola ${o.customer_name.split(' ')[0]}, soy el motorizado de ${BUSINESS}. Ya estoy en tu dirección con tu pedido #${orderNo(o)}.`)} target="_blank" rel="noreferrer">Avisar “ya llegué” por WhatsApp</a>
      )}
    </article>
  );
}

function GpsBar({ state, on, auto, manual, setManual, last, awake }: {
  state: GpsState; on: boolean; auto: boolean; manual: boolean; setManual: (v: boolean) => void; last: { at: number; acc: number } | null; awake: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(t); }, []);
  const ago = last ? Math.round((Date.now() - last.at) / 1000) : null;
  const msg: Record<GpsState, string> = {
    off: 'Ubicación apagada. Se enciende sola al recoger un pedido.',
    waiting: 'Buscando señal GPS…',
    ok: `Compartiendo ubicación${ago != null ? ` · enviada hace ${ago}s` : ''}${last ? ` · ±${Math.round(last.acc)} m` : ''}`,
    denied: 'Permiso de ubicación bloqueado. Actívalo en los ajustes del navegador para este sitio.',
    unavailable: 'Este celular no permite compartir la ubicación desde el navegador.',
  };
  return (
    <div className={`gps-bar gps-${state}`} role="status">
      <span className="gps-dot" aria-hidden />
      <div className="grow small">
        <div>{msg[state]}</div>
        {on && <div className="gps-tip">Mantén esta pantalla abierta mientras repartes{awake ? ' (la pantalla no se apagará)' : ''}.</div>}
      </div>
      {!auto && <button className="btn small" onClick={() => setManual(!manual)}>{manual ? 'Apagar' : 'Encender'}</button>}
    </div>
  );
}

function beep() {
  try { navigator.vibrate?.([300, 100, 300]); } catch { /* */ }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 988; g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch { /* */ }
}
