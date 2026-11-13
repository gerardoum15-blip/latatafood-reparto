import { useRef, useState } from 'react';
import { api } from '../api';
import type { Order, Payment, Session, Staff } from '../types';
import { PAYMENT_ICON, PAYMENT_LABEL, money, parseCoords } from '../lib';
import { parseText, readImage, type Parsed } from '../ticket';
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

  // ---- Llenado automático desde el ticket o el mensaje ----
  const [paste, setPaste] = useState('');
  const [reading, setReading] = useState<number | null>(null);
  const [found, setFound] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (p: Parsed) => {
    const got: string[] = [];
    if (p.ticket) got.push(`ticket ${p.ticket}`);
    if (p.customer_name) got.push('nombre');
    if (p.customer_phone) got.push(`WhatsApp ${p.customer_phone}`);
    if (p.address) got.push('dirección');
    if (p.maps_url || p.dest) got.push('ubicación');
    if (p.payment) got.push(PAYMENT_LABEL[p.payment]);
    if (p.amount) got.push(`total ${money(p.amount)}`);
    if (p.pay_with) got.push(`paga con ${money(p.pay_with)}`);
    setF((cur) => ({
      ...cur,
      ...(p.ticket ? { ticket: p.ticket } : {}),
      ...(p.customer_name ? { customer_name: p.customer_name } : {}),
      ...(p.customer_phone ? { customer_phone: p.customer_phone } : {}),
      ...(p.address ? { address: p.address } : {}),
      ...(p.maps_url ? { maps_url: p.maps_url } : {}),
      ...(p.payment ? { payment: p.payment } : {}),
      ...(p.amount ? { amount: String(p.amount) } : {}),
      ...(p.pay_with ? { pay_with: String(p.pay_with) } : {}),
    }));
    if (p.dest) setDest(p.dest);
    setFound(got.length ? `Se llenó: ${got.join(' · ')}` : 'No encontré datos. Llena los campos a mano.');
  };

  /** Lo de la foto se suma a lo ya pegado/escrito, sin borrarlo. */
  const onText = (t: string) => { setPaste(t); if (t.trim().length > 4) apply(parseText(t)); };

  const onImage = async (file: Blob) => {
    setErr(''); setReading(0); setFound('');
    try {
      const text = await readImage(file, (p) => setReading(p));
      apply(parseText(text));
    } catch {
      setFound('No pude leer la imagen. Revisa tu conexión o escribe los datos.');
    } finally { setReading(null); }
  };

  /** Botón "Pegar": toma la imagen o el texto copiado (ej. desde WhatsApp). */
  const fromClipboard = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const img = it.types.find((t) => t.startsWith('image/'));
          if (img) return void onImage(await it.getType(img));
        }
        for (const it of items) {
          if (it.types.includes('text/plain')) return onText(paste ? `${paste}\n${await (await it.getType('text/plain')).text()}` : await (await it.getType('text/plain')).text());
        }
      }
      const t = await navigator.clipboard.readText();
      onText(paste ? `${paste}\n${t}` : t);
    } catch { setFound('Tu celular no dejó leer lo copiado. Mantén presionado el recuadro y elige "Pegar".'); }
  };

  const onMapsUrl = (v: string) => {
    setF({ ...f, maps_url: v });
    const c = parseCoords(v);
    if (c) { setDest(c); setShowMap(true); }
  };


  const save = async () => {
    setErr('');
    if (!f.ticket.trim()) return setErr('Escribe el N° de ticket.');
    if (f.customer_phone.replace(/\D/g, '').length < 9) return setErr('Escribe el WhatsApp del cliente (9 dígitos).');
    if (!f.address.trim() && !f.maps_url.trim() && !dest) return setErr('Escribe la dirección o pega la ubicación.');
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
        {!order && (
          <div className="full import-box">
            <b>Llenado automático</b>
            <p className="muted small">Sube la foto del ticket o pega el mensaje (WhatsApp del cliente, ubicación, forma de pago). Yo lleno los campos.</p>
            <div className="row gap wrap">
              <button type="button" className="btn primary grow" onClick={() => fileRef.current?.click()} disabled={reading !== null}>📷 Subir ticket</button>
              <button type="button" className="btn grow" onClick={fromClipboard} disabled={reading !== null}>📋 Pegar</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) void onImage(fl); }} />
            <textarea
              rows={3} value={paste} aria-label="Texto del pedido"
              placeholder={'O escribe/pega aquí, por ejemplo:\nPagar con Yape\nhttps://maps.app.goo.gl/...\n987 654 321'}
              onChange={(e) => onText(e.target.value)}
              onPaste={(e) => {
                const img = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
                if (img) { e.preventDefault(); const fl = img.getAsFile(); if (fl) void onImage(fl); }
              }}
            />
            {reading !== null && <p className="small"><b>Leyendo el ticket… {Math.round(reading * 100)}%</b> (la primera vez tarda un poco más)</p>}
            {found && <p className="small found">{found}</p>}
          </div>
        )}
        <div className="full">
          <Field label="N° de ticket" hint="El número de arriba del ticket. Con él y los últimos 4 dígitos de su celular, el cliente ve su pedido.">
            <input value={f.ticket} onChange={set('ticket')} placeholder="Ej. 0458" autoComplete="off" autoFocus={!order} />
          </Field>
        </div>
        <Field label="Nombre del cliente (opcional)"><input value={f.customer_name} onChange={set('customer_name')} autoComplete="off" /></Field>
        <Field label="WhatsApp / celular"><input value={f.customer_phone} onChange={set('customer_phone')} inputMode="tel" placeholder="987 654 321" autoComplete="off" /></Field>
        <div className="full">
          <Field label="Ubicación" hint="Escribe la dirección y, si el cliente envió su ubicación, pega el enlace de Google Maps o márcala en el mapa.">
            <input value={f.address} onChange={set('address')} placeholder="Dirección, distrito y referencia (o pega abajo el enlace)" />
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
        {Number(f.amount) > 0 && (
          <Field label="Total a cobrar (S/)"><input value={f.amount} onChange={set('amount')} inputMode="decimal" /></Field>
        )}
        {Number(f.amount) > 0 && f.payment === 'efectivo' && (
          <Field label="Paga con (S/)" hint={Number(f.pay_with) > Number(f.amount) ? `Vuelto: ${money(Number(f.pay_with) - Number(f.amount))}` : 'Vacío = paga exacto'}>
            <input value={f.pay_with} onChange={set('pay_with')} inputMode="decimal" placeholder="Ej. 50" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
