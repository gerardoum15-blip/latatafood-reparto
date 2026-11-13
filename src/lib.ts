import type { Order, Payment, Status } from './types';

export const STEPS: { key: Status; label: string; icon: string }[] = [
  { key: 'confirmado', label: 'Pedido confirmado', icon: '✅' },
  { key: 'preparacion', label: 'En preparación', icon: '👩‍🍳' },
  { key: 'despacho', label: 'En despacho', icon: '📦' },
  { key: 'ruta', label: 'En ruta hacia su destino', icon: '🛵' },
  { key: 'entregado', label: 'Pedido entregado', icon: '🎉' },
];
export const STATUS_LABEL: Record<Status, string> = {
  confirmado: 'Confirmado', preparacion: 'En preparación', despacho: 'En despacho',
  ruta: 'En ruta', entregado: 'Entregado', anulado: 'Anulado',
};
export const stepIndex = (s: Status) => STEPS.findIndex((x) => x.key === s);
export const nextStatus = (s: Status): Status | null => {
  const i = stepIndex(s);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1].key : null;
};

export const PAYMENT_LABEL: Record<Payment, string> = {
  efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta (POS)', pagado: 'Ya pagó',
};
export const PAYMENT_ICON: Record<Payment, string> = { efectivo: '💵', yape: '📱', plin: '📱', tarjeta: '💳', pagado: '✔️' };

export const money = (n: number | null | undefined) => `S/ ${(Number(n) || 0).toFixed(2)}`;

/** Texto de cobro para el motorizado (incluye el vuelto). */
export function chargeText(o: Pick<Order, 'payment' | 'amount' | 'pay_with'>): string {
  if (o.payment === 'pagado') return 'Ya pagó · no cobrar';
  if (o.payment === 'efectivo') {
    if (o.pay_with && o.pay_with > o.amount) return `Cobrar ${money(o.amount)} en efectivo · paga con ${money(o.pay_with)} · llevar vuelto ${money(o.pay_with - o.amount)}`;
    return `Cobrar ${money(o.amount)} en efectivo (monto exacto)`;
  }
  return `Cobrar ${money(o.amount)} con ${PAYMENT_LABEL[o.payment]}`;
}

export const time = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
export const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
export const pad = (n: number) => String(n).padStart(3, '0');

/** Número peruano a formato internacional sin "+" (ej. 51987654321). */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = '51' + d;
  return d;
}
/** WhatsApp daña los emojis "grandes" al abrir un chat desde un enlace: se quitan. */
const safeWa = (t: string) => t.replace(/ ?[\u{10000}-\u{10FFFF}]️?/gu, '');
export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${normalizePhone(phone)}${text ? `?text=${encodeURIComponent(safeWa(text))}` : ''}`;
export const telLink = (phone: string) => `tel:+${normalizePhone(phone)}`;

export function mapsLink(o: Pick<Order, 'maps_url' | 'address' | 'dest_lat' | 'dest_lng'>) {
  if (o.dest_lat != null && o.dest_lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${o.dest_lat},${o.dest_lng}&travelmode=driving`;
  if (o.maps_url.trim()) return o.maps_url.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.address)}&travelmode=driving`;
}
export const wazeLink = (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

/** Saca coordenadas de un enlace de Google Maps o de un texto "lat, lng". */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const pats = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/];
  for (const p of pats) {
    const m = text.match(p);
    if (m) {
      const lat = Number(m[1]); const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/** Distancia en km en línea recta. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371; const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r; const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const trackUrl = (code: string) => `${location.origin}${location.pathname}#seguir/${code}`;

/** Mensaje de WhatsApp para el cliente según el estado. */
export function customerMessage(o: Order, business: string): string {
  const name = o.customer_name.split(' ')[0];
  const no = ` #${pad(o.number)}`;
  const body: Record<Status, string> = {
    confirmado: `Confirmamos tu pedido${no} por ${money(o.amount)} (${PAYMENT_LABEL[o.payment]}).`,
    preparacion: `Tu pedido${no} ya se está preparando.`,
    despacho: `Tu pedido${no} está listo y lo estamos despachando.`,
    ruta: `Tu pedido${no} va en camino${o.driver_name ? ` con ${o.driver_name.split(' ')[0]}` : ''}. Puedes ver al motorizado en el mapa.`,
    entregado: `Tu pedido${no} fue entregado. ¡Gracias por tu compra, que lo disfrutes!`,
    anulado: `Tu pedido${no} fue anulado. Escríbenos si tienes alguna duda.`,
  };
  const follow = o.status === 'entregado' || o.status === 'anulado' ? '' : `\n\nSigue tu pedido en vivo aquí: ${trackUrl(o.code)}`;
  return `Hola${name ? ` ${name}` : ''}, te escribe ${business}.\n${body[o.status]}${follow}`;
}
