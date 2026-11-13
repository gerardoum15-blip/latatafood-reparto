import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import type { DriverLoc, Order, OrderInput, Session, Staff, Status, Tracking } from './types';
import { demoRpc } from './demo';

export const DEMO = !(SUPABASE_URL && SUPABASE_KEY);

const supabase = DEMO ? null : createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

/** Error de sesión vencida o usuario desactivado: hay que volver a ingresar el PIN. */
export class SessionExpired extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) return demoRpc(fn, args) as T;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (/SESION_VENCIDA/.test(error.message)) throw new SessionExpired('Tu sesión venció. Ingresa tu PIN otra vez.');
    if (/could not find the function/i.test(error.message)) throw new Error('Falta ejecutar supabase/setup.sql en Supabase (SQL Editor).');
    throw new Error(error.message);
  }
  return data as T;
}

// ---------- Sesión guardada en el celular ----------
const KEY = 'reparto-sesion';
export function savedSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null; } catch { return null; }
}
export function storeSession(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
}

export const api = {
  needsSetup: () => rpc<boolean>('rep_needs_setup'),
  setup: (name: string, pin: string) => rpc<Session>('rep_setup', { p_name: name, p_pin: pin }),
  login: async (pin: string) => {
    const r = await rpc<Session & { error?: string }>('rep_login', { p_pin: pin });
    if (r.error) throw new Error(r.error);
    return r;
  },
  logout: (token: string) => rpc<void>('rep_logout', { p_token: token }),
  me: (token: string) => rpc<Session>('rep_me', { p_token: token }),
  listStaff: (token: string) => rpc<Staff[]>('rep_list_staff', { p_token: token }),
  saveStaff: (token: string, s: Partial<Staff> & { pin?: string }) => rpc<string>('rep_save_staff', {
    p_token: token, p_id: s.id ?? null, p_name: s.name ?? '', p_role: s.role ?? 'driver',
    p_phone: s.phone ?? '', p_pin: s.pin ?? '', p_active: s.active ?? true,
  }),
  listOrders: (token: string, days = 2) => rpc<Order[]>('rep_list_orders', { p_token: token, p_days: days }),
  saveOrder: (token: string, o: OrderInput) => rpc<Order>('rep_save_order', { p_token: token, p: o }),
  setStatus: (token: string, id: string, status: Status) => rpc<Order>('rep_set_status', { p_token: token, p_id: id, p_status: status }),
  deleteOrder: (token: string, id: string) => rpc<void>('rep_delete_order', { p_token: token, p_id: id }),
  updateLocation: (token: string, c: GeolocationCoordinates) => rpc<void>('rep_update_location', {
    p_token: token, p_lat: c.latitude, p_lng: c.longitude, p_accuracy: c.accuracy,
    p_heading: c.heading ?? null, p_speed: c.speed ?? null,
  }),
  driverLocations: (token: string) => rpc<DriverLoc[]>('rep_driver_locations', { p_token: token }),
  track: (code: string) => rpc<Tracking | null>('rep_track', { p_code: code }),
};
