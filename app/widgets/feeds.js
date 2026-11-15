// Masaüstü widget'ları — ağ verileri (ana süreçte; arayüz ağa doğrudan çıkmaz):
//   hava durumu : Open-Meteo (anahtarsız; şehir adı → koordinat), olmazsa wttr.in (anahtarsız)
//   maçlar      : herkese açık Elitlig API'si /maclar/live ve /maclar/fikstür (oturum gerekmez)
// Ayrıştırma işlevleri saftır (app/test/widgets.test.js).
"use strict";

/* ------------------------------ hava durumu ------------------------------ */

const KIND_LABEL = {
  clear: "Açık", partly: "Parçalı bulutlu", cloudy: "Bulutlu", fog: "Sisli", drizzle: "Çiseleme",
  rain: "Yağmurlu", snow: "Karlı", storm: "Gök gürültülü", unknown: "—",
};

/** WMO hava kodu (Open-Meteo) → tür. */
function wmoKind(code) {
  const c = Number(code);
  if (c === 0) return "clear";
  if (c === 1 || c === 2) return "partly";
  if (c === 3) return "cloudy";
  if (c === 45 || c === 48) return "fog";
  if (c >= 51 && c <= 57) return "drizzle";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  if (c >= 95 && c <= 99) return "storm";
  return "unknown";
}

/** WWO hava kodu (wttr.in) → tür. */
function wwoKind(code) {
  const c = Number(code);
  if (c === 113) return "clear";
  if (c === 116) return "partly";
  if (c === 119 || c === 122) return "cloudy";
  if ([143, 248, 260].includes(c)) return "fog";
  if ([176, 263, 266, 281, 284, 293, 296, 353].includes(c)) return "drizzle";
  if ([299, 302, 305, 308, 311, 314, 356, 359].includes(c)) return "rain";
  if ([200, 386, 389, 392, 395].includes(c)) return "storm";
  if ([179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(c)) return "snow";
  return "unknown";
}

const round = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

/** Open-Meteo forecast yanıtı → ortak biçim. */
function parseOpenMeteo(json, place) {
  const cur = json?.current;
  if (!cur || !Number.isFinite(Number(cur.temperature_2m))) return null;
  const d = json.daily || {};
  const days = (d.time || []).slice(0, 3).map((date, i) => ({ date, max: round(d.temperature_2m_max?.[i]), min: round(d.temperature_2m_min?.[i]), kind: wmoKind(d.weather_code?.[i]) }));
  const kind = wmoKind(cur.weather_code);
  return { place, temp: round(cur.temperature_2m), kind, text: KIND_LABEL[kind], humidity: round(cur.relative_humidity_2m), wind: round(cur.wind_speed_10m), isDay: cur.is_day !== 0, days, source: "Open-Meteo" };
}

/** wttr.in ?format=j1 yanıtı → ortak biçim. */
function parseWttr(json, fallbackPlace) {
  const cur = json?.current_condition?.[0];
  if (!cur || !Number.isFinite(Number(cur.temp_C))) return null;
  const kind = wwoKind(cur.weatherCode);
  const days = (json.weather || []).slice(0, 3).map((w) => ({ date: w.date, max: round(w.maxtempC), min: round(w.mintempC), kind: wwoKind(w.hourly?.[4]?.weatherCode ?? w.hourly?.[0]?.weatherCode) }));
  const area = json.nearest_area?.[0]?.areaName?.[0]?.value;
  return { place: fallbackPlace || area || "", temp: round(cur.temp_C), kind, text: cur.lang_tr?.[0]?.value || KIND_LABEL[kind], humidity: round(cur.humidity), wind: round(cur.windspeedKmph), isDay: true, days, source: "wttr.in" };
}

/* ------------------------------ maçlar ------------------------------ */

const MATCH_FIELDS = "first_team_name,second_team_name,first_team_score,second_team_score,date,time,match_field,league_name,city,mac_durumu";

/** "2026-11-09T00:00:00.000Z" + "20:30:00" → yerel tarih/saat (maç günü tarihin ilk 10 hanesidir). */
function matchStart(row) {
  const day = String(row?.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [hh = 0, mm = 0] = String(row.time || "").split(":").map(Number);
  const t = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * Canlı + fikstür satırları → widget listesi. Geçmişte kalmış (2 saatten eski) fikstür atılır;
 * şehir verilirse (büyük/küçük harf duyarsız, Türkçe) yalnız o şehir.
 */
function parseMatches(live, fixtures, { now = Date.now(), city = "", limit = 8 } = {}) {
  const norm = (s) => String(s || "").toLocaleLowerCase("tr-TR").trim();
  const c = norm(city);
  const keep = (r) => !c || norm(r.city) === c;
  const map = (r, isLive) => {
    const start = matchStart(r);
    return {
      id: Number(r.id) || null,
      home: String(r.first_team_name || "").slice(0, 40),
      away: String(r.second_team_name || "").slice(0, 40),
      homeScore: isLive ? Number(r.first_team_score) || 0 : null,
      awayScore: isLive ? Number(r.second_team_score) || 0 : null,
      start: start ? start.toISOString() : null,
      field: String(r.match_field || "").slice(0, 60),
      league: String(r.league_name || "").slice(0, 60),
      city: String(r.city || "").slice(0, 40),
      live: isLive,
    };
  };
  const liveRows = (Array.isArray(live) ? live : []).filter(keep).map((r) => map(r, true));
  const upcoming = (Array.isArray(fixtures) ? fixtures : [])
    .filter(keep)
    .map((r) => map(r, false))
    .filter((m) => m.start && new Date(m.start).getTime() >= now - 2 * 3600000)
    .sort((a, b) => a.start.localeCompare(b.start));
  return { live: liveRows.slice(0, limit), upcoming: upcoming.slice(0, limit) };
}

const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ------------------------------ canlı maç / puan durumu ------------------------------ */

/** /maclar/:id satırı → izlenen maç. Durum: canli | bitti (oynandı) | fikstur. */
function parseMatchRow(row, now = Date.now()) {
  if (!row || typeof row !== "object" || !row.id) return null;
  const start = matchStart(row);
  const raw = String(row.mac_durumu || "").toLocaleLowerCase("tr-TR");
  const played = row.is_it_fixture === false || row.is_it_fixture === 0 || ["bitti", "tamamlandi", "tamamlandı", "oynandi", "oynandı"].includes(raw);
  const state = raw === "canli" || raw === "canlı" ? "live" : played ? "done" : "fixture";
  const score = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    id: Number(row.id),
    home: String(row.first_team_name || "").trim().slice(0, 40),
    away: String(row.second_team_name || "").trim().slice(0, 40),
    homeScore: state === "fixture" ? null : score(row.first_team_score) ?? 0,
    awayScore: state === "fixture" ? null : score(row.second_team_score) ?? 0,
    state,
    start: start ? start.toISOString() : null,
    startsIn: start ? Math.round((start.getTime() - now) / 60000) : null,
    league: String(row.league_name || "").slice(0, 60),
    field: String(row.match_field || "").slice(0, 60),
    city: String(row.city || "").slice(0, 40),
  };
}

/** Ligler (arşivlenmemiş), şehir ve ada göre. */
function parseLeagues(list) {
  return (Array.isArray(list) ? list : [])
    .filter((l) => l && l.id && !l.is_archived)
    .map((l) => ({ id: Number(l.id), name: String(l.league_name || "").trim().slice(0, 80), city: String(l.city || "").slice(0, 40), priority: Number(l.league_priority) || 0 }))
    .sort((a, b) => a.city.localeCompare(b.city, "tr") || a.priority - b.priority || a.name.localeCompare(b.name, "tr"));
}

/** Ligin güncel sezonu: arşivlenmemiş, en küçük season_priority (1 = güncel), eşitse en yeni yıl. */
function currentSeason(seasons, leagueId) {
  const list = (Array.isArray(seasons) ? seasons : []).filter((s) => Number(s.league_id) === Number(leagueId) && !s.is_archived);
  list.sort((a, b) => (Number(a.season_priority) || 999) - (Number(b.season_priority) || 999) || String(b.season_year || "").localeCompare(String(a.season_year || "")) || Number(b.id) - Number(a.id));
  const s = list[0];
  return s ? { id: Number(s.id), name: String(s.season_name || "").slice(0, 80), type: s.standings_type || null } : null;
}

/** Puan durumu satırları → sıralı tablo (puan, averaj, atılan gol). */
function parseStandings(rows, { limit = 40 } = {}) {
  const pts = (r) => Number(r.display_points ?? r.total_points ?? 0) || 0;
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.team_name)
    .sort((a, b) => pts(b) - pts(a) || (Number(b.goal_diff) || 0) - (Number(a.goal_diff) || 0) || (Number(b.goals_for) || 0) - (Number(a.goals_for) || 0) || String(a.team_name).localeCompare(String(b.team_name), "tr"))
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, team: String(r.team_name).trim().slice(0, 40), teamId: Number(r.team_id) || null, played: Number(r.played) || 0, won: Number(r.wins) || 0, drawn: Number(r.draws) || 0, lost: Number(r.losses) || 0, gd: Number(r.goal_diff) || 0, points: pts(r), last5: String(r.last5 || "").slice(-5) }));
}

/* ------------------------------ getirici ------------------------------ */

/**
 * deps: { net, publicOrigin }. Sonuçlar önbelleklenir (hava 20 dk, maçlar 2 dk); ağ yoksa
 * son başarılı yanıt "stale" işaretiyle döner.
 */
function createFeeds({ net, publicOrigin }) {
  const cache = new Map();
  const getJson = async (url, ms = 9000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await net.fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  };
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return { ok: true, ...hit.data };
    try {
      const data = await fn();
      cache.set(key, { at: Date.now(), data });
      return { ok: true, ...data };
    } catch (e) {
      if (hit) return { ok: true, ...hit.data, stale: true };
      return { ok: false, error: String(e?.message || e || "Veri alınamadı.") };
    }
  };

  async function weather(cityInput) {
    const city = String(cityInput || "Ankara").trim().slice(0, 60) || "Ankara";
    return cached(`w:${city.toLocaleLowerCase("tr-TR")}`, 20 * 60000, async () => {
      // 1) Open-Meteo: şehir → koordinat → tahmin.
      try {
        const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`);
        const g = geo?.results?.[0];
        if (g) {
          const fc = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${Number(g.latitude)}&longitude=${Number(g.longitude)}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`);
          const parsed = parseOpenMeteo(fc, g.name || city);
          if (parsed) return parsed;
        }
      } catch { /* yedek kaynağa geç */ }
      // 2) wttr.in (Open-Meteo günlük sınırı ya da erişim sorunu).
      const parsed = parseWttr(await getJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=tr`, 12000), city);
      if (!parsed) throw new Error("Hava durumu alınamadı.");
      return parsed;
    });
  }

  async function matches({ city = "" } = {}) {
    const now = Date.now();
    return cached(`m:${city}`, 2 * 60000, async () => {
      const q = `fields=${MATCH_FIELDS}`;
      const [live, fixtures] = await Promise.all([
        getJson(`${publicOrigin}/maclar/live?${q}&limit=30`).catch(() => []),
        getJson(`${publicOrigin}/maclar/fixtures?${q}&limit=200&date_from=${isoDay(now)}&date_to=${isoDay(now + 10 * 86400000)}`),
      ]);
      if (!Array.isArray(fixtures)) throw new Error("Fikstür alınamadı.");
      return { ...parseMatches(live, fixtures, { now, city }), fetchedAt: now };
    });
  }

  /** İzlenen maç (canlıyken 30 sn önbellek). */
  async function match(id) {
    const mid = Number(id);
    if (!Number.isInteger(mid) || mid <= 0) return { ok: false, error: "Maç seçilmedi." };
    return cached(`match:${mid}`, 25000, async () => {
      const row = await getJson(`${publicOrigin}/maclar/${mid}`);
      const m = parseMatchRow(row?.match || row);
      if (!m) throw new Error("Maç bulunamadı.");
      return { match: m, fetchedAt: Date.now() };
    });
  }

  /** Ligler ve sezonlar (6 saat önbellek). */
  async function leagues() {
    return cached("leagues", 6 * 3600000, async () => {
      const [ls, ss] = await Promise.all([getJson(`${publicOrigin}/ligler`), getJson(`${publicOrigin}/sezonlar`)]);
      const list = parseLeagues(ls).map((l) => ({ ...l, season: currentSeason(ss, l.id) })).filter((l) => l.season);
      return { leagues: list };
    });
  }

  /** Puan durumu: sezon verilmezse ligin güncel sezonu (5 dk önbellek). */
  async function standings({ leagueId = 0, seasonId = 0 } = {}) {
    let sid = Number(seasonId) || 0;
    let season = null;
    let league = null;
    if (leagueId) {
      const l = await leagues();
      const found = l.ok ? (l.leagues || []).find((x) => x.id === Number(leagueId)) : null;
      if (found) { league = { id: found.id, name: found.name, city: found.city }; season = found.season || null; }
      if (!sid) sid = season?.id || 0;
    }
    if (!sid) return { ok: false, error: "Lig seçin." };
    return cached(`st:${sid}`, 5 * 60000, async () => {
      const j = await getJson(`${publicOrigin}/puan-durumu?seasonId=${sid}`, 15000);
      return { seasonId: sid, season, league, rows: parseStandings(j?.standings), fetchedAt: Date.now() };
    });
  }

  return { weather, matches, match, leagues, standings };
}

module.exports = { createFeeds, parseOpenMeteo, parseWttr, parseMatches, matchStart, parseMatchRow, parseLeagues, currentSeason, parseStandings, wmoKind, wwoKind, KIND_LABEL };
