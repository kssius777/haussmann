"""La position du joueur et la montgolfière (26/10/2026 : elle vole où l'on veut, migration_vol.sql ; avant : le dé). On n'achète à
la banque que l'immeuble sur lequel on s'est posé (profiles.land) ; la téléportation reste refusée ; les loyers d'absence restent."""
import sys, uuid; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): ok = bool(ok); R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
c0 = db.conn(); cur = c0.cursor()
# Paris et le dé : toutes les migrations depuis migration_monde.sql, dans l'ordre, comme Vercel (avant le 22/10/2026, seulement
# quelques-unes : la base locale gardait d'anciennes versions de _wcell, world_say… et l'e2e ne voyait plus les autres joueurs)
mig = [l.strip() for l in open("supabase/migrations.txt") if l.strip() and not l.startswith("#")]
cur.execute("""create schema if not exists realtime;
  create table if not exists realtime.sent(payload jsonb, event text, topic text, private boolean, at timestamptz default clock_timestamp());
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
  $$ insert into realtime.sent(payload, event, topic, private) values (payload, event, topic, private) $$;""")
for f in mig[mig.index("migration_monde.sql"):]: cur.execute(open("supabase/" + f).read())
c0.commit()
A = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(A))
s = db.rpc(A, "join_game", p_pseudo="Pion" + str(A)[:4], p_party=None)
p = s["profile"]; check("nouveau joueur : 5 km dans la réserve, pas encore dans Paris (pion d'attente : 18 rue de la Bûcherie)", p["pos"] == 400761 and abs(s["km_free"] - 5) < 1e-6, (p["pos"], s["km_free"]))
far = db.sql("select id from cards where lk='l' and id not in (select card from lots) and _dist(400761, id) > 2000 limit 1")[0][0]
db.sql("update profiles set cash = cash + 100000000 where id=%s", str(A))
check("loin d'un immeuble : pas d'achat à la banque", "Posez-vous dessus" in (err(lambda: db.rpc(A, "bank_buy", p_card=far, p_k=None)) or ""))
check("voler avant d'être entré dans Paris : refusé", "Revenez dans Paris" in (err(lambda: db.rpc(A, "fly", p_lon=2.35, p_lat=48.86)) or ""))
check("téléportation retirée : refusée, et plus aucun joueur ne peut l'appeler", "retirée" in (err(lambda: db.rpc(A, "teleport", p_card=far)) or "")
      and not db.sql("select has_function_privilege('authenticated', 'teleport(int)', 'execute') or has_function_privilege('anon', 'teleport(int)', 'execute')")[0][0])
# dans Paris : on vole jusqu'à un immeuble libre et on l'achète là où l'on s'est posé
j = db.rpc(A, "world_join"); x0, y0 = j["pos"]
g = db.sql("select id from cards where lk in ('l','c') and id not in (select card from lots) and _wm(%s, %s, cx / 1e5, cy / 1e5) between 40 and 300 order by id limit 1", x0, y0)[0][0]
r = db.rpc(A, "fly", p_lon=None, p_lat=None, p_card=g)
check("voler jusqu'à un immeuble libre : on s'y pose", r["landing"]["card"] == g and r["landing"]["free"] > 0, r["landing"])
db.rpc(A, "bank_buy", p_card=g, p_k=None)
check("posé dessus : achat à la banque", db.sql("select count(*) from lots where card=%s and owner=%s", g, str(A))[0][0] + db.sql("select coalesce(sum(n),0) from parts where card=%s and owner=%s", g, str(A))[0][0] == 1)
check("go_to (site d'avant le 26/10/2026) : refusé, il faut recharger la page", "rechargez" in (err(lambda: db.rpc(A, "go_to", p_card=far)) or ""))
db.sql("update profiles set rent_at=now()-interval '2 days 4 hours' where id=%s", str(A)); db.rpc(A, "state")
lab = db.sql("select label from ledger where owner=%s and kind='rent_away' order by at desc limit 1", str(A))
check("loyers d'absence : une ligne à part avec la durée", bool(lab) and "2 j 4 h" in lab[0][0], lab)
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
