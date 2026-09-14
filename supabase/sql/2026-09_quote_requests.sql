-- Public "Get a Quote / Booking Inquiry" leads captured from the website.
-- Run this in the Supabase SQL editor (or `supabase db push`) alongside
-- 2026-09_shop_reviews.sql before using the website's quote form / dashboard
-- "Inquiries" tab.

create table if not exists public.quote_requests (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shop_profile_setup(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 200),
  phone text not null check (char_length(phone) between 1 and 40),
  service_type text not null check (service_type in ('walk-in-wash', 'online-reservation', 'home-service')),
  preferred_date date,
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists quote_requests_shop_id_idx on public.quote_requests (shop_id);
create index if not exists quote_requests_status_idx on public.quote_requests (status);

alter table public.quote_requests enable row level security;

-- Anyone (including unauthenticated visitors) can submit a quote request.
drop policy if exists "Anyone can submit a quote request" on public.quote_requests;
create policy "Anyone can submit a quote request"
  on public.quote_requests for insert
  to anon, authenticated
  with check (status = 'new');

-- A shop's admin can see and manage the leads sent to their own shop.
drop policy if exists "Shop admin reads own shop quote requests" on public.quote_requests;
create policy "Shop admin reads own shop quote requests"
  on public.quote_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = quote_requests.shop_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Shop admin updates own shop quote requests" on public.quote_requests;
create policy "Shop admin updates own shop quote requests"
  on public.quote_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = quote_requests.shop_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = quote_requests.shop_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Shop admin deletes own shop quote requests" on public.quote_requests;
create policy "Shop admin deletes own shop quote requests"
  on public.quote_requests for delete
  to authenticated
  using (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = quote_requests.shop_id and s.owner_id = auth.uid()
    )
  );
