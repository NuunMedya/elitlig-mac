// Lig ve organizasyon araçlarının saf mantığı: fikstür (round-robin), eleme ağacı, puan
// durumu, kura / rastgele seçim, dengeli takım bölme, ödeme bölüştürme, kadro listesi, oylama.
// Hepsi yerel; arayüzden bağımsız test edilir (renderer/test/toolkit-league.test.js).

const TR = "tr-TR";

/** Satırlara böl: virgül, noktalı virgül ya da yeni satır; boşları ve tekrarları at. */
export function parseNames(text, { unique = true } = {}) {
  const out = String(text || "").split(/[\n,;]+/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!unique) return out;
  const seen = new Set();
  return out.filter((n) => { const k = n.toLocaleLowerCase(TR); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Tohumlu rastgele (mulberry32): aynı tohum → aynı kura (tekrar üretilebilir). */
export function rng(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const BYE = "BAY";

/**
 * Round-robin fikstür (çember / Berger yöntemi). Tek sayıda takımda her hafta bir takım BAY geçer.
 * Ev sahipliği dengelenir (ilk takım haftalara göre dönüşümlü). double: rövanşlı ikinci devre (ev/deplasman ters).
 * → [{ round, matches: [{ home, away }] , bye }]
 */
export function roundRobin(teams, { double = false } = {}) {
  const list = [...teams];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const fixed = list[0];
  let rot = list.slice(1);
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) {
    const cur = [fixed, ...rot];
    const matches = [];
    let bye = null;
    for (let i = 0; i < n / 2; i += 1) {
      let home = cur[i];
      let away = cur[n - 1 - i];
      // İlk eşleşmede (sabit takım) ev sahipliği haftaya göre değişir; diğerlerinde i'ye göre.
      if ((i === 0 && r % 2 === 1) || (i > 0 && i % 2 === 1)) [home, away] = [away, home];
      if (home == null || away == null) { bye = home ?? away; continue; }
      matches.push({ home, away });
    }
    rounds.push({ round: r + 1, matches, bye });
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  if (double) {
    const second = rounds.map((rd, i) => ({ round: rounds.length + i + 1, matches: rd.matches.map((m) => ({ home: m.away, away: m.home })), bye: rd.bye }));
    return [...rounds, ...second];
  }
  return rounds;
}

/** Fikstürü tablo satırlarına çevir (dışa aktarım): [["Hafta","Ev sahibi","Deplasman"], …]. */
export function fixtureRows(rounds, { dates = null } = {}) {
  const rows = [["Hafta", ...(dates ? ["Tarih"] : []), "Ev sahibi", "Deplasman"]];
  rounds.forEach((rd, i) => {
    rd.matches.forEach((m) => rows.push([`${rd.round}. hafta`, ...(dates ? [dates[i] || ""] : []), m.home, m.away]));
    if (rd.bye) rows.push([`${rd.round}. hafta`, ...(dates ? [dates[i] || ""] : []), rd.bye, BYE]);
  });
  return rows;
}

/** Haftalara tarih ata: başlangıç (YYYY-MM-DD) + gün aralığı. */
export function roundDates(start, count, everyDays = 7) {
  const m = String(start || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * everyDays);
    return d.toLocaleDateString(TR, { day: "2-digit", month: "2-digit", year: "numeric" });
  });
}

/* ------------------------------- eleme ağacı ------------------------------- */

/** Standart seribaşı yerleşimi (1–16, 8–9 …): n = 2'nin kuvveti. */
export function seedOrder(n) {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
}

/**
 * Eleme ağacı. teams sırası seribaşı sırasıdır (seeded) ya da olduğu gibi eşleşir.
 * BAY'lar en üst seribaşlarına verilir; BAY'lı maçların galibi kendiliğinden bir üst tura geçer.
 * → { size, rounds: [[{ a, b, winner }]] } (a/b: takım adı | null = BAY | undefined = bekleniyor)
 */
export function buildBracket(teams, { seeded = true } = {}) {
  const list = teams.filter(Boolean);
  if (list.length < 2) return { size: 0, rounds: [] };
  let size = 2;
  while (size < list.length) size *= 2;
  const slots = seeded ? seedOrder(size).map((s) => list[s - 1] ?? null) : [...list, ...Array(size - list.length).fill(null)];
  // Sırasız kipte BAY'ları sona yığmak yerine çiftlere dağıt (iki BAY aynı maça düşmesin).
  if (!seeded) {
    const byes = size - list.length;
    const pairs = Array.from({ length: size / 2 }, (_, i) => [list[i] ?? null, null]);
    let k = size / 2;
    for (let i = 0; i < size / 2; i += 1) if (i >= byes && k < list.length) { pairs[i][1] = list[k]; k += 1; }
    slots.splice(0, slots.length, ...pairs.flat());
  }
  const first = [];
  for (let i = 0; i < size; i += 2) first.push({ a: slots[i], b: slots[i + 1], winner: undefined });
  const rounds = [first];
  let cur = first;
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push({ a: undefined, b: undefined, winner: undefined });
    rounds.push(next);
    cur = next;
  }
  return propagate({ size, rounds });
}

/** BAY geçişlerini ve seçilmiş galipleri üst turlara taşı (saf; yeni nesne döner). */
export function propagate(bracket) {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })));
  for (let r = 0; r < rounds.length; r += 1) {
    rounds[r].forEach((m, i) => {
      if (r > 0) {
        const fa = rounds[r - 1][i * 2];
        const fb = rounds[r - 1][i * 2 + 1];
        m.a = fa.winner;
        m.b = fb.winner;
        if (m.winner !== undefined && m.winner !== m.a && m.winner !== m.b) m.winner = undefined;
      }
      if (m.a === null && m.b === null) m.winner = null;
      else if (m.a === null && m.b !== undefined) m.winner = m.b;
      else if (m.b === null && m.a !== undefined) m.winner = m.a;
    });
  }
  return { ...bracket, rounds };
}

/** Bir maçın galibini seç (aynı takıma tekrar tıklanınca seçim kalkar). */
export function pickWinner(bracket, roundIndex, matchIndex, team) {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })));
  const m = rounds[roundIndex]?.[matchIndex];
  if (!m || team == null || (team !== m.a && team !== m.b)) return bracket;
  m.winner = m.winner === team ? undefined : team;
  return propagate({ ...bracket, rounds });
}

export function roundName(index, total) {
  const left = total - index;
  if (left === 1) return "Final";
  if (left === 2) return "Yarı final";
  if (left === 3) return "Çeyrek final";
  return `${2 ** left}'li tur`;
}

/* ------------------------------- puan durumu ------------------------------- */

/**
 * Sonuç satırı: "Ev 2-1 Deplasman", "Ev 2 - 1 Deplasman", "Ev 2:1 Deplasman" ya da sekmeyle ayrık
 * "Ev<TAB>2<TAB>1<TAB>Deplasman". Okunamayan satırlar errors'a girer.
 */
export function parseResults(text) {
  const results = [];
  const errors = [];
  String(text || "").split("\n").forEach((line, i) => {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) return;
    let m = raw.match(/^(.+?)\s+(\d{1,3})\s*[-–:]\s*(\d{1,3})\s+(.+)$/);
    if (!m) { const t = raw.split(/\t|;/).map((s) => s.trim()); if (t.length === 4 && /^\d+$/.test(t[1]) && /^\d+$/.test(t[2])) m = [raw, t[0], t[1], t[2], t[3]]; }
    if (!m) { errors.push({ line: i + 1, text: raw }); return; }
    results.push({ home: m[1].trim(), hg: Number(m[2]), ag: Number(m[3]), away: m[4].trim() });
  });
  return { results, errors };
}

/**
 * Puan durumu. Sıralama: puan, averaj, atılan gol, (ikili) aralarındaki maç puanı, ad.
 * points: { win, draw, loss }.
 */
export function standings(results, { teams = [], points = { win: 3, draw: 1, loss: 0 }, h2h = true } = {}) {
  const table = new Map();
  const key = (n) => n.toLocaleLowerCase(TR);
  const row = (name) => {
    const k = key(name);
    if (!table.has(k)) table.set(k, { team: name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] });
    return table.get(k);
  };
  teams.forEach(row);
  for (const r of results) {
    const h = row(r.home);
    const a = row(r.away);
    h.played += 1; a.played += 1;
    h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
    if (r.hg > r.ag) { h.won += 1; a.lost += 1; h.pts += points.win; a.pts += points.loss; h.form.push("G"); a.form.push("M"); }
    else if (r.hg < r.ag) { a.won += 1; h.lost += 1; a.pts += points.win; h.pts += points.loss; a.form.push("G"); h.form.push("M"); }
    else { h.drawn += 1; a.drawn += 1; h.pts += points.draw; a.pts += points.draw; h.form.push("B"); a.form.push("B"); }
  }
  const rows = [...table.values()].map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }));
  const h2hPts = (x, y) => {
    let p = 0;
    for (const r of results) {
      if (key(r.home) === key(x.team) && key(r.away) === key(y.team)) p += r.hg > r.ag ? 1 : r.hg < r.ag ? -1 : 0;
      if (key(r.away) === key(x.team) && key(r.home) === key(y.team)) p += r.ag > r.hg ? 1 : r.ag < r.hg ? -1 : 0;
    }
    return p;
  };
  rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (h2h ? h2hPts(y, x) : 0) || x.team.localeCompare(y.team, TR));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function standingsRows(rows) {
  return [["Sıra", "Takım", "O", "G", "B", "M", "AG", "YG", "AV", "P"], ...rows.map((r) => [r.rank, r.team, r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd, r.pts])];
}

/* ------------------------------- kura / seçici ------------------------------- */

/** n kişi seç (tekrarsız). */
export function pickRandom(names, n = 1, rand = Math.random) {
  return shuffle(names, rand).slice(0, Math.max(0, Math.min(names.length, n)));
}

/** Gruplara kura (torba): sırayla dağıtır, gruplar en fazla 1 farkla eşit. */
export function drawGroups(names, groupCount, rand = Math.random) {
  const k = Math.max(1, Math.min(names.length || 1, Math.floor(groupCount) || 1));
  const groups = Array.from({ length: k }, () => []);
  shuffle(names, rand).forEach((n, i) => groups[i % k].push(n));
  return groups;
}

/** "Ad 7" / "Ad;7" / "Ad, 7" → { name, rating } (puansız: 5). */
export function parsePlayers(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[\s,;:\t]+(\d+(?:[.,]\d+)?)$/);
    return m ? { name: m[1].trim(), rating: Number(m[2].replace(",", ".")) } : { name: l, rating: 5 };
  });
}

/**
 * Dengeli takımlar: güçlüden zayıfa sırala, her oyuncuyu toplam gücü (sonra kişi sayısı) en düşük
 * takıma ver (açgözlü). Eşit güçtekiler karıştırılır, böylece her basışta farklı ama dengeli dağılım.
 */
export function balanceTeams(players, teamCount = 2, rand = Math.random) {
  const k = Math.max(2, Math.floor(teamCount) || 2);
  const teams = Array.from({ length: k }, (_, i) => ({ name: `Takım ${i + 1}`, players: [], total: 0 }));
  const sorted = shuffle(players, rand).sort((a, b) => b.rating - a.rating);
  for (const p of sorted) {
    const t = [...teams].sort((a, b) => a.players.length - b.players.length || a.total - b.total)[0];
    const lightest = teams.filter((x) => x.players.length === t.players.length).sort((a, b) => a.total - b.total)[0];
    lightest.players.push(p);
    lightest.total = Math.round((lightest.total + p.rating) * 100) / 100;
  }
  return teams;
}

/* ------------------------------- ödeme bölüştürme ------------------------------- */

/**
 * Toplamı ağırlıklara göre böl (ör. hakem maç sayısı, oyuncu katılımı). Kuruş farkı en büyük
 * paylardan dağıtılır; toplam her zaman tam tutar. round: 0.01 (kuruş) ya da 1, 5, 10 TL'ye yuvarlama
 * (yuvarlamada artan/eksik "fark" olarak gösterilir).
 */
export function splitByWeight(total, rows, { round = 0.01 } = {}) {
  const T = Number(total) || 0;
  const items = rows.filter((r) => r && r.name && Number(r.weight) > 0).map((r) => ({ name: r.name, weight: Number(r.weight) }));
  const W = items.reduce((s, r) => s + r.weight, 0);
  if (!W || !T) return { items: items.map((r) => ({ ...r, share: 0 })), sum: 0, diff: T, perUnit: 0 };
  if (round === 0.01) {
    const cents = Math.round(T * 100);
    const raw = items.map((r) => (cents * r.weight) / W);
    const base = raw.map(Math.floor);
    let left = cents - base.reduce((s, x) => s + x, 0);
    const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
    for (let j = 0; left > 0; j = (j + 1) % order.length, left -= 1) base[order[j][1]] += 1;
    const out = items.map((r, i) => ({ ...r, share: base[i] / 100 }));
    return { items: out, sum: T, diff: 0, perUnit: Math.round((T / W) * 100) / 100 };
  }
  const out = items.map((r) => ({ ...r, share: Math.round(((T * r.weight) / W) / round) * round }));
  const sum = out.reduce((s, r) => s + r.share, 0);
  return { items: out, sum, diff: Math.round((T - sum) * 100) / 100, perUnit: Math.round((T / W) * 100) / 100 };
}

/** Kişi başı maliyet: toplam / kişi, yukarı yuvarlamalı (toplanan ve artan). */
export function perPerson(total, people, roundUpTo = 1) {
  const T = Number(total) || 0;
  const n = Math.max(0, Math.floor(Number(people) || 0));
  if (!n) return null;
  const exact = T / n;
  const step = Number(roundUpTo) || 0;
  const each = step > 0 ? Math.ceil(exact / step - 1e-9) * step : Math.round(exact * 100) / 100;
  return { exact: Math.round(exact * 100) / 100, each, collected: Math.round(each * n * 100) / 100, surplus: Math.round((each * n - T) * 100) / 100 };
}

/* ------------------------------- kadro listesi ------------------------------- */

/**
 * "10 Ahmet Yılmaz", "Ahmet Yılmaz 10", "10 - Ahmet Yılmaz (K)", "Ahmet Yılmaz; 10; Kaleci" → kayıtlar.
 * → { players: [{ no, name, role, captain }], duplicates: [no], missing: [name] }
 */
export function parseRoster(text) {
  const players = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    let s = l;
    const captain = /\((k|c|kaptan)\)|\bkaptan\b/i.test(s);
    s = s.replace(/\((k|c|kaptan)\)/ig, "").replace(/\bkaptan\b/ig, "").trim();
    let role = "";
    const parts = s.split(/[;\t|]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 3) { role = parts.slice(2).join(" "); s = `${parts[0]} ${parts[1]}`; }
    let no = null;
    let m = s.match(/^#?(\d{1,3})[\s.\-–)]+(.+)$/);
    if (m) { no = Number(m[1]); s = m[2]; } else if ((m = s.match(/^(.+?)[\s\-–#]+(\d{1,3})$/))) { no = Number(m[2]); s = m[1]; }
    return { no, name: titleTr(s.replace(/\s+/g, " ").trim()), role, captain };
  });
  const counts = new Map();
  players.forEach((p) => p.no != null && counts.set(p.no, (counts.get(p.no) || 0) + 1));
  return {
    players,
    duplicates: [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n).sort((a, b) => a - b),
    missing: players.filter((p) => p.no == null).map((p) => p.name),
  };
}
function titleTr(s) {
  return s.split(" ").map((w) => (w ? w[0].toLocaleUpperCase(TR) + w.slice(1).toLocaleLowerCase(TR) : w)).join(" ");
}

export const ROSTER_FORMATS = [
  { key: "list", label: "10 · Ahmet Yılmaz (K)" },
  { key: "upper", label: "10 AHMET YILMAZ" },
  { key: "short", label: "10 A. Yılmaz" },
  { key: "surname", label: "YILMAZ Ahmet 10" },
];

export function formatRoster(players, { format = "list", sort = "no" } = {}) {
  const list = [...players];
  if (sort === "no") list.sort((a, b) => (a.no ?? 999) - (b.no ?? 999) || a.name.localeCompare(b.name, TR));
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, TR));
  return list.map((p) => {
    const no = p.no != null ? String(p.no) : "–";
    const parts = p.name.split(" ");
    const last = parts.length > 1 ? parts[parts.length - 1] : p.name;
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
    const cap = p.captain ? " (K)" : "";
    const role = p.role ? ` — ${p.role}` : "";
    if (format === "upper") return `${no} ${p.name.toLocaleUpperCase(TR)}${cap}${role}`;
    if (format === "short") return `${no} ${first ? `${first[0]}. ` : ""}${last}${cap}${role}`;
    if (format === "surname") return `${last.toLocaleUpperCase(TR)}${first ? ` ${first}` : ""} ${no}${cap}${role}`;
    return `${no} · ${p.name}${cap}${role}`;
  }).join("\n");
}

/* ------------------------------- oylama ------------------------------- */

export function tally(options) {
  const total = options.reduce((s, o) => s + (Number(o.votes) || 0), 0);
  const max = Math.max(0, ...options.map((o) => Number(o.votes) || 0));
  return {
    total,
    rows: options.map((o) => ({ ...o, pct: total ? Math.round(((Number(o.votes) || 0) / total) * 1000) / 10 : 0, leader: max > 0 && Number(o.votes) === max })),
  };
}
