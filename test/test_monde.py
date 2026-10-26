"""Paris (migration_monde.sql, migration_monde_paris.sql, migration_de.sql, puis migration_vol.sql : le 26/10/2026, la
montgolfière vole où l'on veut) : entrer, voir les gens par carrés, voler (tout droit, des km qui se rechargent, un salaire par km,
en acheter), le péage (le loyer écrit sur la carte, une fois par jour par immeuble), se poser (sa case, l'achat, les « ? »),
le métro, parler, couper le chat, les groupes."""
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
          "migration_monde.sql", "migration_monde_paris.sql", "migration_monde_paris.sql", "migration_vitesse.sql", "migration_temps_reel.sql", "migration_chat_minute.sql", "migration_vitesse2.sql", "migration_groupes.sql", "migration_groupes.sql", "migration_depart.sql", "migration_depart.sql", "migration_de.sql", "migration_de.sql", "migration_course.sql", "migration_course.sql", "migration_vol.sql", "migration_vol.sql"]:
    cur.execute(open("supabase/" + f).read())   # la dernière 2 fois : rejouable
c0.commit()
db.sql("truncate place_people, chat_msg, chat_bans, walkers, world_people, chance_taken, toll_seen")
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

# la montgolfière vole où l'on veut (26/10/2026, choix du propriétaire : « en cliquant, on va se déplacer là où on veut, pile
# poil » ; le dé s'en va) : des km qui se rechargent, un salaire par km volé
x0, y0 = 2.3640, 48.8670; put(A, x0, y0)
km = lambda u: db.rpc(u, "state")
db.sql("update profiles set km_free = 5, km_at = now(), km_buy = 0, land = null, cash = 10000000 where id=%s", str(A))
check("le dé s'en va : roll, dice_go, buy_rolls refusés (sites d'avant : « rechargez la page »)", all("rechargez la page" in (err(f) or "") for f in
      (lambda: db.rpc(A, "roll"), lambda: db.rpc(A, "dice_go", p_card=1), lambda: db.rpc(A, "buy_rolls"), lambda: db.rpc(A, "world_move", p_lon=x0 + 0.001, p_lat=y0, p_len=10))))
st = km(A)
check("5 km dans la réserve (le prix de 2 km de plus : 50 000 €)", abs(st["km_free"] - 5) < 1e-6 and st["km_buy"] == 0 and st["km_price"] == 50000 and cfg["kmMax"] == 5, (st["km_free"], st["km_price"]))
tx, ty = x0 + 600 / 73240, y0; c1 = cash(A); r = db.rpc(A, "fly", p_lon=tx, p_lat=ty)
Lm = M((x0, y0), (tx, ty)); want_dur = min(cfg["runMax"], max(cfg["runMin"], Lm / cfg["runSpeed"]))
check("toucher la carte : on y vole tout droit (1,2 à 3 s), on ne s'y pose sur aucun immeuble", r["path"] == [[x0, y0], [tx, ty]] and abs(r["dur"] - want_dur) < .01 and r["landing"] is None
      and db.sql("select land from profiles where id=%s", str(A))[0][0] is None, (r["dur"], want_dur))
check("un salaire par km volé : 20 000 € le km", r["salary"] == math.floor(Lm / 1000 * 20000) and cash(A) == c1 + r["salary"] - r["toll"]["toll"]
      and db.sql("select label from ledger where owner=%s and kind='salary' order by at desc, id desc limit 1", str(A))[0][0] == "Salaire · 0,6 km", (r["salary"], cash(A) - c1))
check("… et autant de km en moins dans la réserve", abs(km(A)["km_free"] - (5 - Lm / 1000)) < 0.002 and abs(r["km"] - (5 - Lm / 1000)) < 0.002, km(A)["km_free"])
t, ev = last_ev()
check("les gens autour voient le vol", ev["k"] == "move" and ev["d"]["path"] == [[x0, y0], [tx, ty]] and abs(ev["d"]["dur"] - want_dur) < .01, ev["k"])
check("pendant le vol : pas de nouveau vol", "Attendez" in (err(lambda: db.rpc(A, "fly", p_lon=x0, p_lat=y0)) or ""))
done(A)
check("arrivé : sa montgolfière est là où l'on a touché", M(W(A)[:2], (tx, ty)) < 1)
check("hors de Paris : refusé", "Restez dans Paris" in (err(lambda: db.rpc(A, "fly", p_lon=2.1, p_lat=48.86)) or ""))
db.sql("update profiles set km_free = 0.2, km_at = now(), km_buy = 0 where id=%s", str(A))
check("pas assez de km : refusé, le serveur dit combien il en reste", "il vous en reste 0,2" in (err(lambda: db.rpc(A, "fly", p_lon=tx + 0.01, p_lat=ty)) or ""), err(lambda: db.rpc(A, "fly", p_lon=tx + 0.01, p_lat=ty)))
db.sql("update profiles set km_free = 0, km_at = now() - interval '60 minutes' where id=%s", str(A))
check("la réserve se recharge : +500 m toutes les 30 min", abs(km(A)["km_free"] - 1.0) < 0.01, km(A)["km_free"])
db.sql("update profiles set km_at = now() - interval '24 hours' where id=%s", str(A))
check("… 5 km au plus", abs(km(A)["km_free"] - 5) < 1e-6)
db.sql("update profiles set km_free = 0, km_at = now(), km_buy = 0, rb_n = 0, rb_day = null where id=%s", str(A)); c2 = cash(A)
db.rpc(A, "buy_km"); st = db.rpc(A, "buy_km")
check("acheter 2 km : 50 000 €, puis le prix double dans la journée", abs(st["km_buy"] - 4) < 1e-6 and c2 - cash(A) == 150000 and st["km_price"] == 200000
      and db.sql("select count(*) from ledger where owner=%s and kind='km' and label='Achat de 2 km'", str(A))[0][0] == 2, (st["km_buy"], c2 - cash(A)))
r = db.rpc(A, "fly", p_lon=x0, p_lat=y0)
check("les km achetés ne donnent pas de salaire (sinon on achèterait de l'argent)", r["salary"] <= 20 and abs(km(A)["km_buy"] - (4 - Lm / 1000)) < 0.002, (r["salary"], km(A)["km_buy"]))
done(A)
G = player("Gil", "tendue"); db.rpc(G, "world_join"); put(G, x0, y0); db.sql("update profiles set km_free = 5, km_at = now() where id=%s", str(G))
check("Gauche : salaire doublé (40 000 € le km)", db.rpc(G, "fly", p_lon=tx, p_lat=ty)["salary"] == math.floor(Lm / 1000 * 40000))
db.rpc(G, "world_leave")

# le péage (26/10/2026, choix du propriétaire : « le loyer affiché ») : survoler l'immeuble d'un autre joueur = lui payer le loyer
# écrit sur sa carte (un logement), une fois par jour par immeuble ; à plusieurs propriétaires, chacun sa part
ax, ay = 2.3700, 48.8590; bx, by = ax + 700 / 73240, ay
near = db.sql("""select id, rent from cards where lk = 'l' and lots >= 2 and id not in (select card from lots) and id not in (select card from parts)
  and cx between %s and %s and cy between %s and %s and _wsegd(cx / 1e5, cy / 1e5, %s, %s, %s, %s) <= 18 order by cx limit 4""",
  int(ax * 1e5), int(bx * 1e5), int((ay - .0003) * 1e5), int((ay + .0003) * 1e5), ax, ay, bx, by)
check("(4 immeubles sous le trajet de test)", len(near) == 4, near)
(g1, r1), (g2, r2), (g3, r3), (g4, r4) = near
Cr = player("Cyr", "rempart"); D = player("Dom", "poing")
db.sql("insert into lots(card,k,owner) values (%s,0,%s),(%s,1,%s)", g1, str(B), g1, str(B))     # Ben : 2 logements (on paie un loyer)
db.sql("insert into lots(card,k,owner) values (%s,0,%s)", g2, str(Cr))                            # Cyr (Extrême droite) : +50 %
db.sql("insert into lots(card,k,owner) values (%s,0,%s),(%s,1,%s)", g3, str(B), g3, str(Cr))     # moitié Ben, moitié Cyr
db.sql("insert into lots(card,k,owner,mort) values (%s,0,%s,100000)", g4, str(B))                 # hypothéqué : rien
for u in (B, Cr): db.sql("delete from pay where owner=%s", str(u))
for t_ in ("lots", "parts"):   # (les autres tests ont pu acheter près du trajet : on ne garde que les 4 immeubles du test)
    db.sql(f"delete from {t_} where card in (select id from cards where cx between %s and %s and cy between %s and %s and _wsegd(cx / 1e5, cy / 1e5, %s, %s, %s, %s) <= 30) and card <> all(%s)",
           int(ax * 1e5) - 60, int(bx * 1e5) + 60, int((ay - .0005) * 1e5), int((ay + .0005) * 1e5), ax, ay, bx, by, [g1, g2, g3, g4])
put(A, ax, ay); db.sql("update profiles set km_free = 5, km_at = now(), km_buy = 0, cash = 10000000, land = null where id=%s", str(A)); db.sql("delete from toll_seen where user_id=%s", str(A))
want = math.floor(r1 + r2 * 1.5 + r3 * .5 + r3 * .5 * 1.5)
# viser puis voler (26/10/2026, « on sait pas trop où on peut cliquer ») : avant de partir, la distance et le péage, sans rien payer
q = db.rpc(A, "fly_quote", p_lon=bx, p_lat=by)
check("viser : fly_quote dit la distance et le péage avant de partir, sans rien payer ni bouger",
      q["ok"] is True and abs(q["len"] - 700) <= 3 and q["n"] == 3 and abs(q["toll"] - want) <= 2 and cash(A) == 10000000
      and not db.sql("select 1 from toll_seen where user_id=%s", str(A)) and not db.sql("select 1 from pay where owner in (%s, %s)", str(B), str(Cr)), q)
r = db.rpc(A, "fly", p_lon=bx, p_lat=by); tl = r["toll"]
check("… et le vol paie exactement ce qui était annoncé", tl["toll"] == q["toll"], (tl["toll"], q["toll"]))
check("survoler : le loyer écrit sur la carte de chaque immeuble d'un autre joueur (Extrême droite +50 %, partagé, rien sur un bien hypothéqué)",
      abs(tl["toll"] - want) <= 2 and tl["n"] == 3 and [h[0] for h in tl["hits"]] == [g1, g2, g3], (tl, want, (r1, r2, r3)))
paid = lambda u: float(db.sql("select coalesce(sum(amount),0) from pay where owner=%s", str(u))[0][0])
check("chacun touche sa part (« Loyer de passage reçu »)", abs(paid(B) - (r1 + r3 * .5)) <= 2 and abs(paid(Cr) - (r2 * 1.5 + r3 * .75)) <= 2, (paid(B), paid(Cr), r1, r2, r3))
check("une ligne dans « Mon argent » : « Péage · 3 immeubles »", db.sql("select label, amount from ledger where owner=%s and kind='toll_paid' order by at desc, id desc limit 1", str(A))[0] == ("Péage · 3 immeubles", -tl["toll"]))
check("les immeubles dans l'ordre du vol (pour le compteur sur la montgolfière)", [h[2] for h in tl["hits"]] == sorted(h[2] for h in tl["hits"]) and all(0 <= h[2] <= 1 for h in tl["hits"]))
done(A)
check("repasser le même jour : rien (une fois par jour par immeuble)", db.rpc(A, "fly", p_lon=ax, p_lat=ay)["toll"]["toll"] == 0)
done(A); db.sql("update toll_seen set day = day - 1 where user_id=%s", str(A))
check("le lendemain : on repaie", db.rpc(A, "fly", p_lon=bx, p_lat=by)["toll"]["toll"] > 0)
done(A); db.sql("delete from toll_seen where user_id=%s", str(A)); db.sql("update profiles set cash = 1000 where id=%s", str(A))
r = db.rpc(A, "fly", p_lon=ax, p_lat=ay)
check("jamais plus de 10 % de son argent par vol (après le salaire)", r["toll"]["toll"] == math.floor((1000 + r["salary"]) * 0.1) and r["toll"]["cap"] is True, (r["toll"], r["salary"]))
done(A); db.rpc(D, "world_join"); put(D, ax, ay); db.sql("update profiles set km_free = 5, km_at = now(), cash = 10000000 where id=%s", str(D))
check("Extrême gauche : moitié prix", abs(db.rpc(D, "fly", p_lon=bx, p_lat=by)["toll"]["toll"] - want * .5) <= 2)
db.rpc(D, "world_leave")
db.sql("update profiles set cash = 10000000 where id=%s", str(A))
put(A, ax, ay); db.sql("update profiles set km_free = 0.1, km_at = now(), km_buy = 0 where id=%s", str(A))
q = db.rpc(A, "fly_quote", p_lon=bx, p_lat=by)
check("viser plus loin que ses km : pas d'accord (why = km) et ce qu'il reste", q["ok"] is False and q["why"] == "km" and abs(q["km"] - 0.1) < 0.01, q)
check("viser hors de Paris : why = paris", db.rpc(A, "fly_quote", p_lon=2.6, p_lat=48.85)["why"] == "paris")
db.sql("update profiles set km_free = 5, km_at = now() where id=%s", str(A))

# se poser sur un immeuble : sa case ; libre, on l'achète à la banque (seulement là où l'on s'est posé) ; plus de bonus chez soi
g = db.sql("select id from cards where arr=15 and lk='l' and lots between 3 and 10 and id not in (select card from lots) order by id limit 1")[0][0]
gx, gy = cardxy(g); put(A, gx + 0.003, gy); db.sql("update profiles set km_free = 5, km_at = now() where id=%s", str(A))
r = db.rpc(A, "fly", p_lon=None, p_lat=None, p_card=g); L = r["landing"]
check("toucher un immeuble puis « Y aller » : on s'y pose, sa case s'ouvre", L["card"] == g and L["free"] > 0 and r["path"][-1] == [gx, gy]
      and db.sql("select land, pos from profiles where id=%s", str(A))[0] == (g, g), L)
done(A)
db.rpc(A, "bank_buy", p_card=g, p_k=None)
check("posé sur un immeuble libre : on l'achète à la banque", db.sql("select count(*) from lots where card=%s and owner=%s", g, str(A))[0][0] == 1)
other = db.sql("select id from cards where lk='l' and id <> %s and id not in (select card from lots) order by abs(cx - %s) + abs(cy - %s) limit 1", g, int(gx * 1e5), int(gy * 1e5))[0][0]
check("un autre immeuble : refusé", "Posez-vous dessus" in (err(lambda: db.rpc(A, "bank_buy", p_card=other, p_k=None)) or ""))
check("sa case : seulement là où l'on s'est posé", db.rpc(A, "world_arrive", p_card=g)["profile"]["land"] == g and "Allez-y d'abord" in (err(lambda: db.rpc(A, "world_arrive", p_card=other)) or ""))
check("recharger la page : la case où l'on s'est posé reste la sienne", db.rpc(A, "world_join")["land"] == g)
put(A, gx + 0.003, gy); c6 = cash(A); r = db.rpc(A, "fly", p_lon=None, p_lat=None, p_card=g)
check("chez soi : plus de bonus (on ferait des allers-retours entre ses biens)", "bonus" not in r["landing"] and cash(A) == c6 + r["salary"] - r["toll"]["toll"] and r["landing"]["mine"] == 1, r["landing"])
done(A)
r = db.rpc(A, "fly", p_lon=gx + 0.002, p_lat=gy)
check("repartir dans une rue : ce n'est plus sa case", r["landing"] is None and db.sql("select land from profiles where id=%s", str(A))[0][0] is None
      and "Posez-vous dessus" in (err(lambda: db.rpc(A, "bank_buy", p_card=g, p_k=None)) or ""))
done(A)
far = db.sql("select id from cards where lk='l' and cx not between %s and %s limit 1", round((gx - .03) * 1e5), round((gx + .03) * 1e5))[0][0]
db.sql("update profiles set land=%s where id=%s", far, str(A))
check("revenir dans Paris loin de sa case : elle ne l'est plus", db.rpc(A, "world_join")["land"] is None)

# les « ? » : une carte Chance en s'y posant (une fois par jour pour chacun)
day = db.sql("select _wday()")[0][0]
on = [x[0] for x in db.sql("select card from spots where _wchance_on(card, %s) order by card", day)]
off = [x[0] for x in db.sql("select card from spots where not _wchance_on(card, %s) order by card limit 1", day)]
check("environ 30 % des lieux ont un « ? » aujourd'hui", 0.2 < len(on) / db.sql("select count(*) from spots")[0][0] < 0.4, len(on))
js = lambda c, d: ((c * 2654435761 + d * 97) % 4294967296) % 100 < 30
check("le site fait le même calcul que le serveur", all(js(c, day) for c in on) and not any(js(c, day) for c in off))
q = on[0]; qx, qy = cardxy(q); put(A, qx + 0.003, qy); db.sql("update profiles set km_free = 5, km_at = now() where id=%s", str(A))
L = db.rpc(A, "fly", p_lon=None, p_lat=None, p_card=q)["landing"]
check("se poser sur un « ? » : une carte Chance", (L["chance"] or {}).get("t") == "chance" and db.rpc(A, "world_join")["taken"] == [q], L["chance"])
done(A); put(A, qx + 0.003, qy)
check("une fois par jour pour chaque « ? »", db.rpc(A, "fly", p_lon=None, p_lat=None, p_card=q)["landing"]["chance"] is None)
done(A); put(A, qx, qy)
check("plus de « ? » ramassé en passant", "rechargez" in (err(lambda: db.rpc(A, "world_chance", p_card=on[1])) or ""))

# le métro
done(A); put(A, qx + 0.003, qy)
check("le métro loin d'une station : refusé", "station" in (err(lambda: db.rpc(A, "world_metro", p_to=1578)) or ""))
ex, ey = cardxy(602931)   # École Militaire
put(A, ex + 0.0008, ey)
c5 = cash(A); k5 = km(A)["km_free"]; r = db.rpc(A, "world_metro", p_to=1578)   # Châtelet
cx_, cy_ = cardxy(1578)
check("métro : de l'École Militaire à Châtelet (toutes les lignes), un ticket, pas de km, on arrive à la station", r["from"] == 602931 and cash(A) == c5 - cfg["ticket"]
      and M(W(A)[:2], (cx_, cy_)) < 1 and r["state"]["profile"]["land"] == 1578 and abs(km(A)["km_free"] - k5) < 0.01, (r["from"], c5 - cash(A)))
t, ev = db.sql("select topic, payload from realtime.sent where payload->>'k' = 'move' order by at desc limit 1")[0]
check("les autres voient qu'on a pris le métro", ev["d"].get("metro") is True)
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
       "_dice_item(uuid,float8,float8,int)", "_land(uuid,int,int,int[])", "_near_or_fail(uuid,int)",
       "_ftoll(uuid,float8,float8,float8,float8,int)", "_ftoll_rows(uuid,float8,float8,float8,float8,int)", "_kmfree(profiles)", "km_price(profiles)")))
check("un visiteur non connecté ne peut rien appeler", not any(db.sql("select has_function_privilege('anon', %s, 'execute')", f)[0][0] for f in
      ("world_join()", "world_move(float8,float8,float8,jsonb,boolean)", "world_arrive(int)", "world_metro(int)", "world_chance(int)", "world_say(text)", "world_stop()", "set_chat_off(boolean)", "world_look(int[])",
       "roll()", "dice_go(int,jsonb)", "go_to(int)", "buy_rolls()", "fly(float8,float8,int)", "buy_km()", "fly_quote(float8,float8,int)")))
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
