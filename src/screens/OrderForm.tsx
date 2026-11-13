import { useState } from 'react';
import { api } from '../api';
import type { Order, Payment, Session, Staff } from '../types';
import { PAYMENT_ICON, PAYMENT_LABEL, money, parseCoords } from '../lib';
import { Field, Modal, errMsg } from '../components/ui';
import { PickMap } from '../components/Map';

const PAYMENTS: Payment[] = ['efectivo', 'yape', 'plin', 'tarjeta', 'pagado'];

export function OrderForm({ session, order, drivers, onClose, onSaved }: {
  session: Session; order: Order | null; drivers: Staff[]; onClose: () => void; onSaved: (o: Order, isNew: boolean) => void;
}) {
  const [f, setF] = useState({
    ticket: order?.ticket ?? '', customer_name: order?.customer_name ?? '', customer_phone: order?.customer_phone ?? '',
    address: order?.address ?? '', reference: order?.reference ?? '', maps_url: order?.maps_url ?? '',
    items: order?.items ?? '', notes: order?.notes ?? '', payment: order?.payment ?? 'efectivo' as Payment,
    amount: order ? String(order.amount) : '', pay_with: order?.pay_with ? String(order.pay_with) : '',
    driver_id: order?.driver_id ?? (drivers.length === 1 ? drivers[0].id : ''),
  });
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(order?.dest_lat != null && order.dest_lng != null ? { lat: order.dest_lat, lng: order.dest_lng } : null);
  const [showMap, setShowMap] = useState(Boolean(dest));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const onMapsUrl = (v: string) => {
    setF({ ...f, maps_url: v });
    const c = parseCoords(v);
    if (c) { setDest(c); setShowMap(true); }
  };

  const amount = Number(f.amount) || 0;
  const payWith = Number(f.pay_with) || 0;

  const save = async () => {
    setErr('');
    if (!f.ticket.trim()) return setErr('Escribe el N° de ticket.');
    if (!f.customer_name.trim()) return setErr('Escribe el nombre del cliente.');
    if (f.customer_phone.replace(/\D/g, '').length < 9) return setErr('Escribe el WhatsApp del cliente (9 dígitos).');
    if (!f.address.trim()) return setErr('Escribe la dirección.');
    if (f.payment === 'efectivo' && payWith && payWith < amount) return setErr('"Paga con" no puede ser menor que el total.');
    setBusy(true);
    try {
      const o = await api.saveOrder(session.token, {
        ...f, id: order?.id, amount, pay_with: f.payment === 'efectivo' && payWith ? payWith : null,
        dest_lat: dest?.lat ?? null, dest_lng: dest?.lng ?? null,
      });
      onSaved(o, !order);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal
      title={order ? `Editar pedido #${order.number}` : 'Nuevo pedido'}
      onClose={onClose}
      footer={<>
        {err && <p className="err-text" role="alert">{err}</p>}
        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? 'Guardando…' : order ? 'Guardar cambios' : 'Crear pedido'}</button>
      </>}
    >
      <div className="form-grid">
        <div className="full">
          <Field label="N° de ticket" hint="El número que aparece arriba en el ticket. El cliente lo usa, junto con los últimos 4 dígitos de su celular, para ver su pedido.">
            <input value={f.ticket} onChange={set('ticket')} placeholder="Ej. 0458" autoComplete="off" autoFocus={!order} />
          </Field>
        </div>
        <h3 className="full">Cliente</h3>
        <Field label="Nombre"><input value={f.customer_name} onChange={set('customer_name')} autoComplete="off" /></Field>
        <Field label="WhatsApp"><input value={f.customer_phone} onChange={set('customer_phone')} inputMode="tel" placeholder="987 654 321" autoComplete="off" /></Field>
        <div className="full"><Field label="Dirección"><input value={f.address} onChange={set('address')} placeholder="Av. ... 123, distrito" /></Field></div>
        <div className="full"><Field label="Referencia"><input value={f.reference} onChange={set('reference')} placeholder="Frente al parque, puerta verde…" /></Field></div>
        <div className="full">
          <Field label="Ubicación (opcional)" hint="Pega el enlace de Google Maps o la ubicación que envió el cliente, o márcala en el mapa. Con el punto marcado, el cliente ve en el mapa cuánto le falta al motorizado.">
            <input value={f.maps_url} onChange={(e) => onMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/… o -12.05, -77.04" />
          </Field>
          <div className="row gap wrap" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={() => setShowMap(!showMap)}>{showMap ? 'Ocultar mapa' : '📍 Marcar en el mapa'}</button>
            {dest && <span className="small ok-text">Punto marcado ✓</span>}
            {dest && <button type="button" className="link small" onClick={() => setDest(null)}>Quitar punto</button>}
          </div>
          {showMap && <div style={{ marginTop: 8 }}><PickMap value={dest} onChange={setDest} /><p className="muted small">Toca el mapa o arrastra la casita.</p></div>}
        </div>

        <h3 className="full">Pedido y pago</h3>
        <div className="full"><Field label="Detalle del pedido"><textarea rows={3} value={f.items} onChange={set('items')} placeholder="1 pollo a la brasa, 1 gaseosa 1.5L…" /></Field></div>
        <Field label="Total (S/)"><input value={f.amount} onChange={set('amount')} inputMode="decimal" placeholder="0.00" /></Field>
        <div className="full">
          <span className="field-label">Forma de pago</span>
          <div className="chips" role="radiogroup" aria-label="Forma de pago">
            {PAYMENTS.map((p) => (
              <button type="button" key={p} role="radio" aria-checked={f.payment === p} className={`chip ${f.payment === p ? 'on' : ''}`} onClick={() => setF({ ...f, payment: p })}>
                {PAYMENT_ICON[p]} {PAYMENT_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {f.payment === 'efectivo' && (
          <Field label="Paga con (S/)" hint={payWith > amount ? `Vuelto: ${money(payWith - amount)}` : 'Déjalo vacío si paga exacto'}>
            <input value={f.pay_with} onChange={set('pay_with')} inputMode="decimal" placeholder="Ej. 100" />
          </Field>
        )}

        <h3 className="full">Reparto</h3>
        <Field label="Motorizado">
          <select value={f.driver_id} onChange={set('driver_id')}>
            <option value="">— Sin asignar —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <div className="full"><Field label="Nota para el motorizado"><textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Llamar al llegar, edificio sin ascensor…" /></Field></div>
      </div>
    </Modal>
  );
}
