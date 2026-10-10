"""Local stand-in for Vercel + Supabase: serves public/ and runs the SQL functions on the local Postgres."""
import json, sys, uuid, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
sys.path.insert(0, os.path.dirname(__file__)); import db
ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
LAT = float(os.environ.get("LAT", "0"))
class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}")
        if LAT: import time; time.sleep(LAT)
        try:
            if self.path == "/auth":
                uid = str(uuid.uuid5(uuid.NAMESPACE_URL, body.get("email", "x")))
                db.sql("insert into auth.users(id) values (%s) on conflict do nothing", uid)
                out = {"id": uid}
            elif self.path.startswith("/rpc/"):
                fn = self.path[5:]
                if not fn.replace("_", "").isalnum(): raise ValueError("bad fn")
                uid = self.headers.get("X-User") or None
                out = db.rpc(uid, fn, **body)
            else:
                self.send_error(404); return
            b = json.dumps(out, default=str).encode(); self.send_response(200)
        except Exception as e:
            b = str(e).split("\n")[0].encode(); self.send_response(400)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8780
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
