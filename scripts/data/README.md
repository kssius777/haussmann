# Données des lieux (stations, jardins, places)

- `stations.json` : les 244 stations de métro dans Paris (nom, position, lignes, arrondissement, identifiant Wikidata).
- `places.json` : 45 jardins, bois, places et le canal Saint-Martin (nom, sorte, position, arrondissement, surface).
- `metro_rules.sql` : les règles qui vont avec (table `spots`, bonus réseau `_network`, `_rates`, boosters `_draw`),
  recopiées en tête de `supabase/migration_metro.sql`.

Source : Wikidata (licence CC0, réutilisable sans condition), relevé le 20/10/2026.
Les photos de ces lieux ne sont pas encore ajoutées : celles de Wikimedia Commons demandent de citer l'auteur
et la licence (champ `cr` des cartes), comme pour les immeubles.

Régénérer les cartes, les liens du dé et la migration : `python3 scripts/add_spots.py` (rejouable).
