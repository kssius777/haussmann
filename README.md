# Haussmann

Le jeu de cartes des vrais immeubles de Paris : boosters, loyers, marché entre joueurs, maires d'arrondissement.

## Architecture
- `public/` : le site (HTML/CSS/JS sans build), les données de Paris (`public/data`) et la carte 3D (MapLibre + three.js).
- `supabase/schema.sql` : toute la base et **toutes les règles du jeu** (fonctions SQL). Le navigateur ne peut rien écrire directement : impossible de tricher, et chaque logement n'a jamais qu'un propriétaire (clé primaire `(card, k)`).
- `api/seed.js` : charge les 77 835 immeubles dans la base (une seule fois).
- `test/` : tests locaux (Postgres local + serveur qui imite Supabase).

## Mise en route (une seule fois)
1. Supabase → **SQL Editor** → coller `supabase/schema.sql` → **Run**.
2. Vercel → variable d'environnement `SUPABASE_SERVICE_ROLE_KEY`.
3. Ouvrir `https://<site>/api/seed` (charge les immeubles).
4. Supabase → **Authentication → URL Configuration** → *Site URL* = l'adresse du site.

## Tests locaux
```
service postgresql start
psql -f test/prelude.sql -f supabase/schema.sql   # base "hm"
python3 test/test_rules.py     # règles du jeu (38 tests)
python3 test/server.py 8780 &  # site local sur http://localhost:8780
python3 test/e2e.py            # parcours complet dans un navigateur
```
