// Bugün panosu — VERİ KAYNAKLARI (saf eşlemeler; renderer/test/today-library.test.js sınar).
//
// Her kaynak bir uçtan (path) ya da masaüstü köprüsünden (bridge) gelen veriyi pano bileşeninin
// ortak biçimine çevirir; DataTile (tiles/data.jsx) bunu kademeye göre çizer:
//   kpi    { value, label, sub?, tone? }               xs düğme, küçük kart, büyükte başlık
//   rows   [{ title, sub?, right?, tone?, icon?, color?, open? }]   liste / tablo
//   bars   [{ label, a, b? }]                          çubuk grafik (a: gelir / plan, b: gider / gerçek)
//   slices [{ label, value, color? }]                  pasta / halka
//   days   [{ date, items:[{ title, time?, tone? }] }] takvim (7 gün)
// open: tıklanınca gidilecek rota (go) ya da { route, arg } / { spec } (düğme eylemi).
// Kaynaklar yalnız GERÇEK uçları ve köprüleri kullanır (renderer/src/api.js, app/preload.js).

const DONE = new Set(["done", "skipped", "completed", "archived"]);
const pad = (n) => String(n).padStart(2, "0");
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (s) => String(s || "").slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const money = (v) => `${Math.round(num(v)).toLocaleString("tr-TR")} ₺`;
export const shortMoney = (v) => {
  const n = Math.abs(num(v));
  const sign = num(v) < 0 ? "−" : "";
  if (n >= 1e6) return `${sign}${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn ₺`;
  if (n >= 1e4) return `${sign}${(n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} bin ₺`;
  return `${sign}${Math.round(n).toLocaleString("tr-TR")} ₺`;
};
const fmtDay = (s) => { const d = new Date(String(s).length <= 10 ? `${s}T12:00:00` : s); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }); };
const fmtTime = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); };
const relDay = (s, now = new Date()) => {
  const a = dayOf(s); if (!a) return "";
  const diff = Math.round((new Date(`${a}T12:00:00`) - new Date(`${isoDay(now)}T12:00:00`)) / 86400000);
  return diff === 0 ? "bugün" : diff === 1 ? "yarın" : diff === -1 ? "dün" : diff < 0 ? `${-diff} gün geçti` : `${diff} gün`;
};
const PALETTE = ["#7c3aed", "#2563eb", "#059669", "#ea580c", "#db2777", "#0891b2", "#ca8a04", "#dc2626", "#475569", "#16a34a"];
const slicesOf = (pairs, limit = 7) => {
  const sorted = pairs.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, limit).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  const rest = sorted.slice(limit).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...head, { label: "Diğer", value: rest, color: "#94a3b8" }] : head;
};
const count = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()]; };

/* ────────────────────────────── muhasebe ────────────────────────────── */
const accountsOf = (d, kind) => (d?.items || []).filter((a) => !a.archived && (!kind || a.kind === kind));
const accountSource = (kind, label) => ({
  path: "/api/finance/accounts",
  map: (d) => {
    const list = accountsOf(d, kind);
    const total = list.reduce((s, a) => s + num(a.balance), 0);
    return { kpi: { value: shortMoney(total), label, tone: total < 0 ? "red" : "", sub: `${list.length} hesap` }, rows: list.map((a) => ({ title: a.name, sub: a.city_name || a.kind, right: money(a.balance), tone: num(a.balance) < 0 ? "red" : "", icon: "bank", open: "ledger" })) };
  },
});
const ledgerItems = (d, pred) => (d?.items || []).filter(pred).sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)) || b.id - a.id);
const ledgerRow = (e) => ({ title: e.description || e.party || e.category || (e.type === "income" ? "Gelir" : "Gider"), sub: [fmtDay(e.entry_date), e.category, e.party].filter(Boolean).join(" · "), right: `${e.type === "income" ? "+" : "−"}${money(e.amount)}`, tone: e.type === "income" ? "green" : "red", icon: e.type === "income" ? "arrowDown" : "receipt", open: `ledger:${e.id}` });

export const SOURCES = {
  "money.cash": accountSource("kasa", "kasada"),
  "money.bank": accountSource("banka", "bankada"),
  "money.card": accountSource("kart", "kartlarda"),
  "money.total": accountSource(null, "toplam bakiye"),
  "money.inout": {
    path: "/api/tools/ledger",
    map: (d) => {
      const s = d?.summary || {};
      return { kpi: { value: shortMoney(num(s.income) - num(s.expense)), label: "net (dönem)", tone: num(s.income) - num(s.expense) < 0 ? "red" : "green", sub: `+${shortMoney(s.income)} · −${shortMoney(s.expense)}` }, slices: [{ label: "Gelir", value: num(s.income), color: "#059669" }, { label: "Gider", value: num(s.expense), color: "#dc2626" }].filter((x) => x.value > 0), bars: (d?.trend || []).slice(-6).map((m) => ({ label: m.month.slice(5), a: num(m.income), b: num(m.expense) })) };
    },
  },
  "money.expcat": {
    path: "/api/tools/ledger",
    map: (d) => {
      const cats = (d?.summary?.categories || []).filter((c) => c.type === "expense");
      const top = cats.slice().sort((a, b) => num(b.total) - num(a.total))[0];
      return { kpi: { value: top ? shortMoney(top.total) : "—", label: top ? `en çok: ${top.name}` : "gider yok" }, slices: slicesOf(cats.map((c) => [c.name || "Kategorisiz", num(c.total)])), rows: cats.map((c) => ({ title: c.name || "Kategorisiz", sub: `${c.count} kayıt`, right: money(c.total), icon: "tag", open: "ledger" })) };
    },
  },
  "money.inccat": {
    path: "/api/tools/ledger",
    map: (d) => {
      const cats = (d?.summary?.categories || []).filter((c) => c.type === "income");
      const sum = cats.reduce((s, c) => s + num(c.total), 0);
      return { kpi: { value: shortMoney(sum), label: "gelir", tone: "green", sub: `${cats.length} kategori` }, slices: slicesOf(cats.map((c) => [c.name || "Kategorisiz", num(c.total)])), rows: cats.map((c) => ({ title: c.name || "Kategorisiz", sub: `${c.count} kayıt`, right: money(c.total), tone: "green", icon: "tag", open: "ledger" })) };
    },
  },
  "money.receivable": {
    path: "/api/tools/ledger",
    map: (d) => {
      const list = ledgerItems(d, (e) => e.type === "income" && e.status !== "paid" && e.status !== "cancelled");
      return { kpi: { value: shortMoney(d?.summary?.receivable), label: "bekleyen alacak", sub: `${list.length} kayıt` }, rows: list.map((e) => ({ ...ledgerRow(e), sub: `${e.party || ""}${e.due_date ? ` · vade ${fmtDay(e.due_date)} (${relDay(e.due_date)})` : ""}`, tone: e.due_date && dayOf(e.due_date) < isoDay() ? "red" : "green" })) };
    },
  },
  "money.payable": {
    path: "/api/tools/ledger",
    map: (d) => {
      const list = ledgerItems(d, (e) => e.type === "expense" && e.status !== "paid" && e.status !== "cancelled");
      return { kpi: { value: shortMoney(d?.summary?.payable), label: "bekleyen borç", tone: num(d?.summary?.payable) ? "red" : "", sub: `${list.length} kayıt` }, rows: list.map((e) => ({ ...ledgerRow(e), sub: `${e.party || ""}${e.due_date ? ` · vade ${fmtDay(e.due_date)} (${relDay(e.due_date)})` : ""}` })) };
    },
  },
  "money.overdue": {
    path: "/api/tools/ledger",
    map: (d) => {
      const today = isoDay();
      const list = ledgerItems(d, (e) => e.status !== "paid" && e.status !== "cancelled" && e.due_date && dayOf(e.due_date) < today);
      return { kpi: { value: shortMoney(d?.summary?.overdue_amount), label: "vadesi geçen", tone: list.length ? "red" : "", sub: `${list.length} kayıt` }, rows: list.map((e) => ({ ...ledgerRow(e), sub: `${e.party || ""} · ${relDay(e.due_date)}`, tone: "red" })) };
    },
  },
  "money.parties": {
    path: "/api/tools/ledger",
    map: (d) => {
      const list = (d?.summary?.parties || []).slice().sort((a, b) => Math.abs(num(b.balance)) - Math.abs(num(a.balance)));
      return { kpi: { value: list.length, label: "cari" }, rows: list.map((p) => ({ title: p.name, sub: `alacak ${money(p.receivable)} · borç ${money(p.payable)}`, right: money(p.balance), tone: num(p.balance) < 0 ? "red" : "green", icon: "user", open: "ledger" })) };
    },
  },
  "money.methods": {
    path: "/api/tools/ledger",
    map: (d) => {
      const M = { cash: "Nakit", bank: "Banka / EFT", card: "Kart", other: "Diğer" };
      const list = d?.summary?.methods || [];
      return { kpi: { value: list.length, label: "ödeme yöntemi" }, rows: list.map((m) => ({ title: M[m.key] || m.key, sub: `+${money(m.income)} · −${money(m.expense)}`, right: money(num(m.income) - num(m.expense)), icon: "wallet", open: "ledger" })), slices: slicesOf(list.map((m) => [M[m.key] || m.key, num(m.expense)])) };
    },
  },
  "money.vat": {
    path: "/api/tools/ledger",
    map: (d) => {
      const s = d?.summary || {};
      return { kpi: { value: shortMoney(s.vat_balance), label: "KDV farkı", sub: `hesaplanan ${shortMoney(s.vat_collected)} · indirilecek ${shortMoney(s.vat_paid)}`, tone: num(s.vat_balance) > 0 ? "amber" : "" }, rows: [{ title: "Hesaplanan KDV", right: money(s.vat_collected), icon: "percent" }, { title: "İndirilecek KDV", right: money(s.vat_paid), icon: "percent" }, { title: "Fark", right: money(s.vat_balance), icon: "percent", tone: num(s.vat_balance) > 0 ? "amber" : "" }] };
    },
  },
  "money.lastin": { path: "/api/tools/ledger", map: (d) => { const l = ledgerItems(d, (e) => e.type === "income"); return { kpi: { value: l[0] ? money(l[0].amount) : "—", label: l[0] ? `son gelir · ${fmtDay(l[0].entry_date)}` : "gelir yok", tone: "green" }, rows: l.map(ledgerRow) }; } },
  "money.lastout": { path: "/api/tools/ledger", map: (d) => { const l = ledgerItems(d, (e) => e.type === "expense"); return { kpi: { value: l[0] ? money(l[0].amount) : "—", label: l[0] ? `son gider · ${fmtDay(l[0].entry_date)}` : "gider yok", tone: "red" }, rows: l.map(ledgerRow) }; } },
  "money.today": {
    path: "/api/tools/ledger",
    map: (d) => {
      const t = isoDay();
      const l = ledgerItems(d, (e) => dayOf(e.entry_date) === t);
      const net = l.reduce((s, e) => s + (e.type === "income" ? 1 : -1) * num(e.amount), 0);
      return { kpi: { value: shortMoney(net), label: "bugün net", tone: net < 0 ? "red" : "green", sub: `${l.length} kayıt` }, rows: l.map(ledgerRow) };
    },
  },
  "money.forecast": {
    path: "/api/tools/recurring",
    map: (d) => {
      const f = d?.forecast || [];
      return { kpi: { value: shortMoney(d?.summary?.remaining_expense), label: "bu ay ödenecek", sub: `${d?.summary?.open_count || 0} açık ödeme`, tone: num(d?.summary?.overdue_count) ? "red" : "" }, bars: f.slice(0, 6).map((m) => ({ label: String(m.month).slice(5), a: num(m.income), b: num(m.expense) })), rows: f.map((m) => ({ title: m.month, sub: `+${money(m.income)} · −${money(m.expense)}`, right: money(m.net), tone: num(m.net) < 0 ? "red" : "green", icon: "trend", open: "ledger:duzenli" })) };
    },
  },
  "money.budgetleft": {
    path: "/api/tools/budgets",
    map: (d) => {
      const t = d?.totals || {};
      const items = (d?.items || []).filter((b) => b.type !== "income");
      return { kpi: { value: shortMoney(t.remaining), label: "bütçeden kalan", tone: num(t.remaining) < 0 ? "red" : "", sub: t.over_count ? `${t.over_count} kategori aşıldı` : `${items.length} kategori` }, bars: items.slice(0, 8).map((b) => ({ label: b.category || b.name || "—", a: num(b.amount ?? b.budget), b: num(b.spent) })), rows: items.map((b) => ({ title: b.category || b.name || "—", sub: `${money(b.spent)} / ${money(b.amount ?? b.budget)}`, right: `%${num(b.amount ?? b.budget) ? Math.round((num(b.spent) / num(b.amount ?? b.budget)) * 100) : 0}`, tone: num(b.spent) > num(b.amount ?? b.budget) ? "red" : "", icon: "target", open: "ledger:butce" })) };
    },
  },
  "money.budgetover": {
    path: "/api/tools/budgets",
    map: (d) => {
      const over = (d?.items || []).filter((b) => b.type !== "income" && num(b.spent) > num(b.amount ?? b.budget));
      const un = d?.unbudgeted || [];
      return { kpi: { value: over.length, label: "aşılan bütçe", tone: over.length ? "red" : "green", sub: un.length ? `${un.length} bütçesiz kategori` : "" }, rows: [...over.map((b) => ({ title: b.category || b.name, sub: `${money(b.spent)} harcandı`, right: `+${money(num(b.spent) - num(b.amount ?? b.budget))}`, tone: "red", icon: "alert", open: "ledger:butce" })), ...un.map((u) => ({ title: u.category || u.name || "Kategorisiz", sub: "bütçe yok", right: money(u.spent ?? u.total), icon: "tag", open: "ledger:butce" }))] };
    },
  },

  /* ────────────────────────────── spor ────────────────────────────── */
  "sport.live": {
    bridge: (o) => window.elitlig.widgets.matches({ city: o.city || "" }), poll: 60000,
    map: (d, o) => {
      const live = filterLeague(d?.live || [], o);
      return { kpi: { value: live.length, label: "canlı maç", tone: live.length ? "red" : "" }, rows: live.map((m) => ({ title: `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`, sub: [m.league, m.city].filter(Boolean).join(" · "), right: "CANLI", tone: "red", icon: "ball", open: { spec: `site:/${slugCity(m.city)}/mac/${m.id}` } })) };
    },
  },
  "sport.fixtures": {
    bridge: (o) => window.elitlig.widgets.matches({ city: o.city || "" }), poll: 5 * 60000,
    map: (d, o) => {
      const up = filterLeague(d?.upcoming || [], o);
      return { kpi: { value: up.length, label: "yaklaşan maç", sub: up[0] ? `ilk: ${fmtDay(up[0].start)} ${fmtTime(up[0].start)}` : "" }, rows: up.map(matchRow), days: daysOf(up.map((m) => ({ date: dayOf(m.start), title: `${m.home} – ${m.away}`, time: fmtTime(m.start) }))) };
    },
  },
  "sport.today": {
    bridge: (o) => window.elitlig.widgets.matches({ city: o.city || "" }), poll: 5 * 60000,
    map: (d, o) => {
      const t = isoDay();
      const list = [...filterLeague(d?.live || [], o), ...filterLeague(d?.upcoming || [], o).filter((m) => dayOf(m.start) === t)];
      return { kpi: { value: list.length, label: "bugün maç", sub: `${(d?.live || []).length} canlı` }, rows: list.map((m) => (m.live ? { title: `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`, sub: m.league, right: "CANLI", tone: "red", icon: "ball" } : matchRow(m))) };
    },
  },
  "sport.next": {
    bridge: (o) => window.elitlig.widgets.matches({ city: o.city || "" }), poll: 5 * 60000,
    map: (d, o) => {
      const m = filterLeague(d?.upcoming || [], o)[0];
      const mins = m ? Math.round((new Date(m.start) - Date.now()) / 60000) : null;
      const left = mins == null ? "—" : mins < 60 ? `${Math.max(0, mins)} dk` : mins < 1440 ? `${Math.floor(mins / 60)} sa ${mins % 60} dk` : `${Math.floor(mins / 1440)} gün`;
      return { kpi: { value: left, label: m ? `${m.home} – ${m.away}` : "yaklaşan maç yok", sub: m ? `${fmtDay(m.start)} ${fmtTime(m.start)} · ${m.field || m.league}` : "" }, rows: m ? [matchRow(m)] : [] };
    },
  },
  "sport.byleague": {
    bridge: (o) => window.elitlig.widgets.matches({ city: o.city || "" }), poll: 10 * 60000,
    map: (d) => {
      const all = [...(d?.live || []), ...(d?.upcoming || [])];
      const pairs = count(all, (m) => m.league || "Lig");
      return { kpi: { value: pairs.length, label: "lig (10 gün)" }, slices: slicesOf(pairs), rows: pairs.sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ title: l, right: `${n} maç`, icon: "trophy" })) };
    },
  },
  "sport.bycity": {
    bridge: () => window.elitlig.widgets.matches({ city: "" }), poll: 10 * 60000,
    map: (d) => {
      const pairs = count([...(d?.live || []), ...(d?.upcoming || [])], (m) => m.city || "—");
      return { kpi: { value: pairs.length, label: "şehir" }, slices: slicesOf(pairs), rows: pairs.sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ title: c, right: `${n} maç`, icon: "map" })) };
    },
  },
  "sport.leader": {
    bridge: (o) => (o.league ? window.elitlig.widgets.standings({ leagueId: Number(o.league) }) : window.elitlig.widgets.leagues().then((r) => (r?.ok && r.leagues?.[0] ? window.elitlig.widgets.standings({ leagueId: r.leagues[0].id }) : r))), poll: 10 * 60000,
    map: (d) => {
      const rows = d?.rows || [];
      const top = rows[0];
      return { kpi: { value: top ? `${top.points ?? top.puan ?? ""} P` : "—", label: top ? `lider: ${top.team || top.name}` : "lig seçin", sub: d?.league?.name || "" }, rows: rows.map((r, i) => ({ title: `${r.rank ?? i + 1}. ${r.team || r.name}`, sub: `O ${r.played ?? r.o ?? "-"} · Av ${r.diff ?? r.av ?? "-"}`, right: `${r.points ?? r.puan ?? 0} P`, icon: "trophy" })), bars: rows.slice(0, 8).map((r) => ({ label: String(r.team || r.name || "").slice(0, 10), a: num(r.points ?? r.puan) })) };
    },
  },
  "staff.referees": {
    path: "/api/staff/matches", query: { range: "upcoming" },
    map: (d) => {
      const list = (d?.items || []).map((m) => ({ m, ref: dutyOf(m, "hakem") }));
      const missing = list.filter((x) => !x.ref.length).length;
      return { kpi: { value: missing, label: "hakemsiz maç", tone: missing ? "red" : "green", sub: `${list.length} maç` }, rows: list.map(({ m, ref }) => ({ title: matchTitle(m), sub: `${fmtDay(m.match_date || m.date || m.start)} · ${ref.length ? ref.join(", ") : "hakem atanmadı"}`, right: ref.length ? "✓" : "eksik", tone: ref.length ? "" : "red", icon: "user", open: "planning" })) };
    },
  },
  "staff.missing": {
    path: "/api/staff/matches", query: { range: "upcoming" },
    map: (d) => {
      const duties = (d?.duties || []).map((x) => x.key);
      const rows = [];
      let total = 0;
      for (const m of d?.items || []) {
        const miss = duties.filter((k) => !dutyOf(m, k).length);
        total += miss.length;
        if (miss.length) rows.push({ title: matchTitle(m), sub: miss.map((k) => (d.duties.find((x) => x.key === k)?.label || k)).join(", "), right: `${miss.length} eksik`, tone: "red", icon: "team", open: "planning" });
      }
      return { kpi: { value: total, label: "eksik görevli", tone: total ? "red" : "green", sub: `${(d?.items || []).length} maç` }, rows };
    },
  },
  "staff.week": {
    path: "/api/staff/matches", query: { range: "upcoming", days: 7 },
    map: (d) => {
      const items = d?.items || [];
      return { kpi: { value: items.length, label: "maç (7 gün)" }, rows: items.map((m) => ({ title: matchTitle(m), sub: `${fmtDay(m.match_date || m.date || m.start)} ${m.match_time || ""} · ${m.field_name || m.match_field || ""}`, icon: "ball", open: "planning" })), days: daysOf(items.map((m) => ({ date: dayOf(m.match_date || m.date || m.start), title: matchTitle(m), time: m.match_time || "" }))) };
    },
  },
  "staff.pending": {
    path: "/api/staff/matches", query: { range: "past", days: 7 },
    map: (d) => {
      const list = (d?.items || []).filter((m) => m.is_it_fixture !== false && !(m.first_team_score != null && m.second_team_score != null && m.played));
      return { kpi: { value: list.length, label: "sonucu girilecek", tone: list.length ? "amber" : "green" }, rows: list.map((m) => ({ title: matchTitle(m), sub: fmtDay(m.match_date || m.date || m.start), right: "sonuç", tone: "amber", icon: "flag", open: { spec: "route:admin" } })) };
    },
  },

  /* ────────────────────────────── projeler ────────────────────────────── */
  "proj.status": {
    path: "/api/tools/projects",
    map: (d) => {
      const S = Object.fromEntries((d?.meta?.project_statuses || []).map((s) => [s.key, s.label]));
      const list = (d?.items || []).filter((p) => !p.archived);
      const pairs = count(list, (p) => S[p.status] || p.status);
      return { kpi: { value: list.filter((p) => p.status === "active").length, label: "yürütülen proje", sub: `${list.length} proje` }, slices: slicesOf(pairs), rows: pairs.map(([k, n]) => ({ title: k, right: n, icon: "layers", open: "projects" })) };
    },
  },
  "proj.deadlines": {
    path: "/api/tools/projects",
    map: (d) => {
      const list = (d?.items || []).filter((p) => !p.archived && p.end_date && !DONE.has(p.status) && p.status !== "cancelled").sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)));
      const n = list[0];
      return { kpi: { value: n ? relDay(n.end_date) : "—", label: n ? n.name : "son tarihli proje yok", tone: n && dayOf(n.end_date) < isoDay() ? "red" : "" }, rows: list.map((p) => ({ title: p.name, sub: `${fmtDay(p.end_date)} · %${p.stats?.steps?.progress ?? 0}`, right: relDay(p.end_date), tone: dayOf(p.end_date) < isoDay() ? "red" : "", color: p.color, icon: "flag", open: { route: "projects", arg: { id: p.id } } })) };
    },
  },
  "proj.progress": {
    path: "/api/tools/projects",
    map: (d) => {
      const list = (d?.items || []).filter((p) => !p.archived && p.status !== "cancelled");
      const avg = list.length ? Math.round(list.reduce((s, p) => s + num(p.stats?.steps?.progress), 0) / list.length) : 0;
      return { kpi: { value: `%${avg}`, label: "ortalama ilerleme", sub: `${list.length} proje` }, bars: list.slice(0, 8).map((p) => ({ label: p.name.slice(0, 12), a: num(p.stats?.steps?.progress) })), rows: list.map((p) => ({ title: p.name, sub: `${p.stats?.steps?.done ?? 0}/${p.stats?.steps?.total ?? 0} adım`, right: `%${p.stats?.steps?.progress ?? 0}`, color: p.color, icon: "layers", open: { route: "projects", arg: { id: p.id } } })) };
    },
  },
  "proj.budget": {
    path: "/api/tools/projects",
    map: (d) => {
      const list = (d?.items || []).filter((p) => !p.archived && p.stats?.finance);
      const plan = list.reduce((s, p) => s + num(p.stats.finance.estimate_expense || p.stats.finance.planned_expense), 0);
      const real = list.reduce((s, p) => s + num(p.stats.finance.paid_expense), 0);
      return { kpi: { value: shortMoney(real), label: "harcanan", sub: `plan ${shortMoney(plan)}`, tone: real > plan && plan ? "red" : "" }, bars: list.slice(0, 8).map((p) => ({ label: p.name.slice(0, 12), a: num(p.stats.finance.estimate_expense || p.stats.finance.planned_expense), b: num(p.stats.finance.paid_expense) })), rows: list.map((p) => ({ title: p.name, sub: `plan ${money(p.stats.finance.estimate_expense || p.stats.finance.planned_expense)} · gelir ${money(p.stats.finance.paid_income)}`, right: money(p.stats.finance.paid_expense), icon: "wallet", open: { route: "projects", arg: { id: p.id } } })) };
    },
  },
  "proj.leads": {
    path: "/api/tools/projects",
    map: (d) => {
      const list = (d?.items || []).filter((p) => !p.archived && p.stats?.leads);
      const open = list.reduce((s, p) => s + num(p.stats.leads.open), 0);
      const due = list.reduce((s, p) => s + num(p.stats.leads.due), 0);
      return { kpi: { value: open, label: "açık görüşme", sub: due ? `${due} bugün aranacak` : "", tone: due ? "amber" : "" }, rows: list.map((p) => ({ title: p.name, sub: `${p.stats.leads.won} kazanıldı · ${money(p.stats.leads.pipeline_value)} süreçte`, right: p.stats.leads.open, icon: "phone", open: { route: "projects", arg: { id: p.id, tab: "leads" } } })) };
    },
  },
  "proj.questions": {
    path: "/api/tools/projects",
    map: (d) => {
      const list = (d?.items || []).filter((p) => !p.archived && num(p.stats?.open_questions));
      const sum = list.reduce((s, p) => s + num(p.stats.open_questions), 0);
      return { kpi: { value: sum, label: "açık soru", tone: sum ? "amber" : "" }, rows: list.map((p) => ({ title: p.name, right: p.stats.open_questions, icon: "help", open: { route: "projects", arg: { id: p.id } } })) };
    },
  },
  "proj.mysteps": {
    path: "/api/todos", query: { view: "mine", status: "active" },
    map: (d) => {
      const list = (d?.items || []).filter((t) => t.isProjectStep || t.kind === "project_step").sort(byDue);
      return { kpi: { value: list.length, label: "proje adımım", sub: `${list.filter((t) => t.overdue).length} gecikmiş`, tone: list.some((t) => t.overdue) ? "red" : "" }, rows: list.map(todoRow) };
    },
  },
  "proj.overdue": {
    path: "/api/todos", query: { view: "mine", status: "active" },
    map: (d) => {
      const list = (d?.items || []).filter((t) => (t.isProjectStep || t.kind === "project_step") && t.overdue).sort(byDue);
      return { kpi: { value: list.length, label: "geciken adım", tone: list.length ? "red" : "green" }, rows: list.map(todoRow) };
    },
  },

  /* ────────────────────────────── yapılacaklar ────────────────────────────── */
  "todo.overdue": { path: "/api/todos", query: { view: "mine", status: "active" }, map: (d) => { const l = (d?.items || []).filter((t) => t.overdue).sort(byDue); return { kpi: { value: l.length, label: "gecikmiş iş", tone: l.length ? "red" : "green" }, rows: l.map(todoRow) }; } },
  "todo.today": { path: "/api/todos", query: { view: "mine", status: "active" }, map: (d) => { const t = isoDay(); const l = (d?.items || []).filter((x) => x.dueAt && isoDay(new Date(x.dueAt)) === t).sort(byDue); return { kpi: { value: l.length, label: "bugün" }, rows: l.map(todoRow) }; } },
  "todo.week": {
    path: "/api/todos", query: { view: "mine", status: "active" },
    map: (d) => {
      const l = (d?.items || []).filter((x) => x.dueAt && !x.overdue).sort(byDue);
      return { kpi: { value: l.filter((x) => (new Date(x.dueAt) - Date.now()) < 7 * 86400000).length, label: "7 günde" }, rows: l.map(todoRow), days: daysOf(l.map((x) => ({ date: isoDay(new Date(x.dueAt)), title: x.title, time: x.allDay ? "" : fmtTime(x.dueAt) }))) };
    },
  },
  "todo.nodate": { path: "/api/todos", query: { view: "mine", status: "active" }, map: (d) => { const l = (d?.items || []).filter((x) => !x.dueAt && !x.isProjectStep); return { kpi: { value: l.length, label: "tarihsiz iş" }, rows: l.map(todoRow) }; } },
  "todo.high": { path: "/api/todos", query: { view: "mine", status: "active" }, map: (d) => { const l = (d?.items || []).filter((x) => x.priority === "high" || x.priority === "urgent" || x.pinned).sort(byDue); return { kpi: { value: l.length, label: "önemli", tone: l.length ? "amber" : "" }, rows: l.map(todoRow) }; } },
  "todo.byproject": {
    path: "/api/todos", query: { view: "mine", status: "active" },
    map: (d) => {
      const pairs = count(d?.items || [], (t) => t.project?.name || "Projesiz");
      return { kpi: { value: pairs.length, label: "kapsam" }, slices: slicesOf(pairs), rows: pairs.sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ title: k, right: n, icon: k === "Projesiz" ? "checkSquare" : "layers", open: "todos" })) };
    },
  },
  "todo.bylabel": {
    path: "/api/todos", query: { view: "mine", status: "active" },
    map: (d) => {
      const m = new Map();
      for (const t of d?.items || []) {
        const labels = [...(t.labels || []).map((l) => l.text), t.project?.phase?.name].filter(Boolean);
        if (!labels.length) m.set("Etiketsiz", (m.get("Etiketsiz") || 0) + 1);
        for (const l of labels) m.set(l, (m.get(l) || 0) + 1);
      }
      const pairs = [...m.entries()];
      return { kpi: { value: pairs.length, label: "etiket / etap" }, slices: slicesOf(pairs), rows: pairs.sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ title: k, right: n, icon: "tag", open: "todos" })) };
    },
  },
  "todo.summary": {
    path: "/api/todos/summary",
    map: (d) => ({ kpi: { value: num(d?.open), label: "açık iş", sub: `${num(d?.overdue)} gecikmiş · ${num(d?.today)} bugün`, tone: num(d?.overdue) ? "red" : "" }, rows: [{ title: "Açık", right: num(d?.open), icon: "checkSquare", open: "todos" }, { title: "Gecikmiş", right: num(d?.overdue), tone: num(d?.overdue) ? "red" : "", icon: "alert", open: "todos" }, { title: "Bugün", right: num(d?.today), icon: "calendar", open: "todos" }, { title: "Bana atanan", right: num(d?.assignedToMe), icon: "user", open: "todos" }, { title: "Maç görevlerim", right: num(d?.matchDuties), icon: "ball", open: "todos" }], slices: slicesOf([["Gecikmiş", num(d?.overdue)], ["Bugün", num(d?.today)], ["Diğer", Math.max(0, num(d?.open) - num(d?.overdue) - num(d?.today))]]) }),
  },
  "todo.assigned": { path: "/api/todos", query: { view: "mine", status: "active" }, map: (d) => { const l = (d?.items || []).filter((t) => t.assignedBy || t.source === "assigned"); return { kpi: { value: l.length, label: "bana atanan" }, rows: l.map(todoRow) }; } },

  /* ────────────────────────────── ajanda ────────────────────────────── */
  "agenda.today": { path: "/api/tools/events", map: (d) => { const t = isoDay(); const l = eventsOf(d).filter((e) => dayOf(e.start) === t); return { kpi: { value: l.length, label: "bugün etkinlik", sub: l[0] ? `${fmtTime(l[0].start)} ${l[0].title}` : "" }, rows: l.map(eventRow) }; } },
  "agenda.next": { path: "/api/tools/events", map: (d) => { const now = Date.now(); const l = eventsOf(d).filter((e) => new Date(e.start).getTime() >= now - 3600000); const n = l[0]; return { kpi: { value: n ? (dayOf(n.start) === isoDay() ? fmtTime(n.start) : fmtDay(n.start)) : "—", label: n ? n.title : "yaklaşan etkinlik yok", sub: n ? relDay(n.start) : "" }, rows: l.map(eventRow) }; } },
  "agenda.week": { path: "/api/tools/events", map: (d) => { const l = eventsOf(d).filter((e) => { const diff = new Date(e.start) - new Date(`${isoDay()}T00:00:00`); return diff >= 0 && diff < 7 * 86400000; }); return { kpi: { value: l.length, label: "bu hafta" }, rows: l.map(eventRow), days: daysOf(l.map((e) => ({ date: dayOf(e.start), title: e.title, time: e.all_day ? "" : fmtTime(e.start), tone: e.source === "todo" ? "blue" : "" }))) }; } },
  "agenda.matches": { path: "/api/tools/events", map: (d) => { const l = eventsOf(d).filter((e) => e.category === "match" && dayOf(e.start) >= isoDay()); return { kpi: { value: l.length, label: "maç etkinliği" }, rows: l.map(eventRow) }; } },
  "agenda.meetings": { path: "/api/tools/events", map: (d) => { const l = eventsOf(d).filter((e) => e.category === "meeting" && dayOf(e.start) >= isoDay()); return { kpi: { value: l.length, label: "toplantı" }, rows: l.map(eventRow) }; } },
  "agenda.payments": { path: "/api/tools/events", map: (d) => { const l = eventsOf(d).filter((e) => (e.category === "payment" || e.category === "deadline") && dayOf(e.start) >= isoDay()); return { kpi: { value: l.length, label: "ödeme / son gün", tone: l.length ? "amber" : "" }, rows: l.map(eventRow) }; } },
  "agenda.periods": { path: "/api/tools/events", map: (d) => { const l = (d?.project_periods || []).filter((p) => dayOf(p.end || p.end_date || p.occurrence_end) >= isoDay()); return { kpi: { value: l.length, label: "süren dönem" }, rows: l.map((p) => ({ title: p.title || p.name, sub: `${fmtDay(p.start || p.start_date || p.occurrence_start)} – ${fmtDay(p.end || p.end_date || p.occurrence_end)}`, color: p.color, icon: "layers", open: "agenda" })) }; } },

  /* ────────────────────────────── mesajlar / talepler ────────────────────────────── */
  "chat.unread": { path: "/api/chat/conversations", poll: 30000, map: (d) => { const l = (d?.conversations || []).filter((c) => num(c.unread) > 0); return { kpi: { value: num(d?.unread), label: "okunmamış", tone: num(d?.unread) ? "red" : "" }, rows: l.map(chatRow) }; } },
  "chat.groups": { path: "/api/chat/conversations", poll: 60000, map: (d) => { const l = (d?.conversations || []).filter((c) => c.type === "group" || c.is_group || num(c.member_count) > 2); return { kpi: { value: l.length, label: "grup" }, rows: l.map(chatRow) }; } },
  "chat.recent": { path: "/api/chat/conversations", poll: 60000, map: (d) => { const l = d?.conversations || []; return { kpi: { value: l.length, label: "sohbet" }, rows: l.map(chatRow) }; } },
  "req.bytype": {
    bridge: () => window.elitlig.requests.summary(), subscribe: (cb) => window.elitlig.requests.onSummary(cb),
    map: (d) => {
      const cats = (d?.categories || []).filter((c) => num(c.count ?? c.total) > 0);
      return { kpi: { value: num(d?.total), label: "bekleyen talep", tone: num(d?.total) ? "red" : "green" }, slices: slicesOf(cats.map((c) => [c.label || c.key, num(c.count ?? c.total)])), rows: cats.map((c) => ({ title: c.label || c.key, right: num(c.count ?? c.total), icon: "inbox", tone: c.warn || c.urgent ? "red" : "", open: { route: "requests", arg: { category: c.key } } })) };
    },
  },
  "req.warn": {
    bridge: () => window.elitlig.requests.summary(), subscribe: (cb) => window.elitlig.requests.onSummary(cb),
    map: (d) => {
      const cats = (d?.categories || []).filter((c) => num(c.overdue ?? c.warnings ?? c.urgent) > 0 || num(c.oldest_days) >= 3);
      return { kpi: { value: cats.length, label: "dikkat isteyen tür", tone: cats.length ? "amber" : "green", sub: d?.denied ? "yetki yok" : "" }, rows: cats.map((c) => ({ title: c.label || c.key, sub: c.oldest_days ? `en eski ${c.oldest_days} gün` : "", right: num(c.overdue ?? c.warnings ?? c.urgent) || num(c.count), tone: "amber", icon: "alert", open: { route: "requests", arg: { category: c.key } } })) };
    },
  },

  /* ────────────────────────────── ekipman ────────────────────────────── */
  "equip.overdue": { path: "/api/tools/equipment/dashboard", map: (d) => { const l = d?.alerts?.overdue_returns || []; return { kpi: { value: l.length, label: "geciken iade", tone: l.length ? "red" : "green", sub: `${num(d?.totals?.open_assignments)} açık zimmet` }, rows: l.map((x) => ({ title: x.item_name || x.name || x.asset_tag, sub: [x.holder_name || x.holder?.name, x.due_at || x.expected_return ? `iade ${fmtDay(x.due_at || x.expected_return)}` : ""].filter(Boolean).join(" · "), tone: "red", icon: "box", open: "equipment:zimmet" })) }; } },
  "equip.holders": { path: "/api/tools/equipment/dashboard", map: (d) => { const t = d?.totals || {}; return { kpi: { value: num(t.assigned), label: "zimmette", sub: `${num(t.holders)} kişide` }, slices: slicesOf((d?.by_status || []).map((s) => [s.label || s.status || s.key, num(s.count ?? s.units)])), rows: (d?.recent || []).map((r) => ({ title: r.item_name || r.title || r.name, sub: [r.holder_name, fmtDay(r.at || r.createdAt)].filter(Boolean).join(" · "), icon: "user", open: "equipment:zimmet" })) }; } },
  "equip.maint": { path: "/api/tools/equipment/dashboard", map: (d) => { const l = d?.alerts?.maintenance || []; return { kpi: { value: num(d?.totals?.maintenance_due) + num(d?.totals?.maintenance_overdue), label: "bakımı gelen", tone: num(d?.totals?.maintenance_overdue) ? "red" : "" }, rows: l.map((x) => ({ title: x.item_name || x.name || x.title, sub: x.due_date || x.next_due ? `${fmtDay(x.due_date || x.next_due)} · ${relDay(x.due_date || x.next_due)}` : "", tone: dayOf(x.due_date || x.next_due) < isoDay() ? "red" : "", icon: "wrench", open: "equipment:bakim" })) }; } },
  "equip.status": { path: "/api/tools/equipment/dashboard", map: (d) => { const t = d?.totals || {}; const pairs = [["Depoda", num(t.in_stock)], ["Kullanımda", num(t.in_use)], ["Zimmette", num(t.assigned)], ["Bakımda", num(t.maintenance)], ["Arızalı", num(t.broken)], ["Kayıp", num(t.lost)]]; return { kpi: { value: num(t.units || t.items), label: "ekipman" }, slices: slicesOf(pairs), rows: pairs.filter(([, n]) => n).map(([k, n]) => ({ title: k, right: n, icon: "box", open: "equipment" })) }; } },
  "equip.value": { path: "/api/tools/equipment/dashboard", map: (d) => { const t = d?.totals || {}; return { kpi: { value: shortMoney(t.book_value), label: "defter değeri", sub: `alış ${shortMoney(t.purchase_value)}` }, rows: [{ title: "Alış değeri", right: money(t.purchase_value), icon: "wallet" }, { title: "Amortisman", right: money(t.depreciation), icon: "trend" }, { title: "Defter değeri", right: money(t.book_value), icon: "bank" }, { title: "Bu yıl bakım", right: money(t.maintenance_cost_year), icon: "wrench" }], bars: (d?.by_category || []).slice(0, 8).map((c) => ({ label: String(c.label || c.name || c.category || "").slice(0, 10), a: num(c.count ?? c.units) })) }; } },
  "equip.reserve": { path: "/api/tools/equipment/dashboard", map: (d) => { const l = d?.reservations || []; return { kpi: { value: l.length, label: "rezervasyon" }, rows: l.map((r) => ({ title: r.item_name || r.title || r.name, sub: `${fmtDay(r.start_at || r.starts_at || r.from)} · ${r.holder_name || r.user_name || ""}`, icon: "calendar", open: "equipment:rezervasyon" })) }; } },
  "equip.faults": { path: "/api/tools/equipment/dashboard", map: (d) => { const l = [...(d?.alerts?.faults || []), ...(d?.alerts?.low_stock || [])]; return { kpi: { value: num(d?.totals?.open_faults), label: "açık arıza", tone: num(d?.totals?.open_faults) ? "red" : "green", sub: num(d?.totals?.low_stock) ? `${d.totals.low_stock} düşük stok` : "" }, rows: l.map((x) => ({ title: x.item_name || x.name || x.title, sub: x.note || x.description || (x.quantity != null ? `stok ${x.quantity}` : ""), tone: "red", icon: "alert", open: "equipment:bakim" })) }; } },

  /* ────────────────────────────── rehber / notlar ────────────────────────────── */
  "contacts.fav": { path: "/api/tools/contacts", map: (d) => { const l = (d?.items || []).filter((c) => c.favorite); return { kpi: { value: l.length, label: "favori kişi" }, rows: l.map(contactRow) }; } },
  "contacts.bday": {
    path: "/api/tools/contacts",
    map: (d) => {
      const today = new Date(`${isoDay()}T12:00:00`);
      const next = (c) => { const [, mm, dd] = String(c.birthday).split("-").map(Number); let t = new Date(today.getFullYear(), mm - 1, dd, 12); if (t < today) t = new Date(today.getFullYear() + 1, mm - 1, dd, 12); return Math.round((t - today) / 86400000); };
      const l = (d?.items || []).filter((c) => c.birthday).map((c) => ({ c, n: next(c) })).filter((x) => x.n <= 60).sort((a, b) => a.n - b.n);
      return { kpi: { value: l.length ? (l[0].n === 0 ? "Bugün" : `${l[0].n} gün`) : "—", label: l.length ? `${l[0].c.name} doğum günü` : "yaklaşan doğum günü yok" }, rows: l.map(({ c, n }) => ({ ...contactRow(c), sub: `${fmtDay(c.birthday.replace(/^\d{4}/, String(today.getFullYear())))} · ${n === 0 ? "bugün 🎂" : `${n} gün sonra`}`, tone: n === 0 ? "green" : "" })) };
    },
  },
  "contacts.aud": { path: "/api/tools/contacts/audiences", map: (d) => { const l = d?.items || []; return { kpi: { value: l.reduce((s, a) => s + num(a.count), 0), label: "kitlelerde kişi", sub: `${l.length} kitle` }, slices: slicesOf(l.map((a) => [a.name, num(a.count)])), rows: l.map((a) => ({ title: a.name, sub: `${num(a.with_phone)} telefon · ${num(a.with_email)} e-posta`, right: num(a.count), color: a.color, icon: "users", open: "contacts" })) }; } },
  "contacts.count": { path: "/api/tools/contacts", map: (d) => { const l = d?.items || []; const pairs = count(l, (c) => c.company || c.city || null); return { kpi: { value: l.length, label: "kişi", sub: `${l.filter((c) => c.favorite).length} favori` }, slices: slicesOf(pairs), rows: l.slice(0, 50).map(contactRow) }; } },
  "notes.pinned": { path: "/api/tools/notes", map: (d) => { const l = (d?.items || []).filter((n) => n.pinned); return { kpi: { value: l.length, label: "sabit not" }, rows: l.map(noteRow) }; } },
  "notes.lists": { path: "/api/tools/notes", map: (d) => { const l = (d?.items || []).filter((n) => (n.checklist || []).length); const open = l.reduce((s, n) => s + n.checklist.filter((c) => !c.done).length, 0); return { kpi: { value: open, label: "açık madde", sub: `${l.length} liste` }, rows: l.map((n) => ({ ...noteRow(n), right: `${n.checklist.filter((c) => c.done).length}/${n.checklist.length}` })) }; } },
  "notes.tags": { path: "/api/tools/notes", map: (d) => { const m = new Map(); for (const n of d?.items || []) for (const t of n.tags || []) m.set(t, (m.get(t) || 0) + 1); const pairs = [...m.entries()]; return { kpi: { value: pairs.length, label: "etiket", sub: `${(d?.items || []).length} not` }, slices: slicesOf(pairs), rows: pairs.sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ title: `#${t}`, right: n, icon: "tag", open: "notes" })) }; } },

  /* ────────────────────────────── tarayıcı / raf / sistem ────────────────────────────── */
  "browser.bookmarks": { bridge: () => window.elitlig.browser.state(), subscribe: (cb) => window.elitlig.browser.onState(cb), map: (d) => { const l = d?.bookmarks || []; return { kpi: { value: l.length, label: "yer imi" }, rows: l.slice().reverse().map((b) => ({ title: b.title || b.url, sub: hostOf(b.url), icon: "star", open: { spec: `web:${b.url}` } })) }; } },
  "browser.tabs": { bridge: () => window.elitlig.browser.state(), subscribe: (cb) => window.elitlig.browser.onState(cb), map: (d) => { const l = d?.tabs || []; return { kpi: { value: l.length, label: "açık sekme", sub: d?.pip ? "sabitlenmiş video var" : "" }, rows: l.map((t) => ({ title: t.title || t.url, sub: hostOf(t.url), icon: t.pinned ? "pin" : t.audible ? "volume" : "globe", tone: t.id === d.activeId ? "blue" : "", open: { browserTab: t.id } })) }; } },
  "browser.downloads": { bridge: () => window.elitlig.browser.downloads(), subscribe: (cb) => window.elitlig.browser.onDownloads(cb), map: (d) => { const l = (Array.isArray(d) ? d : []).slice().reverse(); return { kpi: { value: l.filter((x) => x.state === "progressing").length || l.length, label: l.some((x) => x.state === "progressing") ? "indiriliyor" : "indirme" }, rows: l.map((x) => ({ title: x.name || x.filename || x.url, sub: [x.state === "completed" ? "tamamlandı" : x.state === "progressing" ? `%${x.total ? Math.round((x.received / x.total) * 100) : 0}` : x.state, hostOf(x.url)].filter(Boolean).join(" · "), icon: "download", tone: x.state === "interrupted" || x.state === "cancelled" ? "red" : "", open: x.path ? { reveal: x.path } : "browser" })) }; } },
  "shelf.shots": { bridge: () => window.elitlig.shelf.list({ kind: "image" }, { limit: 24 }), subscribe: (cb) => window.elitlig.shelf.onChange?.(() => window.elitlig.shelf.list({ kind: "image" }, { limit: 24 }).then(cb)), map: (d) => { const l = d?.items || []; return { kpi: { value: num(d?.counts?.image ?? l.length), label: "görüntü" }, thumbs: l.map((i) => ({ id: i.id, src: i.thumbUrl, title: i.title || i.name || "" })), rows: l.map((i) => ({ title: i.title || i.name || "Ekran görüntüsü", sub: i.createdAt ? new Date(i.createdAt).toLocaleString("tr-TR") : "", icon: "image", open: { shelfCopy: i.id } })) }; } },
  "shelf.clips": { bridge: () => window.elitlig.shelf.list({ kind: "text" }, { limit: 30 }), subscribe: (cb) => window.elitlig.shelf.onChange?.(() => window.elitlig.shelf.list({ kind: "text" }, { limit: 30 }).then(cb)), map: (d) => { const l = d?.items || []; return { kpi: { value: num(d?.counts?.text ?? l.length), label: "kopyalanan metin" }, rows: l.map((i) => ({ title: String(i.text || i.title || "").slice(0, 80), sub: i.copiedAt || i.createdAt ? new Date(i.copiedAt || i.createdAt).toLocaleString("tr-TR") : "", icon: "clipboard", open: { shelfCopy: i.id } })) }; } },
  "shelf.links": { bridge: () => window.elitlig.shelf.list({ kind: "link" }, { limit: 30 }), subscribe: (cb) => window.elitlig.shelf.onChange?.(() => window.elitlig.shelf.list({ kind: "link" }, { limit: 30 }).then(cb)), map: (d) => { const l = d?.items || []; return { kpi: { value: num(d?.counts?.link ?? l.length), label: "bağlantı" }, rows: l.map((i) => ({ title: i.title || i.url || i.text, sub: i.site || hostOf(i.url || i.text), icon: "link", open: i.url || /^https?:/.test(i.text || "") ? { spec: `web:${i.url || i.text}` } : { shelfCopy: i.id } })) }; } },
  "sys.cpu": { bridge: () => window.elitlig.widgets.system(), poll: 3000, map: (d) => ({ kpi: { value: d?.cpu != null ? `%${Math.round(d.cpu)}` : "—", label: "işlemci", sub: d?.model || "", tone: d?.cpu >= 85 ? "red" : d?.cpu >= 60 ? "amber" : "" }, gauge: num(d?.cpu), rows: [{ title: "Çekirdek", right: d?.cores ?? "—", icon: "activity" }, { title: "Yük (1 dk)", right: d?.load != null ? Number(d.load).toFixed(2) : "—", icon: "activity" }] }) },
  "sys.ram": { bridge: () => window.elitlig.widgets.system(), poll: 3000, map: (d) => ({ kpi: { value: d?.memory?.percent != null ? `%${d.memory.percent}` : "—", label: "bellek", sub: d?.memory ? `${gb(num(d.memory.total) - num(d.memory.free))} / ${gb(d.memory.total)}` : "", tone: d?.memory?.percent >= 90 ? "red" : "" }, gauge: num(d?.memory?.percent), rows: [{ title: "Kullanılan", right: gb(num(d?.memory?.total) - num(d?.memory?.free)), icon: "activity" }, { title: "Boş", right: gb(d?.memory?.free), icon: "activity" }] }) },
  "sys.disk": { bridge: () => window.elitlig.widgets.system(), poll: 30000, map: (d) => ({ kpi: { value: d?.disk?.percent != null ? `%${d.disk.percent}` : "—", label: "disk dolu", sub: d?.disk ? `${gb(d.disk.free)} boş` : "", tone: d?.disk?.percent >= 90 ? "red" : "" }, gauge: num(d?.disk?.percent), rows: [{ title: "Toplam", right: gb(d?.disk?.total), icon: "box" }, { title: "Boş", right: gb(d?.disk?.free), icon: "box" }] }) },
  "sys.uptime": { bridge: () => window.elitlig.widgets.system(), poll: 60000, map: (d) => ({ kpi: { value: d?.uptime ? `${Math.floor(d.uptime / 86400)} g ${Math.floor((d.uptime % 86400) / 3600)} sa` : "—", label: "açık kalma", sub: d?.host || "" }, rows: [{ title: "Bilgisayar", right: d?.host || "—", icon: "monitor" }, { title: "Sistem", right: d?.platform === "darwin" ? "macOS" : d?.platform === "win32" ? "Windows" : d?.platform || "—", icon: "monitor" }] }) },
  "net.info": { bridge: () => window.elitlig.netTools.info(), poll: 5 * 60000, map: (d) => { const lan = (d?.interfaces || d?.local || []).find?.((i) => i.family === "IPv4" || i.address) || null; return { kpi: { value: d?.public?.ip || d?.publicIp || d?.ip || lan?.address || "—", label: "IP adresi", sub: d?.public?.org || d?.isp || d?.public?.city || "" }, rows: [...(d?.public?.ip ? [{ title: "Dış IP", right: d.public.ip, icon: "globe" }] : []), ...((d?.interfaces || []).slice(0, 6).map((i) => ({ title: i.name || i.iface || "Ağ", right: i.address, icon: "activity" })))] }; } },
};

/* ────────────────────────────── yardımcılar ────────────────────────────── */
function filterLeague(list, o = {}) {
  const q = String(o.league || "").toLocaleLowerCase("tr-TR").trim();
  return q && !/^\d+$/.test(q) ? list.filter((m) => String(m.league).toLocaleLowerCase("tr-TR").includes(q)) : list;
}
const slugCity = (s) => String(s || "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-");
const matchRow = (m) => ({ title: `${m.home} – ${m.away}`, sub: [m.league, m.field, m.city].filter(Boolean).join(" · "), right: dayOf(m.start) === isoDay() ? fmtTime(m.start) : `${fmtDay(m.start)} ${fmtTime(m.start)}`, icon: "ball", open: m.id ? { spec: `site:/${slugCity(m.city)}/mac/${m.id}` } : "planning" });
const matchTitle = (m) => `${m.first_team_name || m.home || m.home_team?.name || "?"} – ${m.second_team_name || m.away || m.away_team?.name || "?"}`;
function dutyOf(m, key) {
  const raw = m.staff?.[key] ?? m.duties?.[key] ?? (Array.isArray(m.assignments) ? m.assignments.filter((a) => a.duty === key) : null);
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((x) => (typeof x === "string" ? x : x?.name || x?.fullName || x?.user_name || "")).filter(Boolean);
}
const byDue = (a, b) => String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999"));
const todoRow = (t) => ({ title: t.title, sub: [t.project?.name, t.project?.phase?.name, (t.labels || []).map((l) => l.text).join(", ")].filter(Boolean).join(" · ") || t.kindLabel, right: t.dueAt ? relDay(t.dueAt) : "", tone: t.overdue ? "red" : t.priority === "high" || t.priority === "urgent" ? "amber" : "", icon: t.isProjectStep ? "layers" : t.priority === "high" ? "flag" : "circle", open: `todos:${t.id}` });
const eventsOf = (d) => [...(d?.items || []), ...(d?.todos || [])].map((e) => ({ ...e, start: e.occurrence_start || e.start_at })).filter((e) => e.start).sort((a, b) => String(a.start).localeCompare(String(b.start)));
const eventRow = (e) => ({ title: e.title, sub: [e.all_day ? "tüm gün" : fmtTime(e.start), e.location].filter(Boolean).join(" · "), right: dayOf(e.start) === isoDay() ? "bugün" : fmtDay(e.start), icon: e.source === "todo" ? "checkSquare" : e.category === "match" ? "ball" : e.category === "meeting" ? "users" : e.category === "payment" ? "wallet" : "calendar", color: e.color, open: e.source === "todo" ? `todos:${String(e.id).replace(/^todo:/, "")}` : "agenda" });
const chatRow = (c) => ({ title: c.title, sub: String(c.last_message?.body || c.last_message?.text || c.subtitle || "").slice(0, 60), right: num(c.unread) ? String(c.unread) : c.last_message?.created_at ? fmtTime(c.last_message.created_at) : "", tone: num(c.unread) ? "red" : "", icon: c.type === "group" ? "users" : "message", open: { route: "messages", arg: { conversationId: c.id } } });
const contactRow = (c) => ({ title: c.name, sub: [c.company, c.phone].filter(Boolean).join(" · "), icon: c.favorite ? "star" : "user", open: `contacts:${c.id}`, phone: c.phone || null });
const noteRow = (n) => ({ title: n.title || String(n.body || "Not").slice(0, 60), sub: n.checklist?.length ? `${n.checklist.filter((c) => c.done).length}/${n.checklist.length} madde` : String(n.body || "").slice(0, 60), icon: n.pinned ? "pin" : "note", open: `notes:${n.id}` });
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const gb = (b) => (num(b) ? `${(num(b) / 1024 ** 3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} GB` : "—");
/** 7 günlük takvim: bugünden başlayarak. */
export function daysOf(list, now = new Date()) {
  const out = [];
  for (let k = 0; k < 7; k += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 12);
    const key = isoDay(d);
    out.push({ date: key, label: d.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric" }), today: k === 0, items: list.filter((x) => x.date === key) });
  }
  return out;
}
export const sourceOf = (key) => SOURCES[key] || null;
