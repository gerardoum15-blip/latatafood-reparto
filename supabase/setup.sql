-- Reparto: pedidos para el motorizado y seguimiento en vivo para el cliente.
-- Pegar completo en Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- Todas las tablas empiezan con "rep_", así que puede convivir en el mismo proyecto de Supabase
-- que ya usa La Tata Food sin tocar sus datos.
--
-- Seguridad: las tablas no se pueden leer ni escribir directo desde la web. Todo pasa por las
-- funciones de abajo, que piden el código de sesión que se obtiene al ingresar con PIN.
-- El cliente solo puede consultar su pedido con el código secreto del enlace de seguimiento.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------

create table if not exists public.rep_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('admin', 'driver')),
  phone text not null default '',
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rep_sessions (
  token text primary key,
  staff_id uuid not null references public.rep_staff(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.rep_login_fails (
  at timestamptz not null default now()
);

create sequence if not exists public.rep_order_number;

create table if not exists public.rep_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  number integer not null default nextval('public.rep_order_number'),
  status text not null default 'confirmado'
    check (status in ('confirmado', 'preparacion', 'despacho', 'ruta', 'entregado', 'anulado')),
  customer_name text not null default '',
  customer_phone text not null default '',
  address text not null default '',
  reference text not null default '',
  maps_url text not null default '',
  dest_lat double precision,
  dest_lng double precision,
  payment text not null default 'efectivo'
    check (payment in ('efectivo', 'yape', 'plin', 'tarjeta', 'pagado')),
  amount numeric(10, 2) not null default 0,
  pay_with numeric(10, 2),
  items text not null default '',
  notes text not null default '',
  driver_id uuid references public.rep_staff(id) on delete set null,
  times jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- N° de ticket (el que aparece arriba en el ticket impreso). Si queda vacío se usa el número automático.
alter table public.rep_orders add column if not exists ticket text not null default '';
create index if not exists rep_orders_created on public.rep_orders (created_at desc);
create index if not exists rep_orders_ticket on public.rep_orders (ticket);

create table if not exists public.rep_track_fails (
  at timestamptz not null default now()
);
create index if not exists rep_orders_driver on public.rep_orders (driver_id, status);

create table if not exists public.rep_locations (
  staff_id uuid primary key references public.rep_staff(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);

-- Sin políticas: nadie entra directo a las tablas, solo por las funciones.
alter table public.rep_staff enable row level security;
alter table public.rep_sessions enable row level security;
alter table public.rep_login_fails enable row level security;
alter table public.rep_orders enable row level security;
alter table public.rep_locations enable row level security;
alter table public.rep_track_fails enable row level security;

-- ---------- Ayudas internas ----------

-- Devuelve quién es el dueño de la sesión, o da error.
create or replace function public.rep_who(p_token text) returns public.rep_staff
language plpgsql stable security definer set search_path = public as $$
declare s public.rep_staff;
begin
  select st.* into s from public.rep_sessions se join public.rep_staff st on st.id = se.staff_id
  where se.token = p_token and se.created_at > now() - interval '60 days' and st.active;
  if not found then raise exception 'SESION_VENCIDA' using errcode = 'P0001'; end if;
  return s;
end $$;

create or replace function public.rep_order_json(o public.rep_orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object(
    'driver_name', (select name from public.rep_staff where id = o.driver_id),
    'driver_phone', (select phone from public.rep_staff where id = o.driver_id));
$$;

-- ---------- Ingreso ----------

-- Crea el primer administrador. Solo funciona mientras no exista ningún usuario.
create or replace function public.rep_setup(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.rep_staff; t text;
begin
  if exists (select 1 from public.rep_staff) then raise exception 'YA_CONFIGURADO'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'El PIN debe tener de 4 a 8 números.'; end if;
  insert into public.rep_staff (name, role, pin_hash) values (trim(p_name), 'admin', crypt(p_pin, gen_salt('bf')))
  returning * into s;
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.rep_sessions (token, staff_id) values (t, s.id);
  return jsonb_build_object('token', t, 'id', s.id, 'name', s.name, 'role', s.role);
end $$;

create or replace function public.rep_needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.rep_staff);
$$;

create or replace function public.rep_login(p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.rep_staff; t text;
begin
  -- Freno contra quien prueba PINs al azar: máximo 30 intentos fallidos cada 15 minutos.
  delete from public.rep_login_fails where at < now() - interval '15 minutes';
  if (select count(*) from public.rep_login_fails) >= 30 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;
  select * into s from public.rep_staff where active and pin_hash = crypt(p_pin, pin_hash) limit 1;
  if not found then
    -- Se devuelve el error (sin "raise") para que el intento fallido sí quede registrado.
    insert into public.rep_login_fails default values;
    return jsonb_build_object('error', 'PIN incorrecto.');
  end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.rep_sessions (token, staff_id) values (t, s.id);
  delete from public.rep_sessions where created_at < now() - interval '60 days';
  return jsonb_build_object('token', t, 'id', s.id, 'name', s.name, 'role', s.role);
end $$;

create or replace function public.rep_logout(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.rep_sessions where token = p_token;
$$;

create or replace function public.rep_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token);
begin
  return jsonb_build_object('token', p_token, 'id', s.id, 'name', s.name, 'role', s.role);
end $$;

-- ---------- Personal (solo administrador) ----------

create or replace function public.rep_list_staff(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token);
begin
  if s.role <> 'admin' then raise exception 'Solo el administrador.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'phone', phone, 'active', active) order by role, name)
    from public.rep_staff), '[]'::jsonb);
end $$;

-- p_pin vacío = no cambiar el PIN.
create or replace function public.rep_save_staff(p_token text, p_id uuid, p_name text, p_role text, p_phone text, p_pin text, p_active boolean) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare s public.rep_staff := public.rep_who(p_token); v_id uuid;
begin
  if s.role <> 'admin' then raise exception 'Solo el administrador.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribe el nombre.'; end if;
  if p_role not in ('admin', 'driver') then raise exception 'Rol no válido.'; end if;
  if coalesce(p_pin, '') <> '' then
    if p_pin !~ '^[0-9]{4,8}$' then raise exception 'El PIN debe tener de 4 a 8 números.'; end if;
    if exists (select 1 from public.rep_staff where id is distinct from p_id and pin_hash = crypt(p_pin, pin_hash)) then
      raise exception 'Ese PIN ya lo usa otra persona. Elige otro.';
    end if;
  end if;
  if p_id is null then
    if coalesce(p_pin, '') = '' then raise exception 'Escribe un PIN.'; end if;
    insert into public.rep_staff (name, role, phone, pin_hash, active)
    values (trim(p_name), p_role, coalesce(p_phone, ''), crypt(p_pin, gen_salt('bf')), coalesce(p_active, true))
    returning id into v_id;
  else
    if p_id = s.id and (p_role <> 'admin' or not p_active) then
      raise exception 'No puedes quitarte el acceso de administrador a ti mismo.';
    end if;
    update public.rep_staff set name = trim(p_name), role = p_role, phone = coalesce(p_phone, ''), active = coalesce(p_active, true),
      pin_hash = case when coalesce(p_pin, '') = '' then pin_hash else crypt(p_pin, gen_salt('bf')) end
    where id = p_id returning id into v_id;
    if not coalesce(p_active, true) then delete from public.rep_sessions where staff_id = p_id; end if;
  end if;
  return v_id;
end $$;

-- ---------- Pedidos ----------

-- Administrador: pedidos de los últimos p_days días. Driver: los suyos pendientes y los entregados hoy.
create or replace function public.rep_list_orders(p_token text, p_days integer default 2) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token);
begin
  if s.role = 'admin' then
    return coalesce((select jsonb_agg(public.rep_order_json(o) order by o.created_at desc)
      from public.rep_orders o where o.created_at > now() - make_interval(days => greatest(1, least(p_days, 60)))), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(public.rep_order_json(o) order by o.created_at desc)
    from public.rep_orders o
    where o.driver_id = s.id
      and (o.status not in ('entregado', 'anulado') or o.updated_at > now() - interval '14 hours')), '[]'::jsonb);
end $$;

create or replace function public.rep_save_order(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.rep_staff := public.rep_who(p_token); o public.rep_orders; v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  if s.role <> 'admin' then raise exception 'Solo el administrador.'; end if;
  if v_id is null then
    insert into public.rep_orders (code, times) values (
      -- Código del enlace del cliente: 12 letras/números al azar, imposible de adivinar.
      translate(encode(gen_random_bytes(9), 'base64'), '+/', 'xy'),
      jsonb_build_object('confirmado', now()))
    returning id into v_id;
  end if;
  update public.rep_orders set
    ticket = trim(coalesce(p ->> 'ticket', '')),
    customer_name = coalesce(p ->> 'customer_name', ''),
    customer_phone = coalesce(p ->> 'customer_phone', ''),
    address = coalesce(p ->> 'address', ''),
    reference = coalesce(p ->> 'reference', ''),
    maps_url = coalesce(p ->> 'maps_url', ''),
    dest_lat = nullif(p ->> 'dest_lat', '')::double precision,
    dest_lng = nullif(p ->> 'dest_lng', '')::double precision,
    payment = coalesce(p ->> 'payment', 'efectivo'),
    amount = coalesce(nullif(p ->> 'amount', '')::numeric, 0),
    pay_with = nullif(p ->> 'pay_with', '')::numeric,
    items = coalesce(p ->> 'items', ''),
    notes = coalesce(p ->> 'notes', ''),
    driver_id = nullif(p ->> 'driver_id', '')::uuid,
    updated_at = now()
  where id = v_id returning * into o;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  return public.rep_order_json(o);
end $$;

-- El administrador puede poner cualquier estado. El driver solo avanza sus propios pedidos
-- desde "En despacho" en adelante.
create or replace function public.rep_set_status(p_token text, p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token); o public.rep_orders;
begin
  select * into o from public.rep_orders where id = p_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if s.role <> 'admin' then
    if o.driver_id is distinct from s.id then raise exception 'Este pedido no está asignado a ti.'; end if;
    if p_status not in ('despacho', 'ruta', 'entregado') then raise exception 'No puedes poner ese estado.'; end if;
  end if;
  update public.rep_orders set status = p_status, updated_at = now(),
    times = times || jsonb_build_object(p_status, now())
  where id = p_id returning * into o;
  return public.rep_order_json(o);
end $$;

create or replace function public.rep_delete_order(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token);
begin
  if s.role <> 'admin' then raise exception 'Solo el administrador.'; end if;
  delete from public.rep_orders where id = p_id;
end $$;

-- ---------- Ubicación ----------

create or replace function public.rep_update_location(p_token text, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_heading double precision, p_speed double precision) returns void
language plpgsql security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token);
begin
  insert into public.rep_locations (staff_id, lat, lng, accuracy, heading, speed, updated_at)
  values (s.id, p_lat, p_lng, p_accuracy, p_heading, p_speed, now())
  on conflict (staff_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
    heading = excluded.heading, speed = excluded.speed, updated_at = now();
end $$;

create or replace function public.rep_driver_locations(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.rep_staff := public.rep_who(p_token);
begin
  if s.role <> 'admin' then raise exception 'Solo el administrador.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('staff_id', l.staff_id, 'name', st.name, 'lat', l.lat, 'lng', l.lng, 'updated_at', l.updated_at))
    from public.rep_locations l join public.rep_staff st on st.id = l.staff_id
    where st.active and l.updated_at > now() - interval '12 hours'), '[]'::jsonb);
end $$;

-- ---------- Seguimiento del cliente (público, con el código secreto) ----------
-- No muestra el teléfono ni el nombre completo. La ubicación del motorizado solo se envía
-- mientras el pedido está "En ruta".
create or replace function public.rep_track(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.rep_orders; v_loc jsonb := null; v_driver text;
  v_ahead integer := 0; v_avg numeric; v_n integer; v_elapsed numeric; v_eta integer := null;
begin
  select * into o from public.rep_orders where code = p_code;
  if not found then return null; end if;

  -- Tiempo aproximado según la demanda del momento:
  --   promedio real (confirmado → entregado) de los últimos 30 pedidos entregados en 7 días
  --   (si hay menos de 3, se usan 35 min) + 4 min por cada pedido que está antes en la cola.
  if o.status in ('confirmado', 'preparacion', 'despacho', 'ruta') then
    select count(*) into v_ahead from public.rep_orders x
    where x.status in ('confirmado', 'preparacion', 'despacho')
      and x.created_at < o.created_at and x.created_at > now() - interval '12 hours' and x.id <> o.id;
    select avg(m), count(*) into v_avg, v_n from (
      select extract(epoch from ((times ->> 'entregado')::timestamptz - (times ->> 'confirmado')::timestamptz)) / 60 as m
      from public.rep_orders
      where status = 'entregado' and times ? 'entregado' and times ? 'confirmado' and updated_at > now() - interval '7 days'
      order by updated_at desc limit 30) t
    where m between 5 and 180;
    if coalesce(v_n, 0) < 3 then v_avg := 35; end if;
    v_avg := least(greatest(v_avg, 15), 120);
    v_elapsed := extract(epoch from (now() - coalesce((o.times ->> 'confirmado')::timestamptz, o.created_at))) / 60;
    if o.status = 'ruta' then v_ahead := 0; end if;
    v_eta := greatest(case when o.status = 'ruta' then 3 else 5 end, round(v_avg + v_ahead * 4 - v_elapsed))::integer;
  end if;
  select split_part(name, ' ', 1) into v_driver from public.rep_staff where id = o.driver_id;
  if o.status = 'ruta' then
    select jsonb_build_object('lat', lat, 'lng', lng, 'heading', heading, 'updated_at', updated_at) into v_loc
    from public.rep_locations where staff_id = o.driver_id;
  end if;
  return jsonb_build_object(
    'number', o.number,
    'ticket', o.ticket,
    'status', o.status,
    'times', o.times,
    'first_name', split_part(o.customer_name, ' ', 1),
    'address', o.address,
    'dest', case when o.dest_lat is null then null else jsonb_build_object('lat', o.dest_lat, 'lng', o.dest_lng) end,
    'payment', o.payment,
    'amount', o.amount,
    'driver', v_driver,
    'location', v_loc,
    'ahead', v_ahead,
    'eta_min', v_eta,
    'updated_at', o.updated_at
  );
end $$;

-- El cliente busca su pedido con el N° de ticket + los últimos 4 dígitos de su celular.
-- Devuelve el código secreto del seguimiento (o un error). Así nadie puede ver pedidos ajenos
-- solo probando números de ticket. Máximo 60 intentos fallidos cada 15 minutos.
create or replace function public.rep_find(p_ticket text, p_phone4 text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t text := ltrim(regexp_replace(coalesce(p_ticket, ''), '[^0-9A-Za-z-]', '', 'g'), '0'); v_code text;
begin
  delete from public.rep_track_fails where at < now() - interval '15 minutes';
  if (select count(*) from public.rep_track_fails) >= 60 then
    return jsonb_build_object('error', 'Demasiados intentos. Espera unos minutos.');
  end if;
  if v_t = '' or coalesce(p_phone4, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('error', 'Escribe el N° de ticket y los últimos 4 dígitos de tu celular.');
  end if;
  select code into v_code from public.rep_orders
  where created_at > now() - interval '3 days'
    and (ltrim(ticket, '0') = v_t or (ticket = '' and number::text = v_t))
    and right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 4) = p_phone4
  order by created_at desc limit 1;
  if v_code is null then
    insert into public.rep_track_fails default values;
    return jsonb_build_object('error', 'No encontramos un pedido con esos datos. Revisa el N° de ticket y tu celular.');
  end if;
  return jsonb_build_object('code', v_code);
end $$;

-- ---------- Permisos ----------

revoke all on function public.rep_who(text) from public, anon, authenticated;
revoke all on function public.rep_order_json(public.rep_orders) from public, anon, authenticated;
grant execute on function public.rep_needs_setup() to anon, authenticated;
grant execute on function public.rep_setup(text, text) to anon, authenticated;
grant execute on function public.rep_login(text) to anon, authenticated;
grant execute on function public.rep_logout(text) to anon, authenticated;
grant execute on function public.rep_me(text) to anon, authenticated;
grant execute on function public.rep_list_staff(text) to anon, authenticated;
grant execute on function public.rep_save_staff(text, uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.rep_list_orders(text, integer) to anon, authenticated;
grant execute on function public.rep_save_order(text, jsonb) to anon, authenticated;
grant execute on function public.rep_set_status(text, uuid, text) to anon, authenticated;
grant execute on function public.rep_delete_order(text, uuid) to anon, authenticated;
grant execute on function public.rep_update_location(text, double precision, double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.rep_driver_locations(text) to anon, authenticated;
grant execute on function public.rep_track(text) to anon, authenticated;
grant execute on function public.rep_find(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
