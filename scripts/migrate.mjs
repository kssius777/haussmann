// Lancé par Vercel à chaque déploiement : applique les migrations SQL pas encore passées.
// Si une migration échoue, le déploiement est annulé (le site reste sur l'ancienne version).
import { readFileSync } from "node:fs";
const URL_ = "https://fmqixxakhphkijtsyeqd.supabase.co";
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!key) { console.log("migrate : pas de clé SUPABASE_SERVICE_ROLE_KEY au build, migrations ignorées"); process.exit(0); }
const H = { apikey: key, "Content-Type": "application/json" }; if (key.startsWith("eyJ")) H.Authorization = "Bearer " + key;
const rpc = async (fn, body) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body || {}) });
  const t = await r.text(); if (!r.ok) { const e = new Error(t); e.status = r.status; throw e; } return t ? JSON.parse(t) : null;
};
let done;
try { done = new Set(await rpc("_applied_migrations")); }
catch (e) { console.log("migrate : migrations automatiques pas encore installées (bootstrap_auto_migrations.sql), rien à faire\n" + e.message.slice(0, 200)); process.exit(0); }
const list = readFileSync("supabase/migrations.txt", "utf8").split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#"));
for (const name of list) {
  if (done.has(name)) continue;
  console.log("migrate : application de " + name + "…");
  try { console.log(JSON.stringify(await rpc("_run_migration", { p_name: name, p_sql: readFileSync("supabase/" + name, "utf8") }))); }
  catch (e) { console.error("migrate : ÉCHEC de " + name + " : " + e.message.slice(0, 500)); process.exit(1); }
}
console.log("migrate : base à jour");
