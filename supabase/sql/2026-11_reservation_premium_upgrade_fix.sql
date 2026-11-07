-- Fix: "Could not upgrade -- Something went wrong" on every Premium upgrade.
--
-- reservation.price is `real`, so `coalesce(price, 0) + v_added` (numeric)
-- comes out as double precision. upgrade_my_reservation_to_premium declares
-- `new_price numeric`, so its final RETURN QUERY failed with a type mismatch
-- and the whole upgrade was rolled back. Same cast added to
-- reservation_paid_value for consistency.
--
-- Paste into the Supabase SQL editor (2026-11_reservation_premium_upgrade.sql
-- now has the same fix for fresh installs).

create or replace function reservation_paid_value(r reservation)
returns numeric
language sql
stable
as $$
  select greatest(
    0,
    coalesce(r.price, 0)::numeric
      - case when coalesce(r.addon_amount, 0) > 0 and r.addon_paid_at is null
             then r.addon_amount else 0 end
  );
$$;

create or replace function upgrade_my_reservation_to_premium(p_reservation_id bigint)
returns table (added numeric, new_price numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row reservation%rowtype;
  v_basic numeric;
  v_premium numeric;
  v_added numeric;
begin
  select * into v_row from reservation
   where id = p_reservation_id
   for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if v_row.customer_id is distinct from auth.uid() then
    raise exception 'NOT_YOUR_RESERVATION';
  end if;

  if v_row.status not in ('Waiting', 'Washing') then
    raise exception 'ALREADY_FINISHED';
  end if;

  if coalesce(lower(v_row.service_type), '') not like 'basic%' then
    raise exception 'NOT_BASIC_WASH';
  end if;

  v_basic   := wash_list_price('basic', v_row.vehicle_type);
  v_premium := wash_list_price('premium', v_row.vehicle_type);
  if v_basic is null or v_premium is null then
    raise exception 'NO_PREMIUM_FOR_VEHICLE';
  end if;

  v_added := greatest(0, v_premium - v_basic);

  update reservation
     set service_type  = 'Premium Wash',
         price         = coalesce(price, 0) + v_added,
         addon_amount  = coalesce(addon_amount, 0) + v_added,
         addon_paid_at = null,
         upgraded_from = v_row.service_type,
         upgraded_at   = now()
   where id = p_reservation_id;

  update walkin_transactions
     set service_type = 'Premium Wash',
         price        = coalesce(price, 0) + v_added
   where reservation_id = p_reservation_id
     and coalesce(price, 0) > 0;

  return query select v_added, (coalesce(v_row.price, 0) + v_added)::numeric;
end;
$$;

grant execute on function upgrade_my_reservation_to_premium(bigint) to authenticated;
