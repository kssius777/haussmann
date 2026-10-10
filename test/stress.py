import sys, uuid, threading, time; sys.path.insert(0,'test'); import db
us=[uuid.uuid4() for _ in range(12)]
for i,u in enumerate(us):
    db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u,"join_game",p_pseudo=f"Stress{i}{str(u)[:4]}",p_party=["poing","tendue","milieu","valeurs","rempart"][i%5])
    db.sql("update profiles set welcome=30, cash=50000000 where id=%s", str(u))
errs=[]; n=[0]
def run(u):
    for _ in range(15):
        for t in range(3):
            try: db.rpc(u,"open_booster",p_kind="welcome"); n[0]+=1; break
            except Exception as e:
                if 'deadlock' in str(e) or 'could not serialize' in str(e): continue
                errs.append(str(e).split('\n')[0]); break
        try: db.rpc(u,"state")
        except Exception as e: errs.append(str(e).split('\n')[0])
t=time.time(); th=[threading.Thread(target=run,args=(u,)) for u in us]; [x.start() for x in th]; [x.join() for x in th]
print("boosters", n[0], "in", round(time.time()-t,1), "s; errors", len(errs), errs[:3])
print("dups", db.sql("select count(*) from (select card,k from lots group by 1,2 having count(*)>1) x"))
print("arr_value consistent", db.sql("""select count(*) from arr_value a full join (select c.arr, l.owner, sum(c.v) v from (select card, owner from lots union all select card, owner from parts) l join cards c on c.id=l.card group by 1,2) x using (arr, owner) where a.v is null""") )
