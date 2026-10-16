import sys, uuid; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
def player(name, cash=20_000_000):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=None)
    db.sql("update profiles set cash=%s where id=%s", cash, str(u)); return u
cash = lambda u: db.sql("select cash from profiles where id=%s", str(u))[0][0]
owner = lambda g, k: str(db.sql("select owner from lots where card=%s and k=%s", g, k)[0][0])
S, B = player("Vend"), player("Ache")
g, v = db.sql("select id, v from cards where lk='l' and lots between 3 and 8 and v < 3000000 and id not in (select card from lots) limit 1")[0]
for k in range(3): db.sql("insert into lots(card,k,owner) values (%s,%s,%s)", g, k, str(S))
low = int(v * 0.7)
check("offre trop basse refusée (< 80 % de la valeur)", "trop basse" in (err(lambda: db.rpc(B, "make_offer", p_card=g, p_k=0, p_price=low)) or ""))
c0 = cash(B); p = int(v * 0.9)
r = db.rpc(B, "make_offer", p_card=g, p_k=0, p_price=p)
check("offre envoyée : l'argent de l'acheteur est bloqué", cash(B) == c0 - p and len(r["sent"]) == 1, (c0 - cash(B), p))
check("le vendeur voit l'offre reçue", any(o["card"] == g and o["status"] == "open" for o in db.rpc(S, "my_offers")["received"]))
check("pas deux offres sur le même logement", "déjà une offre" in (err(lambda: db.rpc(B, "make_offer", p_card=g, p_k=0, p_price=p)) or ""))
oid = r["sent"][0]["id"]
db.rpc(S, "respond_offer", p_id=oid, p_action="refuse")
check("refus : l'argent est rendu", cash(B) == c0)
check("après un refus, pas de nouvelle offre avant 24 h", "24 h" in (err(lambda: db.rpc(B, "make_offer", p_card=g, p_k=0, p_price=p)) or ""))
# offre acceptée
s0, c0 = cash(S), cash(B)
oid = db.rpc(B, "make_offer", p_card=g, p_k=1, p_price=p)["sent"][0]["id"]
db.rpc(S, "respond_offer", p_id=oid, p_action="accept"); db.rpc(S, "state")
check("acceptée : le logement change de main", owner(g, 1) == str(B))
check("acceptée : l'acheteur a payé le prix", cash(B) == c0 - p, c0 - cash(B))
check("acceptée : le vendeur touche le prix − 5 %", abs((cash(S) - s0) - int(p * .95)) < 3000, cash(S) - s0)
# contre-proposition puis acceptation par l'acheteur, à crédit
c0 = cash(B); pc = int(v * 0.85)
oid = db.rpc(B, "make_offer", p_card=g, p_k=2, p_price=pc, p_credit=True)["sent"][0]["id"]
check("offre à crédit : seuls 10 % sont bloqués", cash(B) == c0 - -(-pc // 10), c0 - cash(B))
check("contre-proposition plus basse refusée", "plus haute" in (err(lambda: db.rpc(S, "respond_offer", p_id=oid, p_action="counter", p_price=pc - 1000)) or ""))
db.rpc(S, "respond_offer", p_id=oid, p_action="counter", p_price=int(v * 1.2))
check("une seule contre-proposition", "plus de réponse" in (err(lambda: db.rpc(S, "respond_offer", p_id=oid, p_action="counter", p_price=int(v * 1.3))) or ""))
db.rpc(B, "answer_counter", p_id=oid, p_accept=True)
loan = db.sql("select loan from lots where card=%s and k=2", g)[0][0]
final = int(v * 1.2)
check("contre-offre acceptée à crédit : la banque prête 90 %", owner(g, 2) == str(B) and abs(loan - (final - -(-final // 10))) <= 1, loan)
check("…et l'acheteur n'a payé que l'apport", abs((c0 - cash(B)) - (-(-final // 10))) <= 1, c0 - cash(B))
# limite de 3 offres, expiration, option « pas d'offres »
g2 = db.sql("select id from cards where lk='l' and lots >= 5 and v < 2000000 and id not in (select card from lots) limit 1")[0][0]
v2 = db.sql("select v from cards where id=%s", g2)[0][0]
for k in range(5): db.sql("insert into lots(card,k,owner) values (%s,%s,%s)", g2, k, str(S))
for k in range(3): db.rpc(B, "make_offer", p_card=g2, p_k=k, p_price=v2)
check("3 offres en cours au maximum", "3 offres" in (err(lambda: db.rpc(B, "make_offer", p_card=g2, p_k=3, p_price=v2)) or ""))
c0 = cash(B); db.sql("update offers set expires_at = now() - interval '1 minute' where buyer=%s and status='open'", str(B)); db.rpc(B, "my_offers")
check("après 24 h, les offres expirent et l'argent revient", cash(B) == c0 + 3 * v2, cash(B) - c0)
db.rpc(S, "set_no_offers", p_on=True)
check("« ne pas recevoir d'offres » est respecté", "ne reçoit pas" in (err(lambda: db.rpc(B, "make_offer", p_card=g2, p_k=4, p_price=v2)) or ""))
print(f"\n{sum(R)}/{len(R)} OK")
