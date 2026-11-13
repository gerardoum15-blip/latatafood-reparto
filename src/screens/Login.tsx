import { useEffect, useState } from 'react';
import { api, DEMO } from '../api';
import { BUSINESS } from '../config';
import type { Session } from '../types';
import { errMsg } from '../components/ui';
import logo from '../assets/logo.webp';

export function Login({ onIn }: { onIn: (s: Session) => void }) {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState('');

  useEffect(() => { api.needsSetup().then(setSetup).catch((e) => { setSetup(false); setErr(errMsg(e)); }); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { onIn(setup ? await api.setup(name, pin) : await api.login(pin)); }
    catch (x) { setErr(errMsg(x)); setPin(''); }
    finally { setBusy(false); }
  };

  const goTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const c = track.trim().split(/[#/]/).pop() ?? '';
    if (c) location.hash = `seguir/${c}`;
  };

  return (
    <div className="center-page">
      <img className="logo" src={logo} alt={BUSINESS} width={640} height={453} />
      <h1>Reparto</h1>
      <p className="muted">Pedidos del motorizado y seguimiento en vivo</p>
      {DEMO && <p className="demo-note">Modo demo: los datos se guardan solo en este navegador. PIN <b>1234</b> administrador · <b>1111</b> motorizado.</p>}

      <form className="card stack" onSubmit={submit}>
        <h2>{setup ? 'Crear administrador' : 'Ingresar'}</h2>
        {setup && (
          <>
            <p className="muted small">Es la primera vez. Crea el usuario administrador.</p>
            <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </>
        )}
        <input
          className="pin-input" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="one-time-code"
          placeholder={setup ? 'Elige un PIN (4 a 8 números)' : 'PIN'} aria-label="PIN"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required minLength={4} autoFocus
        />
        {err && <p className="err-text" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy || setup === null || pin.length < 4}>{busy ? 'Ingresando…' : setup ? 'Crear y entrar' : 'Entrar'}</button>
      </form>

      <form className="card stack" onSubmit={goTrack}>
        <h2>¿Eres cliente?</h2>
        <p className="muted small">Abre el enlace que te enviamos por WhatsApp, o pega aquí tu código de seguimiento.</p>
        <div className="row gap">
          <input placeholder="Código o enlace" value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Código de seguimiento" />
          <button className="btn" disabled={!track.trim()}>Ver</button>
        </div>
      </form>
    </div>
  );
}
