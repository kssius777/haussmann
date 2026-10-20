#!/bin/sh
# démarre Postgres et le serveur local s'ils sont arrêtés
pg_isready -h localhost -q || { service postgresql start >/dev/null 2>&1; sleep 2; }
# comme Supabase : DELETE / UPDATE sans WHERE refusés dans les requêtes du site (test/safeupdate.c, chargé par db.rpc)
lib="$(pg_config --pkglibdir)/hm_safeupdate.so"
if [ ! -f "$lib" ]; then
  inc="$(pg_config --includedir-server)"
  [ -f "$inc/postgres.h" ] || { v=$(pg_config --version | sed 's/[^0-9]*\([0-9]*\).*/\1/')
    { apt-get install -y -q "postgresql-server-dev-$v" || { apt-get update -q && apt-get install -y -q "postgresql-server-dev-$v"; }; } >/dev/null 2>&1; }
  gcc -O2 -fPIC -shared -I"$inc" -o "$lib" "$(dirname "$0")/safeupdate.c" 2>/dev/null || echo "test/up.sh : safeupdate non construit (DELETE / UPDATE sans WHERE non vérifiés)"
fi
curl -s -o /dev/null localhost:8780 || { cd "$(dirname "$0")/.." && setsid nohup python3 test/server.py 8780 > /tmp/hm_server.log 2>&1 & sleep 1.5; }
