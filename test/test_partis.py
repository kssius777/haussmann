import sys, uuid, json; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def player(name, party, cash=50_000_000):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=party)
    db.sql("update profiles set cash=%s where id=%s", cash, str(u)); return u
cash = lambda u: db.sql("select cash from profiles where id=%s", str(u))[0][0]
land = lambda u, t: db.sql("select _land(%s, %s, 1, array[%s])::text", str(u), t, t)[0][0]
t, rent = db.sql("select id, rent from cards where lk='l' and lots between 2 and 6 and rent > 1000 and id not in (select card from lots) limit 1")[0]
N, Pg, Rp, Gu, Jm, Dl = player("Neutre", None), player("Poing", "poing"), player("Remp", "rempart"), player("Gauche", "tendue"), player("Milieu", "milieu"), player("Droite", "valeurs")
db.sql("insert into lots(card,k,owner) values (%s,0,%s)", t, str(N))
def toll(payer): c0 = cash(payer); L = json.loads(land(payer, t))["landing"]; return L
L = toll(Gu); check("Gauche : salaire doublé à chaque lancer (40 000 €)", L["salary"] == 40000, L["salary"])
L = toll(Dl); check("loyer de passage normal : une journée de loyer", abs(L["toll"] - rent) <= 1 and L["salary"] == 20000, (L["toll"], rent))
L = toll(Pg); check("Extrême gauche : paie 50 % de loyer en moins", abs(L["toll"] - rent * .5) <= 1 and L["perk"] == "poing", (L["toll"], rent))
db.sql("update lots set owner=%s where card=%s and k=0", str(Rp), t)
L = toll(Dl); check("Extrême droite : encaisse 50 % de plus", abs(L["toll"] - rent * 1.5) <= 1 and L["perk"] == "rempart", (L["toll"], rent))
L = toll(Pg); check("Extrême gauche chez l'extrême droite : les deux s'appliquent (× 0,75)", abs(L["toll"] - rent * .75) <= 1, (L["toll"], rent))
# Droite : apport 5 % et +50 % de capacité d'emprunt
cN = db.sql("select _loan_cap(%s)", str(N))[0][0]; cD = db.sql("select _loan_cap(%s)", str(Dl))[0][0]
check("Droite : +50 % de capacité d'emprunt", abs(cD - cN * 1.5) <= 2, (cN, cD))
g2, v2 = db.sql("select id, v from cards where lk='l' and lots between 2 and 6 and v between 500000 and 3000000 and id not in (select card from lots) limit 1")[0]
db.sql("update profiles set land=%s where id=%s", g2, str(Dl)); c0 = cash(Dl)
db.rpc(Dl, "bank_buy", p_card=g2, p_k=0, p_credit=True)
check("Droite : apport de 5 % seulement", abs((c0 - cash(Dl)) - v2 * .05) <= 1, (c0 - cash(Dl), v2))
# Centriste : pas de commission quand il vend
g3 = db.sql("select id from cards where lk='l' and lots between 2 and 6 and id not in (select card from lots) limit 1")[0][0]
db.sql("insert into lots(card,k,owner) values (%s,0,%s)", g3, str(Jm)); db.rpc(Jm, "list_item", p_card=g3, p_k=0, p_n=1, p_price=1000000)
lid = db.sql("select id from listings where card=%s", g3)[0][0]; c0 = cash(Jm)
db.rpc(N, "buy_listing", p_id=lid); db.rpc(Jm, "state")
check("Centriste : touche 100 % du prix de vente (pas de commission)", cash(Jm) - c0 >= 999000, cash(Jm) - c0)
print(f"\n{sum(R)}/{len(R)} OK")
