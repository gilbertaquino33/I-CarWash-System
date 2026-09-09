-- Clean up stale WALK-IN sessions left behind when backend/camera.py stops
-- mid-session (crash, shut down, CCTV offline). Those rows keep
-- status='Washing' / 'Waiting' with occupied=true forever, so the staff
-- New Walk-in screen shows a bay "Occupied"/"Washing" with a timer ticking
-- from washing_started_at even though no camera is running -- exactly the
-- "walang camera pero may nadetect?" bug.
--
-- Only ever touches WALK-IN rows (customer_id IS NULL, scheduled_at IS
-- NULL). Reserved bookings are handled by sweep_no_show_reservations().
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

create or replace function sweep_stale_walkin_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  record;
  v_count int := 0;
begin
  -- 1) "Washing" walk-ins whose session never ended. A real wash is
  --    minutes; 2h+ means camera.py never saw the car leave (it stopped).
  for v_row in
    select id, shop_id, bay_name
    from reservation
    where status = 'Washing'
      and customer_id is null
      and scheduled_at is null
      and washing_started_at is not null
      and washing_started_at < now() - interval '2 hours'
  loop
    update reservation
       set status = 'Cancelled',
           occupied = false
     where id = v_row.id;

    if v_row.bay_name is not null then
      update bays
         set occupied = false,
             reserved = false,
             reserved_reservation_id = null,
             updated_at = now()
       where shop_id = v_row.shop_id and bay_name = v_row.bay_name;
    end if;

    v_count := v_count + 1;
  end loop;

  -- 2) "Waiting" walk-ins that were detected but never had a service
  --    picked, and it's been long enough that the car is gone / camera off.
  for v_row in
    select id, shop_id, bay_name
    from reservation
    where status = 'Waiting'
      and customer_id is null
      and scheduled_at is null
      and created_at < now() - interval '60 minutes'
  loop
    update reservation
       set status = 'Cancelled',
           occupied = false
     where id = v_row.id;

    if v_row.bay_name is not null then
      update bays
         set occupied = false,
             reserved = false,
             reserved_reservation_id = null,
             updated_at = now()
       where shop_id = v_row.shop_id and bay_name = v_row.bay_name;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function sweep_stale_walkin_sessions() to authenticated;

-- Server-side heartbeat: pure SQL, no pg_net / Vault needed.
create extension if not exists pg_cron;

select cron.unschedule('sweep-stale-walkins')
where exists (select 1 from cron.job where jobname = 'sweep-stale-walkins');

select cron.schedule(
  'sweep-stale-walkins',
  '*/5 * * * *',
  $$ select sweep_stale_walkin_sessions(); $$
);

-- To wipe phantom sessions RIGHT NOW (e.g. during a demo) without waiting
-- for the thresholds, run this once by hand:
--   update reservation
--      set status = 'Cancelled', occupied = false
--    where customer_id is null and scheduled_at is null
--      and status in ('Waiting', 'Washing');
--   update bays set occupied = false, reserved = false,
--          reserved_reservation_id = null, updated_at = now();
