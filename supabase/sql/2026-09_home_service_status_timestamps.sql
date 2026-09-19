-- home_service status timestamps
--
-- Ang home_service ay may `status` lang (Waiting -> On the Way -> Washing ->
-- Completed) at `paid_at`. Walang record KUNG KAILAN naganap ang bawat status
-- change, kaya hindi makita ng staff at ng customer kung anong oras umalis ang
-- staff, kung anong oras nagsimula ang hugas, at kung anong oras natapos.
--
-- Tatlong bagong timestamp column ang isinasagot nito. Sini-stamp ng staff app
-- ang bawat isa sa mismong sandali na pinindot ang katumbas na status button.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must also be pasted into the Supabase SQL editor to actually apply.

alter table home_service
  add column if not exists on_the_way_at timestamptz,
  add column if not exists washing_at    timestamptz,
  add column if not exists completed_at  timestamptz;

-- Backfill: ang mga LUMANG Completed na booking ay walang completed_at, pero
-- may paid_at (sabay na-stamp ang dalawa noon, sa iisang "collect payment"
-- na aksyon), kaya ito ang pinakamalapit na tumpak na oras ng pagkatapos.
update home_service
   set completed_at = paid_at
 where status = 'Completed'
   and completed_at is null
   and paid_at is not null;

-- Kailangan ng realtime publication para agad-agad makita ng CUSTOMER app ang
-- status change na ginawa ng STAFF app. Kung wala ito sa publication, hindi
-- kailanman makakatanggap ng postgres_changes event ang customer screen at
-- mananatiling luma ang listahan nito (ito ang dahilan kung bakit hindi
-- lumilipat sa Completed tab ang booking pagkatapos mag-collect ng bayad).
do $$
begin
  alter publication supabase_realtime add table home_service;
exception
  when duplicate_object then null;  -- nandoon na, ok lang
end $$;

-- Para mai-broadcast ng realtime ang BUONG lumang row sa UPDATE events
-- (kailangan ito ng RLS filtering ng Supabase Realtime para malaman na sa
-- customer na ito ang row kahit na-update ito ng ibang user/staff).
alter table home_service replica identity full;

-- HULING HAKBANG -- huwag laktawan.
-- May sariling schema cache ang PostgREST (ang API layer na tinatawag ng app).
-- Hangga't luma pa ito, tumatanggi ang API sa bagong column kahit NANDOON NA
-- ito sa database: "Could not find the 'on_the_way_at' column of
-- 'home_service' in the schema cache" (PGRST204). Ito ang nagpapa-reload nito
-- agad, imbes na hintayin ang sarili nitong refresh.
notify pgrst, 'reload schema';
