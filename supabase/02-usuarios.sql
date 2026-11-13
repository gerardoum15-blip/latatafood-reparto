-- Crea 1 administrador y 3 drivers con un PIN inicial cada uno.
-- Ejecutar DESPUÉS de setup.sql. Se puede ejecutar más de una vez: si ya existe una persona
-- con ese nombre, o alguien ya usa ese PIN, no la duplica.
-- Luego cambia nombres y PINs desde la app: Personal > Editar.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('Administrador', 'admin',  '7410'),
    ('Driver 1',      'driver', '1357'),
    ('Driver 2',      'driver', '2468'),
    ('Driver 3',      'driver', '3579')
  ) as t(name, role, pin) loop
    if exists (select 1 from public.rep_staff where name = r.name) then
      raise notice '% ya existe, no se crea de nuevo.', r.name;
    elsif exists (select 1 from public.rep_staff where pin_hash = extensions.crypt(r.pin, pin_hash)) then
      raise notice 'El PIN % ya lo usa otra persona: % no se creó.', r.pin, r.name;
    else
      insert into public.rep_staff (name, role, pin_hash) values (r.name, r.role, extensions.crypt(r.pin, extensions.gen_salt('bf')));
    end if;
  end loop;
end $$;

select name as nombre, case role when 'admin' then 'Administrador' else 'Driver' end as rol, active as activo
from public.rep_staff order by role, name;
