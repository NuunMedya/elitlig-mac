// Bildirimler: ajanda hatırlatmaları, son tarihi gelen görevler, düzenli
// ödemeler (fatura, maaş, kira, taksit…) ve proje adımlarının son günü.
//
// Web sitesi yalnız sekme açıkken hatırlatabiliyordu; masaüstü uygulaması
// pencere kapalıyken de macOS bildirimi gösterir. Her dakika yaklaşan
// etkinlikler ve açık görevler (önbellekten de olabilir) taranır; gösterilen
// bildirimler diske yazılır ki uygulama yeniden açılınca tekrarlanmasın.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { equipmentNotifications } = require("./equipmentFeed");

const MIN = 60000;
const GRACE_MS = 10 * MIN; // uyku/kapalılık sonrası en çok 10 dk geç kalmış bildirim gösterilir

/** Şu an gösterilmesi gereken bildirimler. sent: daha önce gösterilenlerin anahtarları. */
function dueNotifications({ events = [], todos = [], now = Date.now(), sent = new Set() }) {
  const out = [];
  for (const item of events) {
    if (item.source && item.source !== "event") continue;
    if (item.remind_minutes == null || !item.occurrence_start) continue;
    const start = new Date(item.occurrence_start).getTime();
    const at = start - Number(item.remind_minutes) * MIN;
    const key = `event:${item.occurrence_key || item.id}:${item.remind_minutes}`;
    if (at <= now && at > now - GRACE_MS && !sent.has(key)) {
      const when = new Date(start).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      const lead = Number(item.remind_minutes);
      const prefix = lead === 0 ? "Şimdi" : lead >= 1440 ? "Yarın" : `${lead} dk sonra`;
      out.push({
        key,
        title: item.title,
        body: [item.all_day ? "Tüm gün" : `${prefix} · ${when}`, item.location].filter(Boolean).join(" · "),
        route: "agenda",
      });
    }
  }
  for (const task of todos) {
    if (!task.dueAt || task.status === "done") continue;
    // Tüm gün son tarihli proje adımı gece 23:59'da değil, sabah "bugün son gün" olarak bildirilir.
    if (task.allDay && task.kind === "project_step") continue;
    const due = new Date(task.dueAt).getTime();
    const key = `todo:${task.id}:${task.dueAt}`;
    if (due <= now && due > now - GRACE_MS && !sent.has(key)) {
      out.push({ key, title: `Zamanı geldi: ${task.title}`, body: task.kindLabel || "Yapılacaklar", route: "todos", id: task.id });
    }
  }
  return out;
}

const PROJECT_FROM_HOUR = 9;
const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Proje adımlarının son günü: kişiye atanmış, tamamlanmamış proje adımı
 * kartının (kind "project_step") son günü bugünse sabah 09:00'dan sonra bir kez
 * "Bugün son gün" bildirimi. Gece açılışta bildirilmez; aynı gün içinde
 * uygulama sonradan açılırsa yine gösterilir. Aynı anda çok adım varsa tek
 * bildirimde toplanır.
 */
function projectNotifications({ todos = [], now = Date.now(), sent = new Set(), maxSingle = 3 }) {
  if (new Date(now).getHours() < PROJECT_FROM_HOUR) return [];
  const today = localDay(now);
  const items = [];
  for (const task of todos) {
    if (task.kind !== "project_step" || task.status === "done" || !task.dueAt) continue;
    if (localDay(new Date(task.dueAt).getTime()) !== today) continue;
    const key = `project_step:${task.id}:${today}`;
    if (sent.has(key)) continue;
    const project = task.project?.name;
    items.push({ key, title: `Bugün son gün: ${task.title}`, body: [project, task.project?.phaseName].filter(Boolean).join(" · ") || "Proje adımı", route: "todos", id: task.id });
  }
  if (items.length <= maxSingle) return items;
  return [{
    key: items.map((i) => i.key),
    title: `${items.length} proje adımının bugün son günü`,
    body: items.slice(0, 3).map((i) => i.title.replace(/^Bugün son gün: /, "")).join(", ") + (items.length > 3 ? ` ve ${items.length - 3} tane daha` : ""),
    route: "todos",
  }];
}

const tl = (value) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const BILL_FROM_HOUR = 9; // gece bildirim gönderilmez; sabah ilk açılışta gösterilir

/**
 * Düzenli ödeme bildirimleri. bills: /api/tools/recurring yanıtındaki dönemler
 * (occurrences + overdue). Her dönem için en çok üç kez: hatırlatma süresine
 * girince ("3 gün sonra"), vade günü ve gecikince. Gönderilen anahtarlar 3 gün
 * saklandığından ödenmeyen geciken ödeme 3 günde bir yeniden hatırlatılır.
 * Aynı anda çok sayıda ödeme varsa tek bildirimde toplanır.
 */
function billNotifications({ bills = [], now = Date.now(), sent = new Set(), maxSingle = 3 }) {
  if (new Date(now).getHours() < BILL_FROM_HOUR) return [];
  const seen = new Set();
  const items = [];
  for (const o of bills) {
    if (!o?.key || seen.has(o.key)) continue;
    seen.add(o.key);
    const open = ["overdue", "due_soon", "upcoming", "accrued"].includes(o.status);
    if (!open) continue;
    const phase = o.late ? "late" : o.days === 0 ? "today" : o.status === "due_soon" || (o.status === "accrued" && o.days <= 3) ? "soon" : null;
    if (!phase) continue;
    const key = `bill:${o.key}:${phase}`;
    if (sent.has(key)) continue;
    const income = o.type === "income";
    const amount = `${o.estimated ? "~" : ""}${tl(o.amount)}`;
    const when = phase === "late" ? `${-o.days} gün gecikti` : phase === "today" ? "Bugün son gün" : `${o.days} gün sonra`;
    items.push({
      key,
      phase,
      title: phase === "late" ? `Gecikti: ${o.name}` : `${income ? "Tahsilat" : "Ödeme"}: ${o.name}`,
      body: [when, amount, o.party].filter(Boolean).join(" · "),
      route: "ledger:duzenli",
    });
  }
  if (items.length <= maxSingle) return items.map(({ phase, ...rest }) => rest);
  const late = items.filter((i) => i.phase === "late").length;
  return [{
    key: items.map((i) => i.key),
    title: late ? `${late} düzenli ödeme gecikti` : `${items.length} düzenli ödemenin vadesi yaklaşıyor`,
    body: items.slice(0, 3).map((i) => i.title.replace(/^(Gecikti|Ödeme|Tahsilat): /, "")).join(", ") + (items.length > 3 ? ` ve ${items.length - 3} tane daha` : ""),
    route: "ledger:duzenli",
  }];
}

function createReminders({ dataDir, load, notify, now = () => Date.now() }) {
  const file = path.join(dataDir, "reminders-sent.json");
  let sent = new Map();
  try { sent = new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))); } catch { /* ilk açılış */ }
  const persist = () => {
    const cutoff = now() - 3 * 86400000;
    for (const [key, at] of sent) if (at < cutoff) sent.delete(key);
    try { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(sent))); } catch { /* yoksay */ }
  };

  async function check() {
    let data;
    try { data = await load(); } catch { return []; }
    const known = new Set(sent.keys());
    const due = [
      ...dueNotifications({ ...data, now: now(), sent: known }),
      ...billNotifications({ bills: data?.bills, now: now(), sent: known }),
      ...projectNotifications({ todos: data?.todos, now: now(), sent: known }),
      // Ekipman: zimmet iade tarihi ve bakım zamanı (app/equipmentFeed.js).
      ...equipmentNotifications({ ...(data?.equipment || {}), now: now(), sent: known }),
    ];
    for (const item of due) {
      for (const key of [].concat(item.key)) sent.set(key, now());
      notify({ ...item, key: [].concat(item.key)[0] });
    }
    if (due.length) persist();
    return due;
  }

  return { check };
}

module.exports = { dueNotifications, billNotifications, projectNotifications, createReminders };
