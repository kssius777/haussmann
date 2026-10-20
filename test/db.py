import json, psycopg2, psycopg2.extras, uuid
DSN = "host=localhost user=postgres password=pg dbname=hm"
def conn():
    c = psycopg2.connect(DSN); c.autocommit = False; return c
def seed():
    rows = json.load(open('public/data/cards.json'))
    c = conn(); cur = c.cursor()
    cur.execute("select count(*) from cards"); 
    if cur.fetchone()[0] == len(rows): return
    psycopg2.extras.execute_values(cur, "insert into cards(id,arr,r,lk,lots,et,v,rent,pk,title) values %s on conflict do nothing",
        [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], bool(r[8]), r[9]) for r in rows], page_size=5000)
    c.commit()
def seed_graph():
    rows = json.load(open('public/data/cards.json')); c = conn(); cur = c.cursor()
    cur.execute("select count(*) from cards where cx is not null")
    if cur.fetchone()[0] < len(rows):
        psycopg2.extras.execute_values(cur, "update cards set cx=v.x, cy=v.y from (values %s) v(id,x,y) where cards.id=v.id", [(r[0], r[10], r[11]) for r in rows], page_size=10000)
    cur.execute("select count(*) from edges")
    if cur.fetchone()[0] == 0:
        e = json.load(open('public/data/edges.json'))
        psycopg2.extras.execute_values(cur, "insert into edges(a,b) values %s on conflict do nothing", [(a, b) for a, b in e] + [(b, a) for a, b in e], page_size=20000)
    c.commit()
def rpc(uid, fn, **args):
    """Calls a public function as user uid, exactly like supabase.rpc() would."""
    c = conn(); cur = c.cursor()
    try:
        if uid:
            import uuid as _u; _u.UUID(str(uid))
            cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(uid),))
        names = ", ".join(f"{k} => %s" for k in args)
        cur.execute(f"select {fn}({names})", [psycopg2.extras.Json(v) if isinstance(v, dict) else v for v in args.values()])   # un objet JSON (jsonb), comme supabase-js
        r = cur.fetchone()[0]; c.commit(); return r
    except Exception as e:
        c.rollback(); raise
    finally: c.close()
def sql(q, *a):
    c = conn(); cur = c.cursor(); cur.execute(q, a)
    r = cur.fetchall() if cur.description else None; c.commit(); c.close(); return r
