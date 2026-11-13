import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { BUSINESS, BUSINESS_WHATSAPP } from '../config';
import { usePoll } from '../hooks';
import { PAYMENT_LABEL, STEPS, distanceKm, money, orderNo, pad, stepIndex, time, waLink } from '../lib';
import { LiveMap, type MapPoint } from '../components/Map';
import logo from '../assets/logo.webp';

/** Página pública que abre el cliente con su enlace (#seguir/CODIGO). No necesita instalar nada. */
export function Track({ code }: { code: string }) {
  const t = usePoll(() => api.track(code), 5000, [code]);
  const s = t.data;
  const step = s ? stepIndex(s.status) : -1;
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  // Al cambiar de estado: vibra, suena y cambia el título de la pestaña.
  const prev = useRef<string | null>(null);
  const [news, setNews] = useState('');
  useEffect(() => {
    if (!s) return;
    if (prev.current && prev.current !== s.status) {
      const label = s.status === 'anulado' ? 'Pedido anulado' : STEPS[step]?.label ?? '';
      setNews(label); alertChange(label);
    }
    prev.current = s.status;
  }, [s, step]);
  useEffect(() => { document.title = s ? `Pedido #${orderNo(s)} · ${BUSINESS}` : BUSINESS; }, [s]);

  const points = useMemo<MapPoint[]>(() => {
    const p: MapPoint[] = [];
    if (s?.dest) p.push({ id: 'home', lat: s.dest.lat, lng: s.dest.lng, label: 'Tú', kind: 'home' });
    if (s?.location) p.push({ id: 'driver', lat: s.location.lat, lng: s.location.lng, label: s.driver ?? 'Motorizado', kind: 'driver' });
    return p;
  }, [s]);
  const km = s?.location && s.dest ? distanceKm(s.location, s.dest) : null;
  const locAge = s?.location ? Math.max(0, Math.round((Date.now() - new Date(s.location.updated_at).getTime()) / 1000)) : null;

  return (
    <div className="track-page">
      <header className="track-head">
        <img src={logo} alt={BUSINESS} width={640} height={453} />
      </header>
      <main className="track-main">
        {!t.loaded && <p className="muted center">Buscando tu pedido…</p>}
        {t.loaded && !s && !t.error && (
          <>
            <div className="card center"><h1>No encontramos este pedido</h1><p className="muted">Revisa que el enlace esté completo, o búscalo con tu N° de ticket.</p></div>
            <FindForm />
          </>
        )}
        {Boolean(t.error) && !s && <div className="card center"><p className="err-text">No hay conexión. Reintentando…</p></div>}
        {s && (
          <>
            <h1 className="track-title">{s.first_name ? `Hola ${s.first_name}, ` : ''}este es tu pedido <span className="nowrap">#{orderNo(s)}</span></h1>
            {news && <div className="track-news" role="alert">🔔 Tu pedido cambió: <b>{news}</b></div>}

            {s.status === 'anulado' ? (
              <div className="card"><p className="err-text"><b>Este pedido fue anulado.</b></p><p className="small">Si tienes dudas, escríbenos.</p></div>
            ) : (
              <>
                {s.status === 'ruta' && (
                  <div className="card track-live">
                    <div className="row between wrap">
                      <b>🛵 {s.driver ?? 'Tu motorizado'} va en camino</b>
                      {km != null && <span className="pill">a {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</span>}
                    </div>
                    {s.location ? (
                      <>
                        <LiveMap points={points} height={300} follow />
                        <p className="muted small">{locAge != null && locAge > 120 ? `Última ubicación hace ${Math.round(locAge / 60)} min (puede estar sin señal).` : 'Ubicación en vivo · se actualiza sola.'}</p>
                      </>
                    ) : <p className="muted small">Esperando la ubicación del motorizado…</p>}
                  </div>
                )}

                <ol className="track-steps" aria-label="Estado del pedido">
                  {STEPS.map((st, i) => (
                    <li key={st.key} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
                      <span className="dot" aria-hidden>{i < step || (i === step && i === STEPS.length - 1) ? '✓' : st.icon}</span>
                      <span className="grow">{st.label}</span>
                      {s.times[st.key] && i <= step && <span className="muted small">{time(s.times[st.key])}</span>}
                    </li>
                  ))}
                </ol>

                {s.status === 'entregado' && <div className="card thanks">🎉 <b>¡Pedido entregado!</b> Gracias por tu compra, que lo disfrutes.</div>}
              </>
            )}

            <div className="card small">
              <div className="row between"><span className="muted">N° de ticket</span><b>{orderNo(s)}</b></div>
              <div className="row between"><span className="muted">Entrega en</span><span className="right">{s.address}</span></div>
              <div className="row between"><span className="muted">Pago</span><span>{PAYMENT_LABEL[s.payment]} · {money(s.amount)}</span></div>
            </div>

            {s.status !== 'entregado' && s.status !== 'anulado' && (
              <p className="muted small center">Esta página se actualiza sola. Puedes cerrarla y volver a abrir el enlace cuando quieras.</p>
            )}
            {BUSINESS_WHATSAPP && <a className="btn wa block" href={waLink(BUSINESS_WHATSAPP, `Hola, consulto por mi pedido #${orderNo(s)}`)} target="_blank" rel="noreferrer">¿Dudas? Escríbenos por WhatsApp</a>}
          </>
        )}
      </main>
    </div>
  );
}

function alertChange(label: string) {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
      setTimeout(() => void ctx.close(), 1000);
    }
  } catch { /* */ }
  if (document.hidden) document.title = `🔔 ${label}`;
}

/** Formulario del cliente: N° de ticket + últimos 4 dígitos de su celular. */
export function FindForm() {
  const [ticket, setTicket] = useState('');
  const [phone4, setPhone4] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { location.hash = `seguir/${await api.find(ticket.trim(), phone4)}`; }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Sigue tu pedido</h2>
      <p className="muted small">Escribe el N° que aparece arriba en tu ticket y los últimos 4 dígitos del celular con el que hiciste el pedido.</p>
      <label className="field"><span className="field-label">N° de ticket</span>
        <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Ej. 0458" autoComplete="off" required />
      </label>
      <label className="field"><span className="field-label">Últimos 4 dígitos de tu celular</span>
        <input value={phone4} onChange={(e) => setPhone4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Ej. 8777" autoComplete="off" required />
      </label>
      {err && <p className="err-text" role="alert">{err}</p>}
      <button className="btn primary block" disabled={busy || !ticket.trim() || phone4.length !== 4}>{busy ? 'Buscando…' : 'Ver mi pedido'}</button>
    </form>
  );
}

/** Página pública solo para clientes (#rastrear): sin acceso del personal. */
export function FindPage() {
  return (
    <div className="track-page">
      <header className="track-head"><img src={logo} alt={BUSINESS} width={640} height={453} /></header>
      <main className="track-main">
        <FindForm />
        {BUSINESS_WHATSAPP && <a className="btn wa block" href={waLink(BUSINESS_WHATSAPP, 'Hola, quiero consultar por mi pedido')} target="_blank" rel="noreferrer">¿No encuentras tu pedido? Escríbenos</a>}
      </main>
    </div>
  );
}
