"""Paris (migration_monde.sql, migration_monde_paris.sql, puis migration_de.sql : le dé revient le 21/10/2026) : entrer,
voir les gens par carrés, le dé (4 destinations au choix, on y court, on y tombe : salaire, loyer, bonus, Chance, achat),
plus de marche libre, les lancers (10, un toutes les 30 min, en acheter), le métro, parler, couper le chat, les groupes."""
import sys, uuid, json, math; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
def player(name, party=None):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=party); return u
c0 = db.conn(); cur = c0.cursor()
cur.execute("""create schema if not exists realtime;
  create table if not exists realtime.sent(payload jsonb, event text, topic text, private boolean, at timestamptz default clock_timestamp());
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
  $$ insert into realtime.sent(payload, event, topic, private) values (payload, event, topic, private) $$;
  truncate realtime.sent;""")
for f in ["migration_admin.sql", "migration_chat.sql", "migration_chat_look.sql", "migration_metro.sql", "migration_lieux.sql",
          "migration_monde.sql", "migration_monde_paris.sql", "migration_monde_paris.sql", "migration_vitesse.sql", "migration_temps_reel.sql", "migration_chat_minute.sql", "migration_vitesse2.sql", "migration_groupes.sql", "migration_groupes.sql", "migration_depart.sql", "migration_depart.sql", "migration_de.sql", "migration_de.sql"]:
    cur.execute(open("supabase/" + f).read())   # la dernière 2 fois : rejouable
c0.commit()
db.sql("truncate place_people, chat_msg, chat_bans, walkers, world_people, chance_taken")
A, B, C = player("Ana", "valeurs"), player("Ben", "valeurs"), player("Cyd", "poing")
cfg = db.sql("select _world_cfg()")[0][0]
M = lambda a, b: math.hypot((a[0] - b[0]) * 73240, (a[1] - b[1]) * 110574)
W = lambda u: db.sql("select lon, lat, km, dur, len, settled from walkers where user_id=%s", str(u))[0]
cash = lambda u: db.sql("select cash from profiles where id=%s", str(u))[0][0]
done = lambda u: db.sql("update walkers set t0 = now() - interval '1 minute' where user_id=%s", str(u))   # le trajet est fini
def put(u, lo, la):   # poser quelqu'un quelque part (fin de trajet, rien en cours)
    db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0, path=null, settled=true, t0 = now() - interval '1 minute' where user_id=%s", lo, la, lo, la, str(u))
    db.sql("update world_people set lon=%s, lat=%s, cell=_wcell(%s, %s) where user_id=%s", lo, la, lo, la, str(u))
last_ev = lambda: db.sql("select topic, payload from realtime.sent order by at desc limit 1")[0]
cardxy = lambda g: tuple(map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=%s", g)[0]))

# entrer
check("sans connexion : refusé", "Connexion" in (err(lambda: db.rpc(None, "world_join")) or ""))
j = db.rpc(A, "world_join"); SP = db.sql("select _wspawns()")[0][0]
check("entrer la première fois : devant un grand lieu tiré au hasard (21/10/2026)", min(M(j["pos"], p) for p in SP) < 8, j["pos"])
check("29 grands lieux de départ, chacun sur une rue avec au moins 15 immeubles achetables à portée", len(SP) == 29 and all(
  db.sql("select count(*) from cards where lk in ('l','c') and _wm(%s, %s, cx / 1e5, cy / 1e5) <= 120", lo, la)[0][0] >= 15 for lo, la in SP))
cell = db.sql("select _wcell(%s, %s)", j["pos"][0], j["pos"][1])[0][0]
t, ev = last_ev()
check("l'arrivée part en temps réel sur le canal privé du carré (≈ 500 m)", t == f"w:{cell}" and ev["k"] == "join", (t, ev["k"]))
check("le jour et les « ? » déjà ramassés sont donnés au site", j["day"] == db.sql("select _wday()")[0][0] and j["taken"] == [])
jb = db.rpc(B, "world_join"); put(B, j["pos"][0] + 0.0001, j["pos"][1])   # (Ben a commencé ailleurs : on le pose à côté d'Ana)
check("on voit les gens des carrés qu'on regarde, pas les autres", len(db.rpc(A, "world_people", p_cells=[cell])) == 2 and db.rpc(A, "world_people", p_cells=[cell + 500]) == [])
news = [player(f"Neuf{i}") for i in range(20)]; firsts = [db.rpc(u, "world_join")["pos"] for u in news]
check("20 nouveaux joueurs : répartis devant au moins 6 lieux différents (pas de foule au même endroit)", len({min(range(len(SP)), key=lambda k: M(q, SP[k])) for q in firsts}) >= 6)
old_p = player("Ancien"); far0 = db.sql("select id from cards where arr = 17 and lk = 'l' limit 1")[0][0]
db.sql("update profiles set pos = %s where id=%s", far0, str(old_p))
check("un ancien joueur du temps du dé : il commence là où était son pion", M(db.rpc(old_p, "world_join")["pos"], cardxy(far0)) < 30)
for u in news + [old_p]: db.rpc(u, "world_leave")
db.sql("delete from walkers where user_id = any(%s::uuid[])", [str(u) for u in news + [old_p]])

# le dé (21/10/2026, choix du propriétaire : « on peut remettre le dé pour se déplacer », « 4 destinations au choix »,
# « on supprime la marche libre »)
x0, y0 = j["pos"]
check("plus de marche libre : on avance au dé", "Lancez le dé" in (err(lambda: db.rpc(A, "world_move", p_lon=x0 + 0.001, p_lat=y0, p_len=10)) or ""))
rolls = lambda u: db.sql("select rolls from profiles where id=%s", str(u))[0][0]
pend = lambda u, g, die=3: db.sql("update profiles set pend = array[%s]::int[], pend_die = %s where id=%s", g, die, str(u))   # (comme si le dé venait de proposer g)
x0, y0 = 2.3640, 48.8670; put(A, x0, y0)   # (place de la République : des immeubles dans toutes les directions)
db.sql("update profiles set rolls = 10, rolls_at = now(), pend = null, pend_die = null, land = null where id=%s", str(A))
r = db.rpc(A, "roll"); d, opts = r["die"], r["options"]
quad = lambda o: int(((math.degrees(math.atan2((cardxy(o["card"])[0] - x0) * 73240, (cardxy(o["card"])[1] - y0) * 110574)) + 405) % 360) // 90)
check("lancer : un dé de 1 à 6 et 4 destinations au choix, une par direction (nord, est, sud, ouest)", 1 <= d <= 6 and len(opts) == 4 and len({quad(o) for o in opts}) == 4, (d, [o["dist"] for o in opts]))
check("à environ 100 m par point du dé", all(abs(o["dist"] - d * 100) <= d * 100 * 0.25 + 1 for o in opts), (d, [o["dist"] for o in opts]))
check("chaque destination dit ce qui l'attend (libre, à qui, loyer à payer, bonus, « ? »)", all({"card", "free", "mine", "owners", "pay", "bonus", "chance", "dist"} <= set(o) for o in opts))
check("un lancer en moins (10 → 9)", rolls(A) == 9 and r["state"]["profile"]["rolls"] == 9)
r2 = db.rpc(A, "roll")
check("relancer avant d'avoir choisi : les mêmes destinations, aucun lancer en moins", r2["die"] == d and [o["card"] for o in r2["options"]] == [o["card"] for o in opts] and rolls(A) == 9)
other = db.sql("select id from cards where lk='l' and id <> all(%s) order by abs(cx - %s) + abs(cy - %s) limit 1", [o["card"] for o in opts], int(x0 * 1e5), int(y0 * 1e5))[0][0]
check("aller ailleurs que sur une des destinations : refusé", "Lancez d'abord" in (err(lambda: db.rpc(A, "dice_go", p_card=other)) or ""))
o = next(o for o in opts if not o["chance"]); gx, gy = cardxy(o["card"])
pth = [[x0, y0], [gx, y0], [gx, gy]]; plen = M(pth[0], pth[1]) + M(pth[1], pth[2])
c1 = cash(A); res = db.rpc(A, "dice_go", p_card=o["card"], p_path=pth)
want_dur = min(cfg["runMax"], max(cfg["runMin"], plen / cfg["runSpeed"]))
check("choisir une destination : on y court par les rues (2,5 à 7 s) et on y tombe", abs(res["dur"] - want_dur) < .01 and res["path"] == pth and res["landing"]["card"] == o["card"]
      and db.sql("select land, pos from profiles where id=%s", str(A))[0] == (o["card"], o["card"]), (res["dur"], want_dur))
check("un salaire à chaque lancer : 20 000 €", res["landing"]["salary"] == 20000 and cash(A) == c1 + 20000 - res["landing"]["toll"]
      and db.sql("select label from ledger where owner=%s and kind='salary' order by at desc, id desc limit 1", str(A))[0][0] == "Salaire du lancer", (cash(A) - c1, res["landing"]))
t, ev = last_ev()
check("les gens autour voient la course (le trajet et sa durée)", ev["k"] == "move" and ev["d"]["path"] == pth and abs(ev["d"]["dur"] - want_dur) < .01, ev["k"])
check("pendant la course : pas de nouveau lancer", "Attendez" in (err(lambda: db.rpc(A, "roll")) or ""))
done(A)
check("arrivé : plus rien en attente, son personnage est devant l'immeuble", db.sql("select pend from profiles where id=%s", str(A))[0][0] is None and M(W(A)[:2], (gx, gy)) < 1)
check("recharger la page : la case où l'on est tombé reste la sienne", db.rpc(A, "world_join")["land"] == o["card"])
p0 = W(A)[:2]; g1 = other; g1x, g1y = cardxy(g1); pend(A, g1)
res = db.rpc(A, "dice_go", p_card=g1, p_path=[[p0[0] - 0.01, p0[1]], [g1x, g1y]])
check("un trajet qui ne part pas d'où l'on est : ignoré (tout droit)", res["path"] == [list(p0), [g1x, g1y]] or M(res["path"][0], p0) < .01, res["path"])
done(A); p0 = W(A)[:2]; pend(A, o["card"])
res = db.rpc(A, "dice_go", p_card=o["card"], p_path=[[p0[0], p0[1]], [p0[0] + 0.05, p0[1]], [gx, gy]])
check("… ou qui fait un détour énorme (plus de 4 km) : tout droit aussi", len(res["path"]) == 2, res["path"])
done(A)

# tomber chez les autres : une journée de loyer (pouvoirs des partis, au plus 20 % de sa trésorerie)
g = db.sql("select id from cards where arr=15 and lk='l' and lots between 3 and 10 and rent > 3000 and id not in (select card from lots) order by id limit 1")[0][0]
gx, gy = cardxy(g); rent = db.sql("select rent from cards where id=%s", g)[0][0]
db.sql("insert into lots(card,k,owner) select %s, k, %s from generate_series(0,1) k", g, str(B))
db.sql("update profiles set cash = 10000000 where id=%s", str(A)); put(A, gx + 0.003, gy); pend(A, g)
opt = db.rpc(A, "roll")["options"]
check("la destination dit le loyer qu'on y paierait et à qui", len(opt) == 1 and opt[0]["pay"] == 2 * rent and len(opt[0]["owners"]) == 1 and opt[0]["owners"][0].startswith("Ben"), opt)
c4 = cash(A); L = db.rpc(A, "dice_go", p_card=g)["landing"]
check("chez un autre joueur : on lui paie une journée de loyer de ses logements", L["toll"] == 2 * rent and cash(A) == c4 + 20000 - 2 * rent
      and db.sql("select coalesce(sum(amount),0) from pay where owner=%s", str(B))[0][0] == 2 * rent and L["payees"][0]["amount"] == 2 * rent, (L, rent))
check("… une ligne dans « Mon argent », et dans le fil d'actu", db.sql("select kind, label from ledger where owner=%s and kind='toll_paid' order by at desc, id desc limit 1", str(A))[0] == ("toll_paid", "Loyer de passage payé")
      and db.sql("select count(*) from news where kind='toll' and card=%s and actor=%s", g, str(A))[0][0] == 1)
done(A); db.rpc(C, "world_join"); put(C, gx + 0.003, gy); db.sql("update profiles set cash = 10000000 where id=%s", str(C)); pend(C, g)
check("Extrême gauche : moitié moins de loyer", db.rpc(C, "dice_go", p_card=g)["landing"]["toll"] == rent)
db.sql("update profiles set party='rempart' where id=%s", str(B)); pend(A, g)
check("Extrême droite : on lui paie 50 % de plus", db.rpc(A, "dice_go", p_card=g)["landing"]["toll"] == 3 * rent)
db.sql("update profiles set party='valeurs' where id=%s", str(B)); done(A)
db.sql("update profiles set cash = 1000 where id=%s", str(A)); pend(A, g)
L = db.rpc(A, "dice_go", p_card=g)["landing"]
check("loyer plafonné à 20 % de la trésorerie (après le salaire)", L["toll"] == math.floor((1000 + 20000) * 0.2), L)
db.sql("update profiles set cash = 1000000000 where id=%s", str(A)); done(A)

# acheter : seulement là où l'on est tombé
db.rpc(A, "bank_buy", p_card=g, p_k=None)
check("tombé sur un immeuble libre : on l'achète à la banque", db.sql("select count(*) from lots where card=%s and owner=%s", g, str(A))[0][0] == 1)
check("un autre immeuble : refusé", "Tombez dessus avec le dé" in (err(lambda: db.rpc(A, "bank_buy", p_card=other, p_k=None)) or ""))
check("sa case : seulement là où l'on est tombé", db.rpc(A, "world_arrive", p_card=g)["profile"]["land"] == g and "Lancez le dé" in (err(lambda: db.rpc(A, "world_arrive", p_card=other)) or ""))
pend(A, g); c6 = cash(A); L = db.rpc(A, "dice_go", p_card=g)["landing"]
check("chez soi : une journée de loyer de ses logements en bonus", L["bonus"] == rent and L["mine"] == 1 and cash(A) == c6 + 20000 + rent - 2 * rent, (L, rent))
done(A)
far = db.sql("select id from cards where lk='l' and cx not between %s and %s limit 1", round((gx - .03) * 1e5), round((gx + .03) * 1e5))[0][0]
db.sql("update profiles set land=%s where id=%s", far, str(A))
check("revenir dans Paris loin de sa case : elle ne l'est plus", db.rpc(A, "world_join")["land"] is None)

# les « ? » : une carte Chance en tombant dessus (plus en passant)
day = db.sql("select _wday()")[0][0]
on = [x[0] for x in db.sql("select card from spots where _wchance_on(card, %s) order by card", day)]
off = [x[0] for x in db.sql("select card from spots where not _wchance_on(card, %s) order by card limit 1", day)]
check("environ 30 % des lieux ont un « ? » aujourd'hui", 0.2 < len(on) / db.sql("select count(*) from spots")[0][0] < 0.4, len(on))
js = lambda c, d: ((c * 2654435761 + d * 97) % 4294967296) % 100 < 30
check("le site fait le même calcul que le serveur", all(js(c, day) for c in on) and not any(js(c, day) for c in off))
q = on[0]; qx, qy = cardxy(q); put(A, qx + 0.003, qy); pend(A, q)
L = db.rpc(A, "dice_go", p_card=q)["landing"]
check("tomber sur un « ? » : une carte Chance", (L["chance"] or {}).get("t") == "chance" and db.rpc(A, "world_join")["taken"] == [q], L["chance"])
done(A); pend(A, q)
check("une fois par jour pour chaque « ? »", db.rpc(A, "dice_go", p_card=q)["landing"]["chance"] is None)
done(A); put(A, qx, qy)
check("plus de « ? » ramassé en passant", "Tombez dessus" in (err(lambda: db.rpc(A, "world_chance", p_card=on[1])) or ""))
q2 = on[1]; q2x, q2y = cardxy(q2)
ids = [o["card"] for o in db.sql("select _dice_opts(%s, %s, %s, 300, null)", str(A), q2x, q2y - 300 / 110574)[0][0]]
check("un « ? » du jour, 300 m devant soi : le dé le propose", q2 in ids, ids)

# les lancers : 10 au plus, un de plus toutes les 30 min, 5 de plus contre l'argent du jeu
db.sql("update profiles set rolls = 0, rolls_at = now() - interval '10 minutes', pend = null where id=%s", str(A))
check("plus de lancers : le serveur dit quand revient le prochain", "le prochain dans 20 min" in (err(lambda: db.rpc(A, "roll")) or ""), err(lambda: db.rpc(A, "roll")))
db.sql("update profiles set rolls_at = now() - interval '61 minutes' where id=%s", str(A))
check("un lancer revient toutes les 30 min", db.rpc(A, "state")["profile"]["rolls"] == 2)
c7 = cash(A); db.rpc(A, "buy_rolls"); db.rpc(A, "buy_rolls")
check("acheter 5 lancers : 50 000 €, puis le prix double dans la journée", rolls(A) == 12 and c7 - cash(A) == 150000
      and db.sql("select count(*) from ledger where owner=%s and kind='rolls'", str(A))[0][0] == 2, (rolls(A), c7 - cash(A)))
pos = [[2.2526, 48.8622], [2.4383, 48.8336], [2.3950, 48.8610], [2.3300, 48.8270], [2.3800, 48.8850], [2.3000, 48.8800], [2.2750, 48.8450], [2.3480, 48.8530]]
n3 = [len(db.sql("select _dice_opts(%s, %s, %s, %s, null)", str(A), lo, la, dd)[0][0]) for lo, la in pos for dd in (100, 600)]
check("partout dans Paris, même au bord d'un bois : au moins une destination (et 3 presque toujours)", min(n3) >= 1 and sum(n >= 3 for n in n3) >= len(n3) - 4, n3)

# le métro
done(A); put(A, qx + 0.003, qy)
check("le métro loin d'une station : refusé", "station" in (err(lambda: db.rpc(A, "world_metro", p_to=1578)) or ""))
ex, ey = cardxy(602931)   # École Militaire
put(A, ex + 0.0008, ey); db.sql("update profiles set rolls = 5, pend = array[%s]::int[], pend_die = 2 where id=%s", other, str(A))
c5 = cash(A); r = db.rpc(A, "world_metro", p_to=1578)   # Châtelet
cx_, cy_ = cardxy(1578)
check("métro : de l'École Militaire à Châtelet (toutes les lignes), un ticket, on arrive à la station", r["from"] == 602931 and cash(A) == c5 - cfg["ticket"]
      and M(W(A)[:2], (cx_, cy_)) < 1 and r["state"]["profile"]["land"] == 1578, (r["from"], c5 - cash(A)))
t, ev = db.sql("select topic, payload from realtime.sent where payload->>'k' = 'move' order by at desc limit 1")[0]
check("les autres voient qu'on a pris le métro", ev["d"].get("metro") is True)
check("un dé lancé et pas joué est rendu en prenant le métro", rolls(A) == 6 and db.sql("select pend from profiles where id=%s", str(A))[0][0] is None)
check("toutes les stations de Paris sont sur le réseau (331 arrêts, 16 lignes)", db.sql("select count(*), count(distinct line) from metro_stop")[0] == (331, 16)
      and db.sql("select count(*) from spots s where s.kind='m' and not exists (select 1 from metro_stop m where m.card = s.card)")[0][0] == 0)

# parler, couper le chat, le personnage
db.rpc(A, "world_join")
db.rpc(A, "world_say", p_text="  Salut   Paris ")
t, ev = last_ev(); mycell = db.sql("select cell from world_people where user_id=%s", str(A))[0][0]
check("parler : on l'entend sur le canal de son carré, message signé par le serveur", t == f"w:{mycell}" and ev["k"] == "say" and ev["d"]["t"] == "Salut Paris" and ev["u"] == str(A))
e2 = err(lambda: db.rpc(A, "world_say", p_text="encore"))
check("un message par minute au plus : un chat de rue, pas une messagerie (21/10/2026)", "un message par minute" in (e2 or "") and "encore" in (e2 or ""), e2)
db.sql("update world_people set said_at = null where user_id=%s", str(A))   # ressortir et revenir ne remet pas le compteur à zéro
check("… même en effaçant son dernier passage (le message compte encore 1 minute)", "un message par minute" in (err(lambda: db.rpc(A, "world_say", p_text="encore")) or ""))
db.sql("update chat_msg set at = now() - interval '61 seconds' where user_id=%s and kind='say'", str(A))
db.rpc(A, "world_say", p_text="Une minute plus tard")
check("une minute plus tard, on peut reparler", last_ev()[1]["d"].get("t") == "Une minute plus tard")
fd = db.rpc(B, "world_feed", p_cells=[mycell], p_since=0)
check("sans temps réel, world_feed rend les évènements des carrés", any(e["k"] == "say" and e["d"]["t"] == "Salut Paris" for e in fd["ev"]))
check("couper le chat : enregistré dans le profil", db.rpc(A, "set_chat_off", p_off=True) is True and db.rpc(A, "state")["profile"]["chat_off"] is True)
db.rpc(A, "set_look", p_look={"g": 1, "s": 2, "h": 4, "c": 1, "t": -1, "b": 0, "a": 3})
check("changer de personnage : les gens autour le voient", last_ev()[1]["k"] == "look")
ADM = player("Adm"); db.sql("insert into admins(id) values (%s) on conflict do nothing", str(ADM))
db.rpc(ADM, "chat_ban", p_user=str(B), p_hours=24)
check("banni du chat : ne peut plus parler, mais reste dans Paris", "banni" in (err(lambda: db.rpc(B, "world_say", p_text="hello")) or "") and db.rpc(B, "world_ping") > 0)

# les groupes (21/10/2026) : dans un carré bondé, chacun ne voit et ne reçoit que son groupe (~40 au plus)
gx, gy = 2.3601, 48.8722   # un carré tranquille (canal Saint-Martin), loin des autres tests
gcell = db.sql("select _wcell(%s, %s)", gx, gy)[0][0]
db.sql("truncate realtime.sent")
crowd = []
for i in range(46):
    u = player(f"Foule{i}"); db.rpc(u, "world_join"); put(u, gx + (i % 7) * 1e-5, gy + (i // 7) * 1e-5); crowd.append(u)
check("41 personnes et plus dans un carré : il passe en 2 groupes", db.rpc(crowd[-1], "world_look", p_cells=[gcell]) and db.sql("select g from world_cells where cell=%s", gcell) == [(2,)], db.sql("select g from world_cells where cell=%s", gcell))
lay = {str(u): db.sql("select _wlayer(%s)", str(u))[0][0] for u in crowd}
a, b = next((u for u in crowd if lay[str(u)] % 2 == 0)), next((u for u in crowd if lay[str(u)] % 2 == 1))
la, lb = db.rpc(a, "world_look", p_cells=[gcell]), db.rpc(b, "world_look", p_cells=[gcell])
ids_a, ids_b = {p["id"] for p in la["people"]}, {p["id"] for p in lb["people"]}
check("chacun ne voit que son groupe (les deux groupes ne se recoupent pas, et font le tour du carré)",
      la["g"] == {str(gcell): 2} and not (ids_a & ids_b) and len(ids_a | ids_b) == 46 and all(lay[i] % 2 == lay[str(a)] % 2 for i in ids_a), (len(ids_a), len(ids_b)))
db.sql("truncate realtime.sent"); db.rpc(a, "world_say", p_text="Bonjour le groupe")
t, ev = last_ev()
check("parler dans un carré bondé : seulement sur le canal de son groupe", t == f"w:{gcell}.{lay[str(a)] % 2}" and ev["k"] == "say", t)
fb = db.rpc(b, "world_feed", p_cells=[gcell], p_since=0)
fa = db.rpc(a, "world_feed", p_cells=[gcell], p_since=0)
check("sans temps réel aussi : l'autre groupe ne reçoit pas le message", not any(e["k"] == "say" and e["d"].get("t") == "Bonjour le groupe" for e in fb["ev"])
      and any(e["k"] == "say" and e["d"].get("t") == "Bonjour le groupe" for e in fa["ev"]) and fb["g"] == {str(gcell): 2})
g4 = db.sql("select id from cards where lk='l' and cx is not null and id not in (select card from lots) order by abs(cx - %s) + abs(cy - %s) limit 1", int(gx * 1e5), int(gy * 1e5))[0][0]
if db.sql("select _wcell(cx / 1e5, cy / 1e5) from cards where id=%s", g4)[0][0] == gcell:
    db.sql("truncate realtime.sent"); db.sql("insert into lots(card,k,owner) values (%s,0,%s)", g4, str(a))
    check("un achat près d'ici part à tous les groupes du carré", sorted(r[0] for r in db.sql("select topic from realtime.sent where payload->>'k'='map'")) == [f"w:{gcell}.0", f"w:{gcell}.1"])
    db.sql("delete from lots where card=%s", g4)
# la foule s'en va : on revient à un seul groupe (pas plus d'une fois toutes les 30 s), et « regroup » prévient les anciens canaux
for u in crowd[4:]: db.rpc(u, "world_leave")
db.sql("update world_cells set at = now() - interval '1 minute' where cell=%s", gcell); db.sql("truncate realtime.sent")
db.rpc(crowd[0], "world_look", p_cells=[gcell])
rg = db.sql("select topic, payload->'d'->>'g' from realtime.sent where payload->>'k'='regroup' order by topic")
check("la foule partie : un seul groupe, « regroup » envoyé sur les 2 anciens canaux", db.sql("select g from world_cells where cell=%s", gcell) == []
      and rg == [(f"w:{gcell}.0", "1"), (f"w:{gcell}.1", "1")], rg)
rr = next(u for u in crowd[:4] if u not in (a, b))   # (pas celui qui vient de parler : un message par minute)
db.sql("truncate realtime.sent"); db.rpc(rr, "world_stop"); db.rpc(rr, "world_say", p_text="Re")
check("… et on reparle sur le canal du carré, comme avant", last_ev()[0] == f"w:{gcell}")
for u in crowd[:4]: db.rpc(u, "world_leave")

db.rpc(A, "world_leave")
check("quitter : on n'est plus visible", not db.sql("select 1 from world_people where user_id=%s", str(A)))
check("les fonctions internes sont interdites aux joueurs", not any(db.sql("select has_function_privilege('authenticated', %s, 'execute')", f)[0][0] for f in
      ("_world_cfg()", "_wsettle(uuid)", "_wpos(walkers)", "_wemit(int,uuid,text,jsonb)", "_wcell(float8,float8)", "_wsal(float8,text)", "_wchance_on(int,int)",
       "_wlayer(uuid)", "_wg(int)", "_wsend(int,int,int,uuid,text,jsonb)", "_wregroup(int,uuid)", "_dice_opts(uuid,float8,float8,float8,int)",
       "_dice_item(uuid,float8,float8,int)", "_land(uuid,int,int,int[])", "_near_or_fail(uuid,int)")))
check("un visiteur non connecté ne peut rien appeler", not any(db.sql("select has_function_privilege('anon', %s, 'execute')", f)[0][0] for f in
      ("world_join()", "world_move(float8,float8,float8,jsonb,boolean)", "world_arrive(int)", "world_metro(int)", "world_chance(int)", "world_say(text)", "world_stop()", "set_chat_off(boolean)", "world_look(int[])",
       "roll()", "dice_go(int,jsonb)", "go_to(int)", "buy_rolls()")))
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
