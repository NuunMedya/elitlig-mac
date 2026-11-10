// Ekipman bildirimleri (ana süreç): benim üzerimdeki zimmetlerin iade tarihi
// ve bakımı gelen ekipman. Hatırlatıcı her dakika çalışır; ekipman verisi 20
// dakikada bir okunur (tarihler gün bazındadır). Yetkisi olmayan hesapta uç
// 403 döner ve bir saat yeniden sorulmaz.
"use strict";

const TTL = 20 * 60000;
const DENIED_TTL = 60 * 60000;
const FROM_HOUR = 9; // gece bildirim gönderilmez
const DAY = 86400000;

function createEquipmentFeed({ request, now: clock = () => Date.now() }) {
  let cache = { at: -Infinity, ttl: TTL, data: { mine: [], maintenance: [] } };
  async function load(now = clock(), { force = false } = {}) {
    if (!force && now - cache.at < cache.ttl) return cache.data;
    const [mine, plan] = await Promise.all([
      request({ path: "/api/tools/equipment/mine" }),
      request({ path: "/api/tools/equipment/maintenance", query: { days: 1 } }),
    ]);
    const denied = [mine, plan].some((r) => !r.ok && [403, 404].includes(r.error?.status));
    if (mine.ok || plan.ok || denied) {
      cache = {
        at: now,
        ttl: denied && !mine.ok ? DENIED_TTL : TTL,
        data: { mine: mine.ok ? mine.data?.items || [] : [], maintenance: plan.ok ? plan.data?.due || [] : [] },
      };
    }
    return cache.data;
  }
  return { load, invalidate: () => { cache.at = -Infinity; } };
}

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * Bildirimler. mine: benim açık zimmetlerim (/mine), maintenance: bakımı bugün
 * ya da gecikmiş ekipman (/maintenance?days=1 → due). İade: bir gün önce,
 * vade günü ve gecikince (gecikme günlük anahtarla günde bir kez). Bakım:
 * ekipman ve bakım tarihi başına bir kez; çoksa tek bildirimde toplanır.
 */
function equipmentNotifications({ mine = [], maintenance = [], now = Date.now(), sent = new Set(), maxSingle = 3 } = {}) {
  if (new Date(now).getHours() < FROM_HOUR) return [];
  const out = [];
  const today = startOfDay(now);
  for (const a of mine) {
    if (!a?.due_at || a.status && a.status !== "open") continue;
    const due = new Date(a.due_at).getTime();
    if (Number.isNaN(due)) continue;
    const days = Math.round((startOfDay(due) - today) / DAY);
    const phase = due < now ? "late" : days === 0 ? "today" : days === 1 ? "tomorrow" : null;
    if (!phase) continue;
    const key = `eq:return:${a.id}:${phase === "late" ? `late:${dayKey(now)}` : phase}`;
    if (sent.has(key)) continue;
    const what = `${a.asset_tag ? `${a.asset_tag} · ` : ""}${a.item_name || "Ekipman"}${a.item_tracking === "bulk" ? ` (${a.quantity} ${a.item_unit || "adet"})` : ""}`;
    out.push({
      key,
      title: phase === "late" ? `İade gecikti: ${a.item_name || "Ekipman"}` : `İade ${phase === "today" ? "bugün" : "yarın"}: ${a.item_name || "Ekipman"}`,
      body: [what, a.purpose].filter(Boolean).join(" · "),
      route: "equipment:zimmet",
    });
  }
  const due = maintenance.filter((m) => m?.next_at && (m.state === "overdue" || m.days_left <= 0)).map((m) => ({ ...m, key: `eq:maint:${m.id}:${m.next_at}` })).filter((m) => !sent.has(m.key));
  if (due.length > maxSingle) {
    out.push({
      key: due.map((m) => m.key),
      title: `${due.length} ekipmanın bakım zamanı geldi`,
      body: due.slice(0, 3).map((m) => m.name).join(", ") + (due.length > 3 ? ` ve ${due.length - 3} tane daha` : ""),
      route: "equipment:bakim",
    });
  } else {
    due.forEach((m) => out.push({
      key: m.key,
      title: `Bakım zamanı: ${m.name}`,
      body: [m.asset_tag, m.state === "overdue" ? `${-m.days_left} gün gecikti` : "bugün", m.location_path].filter(Boolean).join(" · "),
      route: "equipment:bakim",
    }));
  }
  return out;
}

module.exports = { createEquipmentFeed, equipmentNotifications };
