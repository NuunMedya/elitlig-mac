// Web yönetim menüsünün (elitlig-client src/editor_pages/adminNav.js NAV_GROUPS)
// masaüstü kopyasını üretir: app/adminPanel/adminNav.snapshot.json.
//
// Masaüstü "Yönetim" bölümü açılışta (gömülü panel henüz yüklenmeden ve
// çevrimdışıyken) bu kopyayı kullanır; gömülü panel yüklenince web kendi
// süzdüğü menüyü köprüden bildirir ve kopyanın yerini alır.
//
//   node scripts/sync-admin-nav.mjs ../elitlig-client
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import os from "node:os";

const clientDir = path.resolve(process.argv[2] || "../elitlig-client");
const entry = path.join(clientDir, "src/editor_pages/adminNav.js");
if (!fs.existsSync(entry)) { console.error(`Bulunamadı: ${entry}`); process.exit(1); }
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "adminnav-")), "nav.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "error", loader: { ".js": "jsx" } });
const mod = await import(pathToFileURL(out).href);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== "").map((k) => [k, o[k]]));
const ITEM_KEYS = ["name", "path", "icon", "desc", "keywords", "formerly", "permissions", "roles", "excludeRoles", "hideWithPermissions", "badge"];
const groups = mod.NAV_GROUPS.map((g) => ({
  ...pick(g, ["key", "label", "short", "icon", "desc", "top", "workflow", "tools"]),
  items: g.items.map((i) => pick(i, ITEM_KEYS)),
}));
const actions = mod.COMMAND_ACTIONS.map((a) => pick(a, ["key", "name", "path", "icon", "keywords", "permissions"]));
const target = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../app/adminPanel/adminNav.snapshot.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify({ source: "elitlig-client src/editor_pages/adminNav.js", groups, actions }, null, 1)}\n`);
console.log(`${groups.length} bölüm, ${groups.reduce((n, g) => n + g.items.length, 0)} sayfa, ${actions.length} işlem → ${target}`);
