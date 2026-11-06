// Yayın grafikleri · ÇİZİM ANLIK GÖRÜNTÜSÜ (snapshot) — saf.
//
// drawGraphics'in ihtiyaç duyduğu her şey tek düz nesnede: skor, saat
// (taban + çalışıyor mu; kare anında `now` ile ilerletilir), takım adları /
// armaları (adres; görsel önbelleği images.js), olay bandı, golcüler, kadrolar,
// altyazı blokları, röportaj bandı, marka ve seçili çeşit.
import { scorerLines, teamShortCode, periodLabel, clockText } from "../scorebug";
import { resolveBranding } from "./branding";
import { buildTickerBlocks } from "./ticker";
import { normalizeVariant } from "./variants";
import { normalizeVisibility } from "./visibility";

export const GOAL_DETAIL = {
  GOAL_RIGHT_FOOT: "SAĞ AYAK", GOAL_LEFT_FOOT: "SOL AYAK", GOAL_LONG_RIGHT: "UZAKTAN", GOAL_LONG_LEFT: "UZAKTAN",
  GOAL_PENALTY: "PENALTI", GOAL_FREEKICK: "FRİKİK", GOAL_HEADER: "KAFA", GOAL_OWN: "KENDİ KALESİNE",
};

const pick = (...values) => values.find((v) => v != null && String(v).trim() !== "" && String(v) !== "null");

/** Web getLineGroup: mevki metninden saha hattı. */
export function lineGroup(position) {
  const p = String(position || "").toLocaleLowerCase("tr-TR");
  if (p.includes("kale") || p.includes("goalkeeper") || p === "gk") return "gk";
  if (p.includes("def") || p.includes("stoper") || p.includes("bek") || p.includes("back")) return "def";
  if (p.includes("orta") || p.includes("mid") || p.includes("kanat") || p.includes("wing")) return "mid";
  if (p.includes("for") || p.includes("striker") || p.includes("santrafor") || p.includes("forward") || p === "fw") return "fwd";
  return "mid";
}

/** Kadro satırları (toSquad) → yayın satırları. */
export function lineupRows(squad) {
  return (squad || []).map((p) => ({ id: String(p.id), name: p.name, number: p.number || "", position: p.position || "", group: lineGroup(p.position), role: p.role, image: p.image || "", captain: Boolean(p.captain) }));
}

/** Diziliş: "4-3-3" (savunma-orta-forvet, yalnız ilk 11). */
export function formationOf(rows) {
  const starters = (rows || []).filter((r) => r.role === "starter");
  const n = (g) => starters.filter((r) => r.group === g).length;
  return [n("def"), n("mid"), n("fwd")].filter(Boolean).join("-");
}

/** Devre arası / maç sonu zaman çizelgesi satırları (gol, kart, değişiklik). */
export function timelineRows(events, { homeTeamId, awayTeamId, nameOf = () => null } = {}) {
  const out = [];
  for (const ev of events || []) {
    const code = String(ev.olay_kodu || "").toUpperCase();
    let kind = null;
    let type = "OLAY";
    let who = nameOf(ev.oyuncu_id) || "";
    if (code.includes("GOAL")) { kind = "goal"; type = GOAL_DETAIL[code] ? `GOL · ${GOAL_DETAIL[code]}` : "GOL"; }
    else if (code.includes("RED")) { kind = "red"; type = "KIRMIZI KART"; }
    else if (code.includes("YELLOW")) { kind = "yellow"; type = "SARI KART"; }
    else if (code.includes("SUB")) {
      kind = "sub"; type = "OYUNCU DEĞİŞİKLİĞİ";
      const inn = nameOf(ev.oyuncu_giren_id);
      const outn = nameOf(ev.oyuncu_cikan_id);
      who = [inn && `▲ ${inn}`, outn && `▼ ${outn}`].filter(Boolean).join("  ") || "Oyuncu değişikliği";
    }
    if (!kind) continue;
    const tid = Number(ev.takim_id);
    const side = tid && tid === Number(awayTeamId) ? "away" : tid && tid === Number(homeTeamId) ? "home" : "home";
    out.push({ id: ev.id, side, minute: Number(ev.dakika) || 0, kind, type, who: who || "—" });
  }
  return out;
}

/** Röportaj skor kartındaki durum (web interviewStatus). */
export function interviewStatusText({ finished, running, period, clockMs }) {
  if (finished) return "MAÇ SONU";
  if (running) return `${periodLabel(period)} · ${clockText(clockMs)}`;
  if ((Number(period) || 1) <= 1) return clockText(clockMs) === "00:00" ? "MAÇ ÖNCESİ" : "DEVRE ARASI";
  return periodLabel(period);
}

function formatDate(raw) {
  if (!raw) return "";
  const d = new Date(String(raw).length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}
const formatTime = (raw) => {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

/** Desk sponsoru → çizim sponsoru. */
export function drawSponsor(s) {
  if (!s) return null;
  return { id: s.id, name: s.name || "", logo: s.images?.logo || s.images?.corner || s.logo || "", lowerThird: s.images?.lower_third || "", brandColor: s.brandColor || s.brand_color || null, tagline: s.tagline || "" };
}

/** Saatin kare anındaki değeri. */
export function snapshotClockMs(clock, now = Date.now()) {
  if (!clock) return 0;
  const base = Number(clock.baseMs) || 0;
  if (!clock.running || !clock.at) return base;
  return base + Math.max(0, now - clock.at);
}

/**
 * live: useLiveMatch() çıktısı (ya da aynı biçimde sahte veri).
 * opts: { branding, defaultLogo, variant, variantSince, subtitle, interview, sponsors, now }
 *   subtitle  { onAir, settings, epoch }   settings = broadcast-state subtitle
 *   interview { onAir, style, title, people, sponsorId, since }
 */
export function buildGraphicsSnapshot(live, opts = {}) {
  const now = opts.now ?? Date.now();
  const m = live?.match || {};
  const brand = resolveBranding(opts.branding, { defaultLogo: opts.defaultLogo || null });
  const timer = live?.timer || null;
  const at = timer?.base_at ? new Date(timer.base_at).getTime() : null;
  const clock = timer
    ? { baseMs: Number(timer.base_ms) || 0, at: Number.isFinite(at) ? at : null, running: Boolean(timer.running) }
    : { baseMs: Number(live?.clockMs) || 0, at: null, running: false };
  const running = Boolean(live?.running ?? clock.running);
  const finished = live?.status === "yayinlanmis" && !running;
  const homeName = live?.homeName || m.first_team_name || "Ev sahibi";
  const awayName = live?.awayName || m.second_team_name || "Deplasman";
  const ctx = { homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf: live?.nameOf || (() => null) };
  const league = pick(m.league_name, m.lig_adi, m.league?.name, m.leagueName) || "";
  const season = pick(m.season_name, m.match_season, m.sezon_adi, m.season?.name) || "";
  const score = live?.score || { home: Number(m.first_team_score) || 0, away: Number(m.second_team_score) || 0 };
  const scorers = scorerLines(live?.events || [], ctx);
  const sponsors = opts.sponsors || [];
  const sponsorById = (id) => drawSponsor(sponsors.find((s) => Number(s.id) === Number(id)));

  const sub = opts.subtitle || {};
  const settings = sub.settings || {};
  const clockMsNow = snapshotClockMs(clock, now);
  const statusText = interviewStatusText({ finished, running, period: live?.period, clockMs: clockMsNow });

  const iv = opts.interview || {};
  return {
    v: 1,
    // Sahne bazlı görünürlük (maç başına): drawGraphics(ctx, { sceneId }, snap) süzer.
    visibility: normalizeVisibility(opts.visibility),
    variant: normalizeVariant(opts.variant),
    variantSince: opts.variantSince || 0,
    branding: brand,
    match: {
      id: Number(m.id) || null,
      homeName, awayName,
      homeCode: teamShortCode(homeName), awayCode: teamShortCode(awayName),
      homeScore: Number(score.home) || 0, awayScore: Number(score.away) || 0,
      clock, period: Number(live?.period) || 1, running, finished, status: live?.status || null,
      league, season,
      leagueLine: [league, season].filter(Boolean).join(" · ") || brand.brandName,
      field: pick(m.match_field, m.field_name, m.stadium_name) || "Saha",
      date: formatDate(pick(m.date, m.match_date)),
      time: formatTime(pick(m.time, m.match_time)),
      statusText,
    },
    logos: { home: live?.logos?.home || null, away: live?.logos?.away || null },
    event: live?.bannerEvent || null,
    scorers,
    timeline: timelineRows(live?.events || [], ctx),
    lineups: { home: lineupRows(live?.squads?.home), away: lineupRows(live?.squads?.away) },
    subtitle: {
      onAir: Boolean(sub.onAir),
      blocks: buildTickerBlocks({
        subtitle: settings,
        match: { homeCode: teamShortCode(homeName), awayCode: teamShortCode(awayName), homeName, awayName, homeScore: Number(score.home) || 0, awayScore: Number(score.away) || 0, live: live?.status === "canli", statusText: live?.status === "canli" ? statusText : finished ? "MAÇ SONU" : "" },
        scorers,
      }),
      speed: settings.speed || "normal",
      showClock: settings.showClock !== false,
      showLeague: settings.showLeague !== false,
      leagueText: [league, season].filter(Boolean).join(" · "),
      mode: settings.mode || "ticker",
      rotate: Boolean(settings.rotateSponsor),
      everyMin: settings.rotateEveryMin || 15,
      seconds: settings.sponsorSeconds || 15,
      sponsor: settings.sponsorId ? sponsorById(settings.sponsorId) : null,
      epoch: sub.epoch || 0,
    },
    interview: {
      onAir: Boolean(iv.onAir),
      style: iv.style || "classic",
      title: String(iv.title || "RÖPORTAJ"),
      people: (iv.people || []).slice(0, 4).map((p) => ({
        name: String(p.name || ""),
        role: String(p.role || ""),
        side: p.side === "home" || p.side === "away" ? p.side : "other",
        team: p.teamName || p.team || (p.side === "home" ? homeName : p.side === "away" ? awayName : ""),
        image: p.image || "",
      })),
      sponsor: iv.sponsorId ? sponsorById(iv.sponsorId) : null,
      since: iv.since || 0,
    },
  };
}

/** Snapshot'taki tüm görsel adresleri (önceden yükleme için). */
export function snapshotImageUrls(snap) {
  if (!snap) return [];
  const out = [snap.branding?.logoUrl, snap.logos?.home, snap.logos?.away, snap.subtitle?.sponsor?.logo, snap.subtitle?.sponsor?.lowerThird, snap.interview?.sponsor?.logo];
  (snap.interview?.people || []).forEach((p) => out.push(p.image));
  if (String(snap.variant || "").startsWith("lineups")) [...(snap.lineups?.home || []), ...(snap.lineups?.away || [])].forEach((r) => out.push(r.image));
  return out.filter((u) => typeof u === "string" && u);
}
