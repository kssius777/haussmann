import sys, uuid; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
A = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(A)); db.rpc(A, "join_game", p_pseudo="Credit" + str(A)[:4], p_party=None)
cash = lambda: db.sql("select cash from profiles where id=%s", str(A))[0][0]
free = lambda lo, hi: db.sql("select id, v from cards where lk='l' and lots between 2 and 6 and v between %s and %s and id not in (select card from lots) limit 1", lo, hi)[0]
g, v = free(2_000_000, 3_000_000)
db.sql("update profiles set cash=1000000, land=%s where id=%s", g, str(A))
check("comptant impossible au-dessus de la trésorerie", "insuffisante" in (err(lambda: db.rpc(A, "bank_buy", p_card=g, p_k=None)) or ""))
db.rpc(A, "bank_buy", p_card=g, p_k=None, p_credit=True)
loan = db.sql("select loan from lots where card=%s and owner=%s", g, str(A))[0][0]
check("achat à crédit : apport de 10 %, la banque prête le reste", abs(cash() - (1000000 - round(v * .1))) <= 1 and abs(loan - (v - round(v * .1))) <= 1, (cash(), loan))
st = db.rpc(A, "state"); check("l'état indique les crédits en cours", st["credits"] == 1 and st["loans"] == loan and st["loan_rate"] > 0, (st["credits"], st["loans"], st["loan_rate"]))
# un jour passe : la moitié du loyer de base rembourse
rent = db.sql("select rent from cards where id=%s", g)[0][0]
db.sql("update profiles set rent_at = now() - interval '1 day' where id=%s", str(A)); c0 = cash()
db.rpc(A, "state"); loan2 = db.sql("select loan from lots where card=%s and owner=%s", g, str(A))[0][0]
check("chaque jour, 70 % du loyer rembourse le crédit", abs((loan - loan2) - rent * .7) <= 2, (loan - loan2, rent * .7))
check("les 30 % restants arrivent dans la trésorerie", rent * .3 * 0.5 <= cash() - c0 <= rent * 2, cash() - c0)
check("impossible de vendre un bien à crédit", "Remboursez" in (err(lambda: db.rpc(A, "list_item", p_card=g, p_k=0, p_n=1, p_price=123)) or ""))
check("impossible d'hypothéquer un bien à crédit", "crédit" in (err(lambda: db.rpc(A, "mortgage", p_card=g, p_k=0)) or ""))
# capacité d'emprunt : 5 M€ + 20 jours de loyers, moins ce qui est déjà emprunté
st = db.rpc(A, "state"); cap = st["loan_cap"]
check("l'état indique la capacité d'emprunt restante", 2_000_000 < cap < 5_500_000, cap)
gb2 = db.sql("select id from cards where lk='l' and lots between 8 and 30 and v*lots > 9000000 and id not in (select card from lots) limit 1")[0][0]
db.sql("update profiles set land=%s, cash=5000000 where id=%s", gb2, str(A))
check("la banque refuse au-delà de la capacité d'emprunt", "Capacité d'emprunt" in (err(lambda: db.rpc(A, "buy_building", p_card=gb2, p_credit=True)) or ""))
# remboursement anticipé
db.sql("update profiles set cash=cash+5000000 where id=%s", str(A)); c0 = cash()
db.rpc(A, "repay", p_card=g)
check("remboursement anticipé : le crédit disparaît", db.sql("select loan from lots where card=%s and owner=%s", g, str(A))[0][0] is None and abs((c0 - cash()) - loan2) <= rent, c0 - cash())
g3, v3 = free(200_000, 400_000); db.sql("update profiles set land=%s where id=%s", g3, str(A))
db.rpc(A, "bank_buy", p_card=g3, p_k=None, p_credit=True); check("après remboursement, la capacité d'emprunt remonte", db.rpc(A, "state")["loan_cap"] > cap - v3)
# immeuble entier à crédit
gb = db.sql("select id, v*lots from cards where lk='l' and lots between 3 and 5 and v*lots < 4000000 and id not in (select card from lots) limit 1")[0]
B = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(B)); db.rpc(B, "join_game", p_pseudo="Bati" + str(B)[:4], p_party=None)
db.sql("update profiles set cash=2000000, land=%s where id=%s", gb[0], str(B)); db.rpc(B, "buy_building", p_card=gb[0], p_credit=True)
tl = db.sql("select sum(loan), count(*) from lots where card=%s and owner=%s", gb[0], str(B))[0]
check("immeuble entier à crédit : crédit réparti sur les logements", abs(tl[0] - (gb[1] - round(gb[1] * .1))) <= 2, tl)
# acheter au Marché à crédit : apport 10 %, la banque prête le reste
S = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(S)); db.rpc(S, "join_game", p_pseudo="Vend" + str(S)[:4], p_party=None)
gs = db.sql("select id, v from cards where lk='l' and lots between 2 and 6 and id not in (select card from lots) limit 1")[0]
db.sql("update profiles set cash=10000000, land=%s where id=%s", gs[0], str(S)); db.rpc(S, "bank_buy", p_card=gs[0], p_k=0)
price = 1500000; db.rpc(S, "list_item", p_card=gs[0], p_k=0, p_n=1, p_price=price)
lid = db.sql("select id from listings where card=%s", gs[0])[0][0]
C = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(C)); db.rpc(C, "join_game", p_pseudo="Ache" + str(C)[:4], p_party=None)
db.sql("update profiles set cash=200000 where id=%s", str(C))
check("au Marché, comptant refusé sans assez d'argent", "insuffisante" in (err(lambda: db.rpc(C, "buy_listing", p_id=lid)) or ""))
db.rpc(C, "buy_listing", p_id=lid, p_credit=True)
own = db.sql("select owner, loan from lots where card=%s and k=0", gs[0])[0]
c2 = db.sql("select cash from profiles where id=%s", str(C))[0][0]
check("au Marché à crédit : le bien change de main avec un crédit de 90 %", str(own[0]) == str(C) and abs(own[1] - (price - round(price * .1))) <= 1, own)
check("au Marché à crédit : seul l'apport de 10 % est payé", abs(c2 - (200000 - round(price * .1))) <= 2000, c2)
check("le vendeur est payé (prix − 5 %)", db.sql("select coalesce(sum(amount),0) from pay where owner=%s and why='vente'", str(S))[0][0] >= price * .95 - 1)
print(f"\n{sum(R)}/{len(R)} OK")
