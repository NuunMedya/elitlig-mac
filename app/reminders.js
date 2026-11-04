// Bildirimler: ajanda hatırlatmaları ve son tarihi gelen görevler.
//
// Web sitesi yalnız sekme açıkken hatırlatabiliyordu; masaüstü uygulaması
// pencere kapalıyken de macOS bildirimi gösterir. Her dakika yaklaşan
// etkinlikler ve açık görevler (önbellekten de olabilir) taranır; gösterilen
// bildirimler diske yazılır ki uygulama yeniden açılınca tekrarlanmasın.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

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
    const due = new Date(task.dueAt).getTime();
    const key = `todo:${task.id}:${task.dueAt}`;
    if (due <= now && due > now - GRACE_MS && !sent.has(key)) {
      out.push({ key, title: `Zamanı geldi: ${task.title}`, body: task.kindLabel || "Yapılacaklar", route: "todos", id: task.id });
    }
  }
  return out;
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
    const due = dueNotifications({ ...data, now: now(), sent: new Set(sent.keys()) });
    for (const item of due) {
      sent.set(item.key, now());
      notify(item);
    }
    if (due.length) persist();
    return due;
  }

  return { check };
}

module.exports = { dueNotifications, createReminders };
