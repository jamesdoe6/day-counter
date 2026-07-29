/*
 * Day-Counter — configuration de la sauvegarde externe (Supabase).
 * ---------------------------------------------------------------------------
 * Renseigne les deux valeurs ci-dessous avec TON nouveau projet Supabase pour
 * activer la sauvegarde en ligne (synchronisée entre tous tes appareils).
 *
 * Où les trouver : supabase.com → ton projet → icône ⚙️ Project Settings
 * (en bas du menu de gauche) → « API Keys » (parfois nommé « Data API »).
 *   - SUPABASE_URL       : l'URL de base du projet, ex. https://abcd.supabase.co
 *                          (SANS "/rest/v1" à la fin — le client l'ajoute seul)
 *   - SUPABASE_ANON_KEY  : la clé PUBLIQUE cliente. Selon l'âge du projet, elle
 *                          s'appelle :
 *                            • « Publishable key », commence par sb_publishable_...
 *                              (nouveaux projets, depuis 2025)
 *                            • ou « anon » / « public », un long jeton qui
 *                              commence par eyJhbG... (projets plus anciens,
 *                              onglet « Legacy API Keys »)
 *                          Les deux fonctionnent à l'identique ici. Ce n'est
 *                          PAS un secret : prévue pour être exposée côté
 *                          client. La sécurité vient des règles RLS définies
 *                          dans supabase/schema.sql. N'utilise JAMAIS la clé
 *                          « service_role » / « Secret key » (sb_secret_...) ici.
 *
 * Avant de remplir : exécute UNE FOIS le script supabase/schema.sql dans
 * Supabase (Project → SQL Editor → New query → coller → Run).
 *
 * Tant que ces champs sont vides, Day-Counter fonctionne en mode local
 * (localStorage uniquement), exactement comme avant.
 */
window.DAYCOUNTER_CONFIG = {
  SUPABASE_URL: "https://grcczdlwhqzvkdhpvhnf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyY2N6ZGx3aHF6dmtkaHB2aG5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMTEwMDgsImV4cCI6MjEwMDg4NzAwOH0.JW4XAzIhLh3opQbZSWjFu7kWLLQx0f803aE3kcDxoUI",

  // Espace de données. Garde-le pour toi : toute personne qui connaît à la fois
  // l'URL, la clé anon ET cette valeur peut accéder à tes événements. Tu peux
  // mettre n'importe quelle chaîne difficile à deviner.
  SPACE: "perso"
};
