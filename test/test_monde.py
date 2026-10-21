"""Le monde ouvert sur tout Paris (migration_monde.sql puis migration_monde_paris.sql) : entrer, voir les gens par carrés,
marcher (km du jour, salaire au km, au-delà on paie), péage devant les immeubles des autres, acheter à portée, métro,
cartes Chance à ramasser, parler, couper le chat, plus de dé."""
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
          "migration_monde.sql", "migration_monde_paris.sql", "migration_monde_paris.sql", "migration_vitesse.sql", "migration_temps_reel.sql", "migration_chat_minute.sql"]:
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
j = db.rpc(A, "world_join"); nd = cardxy(400761)
check("entrer la première fois : devant son immeuble de départ (Notre-Dame), 5 km offerts", M(j["pos"], nd) < 30 and j["w"]["left"] == 5 and j["w"]["km"] == 0, (j["pos"], j["w"]))
cell = db.sql("select _wcell(%s, %s)", j["pos"][0], j["pos"][1])[0][0]
t, ev = last_ev()
check("l'arrivée part en temps réel sur le canal privé du carré (≈ 500 m)", t == f"w:{cell}" and ev["k"] == "join", (t, ev["k"]))
check("le jour et les « ? » déjà ramassés sont donnés au site", j["day"] == db.sql("select _wday()")[0][0] and j["taken"] == [])
jb = db.rpc(B, "world_join")
check("on voit les gens des carrés qu'on regarde, pas les autres", len(db.rpc(A, "world_people", p_cells=[cell])) == 2 and db.rpc(A, "world_people", p_cells=[cell + 500]) == [])

# marcher
x0, y0 = j["pos"]; tx, ty = x0 + 0.004, y0 + 0.002
path = [[x0, y0], [x0 + 0.004, y0], [tx, ty]]
plen = M(path[0], path[1]) + M(path[1], path[2])
c1 = cash(A); r = db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=10, p_path=path)
check("marcher : les km du trajet par les rues (calculés par le serveur, jamais moins)", abs(r["len"] - plen) < 0.5 and abs(W(A)[2] - plen / 1000) < 1e-6, (r["len"], plen))
check("salaire de la marche : 20 000 € par km offert", r["salary"] == math.floor(plen / 1000 * 20000) and cash(A) == c1 + r["salary"]
      and db.sql("select kind from ledger where owner=%s order by at desc, id desc limit 1", str(A))[0][0] == "salary", (r["salary"], cash(A) - c1))
t, ev = last_ev()
CFG = db.sql("select _world_cfg()")[0][0]
check("les gens autour voient le trajet et la durée (à la vitesse du jeu)", ev["k"] == "move" and ev["d"]["path"] == path and abs(ev["d"]["dur"] - min(CFG["maxDur"], max(1, plen / CFG["speed"]))) < 0.01, (ev["d"].get("dur"), CFG["speed"]))
check("le personnage marche à 12 m/s, un trajet dure 60 s au plus (21/10/2026 : « il avance trop vite »)", CFG["speed"] == 12 and CFG["maxDur"] == 60, CFG)
check("deux déplacements en moins d'un quart de seconde : le 2e attend", "Doucement" in (err(lambda: db.rpc(A, "world_move", p_lon=x0, p_lat=y0, p_len=10)) or ""))
done(A)
r = db.rpc(A, "world_move", p_lon=x0 + 0.001, p_lat=y0, p_len=1, p_path=[[x0 - 0.01, y0], [x0 + 0.001, y0]])
check("un trajet qui ne part pas d'où l'on est est ignoré (ligne droite comptée)", abs(r["len"] - M((tx, ty), (x0 + 0.001, y0))) < 0.5 and W(A)[5] is False, r["len"])
done(A); db.sql("update walkers set km = 1 where user_id=%s", str(A)); c2 = cash(A)
r1 = db.rpc(A, "world_move", p_lon=x0 + 0.012, p_lat=y0, p_len=1200)
db.sql("update walkers set t0 = t0 - interval '300 milliseconds' where user_id=%s", str(A))   # (pas de « Doucement »)
r2 = db.rpc(A, "world_move", p_lon=x0 + 0.001, p_lat=y0, p_len=1)
check("demi-tour aussitôt : les km pas marchés sont rendus, et leur salaire repris", W(A)[2] < 1.03 and abs(cash(A) - c2 - (r1["salary"] + r2["salary"])) <= 1 and r1["salary"] + r2["salary"] < 700,
      (W(A)[2], r1["salary"], r2["salary"]))
done(A); db.sql("update walkers set km = %s where user_id=%s", cfg["freeKm"] - 0.1, str(A)); put(A, x0, y0)
e = err(lambda: db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=400))
check("plus de km offerts : le serveur demande d'abord (prix des 300 m en trop)", e and "PAYER:3000" in e, e)
c3 = cash(A); r = db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=400, p_pay=True)
check("on paie les km en trop ; le salaire ne compte que les km offerts (100 m)", r["cost"] == 3000 and r["salary"] == 2000 and cash(A) == c3 - 3000 + 2000, (r["cost"], r["salary"]))
check("hors de Paris : refusé", "sortir de Paris" in (err(lambda: db.rpc(A, "world_move", p_lon=2.60, p_lat=48.86, p_len=100)) or ""))
db.sql("update walkers set day = paris_today() - 1, km = 9 where user_id=%s", str(A))
check("un nouveau jour : 5 km offerts à nouveau", db.rpc(A, "world_join")["w"]["left"] == cfg["freeKm"])

# le péage : en passant devant l'immeuble d'un autre joueur
g = db.sql("select id from cards where arr=15 and lk='l' and lots between 3 and 10 and rent > 0 and id not in (select card from lots) order by id limit 1")[0][0]
gx, gy = cardxy(g); rent = db.sql("select rent from cards where id=%s", g)[0][0]
for t_ in ("lots", "parts"):   # personne d'autre autour (d'anciens tests ont pu acheter dans le coin)
    db.sql(f"delete from {t_} where card in (select id from cards where cx between %s and %s and cy between %s and %s)", round((gx - .008) * 1e5), round((gx + .008) * 1e5), round((gy - .005) * 1e5), round((gy + .005) * 1e5))
db.sql("insert into lots(card,k,owner) select %s, k, %s from generate_series(0,1) k", g, str(B))
db.sql("update profiles set cash = 10000000 where id=%s", str(A)); db.sql("update walkers set km = 0, day = paris_today() where user_id=%s", str(A))
put(A, gx - 0.0025, gy)
pth = [[gx - 0.0025, gy], [gx + 0.0025, gy]]
db.rpc(A, "world_move", p_lon=gx + 0.0025, p_lat=gy, p_path=pth)
check("le péage se paie à l'arrivée (pas au départ)", db.sql("select count(*) from pay where owner=%s", str(B))[0][0] == 0)
done(A); c4 = cash(A); s = db.rpc(A, "world_stop")["toll"]
want = math.floor(2 * rent * cfg["toll"])
check("péage : en passant devant chez un autre, on lui paie 5 % du loyer du jour de ses logements", s["toll"] == want and s["n"] == 1 and cash(A) == c4 - want
      and db.sql("select coalesce(sum(amount),0) from pay where owner=%s", str(B))[0][0] == want, (s, want))
check("péage : une ligne dans « Mon argent »", db.sql("select kind, label from ledger where owner=%s order by at desc, id desc limit 1", str(A))[0] == ("toll_paid", "Péage · 1 immeuble"))
check("péage : payé une seule fois", db.rpc(A, "world_stop")["toll"]["toll"] == 0)
db.rpc(C, "world_join"); put(C, gx - 0.0025, gy); db.sql("update profiles set cash = 10000000 where id=%s", str(C))
db.rpc(C, "world_move", p_lon=gx + 0.0025, p_lat=gy, p_path=pth); done(C)
check("Extrême gauche : péage à moitié prix", db.rpc(C, "world_stop")["toll"]["toll"] == math.floor(want / 2))
db.sql("update profiles set party='rempart' where id=%s", str(B)); put(A, gx - 0.0025, gy); db.sql("update walkers set km = 0 where user_id=%s", str(A))
db.rpc(A, "world_move", p_lon=gx + 0.0025, p_lat=gy, p_path=pth); done(A)
check("Extrême droite : on lui paie 50 % de plus", db.rpc(A, "world_stop")["toll"]["toll"] == math.floor(want * 1.5))
db.sql("update profiles set party='valeurs' where id=%s", str(B))
put(A, gx - 0.006, gy); db.sql("update walkers set km = 0 where user_id=%s", str(A))
db.rpc(A, "world_move", p_lon=gx + 0.006, p_lat=gy, p_path=[[gx - 0.006, gy], [gx + 0.006, gy]])
db.sql("update walkers set t0 = now() - (dur * 0.2) * interval '1 second' where user_id=%s", str(A))   # 20 % du trajet marché : pas encore devant
check("trajet coupé avant l'immeuble : pas de péage", db.rpc(A, "world_stop")["toll"]["toll"] == 0)
put(A, gx, gy + 0.001)
db.rpc(A, "world_move", p_lon=gx + 0.003, p_lat=gy + 0.001, p_path=[[gx, gy + 0.001], [gx + 0.003, gy + 0.001]]); done(A)
check("passer dans la rue d'à côté (110 m) : pas de péage", db.rpc(A, "world_stop")["toll"]["toll"] == 0)
put(A, gx - 0.0025, gy)
db.rpc(A, "world_move", p_lon=gx + 0.0025, p_lat=gy, p_path=pth); done(A)
db.sql("update profiles set cash = 1000 where id=%s", str(A))   # (après le salaire du trajet)
check("péage plafonné à 10 % de la trésorerie", db.rpc(A, "world_stop")["toll"]["toll"] == 100)
db.sql("update profiles set cash = 1000000000 where id=%s", str(A))

# acheter à portée, même en marchant
put(A, gx + 0.0012, gy)   # ~ 88 m
st = db.rpc(A, "world_arrive", p_card=g)
check("à portée (90 m) : c'est sa case, la montgolfière y est aussi", st["profile"]["land"] == g and st["profile"]["pos"] == g)
db.rpc(A, "bank_buy", p_card=g, p_k=None)
check("on l'achète à la banque, comme en tombant dessus avec le dé", db.sql("select count(*) from lots where card=%s and owner=%s", g, str(A))[0][0] == 1)
put(A, gx + 0.0030, gy)   # ~ 220 m
check("trop loin (220 m) : le serveur le dit", "Trop loin" in (err(lambda: db.rpc(A, "world_arrive", p_card=g)) or ""))
put(A, gx - 0.0030, gy)
db.rpc(A, "world_move", p_lon=gx + 0.0030, p_lat=gy, p_path=[[gx - 0.0030, gy], [gx + 0.0030, gy]])
db.sql("update walkers set t0 = now() - (dur * 0.5) * interval '1 second' where user_id=%s", str(A))   # à mi-chemin : juste devant
check("en marchant, à mi-chemin devant l'immeuble : on peut l'acheter", db.rpc(A, "world_arrive", p_card=g)["profile"]["land"] == g)
done(A); db.rpc(A, "world_stop")
db.rpc(A, "world_move", p_lon=gx + 0.0040, p_lat=gy, p_path=[[gx + 0.0030, gy], [gx + 0.0040, gy]])
check("en repartant, on n'est plus sur sa case", db.sql("select land from profiles where id=%s", str(A))[0][0] is None)
done(A); db.rpc(A, "world_stop"); put(A, gx + 0.0005, gy); db.sql("update profiles set land=%s where id=%s", g, str(A))
check("revenir dans Paris à côté de son bien à portée : il le reste", db.rpc(A, "world_join")["land"] == g)
far = db.sql("select id from cards where lk='l' and cx not between %s and %s limit 1", round((gx - .03) * 1e5), round((gx + .03) * 1e5))[0][0]
db.sql("update profiles set land=%s where id=%s", far, str(A))
check("un ancien bien « à portée » loin d'ici (une case du dé) ne l'est plus en revenant", db.rpc(A, "world_join")["land"] is None
      and "Approchez" in (err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)) or ""))
put(A, gx + 0.0040, gy)   # (là où l'on était : loin d'une station)

# le métro
done(A); db.rpc(A, "world_stop")
check("le métro loin d'une station : refusé", "station" in (err(lambda: db.rpc(A, "world_metro", p_to=1578)) or ""))
ex, ey = cardxy(602931)   # École Militaire
put(A, ex + 0.0008, ey)
c5 = cash(A); r = db.rpc(A, "world_metro", p_to=1578)   # Châtelet
cx_, cy_ = cardxy(1578)
check("métro : de l'École Militaire à Châtelet (toutes les lignes), un ticket, on arrive à la station", r["from"] == 602931 and cash(A) == c5 - cfg["ticket"]
      and M(W(A)[:2], (cx_, cy_)) < 1 and r["state"]["profile"]["land"] == 1578, (r["from"], c5 - cash(A)))
t, ev = db.sql("select topic, payload from realtime.sent where payload->>'k' = 'move' order by at desc limit 1")[0]
check("les autres voient qu'on a pris le métro", ev["d"].get("metro") is True)
check("toutes les stations de Paris sont sur le réseau (331 arrêts, 16 lignes)", db.sql("select count(*), count(distinct line) from metro_stop")[0] == (331, 16)
      and db.sql("select count(*) from spots s where s.kind='m' and not exists (select 1 from metro_stop m where m.card = s.card)")[0][0] == 0)

# les cartes Chance à ramasser
day = db.sql("select _wday()")[0][0]
on = [x[0] for x in db.sql("select card from spots where _wchance_on(card, %s) order by card", day)]
off = [x[0] for x in db.sql("select card from spots where not _wchance_on(card, %s) order by card limit 1", day)]
check("environ 30 % des lieux ont un « ? » aujourd'hui", 0.2 < len(on) / db.sql("select count(*) from spots")[0][0] < 0.4, len(on))
js = lambda c, d: ((c * 2654435761 + d * 97) % 4294967296) % 100 < 30
check("le site fait le même calcul que le serveur", all(js(c, day) for c in on) and not any(js(c, day) for c in off))
q = on[0]; qx, qy = cardxy(q)
put(A, qx + 0.0010, qy)
check("trop loin du « ? » (73 m) : refusé", "Approchez" in (err(lambda: db.rpc(A, "world_chance", p_card=q)) or ""))
put(A, qx + 0.0003, qy)
r = db.rpc(A, "world_chance", p_card=q)
check("ramasser un « ? » : une carte Chance", r["chance"]["t"] == "chance" and r["chance"]["k"], r["chance"])
check("une fois par jour", "Déjà" in (err(lambda: db.rpc(A, "world_chance", p_card=q)) or "") and db.rpc(A, "world_join")["taken"] == [q])
q2 = on[1]; q2x, q2y = cardxy(q2)
put(A, q2x - 0.004, q2y); db.sql("update walkers set km = 0, day = paris_today() where user_id=%s", str(A))   # ~ 290 m à l'ouest du « ? »
db.rpc(A, "world_move", p_lon=q2x + 0.004, p_lat=q2y, p_path=[[q2x - 0.004, q2y], [q2x + 0.004, q2y]])
db.sql("update walkers set t0 = now() - (dur * 0.3) * interval '1 second' where user_id=%s", str(A))   # 30 % du trajet : le « ? » est encore devant
check("un « ? » encore devant soi sur le trajet : pas encore", "Approchez" in (err(lambda: db.rpc(A, "world_chance", p_card=q2)) or ""))
db.sql("update walkers set t0 = now() - (dur * 0.8) * interval '1 second' where user_id=%s", str(A))   # 80 % : on est passé devant, 170 m plus loin
check("un « ? » ramassé en passant (on est déjà plus loin)", (db.rpc(A, "world_chance", p_card=q2)["chance"] or {}).get("t") == "chance")
fx, fy = cardxy(off[0]); put(A, fx, fy)
check("pas de « ? » ici aujourd'hui : refusé", "Pas de carte Chance" in (err(lambda: db.rpc(A, "world_chance", p_card=off[0])) or ""))

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

# plus de dé
check("le dé n'existe plus", all("n'existe plus" in (err(lambda f=f, a=a: db.rpc(A, f, **a)) or "") for f, a in (("roll", {}), ("go_to", {"p_card": 400761}), ("buy_rolls", {}))))
db.rpc(A, "world_leave")
check("quitter : on n'est plus visible", not db.sql("select 1 from world_people where user_id=%s", str(A)))
check("les fonctions internes sont interdites aux joueurs", not any(db.sql("select has_function_privilege('authenticated', %s, 'execute')", f)[0][0] for f in
      ("_world_cfg()", "_wsettle(uuid)", "_wpos(walkers)", "_wemit(int,uuid,text,jsonb)", "_wcell(float8,float8)", "_wsal(float8,text)", "_wchance_on(int,int)")))
check("un visiteur non connecté ne peut rien appeler", not any(db.sql("select has_function_privilege('anon', %s, 'execute')", f)[0][0] for f in
      ("world_join()", "world_move(float8,float8,float8,jsonb,boolean)", "world_arrive(int)", "world_metro(int)", "world_chance(int)", "world_say(text)", "world_stop()", "set_chat_off(boolean)")))
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
