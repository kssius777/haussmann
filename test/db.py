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
def rpc(uid, fn, **args):
    """Calls a public function as user uid, exactly like supabase.rpc() would."""
    c = conn(); cur = c.cursor()
    try:
        if uid:
            import uuid as _u; _u.UUID(str(uid))
            cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(uid),))
        names = ", ".join(f"{k} => %s" for k in args)
        cur.execute(f"select {fn}({names})", list(args.values()))
        r = cur.fetchone()[0]; c.commit(); return r
    except Exception as e:
        c.rollback(); raise
    finally: c.close()
def sql(q, *a):
    c = conn(); cur = c.cursor(); cur.execute(q, a)
    r = cur.fetchall() if cur.description else None; c.commit(); c.close(); return r
