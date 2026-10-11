import sys, uuid, time; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
A, B = uuid.uuid4(), uuid.uuid4()
for u in (A, B): db.sql("insert into auth.users(id) values (%s)", str(u))
s = db.rpc(A, "join_game", p_pseudo="Pion" + str(A)[:4], p_party=None); db.rpc(B, "join_game", p_pseudo="Rival" + str(B)[:4], p_party="poing")
p = s["profile"]; check("nouveau joueur : pion posé à Notre-Dame, 10 lancers, 3 téléportations", p["pos"] == 300658 and p["rolls"] == 10 and p["tp"] == 3, (p["pos"], p["rolls"], p["tp"]))
t = time.time(); r = db.rpc(A, "roll"); dt = time.time() - t
n = sum(r["dice"]); check(f"lancer de dés ({dt*1000:.0f} ms) : {r['dice']} → {len(r['targets'])} cases possibles", 2 <= n <= 12 and len(r["targets"]) > 0)
check("relancer sans bouger renvoie les mêmes dés", db.rpc(A, "roll")["dice"] == r["dice"])
check("un seul lancer consommé", db.rpc(A, "state")["profile"]["rolls"] == 9)
bad = db.sql("select id from cards where id <> all(%s) limit 1", r["targets"])[0][0]
check("impossible d'aller sur une case hors de portée", "pas de votre pion" in (err(lambda: db.rpc(A, "move", p_target=bad)) or ""))
tg = r["targets"][0]; t = time.time(); m = db.rpc(A, "move", p_target=tg); dt = time.time() - t
path = m["path"]
ok_path = len(path) == n + 1 and path[0] == 300658 and path[-1] == tg and all(db.sql("select 1 from edges where a=%s and b=%s", a, b) for a, b in zip(path, path[1:]))
check(f"déplacement ({dt*1000:.0f} ms) : chemin de {len(path)-1} pas par des immeubles voisins", ok_path)
check("le pion est arrivé, les dés sont rendus", db.rpc(A, "state")["profile"]["pos"] == tg and db.rpc(A, "state")["profile"]["dice"] is None)
check("bouger sans relancer est refusé", "Lancez" in (err(lambda: db.rpc(A, "move", p_target=tg)) or ""))
# buying near / far
near = db.sql("select id from cards where lk<>'p' and id not in (select card from lots) and _dist(%s, id) < 150 order by _dist(%s, id) limit 1", tg, tg)[0][0]
far = db.sql("select id from cards where lk='l' and id not in (select card from lots) and _dist(%s, id) > 2000 limit 1", tg)[0][0]
db.sql("update profiles set cash=cash+100000000 where id=%s", str(A)); db.rpc(A, "bank_buy", p_card=near, p_k=None); check("achat d'un immeuble proche du pion", db.sql("select count(*) from lots where card=%s and owner=%s", near, str(A))[0][0] == 1)
e = err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)); check("achat d'un immeuble lointain refusé", e and "Trop loin" in e, e)
# toll: B owns the building where A will land
db.sql("update profiles set dice='{3,4}', pos=%s where id=%s", 300658, str(A))
tg2 = [x for x in db.rpc(A, "roll")["targets"] if x != near][0]
cid = db.sql("select lots from cards where id=%s", tg2)[0][0]
db.sql("delete from lots where card=%s", tg2); db.sql("insert into lots(card,k,owner) select %s, g, %s from generate_series(0,%s-1) g", tg2, str(B), cid)
c0 = db.sql("select cash from profiles where id=%s", str(A))[0][0]; db.sql("update profiles set rent_at=now() where id=%s", str(A))
m = db.rpc(A, "move", p_target=tg2); L = m["landing"]
c1 = db.sql("select cash from profiles where id=%s", str(A))[0][0]
check("péage payé au propriétaire de l'immeuble", L["toll"] > 0 and L["payees"] and c0 - c1 >= L["toll"] - 1 and db.sql("select coalesce(sum(amount),0) from pay where owner=%s and why='péage'", str(B))[0][0] >= L["toll"] - 1, (L["toll"], L["payees"][:1]))
check("péage plafonné à 20 % de la trésorerie", L["toll"] <= c0 * 0.2 + 1)
# teleport
check("téléportation refusée vers un bien qui n'est pas à soi", "ses biens" in (err(lambda: db.rpc(A, "teleport", p_card=far)) or ""))
db.rpc(A, "teleport", p_card=near); check("téléportation sur son bien", db.rpc(A, "state")["profile"]["pos"] == near and db.rpc(A, "state")["profile"]["tp"] == 2)
db.sql("update profiles set tp=0 where id=%s", str(A)); check("3 téléportations par jour", "Plus de téléportation" in (err(lambda: db.rpc(A, "teleport", p_card=near)) or ""))
# rolls run out and regenerate
db.sql("update profiles set rolls=0, rolls_at=now(), dice=null where id=%s", str(A))
check("plus de lancers : message avec le délai", "prochain arrive" in (err(lambda: db.rpc(A, "roll")) or ""))
db.sql("update profiles set rolls_at=now() - interval '5 hours' where id=%s", str(A))
check("les lancers se rechargent (1 toutes les 2 h)", db.rpc(A, "state")["profile"]["rolls"] == 2)
# chance squares exist
nch = db.sql("select count(*) from (select id from cards order by id limit 1200) x where _is_chance(id)")[0][0]
check("cases Chance réparties sur la carte (≈ 1 sur 12)", 60 < nch < 150, nch)
print(f"\n{sum(R)}/{len(R)} OK")
