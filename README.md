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
- **Deux formats d'affichage** (menu ⋯) : **Détaillé** (« il y a 4 ans, 5 mois
  et 6 jours ») ou **Jours** (« il y a 1 618 jours »). Le choix est mémorisé.
- **Jalons** : chaque événement annonce son prochain cap remarquable
  (« 2 000 jours dans 89 jours ») et le met en avant en laiton le jour venu.
- **Icône et couleur** : plus de **100 icônes** classées par thème (santé et
  habitudes, corps et sport, loisirs et écrans, famille, travail, voyage,
  nourriture, repères) avec **recherche par mot-clé** — tapez « tabac »,
  « cheveux », « jeux »… — et **12 teintes**.
- **Dégradés (optionnel)** : cochez « Dégradé » pour fondre la couleur vers une
  seconde teinte (rose → sarcelle, indigo → rose…). Le filet de la ligne et la
  barre de progression prennent le dégradé ; sans la case cochée, la couleur
  reste un aplat.
- **Événements annuels** : cochez « chaque année » pour un anniversaire ou une
  date fixe — l'app affiche alors le **compte à rebours jusqu'à la prochaine
  occurrence**, le rang (« 33 ans le 14/03/2027 ») et une barre de progression
  du cycle annuel.
- **Recherche** : filtrez la liste par nom (loupe dans l'en-tête).
- **Export / Import** : téléchargez une sauvegarde `.json` de tous vos
  événements, ou restaurez-la (menu ⋯).
- **Rappels** : notification à l'ouverture de l'app quand un jalon ou un
  anniversaire tombe le jour même (voir la limite plus bas).
- **Gestes de glissement** : **vers la gauche** pour révéler **Supprimer**,
  **vers la droite** pour **Modifier**.
- **Réorganisation** : par **glisser-déposer** de la poignée ⠿ à la souris, ou
  avec les **flèches ▲ / ▼** (pratiques sur mobile). Nombre d'événements
  illimité.
- **Thème** clair / sombre / automatique, et **mode hors ligne** (l'app est
  mise en cache par un service worker et démarre sans réseau).
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

### Migration du schéma

Les colonnes `emoji`, `color` et `recurring` ont été ajoutées après la
première version. Si votre base date d'avant, **relancez simplement
[`supabase/schema.sql`](./supabase/schema.sql) en entier** (il est écrit pour
être ré-exécutable sans risque).

En attendant, rien ne casse : l'app détecte l'ancien schéma et continue de
synchroniser les champs de base — seules l'icône, la couleur et la récurrence
restent alors locales.

Les dégradés n'ont **pas** demandé de colonne supplémentaire : ils sont encodés
dans la colonne `color` existante sous la forme `teinte>teinte2` (par exemple
`rose>teal`), un aplat restant simplement `rose`.

### Limite des rappels

Un vrai rappel programmé en arrière-plan exigerait un serveur de push et un
abonnement Web Push : ce n'est pas possible pour un site purement statique.
Day-Counter envoie donc une notification **à l'ouverture de l'application**
si un jalon ou un anniversaire tombe ce jour-là (une seule fois par jour).
Sur iPhone, les notifications web supposent iOS 16.4+ et un site ajouté à
l'écran d'accueil.

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
| `index.html` | Structure de la page, de la fiche et du menu |
| `styles.css` | Identité visuelle : jetons de couleur, thèmes clair/sombre, registre |
| `app.js` | Interface : calcul du temps, jalons, récurrence, gestes, recherche, export |
| `store.js` | Persistance : cache local + synchronisation Supabase (hors ligne géré) |
| `config.js` | Clés Supabase (URL + clé anon) — à renseigner |
| `supabase/schema.sql` | Script à exécuter dans Supabase (table + colonnes + RLS) |
| `sw.js` | Service worker : mise en cache pour le mode hors ligne |
| `manifest.webmanifest` | Métadonnées d'application installable |
| `favicon.svg`, `icon-*.png` | Icônes (cadran de chronomètre) |

## Parti pris graphique

Un **registre imprimé** plutôt qu'une pile de cartes : papier, filets fins,
hiérarchie typographique forte et chiffres tabulaires. La palette vient du
sujet — le **bleu acier bleui** des aiguilles de chronomètre sert d'accent, le
**laiton** est réservé aux jalons. Les typographies sont celles du système
(serif pour les compteurs, monospace pour les dates) : aucune requête réseau,
donc un rendu identique hors ligne.

## Confidentialité

Les données sont stockées dans **votre** projet Supabase. La clé *anon* est
publique par conception ; la protection vient des règles RLS du schéma. Avec la
règle par défaut, quiconque connaît l'URL du projet, la clé anon et la valeur
`SPACE` peut accéder aux événements — acceptable pour un compteur personnel non
sensible. Pour verrouiller davantage, activez Supabase Auth et remplacez la
politique par une règle basée sur `auth.uid()`.
