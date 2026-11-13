import { useState } from 'react';
import { api } from '../api';
import type { Role, Session, Staff } from '../types';
import { Field, Modal, errMsg, toast } from '../components/ui';

export function StaffList({ session, staff, refresh }: { session: Session; staff: Staff[]; refresh: () => Promise<void> }) {
  const [edit, setEdit] = useState<Partial<Staff> | null>(null);
  return (
    <div className="stack">
      <div className="row between">
        <p className="muted small">Cada persona ingresa con su propio PIN. Los motorizados solo ven sus pedidos.</p>
        <button className="btn primary" onClick={() => setEdit({ role: 'driver', active: true })}>＋ Agregar</button>
      </div>
      <ul className="plain cards">
        {staff.map((s) => (
          <li key={s.id} className={`card row between ${s.active ? '' : 'off'}`}>
            <div>
              <b>{s.role === 'admin' ? '🧑‍💼' : '🛵'} {s.name}</b>
              <div className="small muted">{s.role === 'admin' ? 'Administrador' : 'Motorizado'}{s.phone ? ` · ${s.phone}` : ''}{s.active ? '' : ' · desactivado'}</div>
            </div>
            <button className="btn small" onClick={() => setEdit(s)}>Editar</button>
          </li>
        ))}
      </ul>
      {edit && <StaffForm session={session} value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void refresh(); toast('Guardado'); }} />}
    </div>
  );
}

function StaffForm({ session, value, onClose, onSaved }: { session: Session; value: Partial<Staff>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: value.name ?? '', role: value.role ?? 'driver' as Role, phone: value.phone ?? '', pin: '', active: value.active ?? true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(''); setBusy(true);
    try { await api.saveStaff(session.token, { ...f, id: value.id }); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={value.id ? 'Editar persona' : 'Agregar persona'} onClose={onClose}
      footer={<>{err && <p className="err-text" role="alert">{err}</p>}<button className="btn primary block" onClick={save} disabled={busy}>Guardar</button></>}>
      <div className="stack">
        <Field label="Nombre"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Rol">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="driver">Motorizado</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
        <Field label="Celular (opcional)"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></Field>
        <Field label={value.id ? 'Nuevo PIN (déjalo vacío para no cambiarlo)' : 'PIN (4 a 8 números)'}>
          <input value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} inputMode="numeric" maxLength={8} autoComplete="off" />
        </Field>
        {value.id && (
          <label className="row gap"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo (puede ingresar)</label>
        )}
      </div>
    </Modal>
  );
}
