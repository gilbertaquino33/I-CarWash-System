-- Public customer reviews per shop. Reviews are published immediately (no admin
-- approval) and nobody -- including the shop's admin -- can hide, edit or delete
-- one, so a shop can't pick and choose what customers see.
-- Run this in the Supabase SQL editor (or `supabase db push`) before using the website.
-- Safe to re-run: it also upgrades an existing table that still used approval.

create table if not exists public.shop_reviews (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shop_profile_setup(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 1 and 2000),
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- Existing installs were created with default 'pending'; new reviews publish at once.
alter table public.shop_reviews alter column status set default 'approved';

-- One-time backfill: publish every review, including ones that were waiting for
-- approval or that an admin had hidden earlier.
update public.shop_reviews set status = 'approved' where status <> 'approved';

create index if not exists shop_reviews_shop_id_idx on public.shop_reviews (shop_id);
create index if not exists shop_reviews_status_idx on public.shop_reviews (status);

alter table public.shop_reviews enable row level security;

-- Anyone can read every review.
drop policy if exists "Public can read approved reviews" on public.shop_reviews;
create policy "Public can read approved reviews"
  on public.shop_reviews for select
  to anon, authenticated
  using (status = 'approved');

-- Anyone (including unauthenticated visitors) can submit a review and it is
-- published right away. The check stops a visitor from inserting a row with any
-- other status, and nobody can change a review after it is posted.
drop policy if exists "Anyone can submit a pending review" on public.shop_reviews;
drop policy if exists "Anyone can submit a review" on public.shop_reviews;
create policy "Anyone can submit a review"
  on public.shop_reviews for insert
  to anon, authenticated
  with check (status = 'approved');

-- A shop's admin (shop_profile_setup.owner_id) can see every review left
-- for their own shop (read-only).
drop policy if exists "Shop admin reads own shop reviews" on public.shop_reviews;
create policy "Shop admin reads own shop reviews"
  on public.shop_reviews for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = shop_reviews.shop_id and s.owner_id = auth.uid()
    )
  );

-- Reviews are read-only for the shop admin: remove the old moderation policies.
-- With no UPDATE or DELETE policy, row-level security blocks both for every
-- website/app user (only the database owner can change a review).
drop policy if exists "Shop admin moderates own shop reviews" on public.shop_reviews;
drop policy if exists "Shop admin deletes own shop reviews" on public.shop_reviews;

-- Aggregate rating/count per shop, used by the public directory + shop page.
-- Recreate as a view every run so it always matches the columns above.
drop view if exists public.shop_review_stats;
create view public.shop_review_stats
with (security_invoker = on) as
select
  shop_id,
  count(*)::int as review_count,
  round(avg(rating)::numeric, 1) as avg_rating
from public.shop_reviews
where status = 'approved'
group by shop_id;

grant select on public.shop_review_stats to anon, authenticated;
