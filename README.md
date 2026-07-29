# Day-Counter ⏳

Petit site **ludique et sans installation** pour suivre le temps écoulé depuis
vos événements personnalisés. Chaque événement affiche un horodatage vivant
qui se met à jour chaque seconde à partir de l'horloge de votre appareil —
par exemple «&nbsp;il y a 4 ans, 5 mois et 6 jours&nbsp;».

## Fonctionnalités

- **Page d'accueil unique** : tous les événements visibles d'un coup d'œil,
  avec un bouton **« Ajouter »** en haut.
- **Horodatage dynamique** : temps exact (ans / mois / jours, et h / min / s
  si une heure est renseignée) recalculé en continu.
- **Ajout d'un événement** :
  - Nom (texte libre).
  - Date au format **JJ/MM/AAAA** (les «&nbsp;/&nbsp;» s'insèrent tout seuls).
  - Heure au format **24h**, **optionnelle**.
- **Deux formats d'affichage** : une bascule en haut de page permet de passer
  du mode **Détaillé** (« il y a 4 ans, 5 mois et 6 jours ») au mode **Jours**
  (« il y a 1617 jours »). Le choix est mémorisé.
- **Modifier / Supprimer** : chaque carte a un bouton ✏️ qui ouvre la fiche
  pour modifier le nom, la date et l'heure, ou supprimer l'événement.
- **Gestes de glissement** : faites **glisser une carte vers la gauche** pour
  révéler un bouton rouge **Supprimer**, ou **vers la droite** pour un bouton
  bleu **Modifier**. Rapide et simple, comme sur une application native.
- **Réorganisation** : par **glisser-déposer** de la poignée ⠿ à la souris, ou
  avec les **flèches ▲ / ▼** (pratiques sur mobile). Nombre d'événements
  illimité.
- **Sauvegarde en ligne synchronisée** : les événements sont enregistrés dans
  une base **Supabase** et retrouvés automatiquement sur **tous vos appareils**
  (le `localStorage` ne sert plus que de cache/secours hors ligne). Voir
  [Sauvegarde persistante](#sauvegarde-persistante-supabase) ci-dessous.
- **Indicateur de synchro** : une pastille en haut à droite indique l'état
  (« Synchronisé », « Synchro… », « Hors ligne », « Local »).

## Optimisé pour iPhone (et mobile)

- **Zones sûres** respectées via `safe-area-inset` (encoche / île dynamique,
  coins arrondis, barre de gestes) — rien n'est coupé ni caché.
- **Application plein écran** : ajoutable à l'écran d'accueil depuis Safari
  (`apple-mobile-web-app-capable`), sans barre de navigateur visible.
- **Zones tactiles** d'au moins 44 px, bien espacées, pour éviter les clics
  accidentels.
- **Pas de zoom intempestif** : champs de saisie en 16 px (Safari iOS ne
  zoome plus au focus), `viewport-fit=cover`.
- **Clavier tactile** : la fenêtre reste défilable et s'ancre en haut sur les
  écrans courts pour que les champs et le bouton « Enregistrer » restent
  visibles.
- **Réorganisation au doigt** : sur mobile, les flèches ▲/▼ remplacent le
  glisser-déposer (non pris en charge nativement au toucher).
- Animations douces respectant `prefers-reduced-motion`.

**Site en ligne** : https://jamesdoe6.github.io/day-counter/

## Utilisation

Site **statique**, sans build ni dépendances. Ouvrez simplement
[`index.html`](./index.html) dans un navigateur, ou servez le dossier :

```bash
git clone https://github.com/jamesdoe6/day-counter.git
cd day-counter
python3 -m http.server 8000
# puis ouvrez http://localhost:8000
```

## Sauvegarde persistante (Supabase)

Sur iPhone, le stockage local d'un site (localStorage) peut être **effacé
automatiquement** après ~7 jours sans ouverture, une mise à jour iOS, etc.
Pour ne plus jamais perdre d'événements, Day-Counter enregistre tout dans une
base **Supabase** (gratuite) et recharge automatiquement les données à chaque
ouverture, quel que soit l'appareil.

> ⚠️ La version **artifact** (`claude.ai/code/artifact/…`) ne peut PAS se
> connecter à une base : son iframe bloque tous les appels réseau externes.
> La sauvegarde en ligne fonctionne uniquement sur la version **hébergée**
> (GitHub Pages). C'est ce lien-là qu'il faut ajouter à l'écran d'accueil.

### Mise en place (une seule fois)

1. **Créer un projet Supabase** : [supabase.com](https://supabase.com) →
   *New project* (gratuit).
2. **Créer la table** : Project → *SQL Editor* → *New query* → coller le
   contenu de [`supabase/schema.sql`](./supabase/schema.sql) → *Run*.
3. **Récupérer les clés** : Project → icône ⚙️ *Project Settings* (bas du menu
   de gauche) → *API Keys* :
   - *Project URL* (ex. `https://abcd.supabase.co`)
   - la clé publique cliente — nommée *Publishable key*
     (`sb_publishable_...`) sur les nouveaux projets, ou *anon* / *public*
     (`eyJhbG...`, onglet *Legacy API Keys*) sur les projets plus anciens.
     Les deux fonctionnent. ⚠️ Jamais la *Secret key* / *service_role* !
4. **Renseigner [`config.js`](./config.js)** avec ces deux valeurs, puis
   pousser sur `main`.
5. **Activer GitHub Pages** : repo → *Settings* → *Pages* → *Source* =
   *Deploy from a branch* → branche `main`, dossier `/ (root)` → *Save*. Le
   site est alors publié à l'adresse `https://<utilisateur>.github.io/<repo>/`.
6. **Sur l'iPhone** : ouvrir ce lien dans Safari → *Partager* → *Sur l'écran
   d'accueil*. La pastille en haut à droite doit afficher **« Synchronisé »**.

Tant que `config.js` n'est pas rempli, l'app reste en **mode local**
(localStorage), sans rien casser.

### Comment ça marche

- Ajout / modification / suppression / réorganisation → l'état complet est
  poussé immédiatement vers Supabase, et le cache local est mis à jour.
- À l'ouverture (et au retour sur l'app), les données sont rechargées depuis
  Supabase : c'est la source de vérité.
- Hors ligne, les changements sont conservés localement (drapeau « à
  synchroniser ») et **automatiquement envoyés** au retour du réseau — aucune
  perte de données.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure de la page et de la modale d'ajout/modification |
| `styles.css` | Thème violet ludique, cartes, modale, responsive |
| `app.js` | Logique d'interface : calcul du temps écoulé, gestes, réorganisation |
| `store.js` | Persistance : cache local + synchronisation Supabase (hors ligne géré) |
| `config.js` | Clés Supabase (URL + clé anon) — à renseigner |
| `supabase/schema.sql` | Script à exécuter une fois dans Supabase (table + RLS) |
| `favicon.svg` | Icône (sablier / horloge) |

## Confidentialité

Les données sont stockées dans **votre** projet Supabase. La clé *anon* est
publique par conception ; la protection vient des règles RLS du schéma. Avec la
règle par défaut, quiconque connaît l'URL du projet, la clé anon et la valeur
`SPACE` peut accéder aux événements — acceptable pour un compteur personnel non
sensible. Pour verrouiller davantage, activez Supabase Auth et remplacez la
politique par une règle basée sur `auth.uid()`.
