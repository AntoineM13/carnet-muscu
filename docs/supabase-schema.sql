-- Schéma Supabase de Carnet de muscu (déjà appliqué sur le projet `carnet-muscu`).
-- À rejouer dans le SQL Editor uniquement pour recréer un projet.
-- (Fichier volontairement hors d'un dossier `supabase/` pour ne pas déclencher
--  l'intégration GitHub de Supabase.)

create table public.docs (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  collection text not null,
  id         text not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

create index docs_user_updated on public.docs (user_id, updated_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger docs_touch before insert or update on public.docs
for each row execute function public.touch_updated_at();

alter table public.docs enable row level security;

create policy "Chacun ses données" on public.docs
for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.docs to authenticated;
