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

-- ---------------------------------------------------------------------------
-- Banque d'exercices COMMUNE (ajouts partagés entre tous les utilisateurs).
-- La banque de base est intégrée à l'app (js/data/exercise-bank.js) ; cette
-- table ne contient que les exercices AJOUTÉS par les utilisateurs.
-- Lecture : tout utilisateur connecté. Écriture : uniquement par son auteur.
-- (Ajouté le 2026-11-08 : à exécuter une fois dans le SQL Editor.)
create table public.bank (
  id         text primary key,
  data       jsonb not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bank_touch before insert or update on public.bank
for each row execute function public.touch_updated_at();

alter table public.bank enable row level security;

create policy "Banque : lecture par tous les connectés" on public.bank
for select to authenticated using (true);

create policy "Banque : ajout par soi-même" on public.bank
for insert to authenticated with check (created_by = auth.uid());

create policy "Banque : modification par l'auteur" on public.bank
for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "Banque : suppression par l'auteur" on public.bank
for delete to authenticated using (created_by = auth.uid());

grant select, insert, update, delete on public.bank to authenticated;
