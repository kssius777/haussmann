# Haussmann — notes pour reprendre le projet

Jeu de cartes à collectionner sur les vrais immeubles de Paris, joué sur une carte 3D de Paris.
Site : https://haussmann-beige.vercel.app · repo GitHub `kssius777/haussmann` (branche `main`).

## Comment c'est construit
- **Front** : HTML/CSS/JS sans build, dans `public/` (`index.html`, `app/*.js`, `app/style.css`).
  Ordre des scripts : models, core, api, cards, map, pawn, pages, booster, onboard, landing, main.
- **Données statiques** : `public/data/` (index.json, a/751xx.json par arrondissement, cards.json, edges.json, atlas photos).
- **Back** : Supabase (Postgres). **Toutes les règles du jeu sont dans des fonctions SQL** de `supabase/schema.sql`
  (le pion et le dé : `supabase/pion.sql`, recopié dans schema.sql). Le site appelle ces fonctions via `rpc()`.
- **Déploiement** : chaque `git push` sur `main` est mis en ligne automatiquement par Vercel.
- `api/seed.js` : charge les immeubles et le plan des rues dans Supabase (ouvrir /api/seed jusqu'à « Prêt »).

## Règles de travail (important)
1. **Tester avant chaque push** :
   ```
   sh test/up.sh                 # démarre Postgres + le serveur local (port 8780)
   python3 test/test_rules.py    # règles du jeu (42 tests)
   python3 test/test_pawn.py     # pion et dé
   python3 test/test_credit.py   # crédit immobilier
   python3 test/e2e.py           # parcours complet dans un vrai navigateur, captures dans test/shots/
   ```
   Ne pousser que si tout est vert.
2. **Base de données en production** : on ne la modifie jamais directement. On écrit un fichier
   `supabase/migration_xxx.sql` (rejouable sans risque), on met à jour `schema.sql`, on teste en local,
   puis le propriétaire colle le fichier dans Supabase → SQL Editor → Run.
   Le site doit continuer à marcher (message « mise à jour en cours ») tant que la migration n'est pas passée.
3. **Sécurité** : la clé `service_role` ne doit jamais apparaître dans le code ni dans la conversation
   (elle est seulement dans les variables Vercel). Les fonctions internes `_xxx` sont interdites aux joueurs (revoke).
   Ne jamais afficher l'e-mail personnel du propriétaire aux joueurs.
4. En cas de doute sur une décision de jeu (règles, économie, textes), demander au propriétaire avant de coder.

## Règles du jeu actuelles (résumé)
- 1 M€ et 5 boosters à l'inscription ; 1 booster gratuit par jour, boosters payants dont le prix double dans la journée.
- Loyers versés en continu ; trésorerie jamais négative ; hypothèque 50 % de la valeur.
- Maire d'un arrondissement = plus gros propriétaire, touche 8 % des loyers des autres. 5 partis, +10 % de loyers là où son parti tient la mairie.
- **Pion façon Monopoly** : un dé de 1 à 6, le pion marche tout seul (4 immeubles voisins par point) et s'arrête sur un immeuble.
  Libre → on peut l'acheter à la banque (c'est le seul endroit où l'on achète à la banque). À un autre joueur → on lui paie
  une journée de ses loyers ici (max 20 % de sa trésorerie). À soi → une journée de loyer en bonus. 1 case sur 8 environ : carte Chance.
  Le pion va vers un immeuble lointain atteignable en n pas et suit le plus court chemin (pas de boucle).
  10 lancers max, +1 toutes les 30 min ; on peut acheter 5 lancers (50 000 €, prix doublé à chaque achat du jour). 3 téléportations par jour vers ses propres biens (on peut y acheter les logements libres).
- **Crédit immobilier** (achat à la banque) : apport 10 %, la banque prête le reste ; 70 % du loyer de base du bien
  rembourse le crédit automatiquement (impossible d'être en défaut) ; capacité d'emprunt = 5 M€ + 20 jours de loyers − crédits en cours ;
  remboursement anticipé (`repay`) ; un bien à crédit ne peut être ni vendu ni hypothéqué. Patrimoine et classement retirent crédits et hypothèques.
- **Salaire** : +20 000 € à chaque lancer de dé. Le pion démarre au 18 rue de la Bûcherie (400761), face à Notre-Dame, rive gauche.
- Historique de l'argent : table `ledger` + `_log()` appelé à chaque mouvement ; page « Mon argent » (clic sur la trésorerie), RPC `my_ledger()`.
- Sons (`sfx()` dans core.js, sans fichier audio) : coupés par défaut, activables dans le profil (localStorage `hm_sound`).
- Achat à la banque : le crédit est proposé en premier (c'est ce que tout le monde choisit) ; « payer comptant » en lien dessous.
- Cartes : image = maquette 3D de la vraie forme de l'immeuble (`maquetteSVG` dans cards.js), couleurs selon l'époque.
- Le joueur est une montgolfière 3D (`models.js`, `pawn3d`) aux couleurs de son parti, qui survole les toits sur le trajet du dé. Barre du bas : Téléport (avec confirmation) · Lancer · Boosters (mini paquet, badge) — il n'y a plus d'onglet Boosters.
- Sur téléphone : pas de bandeau des maires sur la carte (il est dans l'onglet Paris) ; quand on tombe sur une case, la carte s'affiche en grand.
- Thème « Blanc pur » (choisi par le propriétaire) : Paris en maquette blanche (couleurs dans `MC` de map.js), police Inter Tight partout, interface noir et blanc, bleu vif `--act` (#2563EB) pour le dé et les achats ; tes biens en bleu, ceux des autres en rose pâle, à vendre en orange. Booster = sachet métallisé (`packHTML`, classes `.sachet`). Cartes : cadre, ciel, bandeau étoilé et reflets selon la rareté ; époque en étiquette sur la maquette.
- Case et fiche immeuble : même plan des logements (`occHTML`, à vous / à d'autres / libres) et même choix « À crédit / Comptant » avec le loyer de chaque option. Sur téléphone, la case s'ouvre en grand (carte en grand, bouton d'achat toujours visible en bas).
- Patrimoine : « Où sont vos biens » (barres par arrondissement, clic = filtre), collection triable et paginée.
