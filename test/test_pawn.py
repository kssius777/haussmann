import sys, uuid, time; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): ok = bool(ok); R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
A, B = uuid.uuid4(), uuid.uuid4()
for u in (A, B): db.sql("insert into auth.users(id) values (%s)", str(u))
s = db.rpc(A, "join_game", p_pseudo="Pion" + str(A)[:4], p_party=None); db.rpc(B, "join_game", p_pseudo="Rival" + str(B)[:4], p_party="poing")
p = s["profile"]; check("nouveau joueur : pion posé devant Notre-Dame, 10 lancers, 3 téléportations", p["pos"] == 400761 and p["rolls"] == 10 and p["tp"] == 3, (p["pos"], p["rolls"], p["tp"]))
far = db.sql("select id from cards where lk='l' and id not in (select card from lots) and _dist(400761, id) > 2000 limit 1")[0][0]
check("avant de lancer : pas d'achat à la banque", "tomber dessus" in (err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)) or ""))
t = time.time(); r = db.rpc(A, "roll"); dt = time.time() - t
path, L = r["path"], r["landing"]
check(f"lancer ({dt*1000:.0f} ms) : dé {r['die']} → {len(path)-1} pas", 1 <= r["die"] <= 6 and 1 <= len(path) - 1 <= r["die"] * 4)
check("on ne retombe jamais sur sa case de départ (≥ 60 m)", db.sql("select _dist(%s,%s)", path[0], path[-1])[0][0] >= 59)
check("le pion marche d'immeuble voisin en immeuble voisin", path[0] == 400761 and all(db.sql("select 1 from edges where a=%s and b=%s", a, b) for a, b in zip(path, path[1:])))
st = db.rpc(A, "state")["profile"]
check("le pion s'arrête sur la dernière case, achetable", st["pos"] == path[-1] == L["card"] and st["land"] == L["card"] and st["rolls"] == 9)
check("un petit salaire à chaque lancer", L["salary"] == 20000 and (L.get("chance") or st["cash"] >= 1000000 + 20000 - L["toll"]), (L["salary"], st["cash"]))
db.sql("update profiles set cash=cash+100000000 where id=%s", str(A))
if L["free"] > 0:
    db.rpc(A, "bank_buy", p_card=L["card"], p_k=None)
    check("achat de l'immeuble où l'on est tombé", db.sql("select count(*)+0 from lots where card=%s and owner=%s", L["card"], str(A))[0][0] + db.sql("select coalesce(sum(n),0) from parts where card=%s and owner=%s", L["card"], str(A))[0][0] >= 1)
check("achat ailleurs refusé", "tomber dessus" in (err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)) or ""))
# loyer de passage : B possède l'immeuble d'arrivée → on force l'arrivée en mettant tout autour à B
db.sql("update profiles set pos=400761, heading=0 where id=%s", str(A))
def land_on_b():
    for _ in range(12):
        x = db.rpc(A, "roll"); t2 = x["landing"]["card"]
        if not db.sql("select 1 from lots where card=%s and owner=%s", t2, str(A)): return x
    return None
# donne à B tous les immeubles proches pour être sûr de payer
near = [g for (g,) in db.sql("select id from cards where lk<>'p' and _dist(400761, id) < 600 and id not in (select card from lots where owner=%s)", str(A))]
db.sql("delete from lots where card = any(%s) and owner<>%s", near, str(A))
db.sql("insert into lots(card,k,owner) select c.id, 0, %s from cards c where c.id = any(%s) on conflict do nothing", str(B), near)
db.sql("update profiles set rolls=10, rent_at=now() where id=%s", str(A))
x = land_on_b()
check("tomber chez un autre joueur : on lui paie son loyer", x and x["landing"]["toll"] > 0 and not x["landing"]["payees"][0]["pseudo"].startswith("Pion" + str(A)[:4]), x and (x["landing"]["toll"], x["landing"]["payees"][:1]))
check("loyer plafonné à 20 % de la trésorerie", x and x["landing"]["toll"] <= 0.2 * 1e8 + 1e6)
# chez soi : bonus
mine_card = db.sql("select card from lots where owner=%s limit 1", str(A))
if mine_card:
    db.rpc(A, "teleport", p_card=mine_card[0][0]); st = db.rpc(A, "state")["profile"]
    check("téléportation sur son bien : on peut y acheter", st["pos"] == st["land"] == mine_card[0][0] and st["tp"] == 2)
check("téléportation refusée vers un bien qui n'est pas à soi", "ses biens" in (err(lambda: db.rpc(A, "teleport", p_card=far)) or ""))
db.sql("update profiles set tp=0 where id=%s", str(A)); check("3 téléportations par jour", "Plus de téléportation" in (err(lambda: db.rpc(A, "teleport", p_card=far)) or ""))
db.sql("update profiles set rolls=0, rolls_at=now() where id=%s", str(A))
check("plus de lancers : message avec le délai", "prochain arrive" in (err(lambda: db.rpc(A, "roll")) or ""))
db.sql("update profiles set rolls_at=now() - interval '75 minutes' where id=%s", str(A))
check("les lancers se rechargent (1 toutes les 30 min)", db.rpc(A, "state")["profile"]["rolls"] == 2)
# autour de Notre-Dame : 15 lancers, le pion doit quitter l'île au lieu de tourner en rond
C = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(C)); db.rpc(C, "join_game", p_pseudo="Ile" + str(C)[:4], p_party=None)
far_ = 0; same = 0; prev = 300658
for _ in range(15):
    db.sql("update profiles set rolls=10 where id=%s", str(C)); x = db.rpc(C, "roll"); t2 = x["landing"]["card"]
    same += (t2 == prev); prev = t2; far_ = max(far_, db.sql("select _dist(400761,%s)", t2)[0][0])
check("autour de Notre-Dame : le pion s'éloigne (pas de boucle)", far_ > 400 and same == 0, f"{far_:.0f} m au plus loin")
# acheter des lancers
db.sql("update profiles set rolls=0, cash=10000000, rb_n=0, rb_day=null where id=%s", str(A))
p0 = db.rpc(A, "state")["rolls_price"]; db.rpc(A, "buy_rolls"); st = db.rpc(A, "state")
check("acheter 5 lancers avec l'argent du jeu, prix qui double", st["profile"]["rolls"] == 5 and st["rolls_price"] == p0 * 2, (p0, st["rolls_price"]))
nch = db.sql("select count(*) from (select id from cards order by id limit 1200) x where _is_chance(id)")[0][0]
check("cases Chance réparties sur la carte (≈ 1 sur 8)", 100 < nch < 210, nch)
# choisir sa direction : vers l'est puis vers l'ouest, le pion part bien de ce côté
D = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(D)); db.rpc(D, "join_game", p_pseudo="Dir" + str(D)[:4], p_party=None)
ok_e = ok_w = 0
for i in range(8):
    db.sql("update profiles set rolls=10 where id=%s", str(D)); p0 = db.rpc(D, "state")["profile"]["pos"]
    want = 0.0 if i % 2 == 0 else 3.14159
    x = db.rpc(D, "roll", p_dir=want); t2 = x["landing"]["card"]
    dx = db.sql("select (b.cx - a.cx) from cards a, cards b where a.id=%s and b.id=%s", p0, t2)[0][0]
    if i % 2 == 0: ok_e += dx > 0
    else: ok_w += dx < 0
check("choisir sa direction : le pion part du côté choisi", ok_e >= 3 and ok_w >= 3, (ok_e, ok_w))
check("la direction choisie ne vaut que pour un lancer", db.sql("select aim from profiles where id=%s", str(D))[0][0] is False)
db.sql("update profiles set rent_at=now()-interval '2 days 4 hours' where id=%s", str(A)); db.rpc(A, "state")
lab = db.sql("select label from ledger where owner=%s and kind='rent_away' order by at desc limit 1", str(A))
check("loyers d'absence : une ligne à part avec la durée", bool(lab) and "2 j 4 h" in lab[0][0], lab)
print(f"\n{sum(R)}/{len(R)} OK")
