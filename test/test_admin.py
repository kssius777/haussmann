import sys, uuid; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
def player(name):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=None); return u
c0 = db.conn(); c0.cursor().execute(open("supabase/migration_admin.sql").read()); c0.commit()
ADM, A, B = player("Adm"), player("Ana"), player("Ben")
db.sql("insert into admins(id) values (%s) on conflict do nothing", str(ADM))
check("is_admin : vrai pour l'admin, faux pour un joueur", db.rpc(ADM, "is_admin") is True and db.rpc(A, "is_admin") is False)
check("un joueur ne peut pas créer de cadeau", "administrateur" in (err(lambda: db.rpc(A, "admin_gift_create", p_card=None, p_n=1, p_boosters=3)) or ""))
g = db.sql("select id from cards where lk='l' and lots between 3 and 8 and id not in (select card from lots) limit 1")[0][0]
code = db.rpc(ADM, "admin_gift_create", p_card=g, p_n=2, p_boosters=1)["code"]
check("l'admin crée un lien cadeau", len(code) == 10)
info = db.rpc(None, "gift_info", p_code=code)
check("on voit le contenu du cadeau sans être connecté", info["card"] == g and info["n"] == 2 and info["claimed"] is False, info)
check("l'admin ne peut pas récupérer son propre cadeau", "créé ce cadeau" in (err(lambda: db.rpc(ADM, "claim_gift", p_code=code)) or ""))
w0 = db.sql("select welcome from profiles where id=%s", str(A))[0][0]
r = db.rpc(A, "claim_gift", p_code=code)
own = db.sql("select count(*) from lots where card=%s and owner=%s", g, str(A))[0][0]
check("le premier qui ouvre le lien reçoit les logements et les boosters", r["got"] == 2 and own == 2 and db.sql("select welcome from profiles where id=%s", str(A))[0][0] == w0 + 1, (r["got"], own))
check("le deuxième arrive trop tard", "Trop tard" in (err(lambda: db.rpc(B, "claim_gift", p_code=code)) or ""))
check("le gagnant apparaît dans le lien", db.rpc(None, "gift_info", p_code=code)["winner"].startswith("Ana"))
check("lien inconnu refusé", "n'existe pas" in (err(lambda: db.rpc(B, "claim_gift", p_code="xxxxxxxxxx")) or ""))
code2 = db.rpc(ADM, "admin_gift_create", p_card=None, p_n=1, p_boosters=3)["code"]
db.rpc(ADM, "admin_gift_cancel", p_code=code2)
check("l'admin peut annuler un lien pas encore pris", "n'existe pas" in (err(lambda: db.rpc(B, "claim_gift", p_code=code2)) or ""))
check("la liste des cadeaux de l'admin indique le gagnant", any(x["code"] == code and x["winner"] for x in db.rpc(ADM, "admin_gifts")))
full = db.sql("select id, lots from cards where lk='l' and lots between 2 and 4 and id not in (select card from lots) limit 1")[0]
check("impossible d'offrir plus de logements que de libres", "Pas assez" in (err(lambda: db.rpc(ADM, "admin_gift_create", p_card=full[0], p_n=full[1] + 1, p_boosters=0)) or ""))
c0.cursor().execute(open("supabase/migration_stats.sql").read()); c0.commit()
check("tableau de bord : réservé à l'admin", "administrateur" in (err(lambda: db.rpc(A, "admin_stats")) or ""))
b0 = db.rpc(ADM, "admin_stats")["boosters_today"]
db.rpc(B, "open_booster", p_kind="welcome")
st = db.rpc(ADM, "admin_stats")
check("tableau de bord : joueurs, inscrits du jour, boosters ouverts comptés", st["players"] >= 3 and st["new_today"] >= 3 and st["boosters_today"] == b0 + 1 and len(st["by_day"]) == 14 and len(st["top"]) >= 1, {k: st[k] for k in ("players", "new_today", "boosters_today", "active_today")})
check("tableau de bord : le joueur qui agit compte comme actif", db.sql("select seen_at is not null from profiles where id=%s", str(B))[0][0])
print(f"\n{sum(R)}/{len(R)} OK")
