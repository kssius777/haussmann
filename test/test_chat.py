"""Le chat du Champ-de-Mars (migration_chat.sql) : salles, marche, messages signés par le serveur, bannissement, personnage."""
import sys, uuid, json; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
def player(name, party=None):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=party); return u
c0 = db.conn(); cur = c0.cursor()
# un faux « temps réel » local : il note ce que le serveur enverrait (en ligne, c'est la vraie fonction de Supabase)
cur.execute("""create schema if not exists realtime;
  create table if not exists realtime.sent(payload jsonb, event text, topic text, private boolean, at timestamptz default clock_timestamp());
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
  $$ insert into realtime.sent(payload, event, topic, private) values (payload, event, topic, private) $$;
  truncate realtime.sent;""")
for f in ["migration_admin.sql", "migration_chat.sql", "migration_chat.sql"]: cur.execute(open("supabase/" + f).read())   # 2 fois : rejouable
c0.commit()
db.sql("truncate place_people, chat_msg, chat_bans")
ADM, A, B = player("Adm", "milieu"), player("Ana", "tendue"), player("Ben", "rempart")
db.sql("insert into admins(id) values (%s) on conflict do nothing", str(ADM))

check("sans connexion : refusé", "Connexion" in (err(lambda: db.rpc(None, "chat_join", p_lon=2.298, p_lat=48.855)) or ""))
j = db.rpc(A, "chat_join", p_lon=2.2985, p_lat=48.8556)
check("entrer : salle 1, on se voit soi-même avec son pseudo et son parti", j["room"] == 1 and any(p["id"] == str(A) and p["pseudo"].startswith("Ana") and p["party"] == "tendue" for p in j["people"]), j["room"])
sent = db.sql("select event, topic, private, payload->>'k' from realtime.sent order by at")
check("l'arrivée part en temps réel sur le canal privé de la salle", sent and sent[-1] == ("ev", "place:cdm:1", True, "join"), sent[-1:] if sent else sent)
j2 = db.rpc(B, "chat_join", p_lon=9.0, p_lat=40.0)
me_b = [p for p in j2["people"] if p["id"] == str(B)][0]
check("une position hors du Champ-de-Mars est ramenée dessus", 2.2920 <= me_b["lon"] <= 2.3050 and 48.85 <= me_b["lat"] <= 48.86, (me_b["lon"], me_b["lat"]))
check("deux joueurs dans la même salle", j2["room"] == 1 and len(db.rpc(A, "chat_people")) == 2)
db.rpc(A, "chat_move", p_lon=2.2990, p_lat=48.8560)
check("marcher : la nouvelle position est enregistrée et envoyée", db.sql("select lon, lat from place_people where user_id=%s", str(A))[0] == (2.2990, 48.8560)
      and db.sql("select payload->>'k', payload->'d'->>'lon' from realtime.sent order by at desc limit 1")[0] == ("move", "2.299"))
db.rpc(A, "chat_say", p_text="   Salut   tout\n le monde   ")
last = db.sql("select payload from realtime.sent order by at desc limit 1")[0][0]
check("parler : message nettoyé et signé par le serveur (on ne peut pas parler pour un autre)", last["k"] == "say" and last["d"]["t"] == "Salut tout le monde" and last["u"] == str(A), last)
check("un message par seconde au plus", "Doucement" in (err(lambda: db.rpc(A, "chat_say", p_text="encore")) or ""))
db.sql("update place_people set said_at = now() - interval '2 seconds' where user_id=%s", str(A))
db.rpc(A, "chat_say", p_text="x" * 300)
check("un message fait 120 caractères au plus", len(db.sql("select payload->'d'->>'t' from realtime.sent order by at desc limit 1")[0][0]) == 120)
feed = db.rpc(B, "chat_feed", p_since=j2["last"])
check("sans temps réel, chat_feed rend les évènements depuis le dernier vu", [e["k"] for e in feed["ev"]] == ["move", "say", "say"] and feed["ev"][1]["u"] == str(A), [e["k"] for e in feed["ev"]])
check("pastille : nombre de joueurs sur le Champ-de-Mars", db.rpc(A, "chat_count") == 2)
# le personnage
lk = db.rpc(A, "set_look", p_look=json.dumps({"s": 3, "h": 1, "c": 2, "t": -1}))
check("personnage : enregistré et visible dans le profil", lk == {"s": 3, "h": 1, "c": 2, "t": -1} and db.rpc(A, "state")["profile"]["look"] == lk)
check("personnage : changement envoyé aux autres", db.sql("select payload->>'k' from realtime.sent order by at desc limit 1")[0][0] == "look")
check("personnage : un choix inconnu est refusé", "inconnu" in (err(lambda: db.rpc(A, "set_look", p_look=json.dumps({"s": 9, "h": 1, "c": 0, "t": 0}))) or ""))
# bannir
check("un joueur ne peut pas bannir", "administrateur" in (err(lambda: db.rpc(A, "chat_ban", p_user=str(B), p_hours=24)) or ""))
ADM2 = player("Adm2"); db.sql("insert into admins(id) values (%s) on conflict do nothing", str(ADM2))
check("on ne bannit pas un admin, ni soi-même", "On ne bannit pas un admin" in (err(lambda: db.rpc(ADM, "chat_ban", p_user=str(ADM2), p_hours=24)) or "")
      and "vous-même" in (err(lambda: db.rpc(ADM, "chat_ban", p_user=str(ADM), p_hours=24)) or ""))
db.sql("delete from admins where id=%s", str(ADM2))
bans = db.rpc(ADM, "chat_ban", p_user=str(B), p_hours=24)
check("l'admin bannit 24 h : la personne quitte la pelouse, les autres sont prévenus", any(b["id"] == str(B) for b in bans)
      and not db.sql("select 1 from place_people where user_id=%s", str(B)) and db.sql("select payload->>'k', payload->>'u' from realtime.sent order by at desc limit 1")[0] == ("kick", str(B)))
e = err(lambda: db.rpc(B, "chat_join", p_lon=2.298, p_lat=48.855)) or ""
check("banni 24 h : ne peut plus entrer, on lui dit jusqu'à quand", "banni du chat jusqu'au" in e, e)
check("banni : ne peut plus parler", "banni" in (err(lambda: db.rpc(B, "chat_say", p_text="coucou")) or ""))
db.rpc(ADM, "chat_unban", p_user=str(B))
check("débanni : peut revenir", db.rpc(B, "chat_join", p_lon=2.298, p_lat=48.855)["room"] == 1)
db.rpc(ADM, "chat_ban", p_user=str(B), p_hours=None)
e = err(lambda: db.rpc(B, "chat_join", p_lon=2.298, p_lat=48.855)) or ""
check("banni à vie", e == "Vous êtes banni du chat.", e)
check("la liste des bannis est réservée à l'admin", "administrateur" in (err(lambda: db.rpc(A, "chat_bans")) or "") and db.rpc(ADM, "chat_bans")[0]["until"] is None)
# salles de 40, et ceux qui sont partis sans dire au revoir
db.sql("truncate place_people")
fake = [player("P%02d" % i) for i in range(40)]
for i, u in enumerate(fake): db.sql("insert into place_people(user_id, room, lon, lat) values (%s, 1, 2.298, 48.855)", str(u))
check("salle pleine (40) : on ouvre le Champ-de-Mars 2", db.rpc(A, "chat_join", p_lon=2.298, p_lat=48.855)["room"] == 2)
db.sql("update place_people set seen = now() - interval '2 minutes' where room = 1")
db.rpc(A, "chat_leave"); r = db.rpc(A, "chat_join", p_lon=2.298, p_lat=48.855)
check("partis depuis plus de 90 s : retirés, on retrouve la salle 1", r["room"] == 1 and db.sql("select count(*) from place_people")[0][0] == 1, r["room"])
db.rpc(A, "chat_leave")
check("quitter : on n'est plus sur la pelouse, les autres sont prévenus", not db.sql("select 1 from place_people where user_id=%s", str(A))
      and db.sql("select payload->>'k' from realtime.sent order by at desc limit 1")[0][0] == "leave")
check("après être parti : marcher ou parler demande de revenir", "Revenez" in (err(lambda: db.rpc(A, "chat_move", p_lon=2.298, p_lat=48.855)) or "") and db.rpc(A, "chat_feed", p_since=0)["gone"] is True)
check("les messages ne sont gardés que 2 minutes", db.sql("select count(*) from chat_msg where at < now() - interval '2 minutes'")[0][0] == 0)
check("fonctions internes interdites aux joueurs", not any(db.sql("select has_function_privilege('authenticated', %s, 'execute')", f)[0][0]
      for f in ["_chat_emit(int,uuid,text,jsonb)", "_chat_person(uuid)", "_chat_ban_until(uuid)"]))
check("rien n'est ouvert aux visiteurs non connectés", not any(db.sql("select has_function_privilege('anon', %s, 'execute')", f)[0][0]
      for f in ["chat_join(float8,float8)", "chat_say(text)", "chat_count()", "set_look(jsonb)", "chat_ban(uuid,int)"]))
# nettoyage : on enlève le faux temps réel et les joueurs de test
cur = c0.cursor(); cur.execute("drop schema realtime cascade"); c0.commit()
db.sql("truncate place_people, chat_msg, chat_bans")
print(f"\n{sum(R)}/{len(R)} OK")
