/**
 * MODO DEMO: imita las funciones de Supabase guardando todo en este navegador.
 * Funciona entre pestañas del mismo navegador (ej. una pestaña admin, otra driver, otra cliente).
 * PIN de prueba: 1234 (administrador) y 1111 (driver).
 */
import type { DriverLoc, Order, Staff, Status } from './types';

type DemoStaff = Staff & { pin: string };
interface DemoDb {
  staff: DemoStaff[];
  sessions: Record<string, string>;
  orders: Order[];
  locations: Record<string, { lat: number; lng: number; heading: number | null; updated_at: string }>;
  seq: number;
}
const KEY = 'reparto-demo-db';
const uid = () => crypto.randomUUID();
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('');
const now = () => new Date().toISOString();

function load(): DemoDb {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '') as DemoDb;
    if (d?.staff) return d;
  } catch { /* nuevo */ }
  return {
    staff: [
      { id: uid(), name: 'Administrador', role: 'admin', phone: '', active: true, pin: '1234' },
      { id: uid(), name: 'Carlos Motorizado', role: 'driver', phone: '987654321', active: true, pin: '1111' },
    ],
    sessions: {}, orders: [], locations: {}, seq: 0,
  };
}
function save(d: DemoDb) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* lleno */ } }

function who(d: DemoDb, token: unknown) {
  const s = d.staff.find((x) => x.id === d.sessions[String(token)] && x.active);
  if (!s) throw new Error('SESION_VENCIDA');
  return s;
}
const pub = ({ pin: _pin, ...s }: DemoStaff): Staff => s;
const withDriver = (d: DemoDb, o: Order): Order => {
  const dr = d.staff.find((s) => s.id === o.driver_id);
  return { ...o, driver_name: dr?.name ?? null, driver_phone: dr?.phone ?? null };
};
const onlyAdmin = (s: DemoStaff) => { if (s.role !== 'admin') throw new Error('Solo el administrador.'); };

export async function demoRpc(fn: string, a: Record<string, unknown>): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const d = load();
  try {
    switch (fn) {
      case 'rep_needs_setup': return false;
      case 'rep_login': {
        const s = d.staff.find((x) => x.active && x.pin === a.p_pin);
        if (!s) throw new Error('PIN incorrecto. (Demo: 1234 administrador, 1111 driver)');
        const t = uid(); d.sessions[t] = s.id;
        return { token: t, id: s.id, name: s.name, role: s.role };
      }
      case 'rep_logout': delete d.sessions[String(a.p_token)]; return null;
      case 'rep_me': { const s = who(d, a.p_token); return { token: a.p_token, id: s.id, name: s.name, role: s.role }; }
      case 'rep_list_staff': onlyAdmin(who(d, a.p_token)); return d.staff.map(pub);
      case 'rep_save_staff': {
        onlyAdmin(who(d, a.p_token));
        const pin = String(a.p_pin ?? '');
        if (!String(a.p_name).trim()) throw new Error('Escribe el nombre.');
        if (pin && !/^\d{4,8}$/.test(pin)) throw new Error('El PIN debe tener de 4 a 8 números.');
        if (pin && d.staff.some((s) => s.pin === pin && s.id !== a.p_id)) throw new Error('Ese PIN ya lo usa otra persona. Elige otro.');
        const fields = { name: String(a.p_name).trim(), role: a.p_role as Staff['role'], phone: String(a.p_phone ?? ''), active: Boolean(a.p_active) };
        if (!a.p_id) {
          if (!pin) throw new Error('Escribe un PIN.');
          const s = { id: uid(), ...fields, pin }; d.staff.push(s); return s.id;
        }
        const s = d.staff.find((x) => x.id === a.p_id)!;
        Object.assign(s, fields, pin ? { pin } : {});
        return s.id;
      }
      case 'rep_list_orders': {
        const s = who(d, a.p_token);
        const list = s.role === 'admin'
          ? d.orders.filter((o) => Date.now() - +new Date(o.created_at) < Number(a.p_days ?? 2) * 864e5)
          : d.orders.filter((o) => o.driver_id === s.id && (!['entregado', 'anulado'].includes(o.status) || Date.now() - +new Date(o.updated_at) < 14 * 36e5));
        return list.map((o) => withDriver(d, o)).sort((x, y) => y.created_at.localeCompare(x.created_at));
      }
      case 'rep_save_order': {
        onlyAdmin(who(d, a.p_token));
        const p = a.p as Partial<Order>;
        let o = d.orders.find((x) => x.id === p.id);
        if (!o) {
          o = { id: uid(), code: code(), number: ++d.seq, status: 'confirmado', times: { confirmado: now() }, created_at: now() } as Order;
          d.orders.push(o);
        }
        Object.assign(o, {
          ticket: (p.ticket ?? '').trim(), customer_name: p.customer_name ?? '', customer_phone: p.customer_phone ?? '', address: p.address ?? '',
          reference: p.reference ?? '', maps_url: p.maps_url ?? '', dest_lat: p.dest_lat ?? null, dest_lng: p.dest_lng ?? null,
          payment: p.payment ?? 'efectivo', amount: Number(p.amount) || 0, pay_with: p.pay_with ? Number(p.pay_with) : null,
          items: p.items ?? '', notes: p.notes ?? '', driver_id: p.driver_id || null, updated_at: now(),
        });
        return withDriver(d, o);
      }
      case 'rep_set_status': {
        const s = who(d, a.p_token);
        const o = d.orders.find((x) => x.id === a.p_id);
        if (!o) throw new Error('Pedido no encontrado.');
        const st = a.p_status as Status;
        if (s.role !== 'admin') {
          if (o.driver_id !== s.id) throw new Error('Este pedido no está asignado a ti.');
          if (!['despacho', 'ruta', 'entregado'].includes(st)) throw new Error('No puedes poner ese estado.');
        }
        o.status = st; o.updated_at = now(); o.times = { ...o.times, [st]: now() };
        return withDriver(d, o);
      }
      case 'rep_delete_order': onlyAdmin(who(d, a.p_token)); d.orders = d.orders.filter((o) => o.id !== a.p_id); return null;
      case 'rep_update_location': {
        const s = who(d, a.p_token);
        d.locations[s.id] = { lat: Number(a.p_lat), lng: Number(a.p_lng), heading: (a.p_heading as number) ?? null, updated_at: now() };
        return null;
      }
      case 'rep_driver_locations': {
        onlyAdmin(who(d, a.p_token));
        return Object.entries(d.locations).map(([id, l]): DriverLoc => ({ staff_id: id, name: d.staff.find((s) => s.id === id)?.name ?? '', lat: l.lat, lng: l.lng, updated_at: l.updated_at }));
      }
      case 'rep_track': {
        const o = d.orders.find((x) => x.code === a.p_code);
        if (!o) return null;
        const dr = d.staff.find((s) => s.id === o.driver_id);
        return {
          number: o.number, ticket: o.ticket ?? '', status: o.status, times: o.times, first_name: o.customer_name.split(' ')[0], address: o.address,
          dest: o.dest_lat != null && o.dest_lng != null ? { lat: o.dest_lat, lng: o.dest_lng } : null,
          payment: o.payment, amount: o.amount, driver: dr ? dr.name.split(' ')[0] : null,
          location: o.status === 'ruta' && o.driver_id ? d.locations[o.driver_id] ?? null : null, updated_at: o.updated_at,
          ...(() => {
            if (!['confirmado', 'preparacion', 'despacho', 'ruta'].includes(o.status)) return { ahead: 0, eta_min: null };
            const ahead = o.status === 'ruta' ? 0 : d.orders.filter((x) => ['confirmado', 'preparacion', 'despacho'].includes(x.status) && x.created_at < o.created_at).length;
            const elapsed = (Date.now() - +new Date(o.times.confirmado ?? o.created_at)) / 60000;
            return { ahead, eta_min: Math.max(o.status === 'ruta' ? 3 : 5, Math.round(35 + ahead * 4 - elapsed)) };
          })(),
        };
      }
      case 'rep_find': {
        const t = String(a.p_ticket ?? '').replace(/[^0-9A-Za-z-]/g, '').replace(/^0+/, '');
        const o = [...d.orders].reverse().find((x) => ((x.ticket ?? '').replace(/^0+/, '') === t || (!x.ticket && String(x.number) === t)) && x.customer_phone.replace(/\D/g, '').slice(-4) === a.p_phone4);
        return o ? { code: o.code } : { error: 'No encontramos un pedido con esos datos. Revisa el N° de ticket y tu celular.' };
      }
    }
    throw new Error(`Función desconocida ${fn}`);
  } finally {
    save(d);
  }
}
