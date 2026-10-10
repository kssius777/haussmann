// Charge les 77 835 immeubles dans la table `cards` (à lancer une seule fois après schema.sql).
// Ouvrir : https://<votre-site>/api/seed
const SUPABASE_URL = "https://fmqixxakhphkijtsyeqd.supabase.co";
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return res.status(500).json({ error: "La variable SUPABASE_SERVICE_ROLE_KEY n'est pas définie dans Vercel." });
  const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  const head = await fetch(SUPABASE_URL + "/rest/v1/cards?select=id&limit=1", { headers: { ...H, Prefer: "count=exact" } });
  if (!head.ok) return res.status(500).json({ error: "Table cards introuvable : collez d'abord supabase/schema.sql dans le SQL Editor.", detail: await head.text() });
  const have = +((head.headers.get("content-range") || "*/0").split("/")[1] || 0);
  const proto = req.headers["x-forwarded-proto"] || "https";
  const rows = await (await fetch(`${proto}://${req.headers.host}/data/cards.json`)).json();
  if (have >= rows.length) return res.status(200).json({ ok: true, message: `Déjà fait : ${have} immeubles en base.` });
  const t0 = Date.now(); let done = 0;
  for (let i = 0; i < rows.length; i += 4000) {
    const batch = rows.slice(i, i + 4000).map(r => ({ id: r[0], arr: r[1], r: r[2], lk: r[3], lots: r[4], et: r[5], v: r[6], rent: r[7], pk: !!r[8], title: r[9] }));
    const p = await fetch(SUPABASE_URL + "/rest/v1/cards", { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(batch) });
    if (!p.ok) return res.status(500).json({ error: "Erreur d'insertion", at: i, detail: await p.text() });
    done = i + batch.length;
    if (Date.now() - t0 > 50000) return res.status(200).json({ ok: false, message: `${done} / ${rows.length} chargés : rechargez cette page pour continuer.` });
  }
  res.status(200).json({ ok: true, message: `${rows.length} immeubles chargés. Le jeu est prêt !` });
}
