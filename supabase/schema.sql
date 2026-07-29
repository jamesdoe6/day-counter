-- =============================================================
-- Day-Counter — schéma de sauvegarde
-- =============================================================
-- À exécuter UNE SEULE FOIS dans ton projet Supabase :
--   Project → SQL Editor → New query → coller ce fichier entier → Run.
--
-- Ensuite, renseigne l'URL du projet et la clé « anon » dans
-- Day-Counter/config.js.
--
-- Modèle simple mono-utilisateur : une seule table « events ». La colonne
-- « space » permet de cloisonner les données (l'app utilise la valeur définie
-- dans config.js, par défaut « perso »).
-- =============================================================

create table if not exists public.events (
  id          text        primary key,          -- id généré par l'app (stable)
  space       text        not null default 'perso',
  name        text        not null,
  event_date  text        not null,             -- JJ/MM/AAAA (tel que saisi)
  event_time  text,                             -- HH:MM ou NULL
  position    double precision not null default 0,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Colonnes ajoutées après la première version (icône, couleur, récurrence).
-- Ces trois lignes sont sûres à ré-exécuter : si tu avais déjà créé la table
-- avant ces fonctionnalités, relance simplement ce fichier entier.
--
-- Tant que ces colonnes n'existent pas, l'app fonctionne quand même : elle
-- détecte l'ancien schéma et se contente des champs de base (mais l'icône,
-- la couleur et la récurrence ne seront pas sauvegardées en ligne).
-- -------------------------------------------------------------
alter table public.events add column if not exists emoji     text;
alter table public.events add column if not exists color     text;
alter table public.events add column if not exists recurring boolean not null default false;

-- Tri rapide par espace + position
create index if not exists events_space_position_idx
  on public.events (space, position);

-- -------------------------------------------------------------
-- Sécurité (RLS)
-- -------------------------------------------------------------
-- On active RLS puis on autorise le rôle « anon » (la clé publique du site) à
-- lire/écrire cette table.
--
-- ⚠️ Compromis de confidentialité : avec cette règle, toute personne qui
-- connaît à la fois l'URL du projet, la clé « anon » ET la valeur « space »
-- peut accéder à tes événements. Pour un compteur personnel non sensible,
-- c'est un compromis acceptable (la clé anon est de toute façon publique).
-- Pour verrouiller davantage plus tard : activer Supabase Auth et remplacer
-- ces règles par des politiques basées sur auth.uid().
-- -------------------------------------------------------------
alter table public.events enable row level security;

drop policy if exists events_anon_all on public.events;
create policy events_anon_all
  on public.events
  for all
  to anon, authenticated
  using (true)
  with check (true);
