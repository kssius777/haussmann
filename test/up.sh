#!/bin/sh
# démarre Postgres et le serveur local s'ils sont arrêtés
pg_isready -h localhost -q || { service postgresql start >/dev/null 2>&1; sleep 2; }
curl -s -o /dev/null localhost:8780 || { cd "$(dirname "$0")/.." && setsid nohup python3 test/server.py 8780 > /tmp/hm_server.log 2>&1 & sleep 1.5; }
