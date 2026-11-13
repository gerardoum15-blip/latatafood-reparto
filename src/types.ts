export type Status = 'confirmado' | 'preparacion' | 'despacho' | 'ruta' | 'entregado' | 'anulado';
export type Payment = 'efectivo' | 'yape' | 'plin' | 'tarjeta' | 'pagado';
export type Role = 'admin' | 'driver';

export interface Session { token: string; id: string; name: string; role: Role }

export interface Staff { id: string; name: string; role: Role; phone: string; active: boolean }

export interface Order {
  id: string;
  code: string;
  number: number;
  ticket: string;
  status: Status;
  customer_name: string;
  customer_phone: string;
  address: string;
  reference: string;
  maps_url: string;
  dest_lat: number | null;
  dest_lng: number | null;
  payment: Payment;
  amount: number;
  pay_with: number | null;
  items: string;
  notes: string;
  driver_id: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  times: Partial<Record<Status, string>>;
  created_at: string;
  updated_at: string;
}

export type OrderInput = Partial<Order>;

export interface DriverLoc { staff_id: string; name: string; lat: number; lng: number; updated_at: string }

export interface Tracking {
  number: number;
  ticket: string;
  status: Status;
  times: Partial<Record<Status, string>>;
  first_name: string;
  address: string;
  dest: { lat: number; lng: number } | null;
  payment: Payment;
  amount: number;
  driver: string | null;
  location: { lat: number; lng: number; heading: number | null; updated_at: string } | null;
  /** Pedidos antes del suyo en la cola. */
  ahead: number;
  /** Minutos aproximados para que llegue (null si ya se entregó o se anuló). */
  eta_min: number | null;
  updated_at: string;
}
