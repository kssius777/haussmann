# Proprio (ex-Haussmann) — notes pour reprendre le projet

Jeu de cartes à collectionner sur les vrais immeubles de Paris, joué sur une carte 3D de Paris.
Nom du jeu : **Proprio** (choisi le 17/10/2026), domaine **proprio.games**. Le dépôt et le projet Vercel gardent le nom « haussmann ».
Site : https://proprio.games (quand le domaine sera branché) · https://haussmann-beige.vercel.app · repo GitHub `kssius777/haussmann` (branche `main`).
Logo : plaque de rue parisienne « PROPRIO » (`.plaque-mini`, la petite ligne du haut `data-sub` = arrondissement de la montgolfière) + emblème « P-clé » (`public/icons/`, favicon, icônes d'app, `manifest.webmanifest`), image de partage `public/og.png` (1200 × 630). Sources du logo : script dans le scratchpad, à refaire en SVG si besoin.
« Haussmann » reste utilisé seulement pour le baron (anecdotes, exemple de pseudo) et l'époque « haussmannien ». Les comptes invités gardent leur e-mail technique `@haussmann.app` (ne pas changer : ils ne pourraient plus se reconnecter).

## Comment c'est construit
- **Front** : HTML/CSS/JS sans build, dans `public/` (`index.html`, `app/*.js`, `app/style.css`).
  Ordre des scripts : models, core, api, cards, map, pawn, life, pages, booster, onboard, landing, main.
- **Données statiques** : `public/data/` (index.json, a/751xx.json par arrondissement, cards.json, edges.json, atlas photos).
- **Back** : Supabase (Postgres). **Toutes les règles du jeu sont dans des fonctions SQL** de `supabase/schema.sql`
  (le pion et le dé : `supabase/pion.sql`, recopié dans schema.sql). Le site appelle ces fonctions via `rpc()`.
- **Déploiement** : chaque `git push` sur `main` est mis en ligne automatiquement par Vercel.
- **Base de test** (core.js) : `DB_PROD` sur proprio.games et haussmann-beige.vercel.app ; ailleurs (sites de test Vercel), `DB_TEST` dès qu'il est rempli (bandeau orange « SITE DE TEST »).
  `scripts/migrate.mjs` et `api/seed.js` visent `SUPABASE_URL` (variable Vercel) sinon la vraie base ; un build « preview » sans base de test ne touche JAMAIS la vraie base.
- `api/seed.js` : charge les immeubles et le plan des rues dans Supabase (ouvrir /api/seed jusqu'à « Prêt »).

## Règles de travail (important)
1. **Tester avant chaque push** :
   ```
   sh test/up.sh                 # démarre Postgres + le serveur local (port 8780)
   python3 test/test_rules.py    # règles du jeu (42 tests)
   python3 test/test_pawn.py     # pion et dé
   python3 test/test_credit.py   # crédit immobilier
   python3 test/test_admin.py    # admin et liens cadeaux
   python3 test/test_offers.py   # offres de rachat entre joueurs
   python3 test/test_partis.py   # pouvoirs des partis
   python3 test/e2e.py           # parcours complet dans un vrai navigateur, captures dans test/shots/
   ```
   Ne pousser que si tout est vert.
2. **Base de données en production** : on ne la modifie jamais à la main. On écrit un fichier `supabase/migration_xxx.sql`
   (rejouable sans risque), on l'ajoute **à la fin de `supabase/migrations.txt`**, on met à jour `schema.sql`, on teste en local, puis on pousse :
   **Vercel applique tout seul les migrations au déploiement** (`buildCommand` → `scripts/migrate.mjs` → fonction `_run_migration`,
   table `_migrations`). Une migration qui échoue est annulée et bloque le déploiement (le site reste sur l'ancienne version).
   Le propriétaire n'a plus rien à coller (installé le 16/10/2026 avec `bootstrap_auto_migrations.sql`, vérifié de bout en bout avec `migration_ping.sql` : `migrations_ok()` répond true).
   Pour vérifier qu'une migration est passée en prod : appeler une de ses fonctions avec la clé publique (anon) de api.js.
   Le site doit continuer à marcher (message « mise à jour en cours ») tant que la migration n'est pas passée.
3. **Sécurité** : la clé `service_role` ne doit jamais apparaître dans le code ni dans la conversation
   (elle est seulement dans les variables Vercel). Les fonctions internes `_xxx` sont interdites aux joueurs (revoke).
   Ne jamais afficher l'e-mail personnel du propriétaire aux joueurs.
4. En cas de doute sur une décision de jeu (règles, économie, textes), demander au propriétaire avant de coder.

## Avant la mise en production (à ne pas oublier)
- **Nouveau nom de domaine proprio.games** : dans Supabase → Authentication → URL Configuration, mettre le **Site URL** sur le nouveau domaine
  et ajouter `https://NOUVEAU-DOMAINE/**` dans **Redirect URLs** (les `/**` sont indispensables : les liens cadeaux reviennent avec `?gift=…`
  après Google ou l'e-mail de confirmation). Garder `https://haussmann-beige.vercel.app/**` tant que l'ancien lien circule.
  Fait pour haussmann-beige.vercel.app le 16/10/2026.
- Google Cloud (connexion Google) : ajouter le nouveau domaine dans les origines autorisées.
- Supabase Pro (pas de mise en pause, sauvegardes) et Vercel Pro dès qu'on encaisse de l'argent.
- Mentions légales au nom de la SASU, conditions et confidentialité relues ; e-mail de contact sur le domaine.

## Règles du jeu actuelles (résumé)
- 1 M€ et 5 boosters à l'inscription ; 1 booster gratuit par jour, boosters payants dont le prix double dans la journée.
- Loyers versés en continu ; trésorerie jamais négative ; hypothèque 50 % de la valeur.
- Maire d'un arrondissement = plus gros propriétaire, touche 8 % des loyers des autres. 5 partis, +10 % de loyers là où son parti tient la mairie.
- **Pouvoirs des partis** (migration_partis.sql, choix du propriétaire) : Poing Levé −50 % de loyer quand il tombe chez un autre ; Gauche Unie salaire doublé (40 000 €/lancer) ; Juste Milieu 0 % de commission quand il vend ; Droite Libre apport 5 % et capacité d'emprunt ×1,5 (`_down_rate`, `_loan_cap`) ; Rempart National +50 % de loyer encaissé quand on tombe chez lui. Poing chez Rempart = ×0,75. Texte dans `PARTIES[k].power/powerTxt` (core.js), `downRate()` côté site. Chaque parti garde aussi sa protection contre 2-3 cartes Chance.
- **Pion façon Monopoly** : un dé de 1 à 6, le pion marche tout seul (4 immeubles voisins par point) et s'arrête sur un immeuble.
  Libre → on peut l'acheter à la banque (c'est le seul endroit où l'on achète à la banque). À un autre joueur → on lui paie
  une journée de ses loyers ici (max 20 % de sa trésorerie). À soi → une journée de loyer en bonus. 1 case sur 8 environ : carte Chance.
  Le pion va vers un immeuble lointain atteignable en n pas et suit le plus court chemin (pas de boucle).
  Choisir sa destination APRÈS le dé : `roll()` consomme un lancer et renvoie `{die, options}` (jusqu'à 4 immeubles à n pas, un par direction, stockés dans `profiles.pend`/`pend_die`) ;
  la carte montre des flèches (`showDest` dans pawn.js, pointillés depuis la montgolfière, `aimArrows` les oriente ; vert « À acheter », rose « Loyer à X », bleu « Chez vous », violet « Carte Chance ») ; toucher un point = la montgolfière y va tout de suite (`go_to(p_card)`), et l'achat se fait seulement une fois arrivé (chronologie voulue par le propriétaire : se déplacer, puis acheter).
  Sur téléphone, pendant le choix et quand la case est ouverte, la barre d'onglets s'efface et la page descend jusqu'en bas (`#pages{bottom:0}`) ; la case prend toute la hauteur, carte en grand ; le plan des logements n'est montré que si quelqu'un possède déjà un logement.
  Relancer pendant le choix repropose les mêmes options sans consommer ; la téléportation annule le choix ; au rechargement `resumeDest()` réaffiche les options. `roll(p_dir)` = alias de `roll()`.
  10 lancers max, +1 toutes les 30 min ; on peut acheter 5 lancers (50 000 €, prix doublé à chaque achat du jour). 3 téléportations par jour vers ses propres biens (on peut y acheter les logements libres).
- **Crédit immobilier** (achat à la banque) : apport 10 %, la banque prête le reste ; 70 % du loyer de base du bien
  rembourse le crédit automatiquement (impossible d'être en défaut) ; capacité d'emprunt = 5 M€ + 20 jours de loyers − crédits en cours ;
  remboursement anticipé (`repay`) ; un bien à crédit ne peut être ni vendu ni hypothéqué. Patrimoine et classement retirent crédits et hypothèques.
- **Salaire** : +20 000 € à chaque lancer de dé. Le pion démarre au 18 rue de la Bûcherie (400761), face à Notre-Dame, rive gauche.
- **Admin et liens cadeaux** (migration_admin.sql) : table `admins` (on s'y ajoute à la main dans le SQL Editor), `is_admin()`. L'admin crée un lien `/?gift=CODE` depuis la fiche d'un immeuble (« Admin · offrir cette carte », n logements) ou depuis Profil → « Liens cadeaux » (boosters) ; le premier joueur connecté qui ouvre le lien gagne (`claim_gift`, verrou sur la ligne), les suivants voient « Trop tard ». La page d'accueil montre le cadeau avant l'inscription (`gift_info`, localStorage `hm_gift`).
- **Marché à crédit** (migration_marche_credit.sql) : `buy_listing(p_id, p_credit)` ; à crédit = apport 10 %, la banque prête le reste (même capacité d'emprunt, remboursé par 70 % du loyer), le vendeur touche le prix − 5 %. Boutons « À crédit · apport » + « ou comptant » (`listingBuy` dans pages.js).
- **Offres de rachat** (migration_offres.sql) : sur la fiche d'un immeuble, « Proposer de racheter » un logement d'un autre joueur (`make_offer`) ; prix ≥ 80 % de la valeur ; argent bloqué (tout, ou l'apport de 10 % à crédit) ; 24 h pour répondre ; le vendeur accepte / refuse / fait UNE contre-proposition (`respond_offer`), l'acheteur y répond (`answer_counter`) ; 3 offres en cours max ; après un refus, 24 h avant de réoffrir ; option « ne pas recevoir d'offres » dans le profil (`no_offers`). Marché → onglet « Offres » (reçues / envoyées), pastille rose sur l'onglet Marché, vérification toutes les 60 s (`refreshOffers`). Choix du propriétaire (80 %, 24 h, une contre-proposition).
- Historique de l'argent : table `ledger` + `_log()` appelé à chaque mouvement ; page « Mon argent » (clic sur la trésorerie), RPC `my_ledger()`.
- Sons (`sfx()` dans core.js, sans fichier audio) : coupés par défaut, activables dans le profil (localStorage `hm_sound`).
- Achat à la banque : le crédit est proposé en premier (c'est ce que tout le monde choisit) ; « payer comptant » en lien dessous.
- Photos des cartes : planches `public/data/atlas/aN.jpg` (5 × 8 photos 400 × 300), champs `ph` = [planche, case] et `cr` = « Photo Auteur · Licence ». 4 797 bonnes photos (17/10/2026 : +2 201 photos de Commons rattachées par l'adresse dans le titre du fichier ou par position, script dans /tmp, planches a78–a133 ; 16/10/2026 : +1 340 photos libres de Wikimedia Commons trouvées via Wikidata, image P18 des lieux dont le point tombe dans l'emprise de l'immeuble ; script `scripts/add_photos.py`, rejouable). Les photos Panoramax sont ignorées à l'affichage. Quand on change `public/data`, changer `DATA_V` dans core.js.
- Cartes : image = maquette 3D de la vraie forme de l'immeuble (`maquetteSVG` dans cards.js), couleurs selon l'époque.
- Le joueur est une montgolfière 3D (`models.js`, `pawn3d`) aux couleurs de son parti, qui survole les toits sur le trajet du dé. Barre du bas : Téléport (avec confirmation) · Lancer · Boosters (mini paquet, badge) — il n'y a plus d'onglet Boosters.
- Sur téléphone : pas de bandeau des maires sur la carte (il est dans l'onglet Paris) ; quand on tombe sur une case, la carte s'affiche en grand.
- Thème « Blanc pur » (choisi par le propriétaire) : Paris en maquette blanche (couleurs dans `MC` de map.js), police Inter Tight partout, interface noir et blanc, bleu vif `--act` (#2563EB) pour le dé et les achats ; tes biens en bleu, ceux des autres en rose pâle, à vendre en orange. Booster = sachet métallisé (`packHTML`, classes `.sachet`). Cartes : cadre, ciel, bandeau étoilé et reflets selon la rareté ; époque en étiquette sur la maquette.
- Case et fiche immeuble : même plan des logements (`occHTML`, à vous / à d'autres / libres) et même choix « À crédit / Comptant » avec le loyer de chaque option. Sur téléphone, la case s'ouvre en grand (carte en grand, bouton d'achat toujours visible en bas).
- Téléphone : le filtre Tout / Mes biens / À vendre est toujours visible en haut à gauche de la carte (plus de bouton calque). Patrimoine compact (la collection apparaît dès le premier écran), fiche immeuble avec carte réduite.
- Carte : les filtres « Mes biens » et « À vendre » montrent une vue de tout Paris (dézoomée, jamais zoomée sur un seul bien) : points bleus (ou orange), étiquettes d'arrondissement avec le nombre de biens, couleurs des partis masquées, résumé en bas (`#stripsum`). Pas de rangée de cartes (demande du propriétaire). Toucher un point ouvre l'immeuble.
- Vue dézoomée (zoom < 13,4) : arrondissements colorés selon le parti du maire, emblème du parti dans l'étiquette d'arrondissement, légende « Qui gouverne Paris » en haut à gauche (`renderPartyLegend` dans map.js, clic → onglet Paris).
- Cliquer un immeuble ou un monument ouvre le même panneau que la case (`showLand(null, g)`, `landView`) : à droite sur ordinateur, en bas sur téléphone. Changer d'onglet ferme ce panneau.
- Page d'accueil « vitrine » noire (landing.js, `.landing.v2`), sans le bloc d'explication Google.
- Après un achat, s'il reste des logements libres, la case garde le bouton « Acheter 1 autre … » (Continuer devient secondaire). Fermer la case recentre la carte sur la montgolfière.
- Patrimoine (de haut en bas) : patrimoine net + petite courbe à droite, classement, 4 chiffres, endettement sur une ligne (`.debt2`), « Où sont vos biens » en tuiles par arrondissement (clic = filtre, `.dtile`), puis la collection.
- Fiche d'un bien possédé : « Vendre… » / « Hypothéquer… » ouvrent un formulaire en deux temps (`ownSheet` dans pages.js : nombre de logements, prix avec repères valeur / +10 % / +25 %, ce qu'on recevra ; hypothèque : argent reçu vs loyer perdu, puis Confirmer). Seuls les logements en vente ou hypothéqués ont une ligne. Marché → « Vendre » liste les biens vendables (`sellList`), un toucher ouvre la fiche avec le formulaire de vente.
- « Mes biens » sur la carte : carte épurée (classe `mymode`) : seulement les numéros d'arrondissement et les points bleus.
- Noms des quartiers, canaux et îles sur la carte (`PLACES` dans map.js).
- Tutoriel en jouant (fin de main.js, `tutTick`, localStorage `hm_tut` : 1 lancer · 2 la case · 3 après l'achat · 4 boosters · 5 mairies · 99 fini) : une bulle noire pointe ce qu'il faut toucher, seulement pour les nouveaux joueurs ; « Passer le tutoriel » à tout moment. e2e.py le passe (hm_tut=99).
- Noms des rues sur la carte (à partir du zoom 15,3) : `public/data/streets.json` (données « voie » de la Ville de Paris), polices de carte hébergées dans `public/fonts/` (Noto Sans).
- Dé : le bouton du milieu est un gros dé dessiné (`dieSVG`), et l'animation de lancer utilise le même dessin.
- Destinations après le dé (`_options`, migration_options.sql) : immeubles à au moins 0,6 × n pas, directions séparées si cos < 0,3 → 4 choix presque partout (moins au bord de Paris, c'est normal).
- Paris vivant (`life.js`) : zoomé (≥ 15) voitures et bus en 3D (`life3d`, petites boîtes extrudées), vélos (dans les parcs `inPark` — jamais de voitures dans un parc — et sur les pistes), passants, poussettes, chiens, pigeons ; dézoomé (12,4–15,4) trafic en points sur les grands axes (`flow`, BASE.major) ; dès 12,2 péniches, bateaux-mouches et vedettes sur la Seine avec sillage (`SEINE` = 2 voies calculées depuis les polygones d'eau) ; ~18 images/s, onglet Carte seulement ; toutes les 40–70 s un passant raconte une anecdote (`ANECDOTES`, bulle `.lbub`, jamais pendant le choix du dé ni case ouverte). Désactivable dans le profil (localStorage `hm_life`), coupé si « réduire les animations ».
- Case sur téléphone : `fitLand()` (pawn.js) rétrécit la carte jusqu'à ce que tout tienne sans faire défiler. Page booster : tout tient à l'écran.
- Sachet de booster v3 : façade haussmannienne gravée (`FACADE_SVG`), feuille holographique, sceau « 75 PARIS ». Barre d'onglets : icônes en couleur dans des tuiles (index.html).
- Hôtel de Ville : accessible en un toucher (bouton « La course à l'Hôtel de Ville », pastille, carte des mairies, légende des partis sur la carte).
- Crédit encore disponible : fine ligne sous la barre du haut (`#credbar`, version B choisie par le propriétaire) : « Crédit dispo X · jauge · N % utilisé » (N = crédits / (crédits + capacité)) ; `body.hascred` passe `--bar-h` à 84px.
- Patrimoine « Où sont vos biens » : liste classée (`.drow` : n° d'arrondissement, valeur + barre, loyers/jour ; 👑 si maire), 5 premiers puis « Voir les N ».
- Tableau de bord admin (migration_stats.sql) : Profil → Admin → « Tableau de bord » (`adminPage`, RPC `admin_stats()` réservée aux admins) : inscrits, actifs jour/7 j (`profiles.seen_at` mis à jour par le trigger `profiles_track` quand le joueur agit lui-même, + ledger), lancers (= salaires), boosters ouverts (`stat_day`, compté depuis le 17/10/2026), achats, ventes, argent en circulation, classement, derniers inscrits, courbe 14 jours.
- Pas de paiement en vrai argent pour l'instant : la boutique (`shopPage`) n'est plus accessible (bouton « + » masqué). Couleur du sachet au hasard à chaque ouverture (`packColSeed`), le contenu est toujours aléatoire.
- Carte : on ne peut pas dézoomer au-delà de « Paris remplit l'écran » (`fitMin` dans map.js) ; tout dézoomé (`body.zfar`, zoom < 12,4) étiquettes d'arrondissement compactes sans nom de maire.
- Taux de retour (migration_retention.sql) : table `active_day` (un jour d'activité par joueur, rempli par le trigger `profiles_track` à chaque visite — state() met le profil à jour — et reconstitué avant le 17/10/2026 depuis le ledger), RPC `admin_retention()` : J+1 / J+7 / J+30 / « revenu au moins une fois » + tableau par jour d'inscription (35 derniers jours), comptes admin exclus ; affiché dans le tableau de bord (`retentionHTML`), repères 40 / 20 / 10 %.
