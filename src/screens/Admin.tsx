import { useMemo, useState } from 'react';
import { api } from '../api';
import { BUSINESS } from '../config';
import { usePoll } from '../hooks';
import type { Order, Session, Staff, Status } from '../types';
import { STATUS_LABEL, STEPS, chargeText, customerMessage, minutesAgo, nextStatus, orderNo, pad, time, trackUrl, waLink } from '../lib';
import { Badge, Modal, copy, errMsg, toast } from '../components/ui';
import { LiveMap, type MapPoint } from '../components/Map';
import { OrderForm } from './OrderForm';
import { StaffList } from './StaffList';
import { TopBar, useSessionGuard } from './shared';

type Tab = 'pedidos' | 'mapa' | 'personal';
type Filter = 'activos' | 'entregados' | 'todos' | Status;
const ACTIVE: Status[] = ['confirmado', 'preparacion', 'despacho', 'ruta'];

export function Admin({ session, onOut }: { session: Session; onOut: () => void }) {
  const [tab, setTab] = useState<Tab>('pedidos');
  const guard = useSessionGuard(onOut);
  const orders = usePoll(() => guard(api.listOrders(session.token, 2)), 6000, [session.token]);
  const staff = usePoll(() => guard(api.listStaff(session.token)), 60000, [session.token]);
  const drivers = (staff.data ?? []).filter((s) => s.role === 'driver' && s.active);
  const activeCount = (orders.data ?? []).filter((o) => ACTIVE.includes(o.status)).length;

  return (
    <div className="app">
      <TopBar session={session} onOut={onOut} />
      <nav className="tabs" role="tablist">
        {([['pedidos', `Pedidos${activeCount ? ` (${activeCount})` : ''}`], ['mapa', 'Mapa en vivo'], ['personal', 'Personal']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <main className="main">
        {tab === 'pedidos' && <Orders session={session} orders={orders.data ?? []} loaded={orders.loaded} error={orders.error} drivers={drivers} refresh={orders.refresh} />}
        {tab === 'mapa' && <DriversMap session={session} orders={orders.data ?? []} guard={guard} />}
        {tab === 'personal' && <StaffList session={session} staff={staff.data ?? []} refresh={staff.refresh} />}
      </main>
    </div>
  );
}

function Orders({ session, orders, loaded, error, drivers, refresh }: {
  session: Session; orders: Order[]; loaded: boolean; error: unknown; drivers: Staff[]; refresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>('activos');
  const [editing, setEditing] = useState<Order | 'new' | null>(null);
  const [created, setCreated] = useState<Order | null>(null);
  // Cola: los activos van por estado y, dentro de cada estado, el más antiguo primero.
  const list = orders
    .filter((o) => filter === 'todos' || (filter === 'activos' ? ACTIVE.includes(o.status) : filter === 'entregados' ? !ACTIVE.includes(o.status) : o.status === filter))
    .sort((a, b) => filter === 'activos' || ACTIVE.includes(filter as Status)
      ? ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status) || a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at));
  const count = (s: Status) => orders.filter((o) => o.status === s).length;

  const setStatus = async (o: Order, s: Status) => {
    try { await api.setStatus(session.token, o.id, s); await refresh(); toast(`#${orderNo(o)} → ${STATUS_LABEL[s]}`); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
  const assign = async (o: Order, driver_id: string) => {
    try { await api.saveOrder(session.token, { ...o, driver_id: driver_id || null }); await refresh(); toast('Motorizado asignado'); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
  const remove = async (o: Order) => {
    if (!confirm(`¿Borrar el pedido #${orderNo(o)}? Esto no se puede deshacer.`)) return;
    try { await api.deleteOrder(session.token, o.id); await refresh(); } catch (e) { toast(errMsg(e), 'err'); }
  };

  return (
    <>
      <div className="row between wrap toolbar">
        <div className="chips" role="radiogroup" aria-label="Filtrar">
          {(['activos', 'entregados', 'todos'] as Filter[]).map((k) => (
            <button key={k} role="radio" aria-checked={filter === k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>＋ Nuevo pedido</button>
      </div>
      <div className="queue" role="group" aria-label="Pedidos por estado">
        {ACTIVE.map((st) => (
          <button key={st} className={`queue-box st-${st} ${filter === st ? 'on' : ''}`} onClick={() => setFilter(filter === st ? 'activos' : st)} aria-pressed={filter === st}>
            <b>{count(st)}</b><span>{STATUS_LABEL[st]}</span>
          </button>
        ))}
        <button className={`queue-box st-entregado ${filter === 'entregados' ? 'on' : ''}`} onClick={() => setFilter(filter === 'entregados' ? 'activos' : 'entregados')} aria-pressed={filter === 'entregados'}>
          <b>{count('entregado')}</b><span>Entregados</span>
        </button>
      </div>
      {Boolean(error) && <p className="err-text">No se pudo actualizar: {errMsg(error)}</p>}
      {!loaded && <p className="muted">Cargando…</p>}
      {loaded && !list.length && <div className="empty">{filter === 'activos' ? 'No hay pedidos en cola. Crea uno con “Nuevo pedido”.' : 'No hay pedidos en este estado.'}</div>}
      <div className="cards">
        {list.map((o) => {
          const next = nextStatus(o.status);
          return (
            <article key={o.id} className={`card order st-${o.status}`}>
              <header className="row between">
                <div className="row gap"><b className="num">#{orderNo(o)}</b><Badge status={o.status} /></div>
                <span className="muted small nowrap">{time(o.created_at)} · {minutesAgo(o.created_at)} min</span>
              </header>
              <div className="order-body">
                <p><b>{o.customer_name || 'Cliente'}</b> · <a href={waLink(o.customer_phone)} target="_blank" rel="noreferrer">{o.customer_phone}</a></p>
                <p className="muted small">📍 {o.address || 'Ubicación por Google Maps'}{o.maps_url ? <> · <a href={o.maps_url} target="_blank" rel="noreferrer">ver mapa</a></> : ''}</p>
                {o.items && <p className="small pre">{o.items}</p>}
                <p className="small charge">{chargeText(o)}</p>
              </div>
              <Progress status={o.status} />
              <div className="row gap wrap">
                <select className="grow" value={o.driver_id ?? ''} onChange={(e) => assign(o, e.target.value)} aria-label="Motorizado">
                  <option value="">🛵 Sin motorizado</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>🛵 {d.name}</option>)}
                </select>
                {next && <button className="btn primary grow" onClick={() => setStatus(o, next)}>→ {STATUS_LABEL[next]}</button>}
              </div>
              <div className="row gap wrap actions">
                <a className="btn small wa" href={waLink(o.customer_phone, customerMessage(o, BUSINESS))} target="_blank" rel="noreferrer">WhatsApp al cliente</a>
                <button className="btn small" onClick={() => copy(trackUrl(o.code))}>Copiar enlace</button>
                <a className="btn small" href={`#seguir/${o.code}`} target="_blank" rel="noreferrer">Ver rastreo</a>
                <button className="btn small" onClick={() => setEditing(o)}>Editar</button>
                <select className="small-select" value="" onChange={(e) => e.target.value && setStatus(o, e.target.value as Status)} aria-label="Cambiar estado">
                  <option value="">Cambiar estado…</option>
                  {[...STEPS.map((s) => s.key), 'anulado' as Status].filter((s) => s !== o.status).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                {(o.status === 'anulado' || o.status === 'confirmado') && <button className="btn small danger" onClick={() => remove(o)}>Borrar</button>}
              </div>
            </article>
          );
        })}
      </div>
      {editing && (
        <OrderForm
          session={session} drivers={drivers} order={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(o, isNew) => { setEditing(null); void refresh(); if (isNew) setCreated(o); else toast('Pedido guardado'); }}
        />
      )}
      {created && (
        <Modal title={`Pedido #${orderNo(created)} creado`} onClose={() => setCreated(null)}
          footer={<button className="btn block" onClick={() => setCreated(null)}>Listo</button>}>
          <p>Envía al cliente su enlace de seguimiento. Lo puede abrir cuando quiera, sin instalar nada.</p>
          <p className="link-box">{trackUrl(created.code)}</p>
          <div className="stack">
            <a className="btn wa block" href={waLink(created.customer_phone, customerMessage(created, BUSINESS))} target="_blank" rel="noreferrer" onClick={() => setCreated(null)}>Enviar por WhatsApp</a>
            <button className="btn block" onClick={() => copy(trackUrl(created.code))}>Copiar enlace</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Progress({ status }: { status: Status }) {
  const i = STEPS.findIndex((s) => s.key === status);
  if (status === 'anulado') return null;
  return (
    <ol className="mini-steps" aria-label={`Estado: ${STATUS_LABEL[status]}`}>
      {STEPS.map((s, k) => <li key={s.key} className={k < i ? 'done' : k === i ? 'now' : ''} title={s.label} />)}
    </ol>
  );
}

function DriversMap({ session, orders, guard }: { session: Session; orders: Order[]; guard: <T>(p: Promise<T>) => Promise<T> }) {
  const locs = usePoll(() => guard(api.driverLocations(session.token)), 5000, [session.token]);
  const points = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = (locs.data ?? []).map((l) => ({ id: l.staff_id, lat: l.lat, lng: l.lng, label: `${l.name.split(' ')[0]} · ${minutesAgo(l.updated_at)}m`, kind: 'driver', stale: minutesAgo(l.updated_at) > 3 }));
    for (const o of orders) if (o.status === 'ruta' && o.dest_lat != null && o.dest_lng != null) pts.push({ id: o.id, lat: o.dest_lat, lng: o.dest_lng, label: `#${orderNo(o)}`, kind: 'home' });
    return pts;
  }, [locs.data, orders]);
  return (
    <div className="stack">
      <LiveMap points={points} height="min(65vh, 560px)" follow={false} />
      {!locs.data?.length && locs.loaded && <p className="muted">Ningún motorizado ha compartido su ubicación en las últimas 12 horas.</p>}
      <ul className="plain">
        {(locs.data ?? []).map((l) => (
          <li key={l.staff_id} className="row between"><span>🛵 {l.name}</span><span className={`small ${minutesAgo(l.updated_at) > 3 ? 'err-text' : 'muted'}`}>actualizado hace {minutesAgo(l.updated_at)} min</span></li>
        ))}
      </ul>
    </div>
  );
}
