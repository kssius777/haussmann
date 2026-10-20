"""Le monde ouvert, essai dans le 7e (migration_monde.sql) : entrer, marcher (km du jour, au-delà on paie), trajet écourté,
s'arrêter devant un immeuble pour l'acheter, le métro, la zone."""
import sys, uuid, json; sys.path.insert(0, 'test'); import db
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
for f in ["migration_admin.sql", "migration_chat.sql", "migration_chat_look.sql", "migration_metro.sql", "migration_lieux.sql", "migration_monde.sql", "migration_monde.sql"]:
    cur.execute(open("supabase/" + f).read())   # la dernière 2 fois : rejouable
c0.commit()
db.sql("truncate place_people, chat_msg, chat_bans, walkers")
A, B = player("Ana", "tendue"), player("Ben", "rempart")
cfg = db.sql("select _world_cfg()")[0][0]
W = lambda u: db.sql("select lon, lat, km, dur, len from walkers where user_id=%s", str(u))[0]
cash = lambda u: db.sql("select cash from profiles where id=%s", str(u))[0][0]
done = lambda u: db.sql("update walkers set t0 = now() - interval '1 minute' where user_id=%s", str(u))   # le trajet est fini

check("sans connexion : refusé", "Connexion" in (err(lambda: db.rpc(None, "world_join")) or ""))
j = db.rpc(A, "world_join")
near = lambda a, b, m: (((a[0] - b[0]) * 73240) ** 2 + ((a[1] - b[1]) * 110574) ** 2) ** .5 <= m
check("entrer la première fois : au Champ-de-Mars (un peu au hasard), 5 km offerts, salle 1", j["room"] == 1 and near(j["pos"], cfg["start"], 30) and j["w"]["left"] == cfg["freeKm"] and j["w"]["km"] == 0, (j["pos"], j["w"]))
sent = db.sql("select topic, payload->>'k' from realtime.sent order by at desc limit 1")
check("l'arrivée part en temps réel sur le canal de la salle", sent and sent[0] == ("place:cdm:1", "join"), sent)
g7 = db.sql("select id from cards where arr=7 and lk='l' and lots between 3 and 12 and id not in (select card from lots) order by id limit 1")[0][0]
db.sql("update profiles set pos=%s where id=%s", g7, str(B))
jb = db.rpc(B, "world_join"); gx, gy = map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=%s", g7)[0])
check("la montgolfière déjà dans le 7e : on entre devant son immeuble", abs(jb["pos"][0] - gx) < 1e-6 and abs(jb["pos"][1] - gy) < 1e-6, jb["pos"])

# marcher
x0, y0 = j["pos"]; tx, ty = x0 + 0.004, y0 + 0.002   # ~ 360 m
straight = ((0.004 * 73240) ** 2 + (0.002 * 110574) ** 2) ** .5
path = [[x0, y0], [x0 + 0.004, y0], [tx, ty]]
r = db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=520, p_path=json.dumps(path))
check("marcher : les km du trajet comptent (le trajet par les rues)", abs(r["len"] - 520) < 1e-6 and abs(W(A)[2] - 0.52) < 1e-6 and abs(r["w"]["left"] - (cfg["freeKm"] - 0.52)) < 1e-6, r)
check("marcher : durée à la vitesse du jeu (13 s pour 520 m)", abs(r["dur"] - 520 / cfg["speed"]) < 1e-6, r["dur"])
ev = db.sql("select payload from realtime.sent order by at desc limit 1")[0][0]
check("les autres voient le trajet (par les rues) et la durée", ev["k"] == "move" and ev["d"]["path"] == path and abs(ev["d"]["dur"] - r["dur"]) < 1e-6, ev["d"])
check("la position est notée (pour ceux qui arrivent ensuite)", db.sql("select lon, lat from place_people where user_id=%s", str(A))[0] == (tx, ty))
done(A); km = W(A)[2]
r = db.rpc(A, "world_move", p_lon=x0, p_lat=y0, p_len=10)
check("on ne compte jamais moins que la ligne droite", abs(r["len"] - straight) < 0.01 and abs(W(A)[2] - (km + straight / 1000)) < 1e-6, (r["len"], straight))
check("hors de la zone : refusé", "plus loin" in (err(lambda: db.rpc(A, "world_move", p_lon=2.35, p_lat=48.86, p_len=100)) or ""))
# trajet écourté : on rend ce qui n'a pas été marché
done(A); db.sql("update walkers set km = 1 where user_id=%s", str(A))
db.rpc(A, "world_move", p_lon=x0 + 0.01, p_lat=y0, p_len=1200)   # 1,2 km, 30 s
r = db.rpc(A, "world_move", p_lon=x0, p_lat=y0, p_len=1)          # aussitôt : demi-tour
check("demi-tour aussitôt : les km pas marchés sont rendus", W(A)[2] < 1.02, W(A)[2])
# au-delà des km offerts : on paie, seulement si on l'accepte
done(A); db.sql("update walkers set km = %s where user_id=%s", cfg["freeKm"] - 0.1, str(A))
e = err(lambda: db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=400))
check("plus de km offerts : le serveur demande d'abord (prix des 300 m en trop)", e and "PAYER:3000" in e, e)
c1 = cash(A); r = db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=400, p_pay=True)
check("on paie les km en trop, une ligne dans « Mon argent »", r["cost"] == 3000 and cash(A) == c1 - 3000
      and db.sql("select kind, amount from ledger where owner=%s order by at desc, id desc limit 1", str(A))[0] == ("walk", -3000), r)
done(A); db.sql("update walkers set km = %s where user_id=%s", cfg["freeKm"], str(A))
c2 = cash(A); r1 = db.rpc(A, "world_move", p_lon=x0, p_lat=y0, p_len=800, p_pay=True)            # 0,8 km payés…
r = db.rpc(A, "world_move", p_lon=tx, p_lat=ty, p_len=10, p_pay=True)                          # …puis demi-tour aussitôt
check("demi-tour sur un trajet payé : l'argent pas marché est rendu", r1["cost"] == 8000 and r["back"] > 7900 and abs(cash(A) - (c2 - 100)) < 60, (r1["cost"], r["back"], c2 - cash(A)))
db.sql("update profiles set cash = 100 where id=%s", str(A)); done(A)
check("pas assez d'argent pour les km : refusé", "Pas assez" in (err(lambda: db.rpc(A, "world_move", p_lon=x0, p_lat=y0, p_len=900, p_pay=True)) or ""))
db.sql("update profiles set cash = 1000000000 where id=%s", str(A))
db.sql("update walkers set day = paris_today() - 1, km = 9 where user_id=%s", str(A))
check("un nouveau jour : 5 km offerts à nouveau", db.rpc(A, "world_join")["w"]["left"] == cfg["freeKm"])

# s'arrêter devant un immeuble et l'acheter
db.sql("update walkers set km = 0, day = paris_today() where user_id=%s", str(A))
db.rpc(A, "world_move", p_lon=gx + 0.0003, p_lat=gy, p_len=300)
check("pas encore arrivé : on ne peut pas s'arrêter", "pas encore" in (err(lambda: db.rpc(A, "world_arrive", p_card=g7)) or ""))
done(A)
far = db.sql("select id from cards where arr=7 and lk='l' and sqrt(power((cx/1e5 - %s) * 73240, 2) + power((cy/1e5 - %s) * 110574, 2)) > 400 limit 1", gx, gy)[0][0]
check("trop loin de l'immeuble : refusé", "Approchez" in (err(lambda: db.rpc(A, "world_arrive", p_card=far)) or ""))
st = db.rpc(A, "world_arrive", p_card=g7)
check("devant l'immeuble : c'est sa case (la montgolfière y est aussi)", st["profile"]["land"] == g7 and st["profile"]["pos"] == g7)
db.rpc(A, "bank_buy", p_card=g7, p_k=None)
check("on l'achète à la banque, comme en tombant dessus avec le dé", db.sql("select count(*) from lots where card=%s and owner=%s", g7, str(A))[0][0] == 1)
db.rpc(A, "world_move", p_lon=x0, p_lat=y0, p_len=600)
db.sql("update profiles set cash = 1000000000 where id=%s", str(A))
land = db.sql("select land from profiles where id=%s", str(A))[0][0]; e = err(lambda: db.rpc(A, "bank_buy", p_card=g7, p_k=None))
check("en repartant, on n'est plus devant : plus d'achat à la banque", land is None and "tomber dessus" in (e or ""), (land, e))

# le métro
done(A)
sx, sy = map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=602931")[0])
db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0 where user_id=%s", sx - 0.0025, sy, sx - 0.0025, sy, str(A))   # à 180 m de la station
check("une station, c'est un point : à 180 m on n'y est pas (un jardin, si)", "Approchez" in (err(lambda: db.rpc(A, "world_arrive", p_card=602931)) or ""))
check("le métro loin d'une station : refusé", "station" in (err(lambda: db.rpc(A, "world_metro", p_to=602930)) or ""))
ex, ey = map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=602931")[0])   # École Militaire (ligne 8)
db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0 where user_id=%s", ex, ey, ex, ey, str(A))
check("une station hors du réseau de l'essai : refusé", "pas encore ouverte" in (err(lambda: db.rpc(A, "world_metro", p_to=1578)) or ""))
c3 = cash(A); r = db.rpc(A, "world_metro", p_to=602930)   # Duroc (lignes 10 et 13) : changement à Invalides
dx, dy = map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=602930")[0])
check("métro : un ticket, changement compris, on arrive à la station (sa case)", r["from"] == 602931 and cash(A) == c3 - cfg["ticket"]
      and abs(W(A)[0] - dx) < 1e-9 and r["state"]["profile"]["land"] == 602930, (r["from"], c3 - cash(A)))
ev = db.sql("select payload from realtime.sent order by at desc limit 1")[0][0]
check("les autres voient qu'on a pris le métro", ev["k"] == "move" and ev["d"].get("metro") is True)
check("le métro coûte un ticket, pas de km", abs(W(A)[2] - db.sql("select km from walkers where user_id=%s", str(A))[0][0]) < 1e-9 and
      db.sql("select kind from ledger where owner=%s order by at desc, id desc limit 1", str(A))[0][0] == "metro")
check("les fonctions internes sont interdites aux joueurs", not any(db.sql("select has_function_privilege('authenticated', %s, 'execute')", f)[0][0] for f in
      ("_world_cfg()", "_wm(float8,float8,float8,float8)", "_wpos(walkers)", "_wcost(float8)", "_wkm(walkers)", "_wout(uuid)")))
check("un visiteur non connecté ne peut rien appeler", not any(db.sql("select has_function_privilege('anon', %s, 'execute')", f)[0][0] for f in
      ("world_join()", "world_move(float8,float8,float8,jsonb,boolean)", "world_arrive(int)", "world_metro(int)")))
print(f"\n{sum(R)}/{len(R)} OK")
sys.exit(0 if all(R) else 1)
