import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { BUSINESS, BUSINESS_WHATSAPP } from '../config';
import { usePoll } from '../hooks';
import { PAYMENT_LABEL, STEPS, distanceKm, money, pad, stepIndex, time, waLink } from '../lib';
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
  useEffect(() => { document.title = s ? `Pedido #${pad(s.number)} · ${BUSINESS}` : BUSINESS; }, [s]);

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
          <div className="card center"><h1>No encontramos este pedido</h1><p className="muted">Revisa que el enlace esté completo.</p></div>
        )}
        {Boolean(t.error) && !s && <div className="card center"><p className="err-text">No hay conexión. Reintentando…</p></div>}
        {s && (
          <>
            <h1 className="track-title">{s.first_name ? `Hola ${s.first_name}, ` : ''}este es tu pedido <span className="nowrap">#{pad(s.number)}</span></h1>
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
              <div className="row between"><span className="muted">Entrega en</span><span className="right">{s.address}</span></div>
              <div className="row between"><span className="muted">Pago</span><span>{PAYMENT_LABEL[s.payment]} · {money(s.amount)}</span></div>
            </div>

            {s.status !== 'entregado' && s.status !== 'anulado' && (
              <p className="muted small center">Esta página se actualiza sola. Puedes cerrarla y volver a abrir el enlace cuando quieras.</p>
            )}
            {BUSINESS_WHATSAPP && <a className="btn wa block" href={waLink(BUSINESS_WHATSAPP, `Hola, consulto por mi pedido #${pad(s.number)}`)} target="_blank" rel="noreferrer">¿Dudas? Escríbenos por WhatsApp</a>}
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
