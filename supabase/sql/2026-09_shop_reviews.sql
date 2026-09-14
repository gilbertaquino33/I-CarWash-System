-- Public customer reviews per shop, moderated by the shop's admin.
-- Run this in the Supabase SQL editor (or `supabase db push`) before using the website.

create table if not exists public.shop_reviews (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shop_profile_setup(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists shop_reviews_shop_id_idx on public.shop_reviews (shop_id);
create index if not exists shop_reviews_status_idx on public.shop_reviews (status);

alter table public.shop_reviews enable row level security;

-- Anyone can read reviews that have been approved by the shop admin.
drop policy if exists "Public can read approved reviews" on public.shop_reviews;
create policy "Public can read approved reviews"
  on public.shop_reviews for select
  to anon, authenticated
  using (status = 'approved');

-- Anyone (including unauthenticated visitors) can submit a review, but it
-- always lands as "pending" until a shop admin approves it.
drop policy if exists "Anyone can submit a pending review" on public.shop_reviews;
create policy "Anyone can submit a pending review"
  on public.shop_reviews for insert
  to anon, authenticated
  with check (status = 'pending');

-- A shop's admin (shop_profile_setup.owner_id) can see every review left
-- for their own shop, regardless of status, so they can moderate it.
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

-- A shop's admin can approve/reject reviews left for their own shop.
drop policy if exists "Shop admin moderates own shop reviews" on public.shop_reviews;
create policy "Shop admin moderates own shop reviews"
  on public.shop_reviews for update
  to authenticated
  using (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = shop_reviews.shop_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = shop_reviews.shop_id and s.owner_id = auth.uid()
    )
  );

-- A shop's admin can delete spam/unwanted reviews left for their own shop.
drop policy if exists "Shop admin deletes own shop reviews" on public.shop_reviews;
create policy "Shop admin deletes own shop reviews"
  on public.shop_reviews for delete
  to authenticated
  using (
    exists (
      select 1 from public.shop_profile_setup s
      where s.id = shop_reviews.shop_id and s.owner_id = auth.uid()
    )
  );

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
