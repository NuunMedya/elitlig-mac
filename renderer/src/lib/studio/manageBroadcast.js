// Yayın Stüdyosu · Maç yönetimi — yayın grafikleri (saf işlevler).
//
//   PUT /api/maclar/:id/overlay-status   { status }   web skorboard kaplamasının modu (overlay_status)
//   PUT /api/maclar/:id/led-status       { status }   LED ekran içeriği (led_overlay_status)
//   GET/PUT /api/maclar/:id/broadcast-state           sponsor yayını, köşe rozeti, altyazı,
//        röportaj, LED sponsoru — PUT kısmi yama: { onAir } | { corner } | { subtitle } | { interview } | { led }
//   POST /api/maclar/:id/broadcast-state/ai-headlines { count, tone } → { headlines, source }
//   PATCH /maclar/:id   post_macin_enleri / post_enler / match_mvp   (LED "Maçın enleri", "Maçın oyuncusu")
//
// Kaynak: web editor_pages/MatchLiveStep.js (BROADCAST_CONTENT_ITEMS, LED_CONTENT_ITEMS,
// OVERLAY_LINKS), editor_pages/broadcast/BroadcastDesk.js, live/broadcastState.js,
// sunucu constants/overlayModes.js ve services/broadcastState.js.

/** Web skorboard kaplaması modları (sunucu OVERLAY_STATUSES ile birebir). */
export const OVERLAY_MODES = [
  { key: "scoreboard", label: "Skorboard", hint: "Sol üst klasik skor çubuğu", group: "score" },
  { key: "scoreboardv2", label: "Skorboard V2", hint: "Minimal, üst orta premium", group: "score" },
  { key: "bottomboard", label: "Orta-alt skorboard", hint: "Küçük, gol listeli alt bar", group: "score" },
  { key: "pre_match", label: "Maç öncesi", hint: "Klasik tanıtım kartı", group: "pre" },
  { key: "prematchv2", label: "Maç öncesi V2", hint: "Şeffaf, estetik logolar", group: "pre" },
  { key: "lineups", label: "Kadrolar", hint: "Taktik tahta", group: "pre" },
  { key: "lineupsv2", label: "Kadrolar V2", hint: "Tek tek oyuncu kartları", group: "pre" },
  { key: "lineupsv3", label: "Kadrolar V3", hint: "Saha dizilişi + yedek paneli", group: "pre" },
  { key: "halftime", label: "Devre arası", hint: "İlk yarı özeti", group: "break" },
  { key: "post_match", label: "Maç sonu", hint: "Maç sonucu özeti", group: "break" },
  { key: "interview", label: "Röportaj", hint: "Ortalı skor + röportaj bandı", group: "break" },
];

export const OVERLAY_GROUPS = [
  { key: "score", title: "Skorboard çeşitleri" },
  { key: "pre", title: "Maç öncesi ve kadrolar" },
  { key: "break", title: "Ara, maç sonu, röportaj" },
];

/** LED ekran içerikleri (sunucu LED_STATUSES ile birebir). */
export const LED_MODES = [
  { key: "scoreboard", label: "LED skorboard", hint: "Skor, süre ve maç özeti" },
  { key: "scoreboardv2", label: "LED skorboard V2", hint: "Maç fotoğrafı zeminli, dinamik" },
  { key: "pre_match", label: "Maç öncesi", hint: "İki takım logosu ve detay" },
  { key: "players", label: "Oyuncu tanıtımı", hint: "Sağlı sollu tek tek oyuncular" },
  { key: "lineup_home", label: "Diziliş · ev", hint: "Ev sahibi saha dizilişi" },
  { key: "lineup_away", label: "Diziliş · deplasman", hint: "Deplasman saha dizilişi" },
  { key: "highlights", label: "Maçın enleri", hint: "Beşli en iyi listesi" },
  { key: "mvp", label: "Maçın oyuncusu", hint: "MVP tam ekran" },
  { key: "kare_as", label: "Maçın kare ası", hint: "Kaleci, defans, orta saha, forvet" },
  { key: "interview", label: "Röportaj arka planı", hint: "Markalı röportaj duvarı" },
  { key: "var", label: "VAR görseli", hint: "VAR tanıtım ekranı" },
  { key: "var_check", label: "VAR kontrolü", hint: "İnceleme sürüyor animasyonu" },
  { key: "halftime", label: "Devre arası", hint: "Devre arası skoru" },
  { key: "post_match", label: "Maç sonucu", hint: "Maç sonu skoru ve olaylar" },
  { key: "sponsor", label: "Marka / sponsor", hint: "Elit Lig marka ekranı ya da seçili LED sponsoru" },
];

const OVERLAY_KEYS = new Set(OVERLAY_MODES.map((m) => m.key));
const LED_KEYS = new Set(LED_MODES.map((m) => m.key));
const RETIRED_OVERLAY = new Set(["scoreboardtable", "matchstats", "standings"]);

/** Maç kaydındaki skorboard modu (kaldırılan modlar kaplamada skorboarda düşer). */
export function currentOverlayMode(match) {
  const raw = String(match?.overlay_status ?? match?.overlay_mode ?? "").trim().toLowerCase();
  if (OVERLAY_KEYS.has(raw)) return raw;
  if (RETIRED_OVERLAY.has(raw)) return "scoreboard";
  return raw ? null : "scoreboard";
}

export function currentLedMode(match) {
  const raw = String(match?.led_overlay_status ?? match?.led_status ?? "").trim().toLowerCase();
  return LED_KEYS.has(raw) ? raw : "scoreboard";
}

export const overlayModeBody = (key) => {
  if (!OVERLAY_KEYS.has(key)) throw new Error(`Bilinmeyen skorboard modu: ${key}`);
  return { status: key };
};
export const ledModeBody = (key) => {
  if (!LED_KEYS.has(key)) throw new Error(`Bilinmeyen LED içeriği: ${key}`);
  return { status: key };
};

/** OBS / vMix tarayıcı kaynağı ve LED ekran adresleri (web App.js rotaları). */
export function overlayLinks(matchId, origin = "https://elitlig.com") {
  const id = Number(matchId);
  if (!id) return [];
  const base = String(origin).replace(/\/+$/, "");
  return [
    { key: "skor", label: "Skorboard", url: `${base}/skorboard/canli/${id}`, hint: "OBS / vMix tarayıcı kaynağı (1920×1080)" },
    { key: "skor-q", label: "Skorboard (eski adres)", url: `${base}/skoroverlay?match=${id}`, hint: "Eski OBS sahneleri için" },
    { key: "led", label: "LED ekran", url: `${base}/led/${id}`, hint: "Sahadaki ekran" },
    { key: "altyazi", label: "Altyazı", url: `${base}/altyazi/${id}`, hint: "Alt bant haber şeridi" },
  ];
}

/* ------------------------------ yayın durumu ------------------------------ */

export const ON_AIR_SLOTS = [
  { key: "lower_third", label: "Alt bant" },
  { key: "pre_match", label: "Maç öncesi" },
  { key: "halftime", label: "Devre arası" },
  { key: "post_match", label: "Maç sonu" },
  { key: "fullscreen", label: "Tam ekran" },
];

export const SECOND_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
export const ROTATE_MINUTE_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

export const DURATION_CHOICES = [
  { value: "default", label: "Sponsor ayarı" },
  ...SECOND_STEPS.map((sec) => ({ value: String(sec), label: sec === 60 ? "1 dk" : `${sec} sn` })),
  { value: "0", label: "Süresiz" },
];

export const SUBTITLE_SECTIONS = [
  { key: "custom", label: "Girilen manşetler", hint: "Rejiden yazdığın manşetler" },
  { key: "ai", label: "Yapay zekâ manşetleri", hint: "Lig verisinden üretilen başlıklar" },
  { key: "news", label: "Site haberleri", hint: "Yayınlanan haberlerin başlıkları" },
  { key: "headlines", label: "Canlı skorlar ve sonuçlar", hint: "Ligdeki canlı ve biten maçlar" },
  { key: "fixtures", label: "Maç programı", hint: "Yaklaşan maçlar" },
  { key: "scorers", label: "Gol krallığı", hint: "İlk 3 golcü" },
  { key: "assists", label: "Asist krallığı", hint: "İlk 3 asist" },
  { key: "standings", label: "Puan durumu", hint: "İlk 10 takım" },
];

export const SUBTITLE_SPEEDS = [
  { key: "slow", label: "Yavaş" },
  { key: "normal", label: "Normal" },
  { key: "fast", label: "Hızlı" },
];

export const AI_TONES = [
  { value: "", label: "Dengeli" },
  { value: "heyecanlı, coşkulu spiker dili", label: "Heyecanlı" },
  { value: "resmî ve sade haber dili", label: "Resmî" },
  { value: "esprili ve samimi", label: "Esprili" },
  { value: "istatistik ağırlıklı", label: "İstatistik odaklı" },
];

export const MAX_CUSTOM_HEADLINES = 20;
export const MAX_AI_HEADLINES = 12;
export const MAX_INTERVIEW_PEOPLE = 4;

export const INTERVIEW_VARIANTS = [
  { key: "classic", label: "Klasik", hint: "Skor kartı + geniş röportaj bandı" },
  { key: "slim", label: "İnce bant", hint: "Tek satır, alt ortada ince şerit" },
  { key: "side", label: "Yan panel", hint: "Sol altta dikey liste" },
  { key: "stack", label: "Merkez vitrin", hint: "Büyük isimler, ortalı kart" },
  { key: "vertical", label: "Dikey güvenli", hint: "9:16 kırpmada da tamamı görünür" },
];
export const INTERVIEW_TITLES = ["RÖPORTAJ", "MAÇ ÖNCESİ RÖPORTAJ", "DEVRE ARASI RÖPORTAJ", "MAÇ SONU RÖPORTAJI"];

export const DEFAULT_SUBTITLE = Object.freeze({
  mode: "ticker",
  sponsorId: null,
  sections: { custom: true, ai: true, news: true, headlines: true, fixtures: true, scorers: true, assists: false, standings: true },
  message: "",
  customHeadlines: [],
  aiHeadlines: [],
  speed: "normal",
  showClock: true,
  showLeague: true,
  rotateSponsor: false,
  rotateEveryMin: 15,
  sponsorSeconds: 15,
});

/** GET/PUT /broadcast-state yanıtı → { state, sponsors, onAirEndsAt } (eksik alanlar varsayılanla). */
export function normalizeDesk(res, now = Date.now()) {
  const src = res?.state && typeof res.state === "object" ? res.state : {};
  const subtitle = {
    ...DEFAULT_SUBTITLE,
    ...(src.subtitle || {}),
    sections: { ...DEFAULT_SUBTITLE.sections, ...(src.subtitle?.sections || {}) },
    customHeadlines: Array.isArray(src.subtitle?.customHeadlines) ? src.subtitle.customHeadlines : [],
    aiHeadlines: Array.isArray(src.subtitle?.aiHeadlines) ? src.subtitle.aiHeadlines : [],
  };
  const interview = {
    title: src.interview?.title || "RÖPORTAJ",
    variant: src.interview?.variant || "classic",
    sponsorId: src.interview?.sponsorId ?? null,
    people: Array.isArray(src.interview?.people) ? src.interview.people : [],
  };
  const onAir = src.onAir && src.onAir.sponsorId ? src.onAir : null;
  const remaining = res?.onAirRemainingMs;
  return {
    state: {
      seq: Number(src.seq) || 0,
      onAir,
      corner: { sponsorId: src.corner?.sponsorId ?? null },
      subtitle,
      interview,
      led: { sponsorId: src.led?.sponsorId ?? null },
    },
    sponsors: Array.isArray(res?.sponsors) ? res.sponsors : [],
    // Süresiz yayında (durationSec 0) sunucu kalan süre döndürmez.
    onAirEndsAt: onAir && Number(onAir.durationSec) > 0 && remaining != null ? now + Math.max(0, Number(remaining) || 0) : null,
  };
}

export const sponsorHas = (sponsor, placementKey) => Boolean(sponsor && Array.isArray(sponsor.placements) && sponsor.placements.includes(placementKey));

/** "Ekrana ver" yaması; süre "default" ise sponsorun kendi süresi. */
export function onAirPatch(sponsor, slotKey, duration = "default") {
  const durationSec = duration === "default" ? Number(sponsor?.displaySeconds) || 0 : Math.max(0, Number(duration) || 0);
  return { onAir: { sponsorId: Number(sponsor.id), slot: slotKey, durationSec } };
}

/** Liste işlemleri (manşetler, röportaj konukları). */
export function moveItem(list, index, dir) {
  const target = index + dir;
  if (!Array.isArray(list) || index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export const removeAt = (list, index) => (list || []).filter((_, i) => i !== index);
export const editAt = (list, index, patch) => (list || []).map((item, i) => (i === index ? { ...item, ...patch } : item));

/** Yeni manşet: etiket büyük harf, en çok 14 / 160 karakter. */
export function headlineItem(tag, text) {
  const t = String(text || "").trim().slice(0, 160);
  if (!t) return null;
  return { tag: String(tag || "").trim().toLocaleUpperCase("tr-TR").slice(0, 14), text: t };
}

export function addHeadlinePatch(subtitle, tag, text) {
  const item = headlineItem(tag, text);
  const list = subtitle?.customHeadlines || [];
  if (!item || list.length >= MAX_CUSTOM_HEADLINES) return null;
  return { subtitle: { customHeadlines: [...list, item], sections: { custom: true } } };
}

/** Yapay zekâ manşetleri: "replace" ya da "append" (en çok 12). */
export function aiHeadlinesPatch(current, incoming, mode = "replace") {
  const list = Array.isArray(incoming) ? incoming.filter((h) => h && h.text) : [];
  const next = mode === "append" ? [...(current || []), ...list].slice(0, MAX_AI_HEADLINES) : list.slice(0, MAX_AI_HEADLINES);
  return { subtitle: { aiHeadlines: next, sections: { ai: true } } };
}

/** Röportaj konuğu (kadrodan ya da elle). */
export function interviewPerson({ playerId = null, name, side = "home", teamName = "", role = "", image = "" }) {
  const n = String(name || "").trim().slice(0, 80);
  if (!n) return null;
  return {
    playerId: Number(playerId) || null,
    name: n,
    side: ["home", "away", "other"].includes(side) ? side : "other",
    teamName: String(teamName || "").trim().slice(0, 80),
    role: String(role || "").trim().slice(0, 60),
    image: String(image || ""),
  };
}

/** { interview } yaması (en çok 4 kişi). */
export function interviewPatch({ title, variant, sponsorId, people }) {
  return {
    interview: {
      title: String(title || "").trim() || "RÖPORTAJ",
      variant: INTERVIEW_VARIANTS.some((v) => v.key === variant) ? variant : "classic",
      sponsorId: Number(sponsorId) || null,
      people: (people || []).slice(0, MAX_INTERVIEW_PEOPLE).map(({ key, ...rest }) => rest), // eslint-disable-line no-unused-vars
    },
  };
}

/* ------------------------------ maçın enleri ------------------------------ */

export const HIGHLIGHT_FIELDS = [
  { key: "best_player", label: "Maçın oyuncusu (MVP)" },
  { key: "best_goalkeeper", label: "Maçın kalecisi" },
  { key: "best_defender", label: "Maçın defansı" },
  { key: "best_midfielder", label: "Maçın orta sahası" },
  { key: "best_forward", label: "Maçın forveti" },
  { key: "best_goal", label: "Maçın golü" },
  { key: "best_save", label: "Maçın kurtarışı" },
];

const parseJson = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * "Anın ödülleri" (maçın golü / kurtarışı) olaydan ve tekrar klibinden seçilir.
 * Kayıt biçimi (geriye uyumlu): düz alanlar her zaman yazılır
 *   best_goal_id, best_goal_name                (web / mobil / sunucu okur)
 * ve olay seçildiyse best_goal NESNE olur:
 *   best_goal: { id, name, player_id, player_name, event_id, minute, period,
 *                team_id, code, clip_url, poster_url }
 * Olay seçilmediyse best_goal eskisi gibi oyuncu adıdır (dizgi).
 */
export const MOMENT_KEYS = ["best_goal", "best_save"];

const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim());
const toPosInt = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };
const toMin = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; };

/** Ödül nesnesi / dizgisinden oyuncu kimliği ve adı. */
const rawAward = (raw, key) => {
  const v = raw[key];
  const obj = v && typeof v === "object" ? v : null;
  const id = raw[`${key}_id`] != null && raw[`${key}_id`] !== "" ? String(raw[`${key}_id`]) : obj?.id != null && obj.id !== "" ? String(obj.id) : obj?.player_id != null ? String(obj.player_id) : "";
  const name = String(raw[`${key}_name`] ?? (obj ? obj.name ?? obj.player_name ?? "" : v ?? "")).trim();
  return { id, name, obj };
};

/** Kayıtlı ödüller → { best_player: "12" }; eski kayıtlarda ad kadrodan çözülür. */
export function readHighlights(match, players = []) {
  const raw = parseJson(match?.post_macin_enleri ?? match?.post_enler);
  const out = {};
  for (const { key } of HIGHLIGHT_FIELDS) {
    const { id: savedId, name } = rawAward(raw, key);
    let id = savedId;
    if (!id) {
      const found = name ? players.find((p) => String(p.name).trim() === name) : null;
      if (found) id = String(found.id);
    }
    out[key] = id;
  }
  return out;
}

/** Normalize bir an: { event_id, minute, period, team_id, code, clip_url, poster_url, player_id } | null. */
export function normalizeMoment(m) {
  if (!m || typeof m !== "object") return null;
  const eventId = toPosInt(m.event_id ?? m.eventId);
  if (!eventId) return null;
  return {
    event_id: eventId,
    minute: toMin(m.minute),
    period: toPosInt(m.period),
    team_id: toPosInt(m.team_id ?? m.teamId),
    code: m.code ? String(m.code).toUpperCase() : null,
    clip_url: isHttp(m.clip_url ?? m.clipUrl) ? String(m.clip_url ?? m.clipUrl).trim() : null,
    poster_url: isHttp(m.poster_url ?? m.posterUrl) ? String(m.poster_url ?? m.posterUrl).trim() : null,
    player_id: toPosInt(m.player_id ?? m.playerId),
  };
}

/** Kayıtlı anlar: { best_goal: moment | null, best_save: moment | null }. */
export function readMoments(match) {
  const raw = parseJson(match?.post_macin_enleri ?? match?.post_enler);
  const out = {};
  for (const key of MOMENT_KEYS) out[key] = normalizeMoment(raw[key] && typeof raw[key] === "object" ? raw[key] : null);
  return out;
}

/**
 * post_macin_enleri nesnesi. Her ödül için `${key}_id`, `${key}_name`, key
 * (eskisi gibi ad) yazılır; an seçilmiş ödülde key nesneye dönüşür. An
 * başka oyuncuya aitse (ödül sonradan değiştirildiyse) atılır.
 */
export function awardsJson(highlights, nameOf, moments = null) {
  const award = {};
  for (const { key } of HIGHLIGHT_FIELDS) {
    const id = highlights?.[key] ? String(highlights[key]) : "";
    let name = id ? nameOf?.(id) || "" : "";
    award[`${key}_id`] = id;
    const m = MOMENT_KEYS.includes(key) ? normalizeMoment(moments?.[key]) : null;
    const usable = m && (!m.player_id || String(m.player_id) === id);
    if (usable) {
      // Oyuncusuz an (ör. oyuncusu girilmemiş gol): ad boş kalmasın (web adı düz alandan okur).
      if (!name) name = m.minute != null ? `${m.minute}' ${key === "best_save" ? "kurtarış" : "gol"}` : key === "best_save" ? "Maçın kurtarışı" : "Maçın golü";
      award[`${key}_name`] = name;
      award[key] = { ...m, id, name, player_id: id ? Number(id) || id : null, player_name: name };
    } else {
      award[`${key}_name`] = name;
      award[key] = name;
    }
  }
  return award;
}

/** PATCH /maclar/:id — yalnız ödül alanları (maç sonu içeriğine dokunmaz). moments: kayıtlı anlar korunur. */
export function highlightsPayload(highlights, nameOf, moments = null) {
  const json = JSON.stringify(awardsJson(highlights, nameOf, moments));
  const mvp = Number(highlights?.best_player);
  return { post_macin_enleri: json, post_enler: json, match_mvp: Number.isFinite(mvp) && mvp > 0 ? mvp : null };
}

/** Anın türüne göre olay kodu uyuyor mu: goal → GOAL_* (kendi kalesine hariç), save → SAVE. */
export const momentCodeMatches = (kind, code) => {
  const c = String(code || "").toUpperCase();
  return kind === "save" ? c === "SAVE" : c.startsWith("GOAL_") && c !== "GOAL_OWN";
};

/** Tekrar / sunucu klibinden oynatılabilir adres + kapak. */
function clipFor(ev, replays, clips) {
  const id = Number(ev.id);
  const rp = (replays || []).find((r) => Number(r?.eventId) === id);
  const angle = rp ? (rp.angles || []).find((a) => a?.url) || (rp.angles || [])[0] : null;
  const sc = (clips || []).find((c) => Number(c?.event_id) === id)
    || (clips || []).find((c) => c?.event_id == null && ev.oyuncu_id && Number(c?.player_id) === Number(ev.oyuncu_id) && Number(c?.minute) === Number(ev.dakika));
  return {
    replayId: rp?.id ?? null,
    replay: rp || null,
    localUrl: angle?.url || null,
    localPoster: angle?.posterUrl || null,
    serverUrl: sc?.url || null,
    serverPoster: sc?.poster_url || null,
  };
}

/**
 * Maçın golü / kurtarışı için aday anlar (olaylardan; kronolojik).
 * replays: useReplays [{ id, eventId, angles:[{ url, posterUrl }] }],
 * clips: GET /api/goal-clips?match_id= items. Her aday:
 *   { eventId, code, minute, period, side, teamId, playerId, playerName,
 *     playUrl, posterUrl, clipUrl (sunucu, kalıcı), posterSaveUrl, replay }
 */
export function momentCandidates(events, { kind = "goal", homeTeamId, awayTeamId, nameOf = () => null, replays = [], clips = [] } = {}) {
  return [...(events || [])]
    .filter((ev) => ev && ev.id != null && momentCodeMatches(kind, ev.olay_kodu))
    .sort((a, b) => (Number(a.devre) || 1) - (Number(b.devre) || 1) || (Number(a.dakika) || 0) - (Number(b.dakika) || 0) || Number(a.id) - Number(b.id))
    .map((ev) => {
      const tid = Number(ev.takim_id) || null;
      const side = tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : null;
      const c = clipFor(ev, replays, clips);
      const playerId = ev.oyuncu_id != null && Number(ev.oyuncu_id) > 0 ? String(ev.oyuncu_id) : "";
      return {
        eventId: Number(ev.id),
        code: String(ev.olay_kodu).toUpperCase(),
        minute: Number(ev.dakika) || 0,
        period: Number(ev.devre) || 1,
        side,
        teamId: tid,
        playerId,
        playerName: (playerId && nameOf(playerId)) || "",
        playUrl: c.serverUrl || c.localUrl,
        posterUrl: c.serverPoster || c.localPoster,
        clipUrl: isHttp(c.serverUrl) ? c.serverUrl : isHttp(c.localUrl) ? c.localUrl : null,
        posterSaveUrl: isHttp(c.serverPoster) ? c.serverPoster : isHttp(c.localPoster) ? c.localPoster : null,
        replay: c.replay,
        hasClip: Boolean(c.serverUrl || c.localUrl),
      };
    });
}

/** Aday → kaydedilecek an. */
export function momentFromCandidate(c) {
  if (!c) return null;
  return normalizeMoment({ event_id: c.eventId, minute: c.minute, period: c.period, team_id: c.teamId, code: c.code, clip_url: c.clipUrl, poster_url: c.posterSaveUrl, player_id: c.playerId || null });
}

/** Kalan süre metni: 75000 → "1:15", 9000 → "9 sn". */
export function formatLeft(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s} sn`;
}

/** GET /api/staff/matches/:id → röportaj için görevliler: [{ id, name, role }]. */
export function staffPeople(data) {
  return Object.values(data?.assignments || {})
    .filter((a) => a && a.fullName)
    .map((a) => ({ id: String(a.staffId ?? a.fullName), name: String(a.fullName).trim(), role: String(a.dutyLabel || a.duty || "").trim() }));
}
