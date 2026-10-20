"""Les migrations passent comme sur la vraie base. Vercel les envoie par l'API de Supabase (rôle service_role) :
DELETE / UPDATE sans WHERE y sont refusés (pg-safeupdate, test/safeupdate.c) et chacune a 8 s.
On rebâtit une base comme la vraie : le schéma du 16/10/2026 (dernier collé à la main), les données, puis chaque
migration de migrations.txt dans l'ordre, par _run_migration ; puis toutes une 2e fois (« rejouable sans risque »)."""
import sys, os, re, time, subprocess
sys.path.insert(0, 'test'); import db
import psycopg2
R = []
def check(name, ok, info=""):
    R.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  · {info}" if info != "" else ""), flush=True)

names = [l.strip() for l in open("supabase/migrations.txt") if l.strip() and not l.startswith("#")]
check("migrations.txt : tous les fichiers existent", all(os.path.exists("supabase/" + n) for n in names),
      [n for n in names if not os.path.exists("supabase/" + n)])
auto = names[names.index("migration_ping.sql"):]   # appliquées par Vercel (celles d'avant ont été collées à la main)

# 1. lecture : un DELETE / UPDATE sans WHERE (« on conflict … do update », « for update », triggers à part)
bad = []
for n in auto:
    s = re.sub(r"--[^\n]*", "", open("supabase/" + n, encoding="utf8").read())
    for m in re.finditer(r"(?is)\b(delete\s+from|update)\s+([a-z_\.]+)\b(.*?);", s):
        if re.search(r"(?i)\bwhere\b", m.group(0)): continue
        if m.group(1).lower() == "update" and (m.group(2).lower() in ("set", "on", "of", "skip", "nowait", "cascade", "restrict", "no")
                                               or re.search(r"(?i)\b(for|do|key|or)\s*$", s[:m.start()])): continue
        bad.append(f"{n}:{s[:m.start()].count(chr(10)) + 1} {' '.join(m.group(0).split())[:60]}")
check("aucun DELETE / UPDATE sans WHERE (Supabase les refuse)", not bad, bad[:3])

# 2. une base comme la vraie, et toutes les migrations par l'API
BASE = "6f356bd"   # 16/10/2026 : installation des migrations automatiques
try: schema0 = subprocess.run(["git", "show", BASE + ":supabase/schema.sql"], capture_output=True, text=True, check=True).stdout; \
     boot = subprocess.run(["git", "show", BASE + ":supabase/bootstrap_auto_migrations.sql"], capture_output=True, text=True, check=True).stdout
except Exception: schema0 = None
if schema0 is None: print("SKIP rejouer les migrations : historique git introuvable")
else:
    os.environ["PGPASSWORD"] = "pg"
    def psql(dbname, sql):
        r = subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", dbname, "-v", "ON_ERROR_STOP=1", "-q"], input=sql, capture_output=True, text=True)
        if r.returncode: raise RuntimeError(r.stderr[-400:])
    psql("postgres", "drop database if exists hm_migr with (force); create database hm_migr;")
    dsn0 = db.DSN; db.DSN = dsn0.replace("dbname=hm", "dbname=hm_migr")
    try:
        psql("hm_migr", open("test/prelude.sql").read() + schema0)
        db.seed(); db.seed_graph()
        psql("hm_migr", """create schema realtime;
          create table realtime.messages (topic text not null, extension text not null default 'broadcast', payload jsonb, event text,
            private boolean default false, inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid());
          alter table realtime.messages enable row level security;
          create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
          create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
            $$ insert into realtime.messages(payload, event, topic, private) values (payload, event, topic, private) $$;""" + boot)
        c = psycopg2.connect(db.DSN); c.autocommit = True; cur = c.cursor()
        safe = db.safeupdate(cur)
        cur.execute("set statement_timeout = '8s'")   # comme service_role chez Supabase
        def run(n):
            t = time.time(); cur.execute("select _run_migration(%s, %s)", (n, open("supabase/" + n, encoding="utf8").read()))
            return cur.fetchone()[0], time.time() - t
        fails, slow = [], []
        for n in names:
            try:
                r, dt = run(n)
                if dt > 2: slow.append(f"{n} {dt:.1f} s")
            except Exception as e: fails.append(f"{n} : {str(e).splitlines()[0][:160]}"); break
        check(f"toutes les migrations passent par l'API{'' if safe else ' (sans safeupdate)'}", not fails, fails)
        check("chacune bien en dessous de 8 s", not slow, slow)
        if not fails:
            again = []
            for n in auto:   # une 2e fois, dans l'ordre : « rejouable sans risque »
                cur.execute("delete from _migrations where name = %s", (n,))
                try: run(n)
                except Exception as e: again.append(f"{n} : {str(e).splitlines()[0][:160]}"); break
            check("chacune se rejoue sans risque", not again, again)
        c.close()
    finally:
        db.DSN = dsn0
        psql("postgres", "drop database if exists hm_migr with (force);")
print(f"\n{sum(R)}/{len(R)} tests OK"); sys.exit(0 if all(R) else 1)
