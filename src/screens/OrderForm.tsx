import { useState } from 'react';
import { api } from '../api';
import type { Order, Payment, Session, Staff } from '../types';
import { PAYMENT_ICON, PAYMENT_LABEL, parseCoords } from '../lib';
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


  const save = async () => {
    setErr('');
    if (!f.ticket.trim()) return setErr('Escribe el N° de ticket.');
    if (!f.customer_name.trim()) return setErr('Escribe el nombre del cliente.');
    if (f.customer_phone.replace(/\D/g, '').length < 9) return setErr('Escribe el WhatsApp del cliente (9 dígitos).');
    if (!f.address.trim()) return setErr('Escribe la ubicación.');
    setBusy(true);
    try {
      const o = await api.saveOrder(session.token, {
        ...f, id: order?.id, amount: Number(f.amount) || 0, pay_with: f.payment === 'efectivo' && Number(f.pay_with) ? Number(f.pay_with) : null,
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
          <Field label="N° de ticket" hint="El número de arriba del ticket. Con él y los últimos 4 dígitos de su celular, el cliente ve su pedido.">
            <input value={f.ticket} onChange={set('ticket')} placeholder="Ej. 0458" autoComplete="off" autoFocus={!order} />
          </Field>
        </div>
        <Field label="Nombre del cliente"><input value={f.customer_name} onChange={set('customer_name')} autoComplete="off" /></Field>
        <Field label="WhatsApp / celular"><input value={f.customer_phone} onChange={set('customer_phone')} inputMode="tel" placeholder="987 654 321" autoComplete="off" /></Field>
        <div className="full">
          <Field label="Ubicación" hint="Escribe la dirección y, si el cliente envió su ubicación, pega el enlace de Google Maps o márcala en el mapa.">
            <input value={f.address} onChange={set('address')} placeholder="Dirección, distrito y referencia" />
          </Field>
          <input style={{ marginTop: 8 }} value={f.maps_url} onChange={(e) => onMapsUrl(e.target.value)} placeholder="Enlace de Google Maps (opcional)" aria-label="Enlace de Google Maps" />
          <div className="row gap wrap" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={() => setShowMap(!showMap)}>{showMap ? 'Ocultar mapa' : '📍 Marcar en el mapa'}</button>
            {dest && <span className="small ok-text">Punto marcado ✓</span>}
            {dest && <button type="button" className="link small" onClick={() => setDest(null)}>Quitar punto</button>}
          </div>
          {showMap && <div style={{ marginTop: 8 }}><PickMap value={dest} onChange={setDest} /><p className="muted small">Toca el mapa o arrastra la casita.</p></div>}
        </div>
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
      </div>
    </Modal>
  );
}
