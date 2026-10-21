"""La position du joueur et le dé (21/10/2026 : le dé revient dans Paris, migration_de.sql). On n'achète à la banque que
l'immeuble sur lequel le dé l'a fait tomber (profiles.land) ; la téléportation reste refusée ; les loyers d'absence restent."""
import sys, uuid; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): ok = bool(ok); R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
c0 = db.conn(); cur = c0.cursor()
for f in ["migration_monde.sql", "migration_monde_paris.sql", "migration_depart.sql", "migration_de.sql"]: cur.execute(open("supabase/" + f).read())
c0.commit()
A = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(A))
s = db.rpc(A, "join_game", p_pseudo="Pion" + str(A)[:4], p_party=None)
p = s["profile"]; check("nouveau joueur : 10 lancers, pas encore dans Paris (pion d'attente : 18 rue de la Bûcherie)", p["pos"] == 400761 and p["rolls"] == 10, (p["pos"], p["rolls"]))
far = db.sql("select id from cards where lk='l' and id not in (select card from lots) and _dist(400761, id) > 2000 limit 1")[0][0]
db.sql("update profiles set cash = cash + 100000000 where id=%s", str(A))
check("loin d'un immeuble : pas d'achat à la banque", "Tombez dessus avec le dé" in (err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)) or ""))
check("lancer le dé avant d'être entré dans Paris : refusé", "Revenez dans Paris" in (err(lambda: db.rpc(A, "roll")) or ""))
check("téléportation retirée : refusée, et plus aucun joueur ne peut l'appeler", "retirée" in (err(lambda: db.rpc(A, "teleport", p_card=far)) or "")
      and not db.sql("select has_function_privilege('authenticated', 'teleport(int)', 'execute') or has_function_privilege('anon', 'teleport(int)', 'execute')")[0][0])
# dans Paris : le dé, puis on achète là où l'on tombe
db.rpc(A, "world_join")
r = db.rpc(A, "roll"); free = [o for o in r["options"] if o["free"] > 0 and not o["owners"]]
check("le dé propose des destinations, dont des immeubles libres", len(r["options"]) >= 3 and free, [(o["card"], o["free"]) for o in r["options"]])
g = free[0]["card"]; db.rpc(A, "dice_go", p_card=g)
db.rpc(A, "bank_buy", p_card=g, p_k=None)
check("tombé dessus : achat à la banque", db.sql("select count(*) from lots where card=%s and owner=%s", g, str(A))[0][0] + db.sql("select coalesce(sum(n),0) from parts where card=%s and owner=%s", g, str(A))[0][0] == 1)
check("go_to (ancien site) : sans lancer, refusé", "Lancez d'abord" in (err(lambda: db.rpc(A, "go_to", p_card=far)) or ""))
db.sql("update profiles set rent_at=now()-interval '2 days 4 hours' where id=%s", str(A)); db.rpc(A, "state")
lab = db.sql("select label from ledger where owner=%s and kind='rent_away' order by at desc limit 1", str(A))
check("loyers d'absence : une ligne à part avec la durée", bool(lab) and "2 j 4 h" in lab[0][0], lab)
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
