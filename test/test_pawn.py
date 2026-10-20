"""La position du joueur, depuis que le dé est retiré (20/10/2026 : on se promène dans Paris, migration_monde_paris.sql).
On n'achète à la banque que l'immeuble devant lequel on est (world_arrive pose profiles.land) ; le dé, la téléportation et
l'achat de lancers sont refusés ; les loyers d'absence restent."""
import sys, uuid; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): ok = bool(ok); R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
c0 = db.conn(); cur = c0.cursor()
for f in ["migration_monde.sql", "migration_monde_paris.sql"]: cur.execute(open("supabase/" + f).read())
c0.commit()
A = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(A))
s = db.rpc(A, "join_game", p_pseudo="Pion" + str(A)[:4], p_party=None)
p = s["profile"]; check("nouveau joueur : posé devant Notre-Dame (18 rue de la Bûcherie)", p["pos"] == 400761, p["pos"])
far = db.sql("select id from cards where lk='l' and id not in (select card from lots) and _dist(400761, id) > 2000 limit 1")[0][0]
db.sql("update profiles set cash = cash + 100000000 where id=%s", str(A))
check("loin d'un immeuble : pas d'achat à la banque", "Approchez" in (err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)) or ""))
check("le dé n'existe plus (lancer, aller, acheter des lancers)", all("n'existe plus" in (err(lambda f=f, a=a: db.rpc(A, f, **a)) or "") for f, a in (("roll", {}), ("go_to", {"p_card": far}), ("buy_rolls", {}))))
check("téléportation retirée : refusée, et plus aucun joueur ne peut l'appeler", "retirée" in (err(lambda: db.rpc(A, "teleport", p_card=far)) or "")
      and not db.sql("select has_function_privilege('authenticated', 'teleport(int)', 'execute') or has_function_privilege('anon', 'teleport(int)', 'execute')")[0][0])
# devant un immeuble (dans le monde) : on l'achète
db.rpc(A, "world_join"); fx, fy = map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=%s", far)[0])
db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0, path=null, settled=true where user_id=%s", fx, fy, fx, fy, str(A))
db.rpc(A, "world_arrive", p_card=far); db.rpc(A, "bank_buy", p_card=far, p_k=None)
check("devant l'immeuble : achat à la banque", db.sql("select count(*) from lots where card=%s and owner=%s", far, str(A))[0][0] == 1)
db.sql("update profiles set rent_at=now()-interval '2 days 4 hours' where id=%s", str(A)); db.rpc(A, "state")
lab = db.sql("select label from ledger where owner=%s and kind='rent_away' order by at desc limit 1", str(A))
check("loyers d'absence : une ligne à part avec la durée", bool(lab) and "2 j 4 h" in lab[0][0], lab)
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
