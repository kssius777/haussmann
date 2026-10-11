// Charge les données de Paris dans la base (à relancer jusqu'au message « prêt ») :
// 1. les 77 835 immeubles ; 2. leurs coordonnées ; 3. le plan des rues pour le pion (immeubles voisins).
// Ouvrir : https://<votre-site>/api/seed
const SUPABASE_URL = "https://fmqixxakhphkijtsyeqd.supabase.co";
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) return res.status(500).json({ error: "La variable SUPABASE_SERVICE_ROLE_KEY n'est pas définie dans Vercel." });
  const H = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) H.Authorization = "Bearer " + key;
  const t0 = Date.now(), late = () => Date.now() - t0 > 45000;
  const count = async (q) => {
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + q, { headers: { ...H, Prefer: "count=exact" } });
    if (!r.ok) throw new Error(await r.text());
    return +((r.headers.get("content-range") || "*/0").split("/")[1] || 0);
  };
  const post = async (table, rows, prefer) => {
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + table, { method: "POST", headers: { ...H, Prefer: prefer + ",return=minimal" }, body: JSON.stringify(rows) });
    if (!r.ok) throw new Error(table + " : " + (await r.text()));
  };
  try {
    const proto = req.headers["x-forwarded-proto"] || "https", base = `${proto}://${req.headers.host}/data/`;
    let have;
    try { have = await count("cards?select=id&limit=1"); }
    catch (e) {
      if (/Invalid API key|JWT/i.test(e.message)) return res.status(500).json({ error: "La clé SUPABASE_SERVICE_ROLE_KEY est refusée par Supabase : recopiez la clé « service_role » dans Vercel, puis redéployez.", detail: e.message, keyInfo: info(key) });
      return res.status(500).json({ error: "Table cards introuvable : collez d'abord supabase/schema.sql dans le SQL Editor.", detail: e.message });
    }
    const rows = await (await fetch(base + "cards.json")).json();
    const toRow = r => ({ id: r[0], arr: r[1], r: r[2], lk: r[3], lots: r[4], et: r[5], v: r[6], rent: r[7], pk: !!r[8], title: r[9], cx: r[10], cy: r[11] });
    // 1 et 2 : immeubles + coordonnées (upsert : insère les manquants, complète les coordonnées)
    let noCoord = 0;
    try { noCoord = await count("cards?select=id&cx=is.null&limit=1"); }
    catch (e) { return res.status(500).json({ error: "Collez d'abord la mise à jour « pion » (fichier SQL) dans Supabase.", detail: e.message }); }
    if (have < rows.length || noCoord > 0) {
      for (let i = 0; i < rows.length; i += 4000) {
        await post("cards", rows.slice(i, i + 4000).map(toRow), "resolution=merge-duplicates");
        if (late()) return res.status(200).json({ ok: false, message: `Immeubles : ${i + 4000} / ${rows.length}. Rechargez cette page pour continuer.` });
      }
    }
    // 3 : plan des rues (liens entre immeubles voisins, dans les deux sens)
    const edges = await (await fetch(base + "edges.json")).json();
    const all = edges.length * 2;
    let done = await count("edges?select=a&limit=1");
    if (done < all) {
      const both = []; for (const [a, b] of edges) { both.push({ a, b }); both.push({ a: b, b: a }); }
      const start = Math.max(0, Math.floor(done / 10000) * 10000 - 10000);
      for (let i = start; i < both.length; i += 10000) {
        await post("edges", both.slice(i, i + 10000), "resolution=ignore-duplicates");
        if (late()) return res.status(200).json({ ok: false, message: `Plan des rues : ${Math.min(both.length, i + 10000)} / ${both.length} liens. Rechargez cette page pour continuer.` });
      }
      done = await count("edges?select=a&limit=1");
    }
    res.status(200).json({ ok: true, message: `Prêt ! ${rows.length} immeubles et ${done} liens entre immeubles voisins.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
// affiche seulement le projet et le rôle inscrits dans la clé (jamais la clé elle-même)
function info(k) { try { const p = JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()); return { projet: p.ref, role: p.role }; } catch (e) { return "illisible"; } }
