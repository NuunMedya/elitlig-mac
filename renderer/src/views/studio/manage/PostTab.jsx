// Maç yönetimi · MAÇ SONU (web MatchPostStep + mobil PostStep):
//   Özet         skor, golcüler, kartlar, değişiklik sayısı + "Maçı yayınla / sonuçlandır"
//   Puanlar      iki takımın oyuncuları 1–10 (PATCH /api/maclar/:id/kadro/puan)
//   Enler        MVP ve mevki ödülleri (puan + gollerden öneri); maçın golü /
//                kurtarışı OLAYLARDAN ve tekrar / gol klibi kapaklarından seçilir
//                (props replays: useReplays listesi; GET /api/goal-clips?match_id=)
//   İçerik       manşet, rapor, kapak görseli, canlı yayın, röportaj, foto
//                (PATCH /maclar/:id buildPostPayload)
//   İstatistik   oyuncu maç istatistikleri (StatsPanel)
//
// PARÇALAR (part): "summary" (skor + yayınla) · "ratings" (puanlar) · "awards" (MVP ve
// oyuncu ödülleri) · "goal" (maçın golü seçici) · "save" (maçın kurtarışı) · "content" ·
// "stats". Taslaklar (puanlar, enler, içerik) maç başına ORTAK durumdadır (./manageStore):
// bir parçada seçilen MVP öbür parçadaki "Enleri kaydet" ile birlikte kaydedilir.
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Modal, useConfirm, useToast } from "../../../components/ui";
import {
  POST_HIGHLIGHT_FIELDS, buildPostPayload, highlightSuggestions, postSummary, ratingsPayload, ratingsSummary, readPostContent, readSavedRatings,
} from "../../../lib/studio/manage";
import { MOMENT_KEYS, momentCandidates, momentFromCandidate, normalizeMoment, readHighlights, readMoments } from "../../../lib/studio/manageBroadcast";
import { normalizeMatchStatus } from "../../../lib/studio/match";
import { pickAndUploadImage } from "../graphics/graphicsApi";
import * as api from "./manageApi";
import MomentPicker from "./MomentPicker";
import { PlayerSelect } from "./pickers";
import RatingsPanel from "./RatingsPanel";
import StatsPanel from "./StatsPanel";
import { useSharedDraft } from "./manageStore";
import { useLoad, useRun } from "./useManage";

const TABS = [
  { key: "ratings", label: "Puanlar", icon: "star" },
  { key: "awards", label: "Maçın enleri", icon: "award" },
  { key: "content", label: "İçerik", icon: "note" },
  { key: "stats", label: "İstatistik", icon: "activity" },
];

const CONTENT_FIELDS = [
  { key: "title", label: "Manşet", max: 160 },
  { key: "liveLink", label: "Canlı yayın / video bağlantısı", max: 500 },
  { key: "photos", label: "Fotoğraf albümü bağlantısı", max: 1000 },
];

function SideSummary({ name, goals, cards, right }) {
  return (
    <div className={`pt-side${right ? " is-right" : ""}`}>
      <b>{name}</b>
      {goals.map((g, i) => <small key={`g${i}`}>⚽ {g.name}{g.own ? " (k.k.)" : ""} {g.minute ?? ""}'</small>)}
      {cards.map((c, i) => <small key={`c${i}`} className={c.red ? "is-red" : "is-yellow"}>▮ {c.name} {c.minute ?? ""}'</small>)}
    </div>
  );
}

const POST_TAB = "elitlig.studio.postTab";
const PLAYER_AWARDS = POST_HIGHLIGHT_FIELDS.filter((f) => !MOMENT_KEYS.includes(f.key));
const MOMENT_AWARDS = [
  { key: "best_goal", kind: "goal", title: "Maçın golü", icon: "ball" },
  { key: "best_save", kind: "save", title: "Maçın kurtarışı", icon: "shield" },
];

export const POST_PARTS = ["summary", "ratings", "awards", "goal", "save", "content", "stats"];

export default function PostTab({ matchId, match, live, replays = [], onPlayReplay, part = null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run, busy } = useRun();
  const [tab, setTab] = useState(() => { try { const v = localStorage.getItem(POST_TAB); return TABS.some((t) => t.key === v) ? v : "ratings"; } catch { return "ratings"; } });
  useEffect(() => { try { localStorage.setItem(POST_TAB, tab); } catch { /* yoksay */ } }, [tab]);
  const players = useMemo(() => [...(live?.squads?.home || []), ...(live?.squads?.away || [])], [live?.squads]);
  const nameOf = (id) => players.find((p) => p.id === String(id))?.name || "";
  const finished = normalizeMatchStatus(match?.mac_durumu) === "yayinlanmis";
  const summary = useMemo(() => postSummary(live?.events, { homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf: live?.nameOf }), [live?.events, live?.homeTeamId, live?.awayTeamId, live?.nameOf]);

  /* ---------------- puanlar ---------------- */
  const savedRatings = useMemo(() => readSavedRatings(live?.lineup), [live?.lineup]);
  const [ratings, setRatings] = useSharedDraft(`macsonu.${matchId}.ratings`, savedRatings);
  const rSummary = ratingsSummary(players, ratings, savedRatings);
  const saveRatings = async () => {
    const body = ratingsPayload(players, ratings);
    if (!body) { toast("Kaydedilecek puan yok.", { tone: "warn" }); return; }
    const ok = await run(() => api.saveRatings(matchId, body), { ok: (d) => `Puanlar kaydedildi${d?.updated != null ? ` (${d.updated} oyuncu)` : ""}.`, fail: "Puanlar kaydedilemedi." });
    if (ok) live?.refreshLineup?.();
  };

  /* ---------------- içerik + enler ---------------- */
  const savedContent = useMemo(() => readPostContent(match), [match]);
  const savedHighlights = useMemo(() => readHighlights(match, players), [match, players]);
  const savedMoments = useMemo(() => readMoments(match), [match]);
  const [content, setContent] = useSharedDraft(`macsonu.${matchId}.content`, savedContent);
  const [highlights, setHighlights] = useSharedDraft(`macsonu.${matchId}.highlights`, savedHighlights);
  const [moments, setMoments] = useSharedDraft(`macsonu.${matchId}.moments`, savedMoments);
  const contentDirty = JSON.stringify(content) !== JSON.stringify(savedContent)
    || POST_HIGHLIGHT_FIELDS.some(({ key }) => (highlights[key] || "") !== (savedHighlights[key] || ""))
    || MOMENT_KEYS.some((k) => JSON.stringify(normalizeMoment(moments[k])) !== JSON.stringify(savedMoments[k]));
  const suggestions = useMemo(() => highlightSuggestions(players, ratings, live?.events), [players, ratings, live?.events]);
  const saveContent = async () => {
    const ok = await run(() => api.updateMatch(matchId, buildPostPayload(content, highlights, nameOf, moments)), { ok: "Maç sonu içerikleri kaydedildi.", fail: "Maç sonu içerikleri kaydedilemedi." });
    if (ok) live?.refresh?.();
  };
  const revertContent = () => { setContent(savedContent); setHighlights(savedHighlights); setMoments(savedMoments); };

  /* ---------------- anlar (maçın golü / kurtarışı) ---------------- */
  const clipsRes = useLoad(() => api.getGoalClips(matchId), [matchId], { enabled: Boolean(matchId) && (part ? part === "goal" || part === "save" : tab === "awards"), fallback: "" });
  const clips = Array.isArray(clipsRes.data?.items) ? clipsRes.data.items : Array.isArray(clipsRes.data) ? clipsRes.data : [];
  const candidates = useMemo(() => Object.fromEntries(MOMENT_AWARDS.map((m) => [m.key, momentCandidates(live?.events, { kind: m.kind, homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf: live?.nameOf, replays, clips })])), [live?.events, live?.homeTeamId, live?.awayTeamId, live?.nameOf, replays, clips]);
  const [playing, setPlaying] = useState(null); // aday
  const selectMoment = (key, c) => {
    setMoments((m) => ({ ...m, [key]: c ? momentFromCandidate(c) : null }));
    if (c) setHighlights((h) => ({ ...h, [key]: c.playerId || "" }));
  };
  const setMomentPlayer = (key, id) => {
    setHighlights((h) => ({ ...h, [key]: id }));
    // Başka oyuncu seçildiyse an artık o oyuncunun değil: kaldır.
    setMoments((m) => (m[key]?.player_id && String(m[key].player_id) !== String(id) ? { ...m, [key]: null } : m));
  };
  const teamName = (side) => (side === "home" ? live?.homeName : side === "away" ? live?.awayName : "");
  const [uploading, setUploading] = useState(false);
  const uploadCover = async () => {
    setUploading(true);
    const res = await pickAndUploadImage();
    setUploading(false);
    if (res.ok) { setContent((c) => ({ ...c, coverImage: res.url })); toast("Kapak yüklendi; kaydetmeyi unutma.", { tone: "success" }); } else if (!res.cancelled) toast(res.error?.message || "Kapak yüklenemedi.", { tone: "error" });
  };

  /* ---------------- yayınla ---------------- */
  const publish = async () => {
    const yes = await confirm({ title: "Maçı yayınla", message: `${live?.homeName} ${live?.score?.home ?? 0} – ${live?.score?.away ?? 0} ${live?.awayName}\n\nSkor kesinleşir, puan durumu yeniden hesaplanır ve üyelere sonuç bildirimi gider.`, confirmLabel: "Yayınla" });
    if (!yes) return;
    // matches.publish yetkisi yoksa (ya da uç yoksa) maç kaydı üzerinden yayınlanır (mobil ile aynı).
    const first = await api.setMatchStatus(matchId, "yayinlanmis");
    let ok = first.ok ? first.data || {} : null;
    if (!ok) ok = await run(() => api.updateMatch(matchId, { mac_durumu: "yayinlanmis", ...(live?.manual ? {} : { first_team_score: live?.score?.home ?? 0, second_team_score: live?.score?.away ?? 0 }) }), { quiet: true, fail: "Maç yayınlanamadı." });
    if (ok) { toast("Maç yayınlandı. Puan durumu yeniden hesaplandı.", { tone: "success" }); live?.refresh?.(); }
  };

  // Parça: tek bölüm (sekme şeridi ve özet kartı yok).
  const cur = part ? (part === "goal" || part === "save" ? "awards" : part) : tab;
  const onlyMoment = part === "goal" ? "best_goal" : part === "save" ? "best_save" : null;
  const showSummary = !part || part === "summary";
  return (
    <div className={`mg-stack pt${part ? ` mg-part is-${part}` : ""}`} data-post-part={part || "all"}>
      {showSummary && <section className="mg-card pt-summary">
        <SideSummary name={live?.homeName} goals={summary.goals.home} cards={summary.cards.home} />
        <div className="pt-score">
          <strong>{live?.score?.home ?? 0} – {live?.score?.away ?? 0}</strong>
          {summary.subs ? <small>{summary.subs} değişiklik</small> : null}
          {finished ? <span className="pill pill--xs pill--green">Yayınlandı</span> : (
            <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={publish}><Icon name="checks" size={13} /> Maçı yayınla / sonuçlandır</button>
          )}
        </div>
        <SideSummary name={live?.awayName} goals={summary.goals.away} cards={summary.cards.away} right />
      </section>}
      {showSummary && !finished && <p className="mg-note">Maç henüz tamamlanmadı. Skorun tescili için maçı Reji'den bitir ya da buradan yayınla.</p>}

      {!part && <nav className="mg-subnav" aria-label="Maç sonu">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={13} /> {t.label}
            {t.key === "ratings" && rSummary.dirty && <span className="gx-dot is-amber" />}
            {(t.key === "awards" || t.key === "content") && contentDirty && <span className="gx-dot is-amber" />}
          </button>
        ))}
      </nav>}

      {cur === "ratings" && <RatingsPanel live={live} ratings={ratings} setRatings={setRatings} summary={rSummary} saving={busy} onSave={saveRatings} onReset={() => setRatings(savedRatings)} />}

      {cur === "awards" && (
        <div className="mg-stack">
          {!onlyMoment && <section className="mg-card">
            <header className="mg-card__head"><h5><Icon name="award" size={13} /> Oyuncu ödülleri</h5><small className="mg-muted">Puanlardan öneri gelir</small></header>
            <div className="pt-awards">
              {PLAYER_AWARDS.map((f) => {
                const sug = suggestions[f.key];
                return (
                  <div key={f.key} className="pt-award">
                    <PlayerSelect label={f.label} value={highlights[f.key] || ""} emptyLabel="Seçilmedi" onChange={(v) => setHighlights((h) => ({ ...h, [f.key]: v }))}
                      groups={[{ label: live?.homeName || "Ev sahibi", players: live?.squads?.home || [] }, { label: live?.awayName || "Deplasman", players: live?.squads?.away || [] }]} />
                    {sug && sug.id !== highlights[f.key] && (
                      <button type="button" className="btn btn--xs btn--ghost" onClick={() => setHighlights((h) => ({ ...h, [f.key]: sug.id }))}>
                        <Icon name="sparkles" size={12} /> Öneri: {nameOf(sug.id)} ({sug.reason})
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>}
          {MOMENT_AWARDS.filter((m) => (onlyMoment ? m.key === onlyMoment : part !== "awards")).map((m) => (
            <MomentPicker key={m.key} title={m.title} icon={m.icon} kind={m.kind} candidates={candidates[m.key]} selectedEventId={moments[m.key]?.event_id ?? null}
              onSelect={(c) => selectMoment(m.key, c)} onPlay={setPlaying} teamName={teamName}
              playerSlot={(
                <div className="pt-moment__player">
                  <PlayerSelect label={`${m.title} · oyuncu`} value={highlights[m.key] || ""} emptyLabel="Seçilmedi" onChange={(v) => setMomentPlayer(m.key, v)}
                    groups={[{ label: live?.homeName || "Ev sahibi", players: live?.squads?.home || [] }, { label: live?.awayName || "Deplasman", players: live?.squads?.away || [] }]} />
                  <small className="mg-muted">{moments[m.key] ? `Olay #${moments[m.key].event_id} · ${moments[m.key].minute ?? "?"}'${moments[m.key].clip_url ? " · klip bağlı" : ""}` : "Olay seçilmedi: yalnız oyuncu adı kaydedilir."}</small>
                </div>
              )} />
          ))}
          <div className="mg-card__foot">
            {contentDirty && <span className="pill pill--xs pill--amber">Kaydedilmedi</span>}
            <button type="button" className="btn btn--sm btn--ghost" disabled={!contentDirty || busy} onClick={revertContent}>Geri al</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={!contentDirty || busy} onClick={saveContent}><Icon name="check" size={13} /> Enleri kaydet</button>
          </div>
        </div>
      )}
      {playing && (
        <Modal title={`${playing.playerName || "Oyuncusuz"} · ${playing.minute}'`} onClose={() => setPlaying(null)} width={760} className="st-modal mg-modal"
          footer={<>
            {onPlayReplay && playing.replay && <button type="button" className="btn" onClick={() => { onPlayReplay(playing.replay); setPlaying(null); }}><Icon name="broadcast" size={13} /> Tekrar panelinde aç</button>}
            <button type="button" className="btn" onClick={() => setPlaying(null)}>Kapat</button>
            <button type="button" className="btn btn--primary" onClick={() => { const key = playing.code === "SAVE" ? "best_save" : "best_goal"; selectMoment(key, playing); setPlaying(null); }}><Icon name="check" size={13} /> Bunu seç</button>
          </>}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video className="pt-video" src={playing.playUrl} poster={playing.posterUrl || undefined} controls autoPlay />
        </Modal>
      )}

      {cur === "content" && (
        <div className="mg-stack">
          <div className="mg-grid2">
            <div className="mg-stack">
              {CONTENT_FIELDS.map((f) => (
                <label key={f.key} className="mg-field"><span>{f.label}</span>
                  <input value={content[f.key] || ""} maxLength={f.max} onChange={(e) => setContent((c) => ({ ...c, [f.key]: e.target.value }))} />
                </label>
              ))}
              <label className="mg-field"><span>Maç raporu</span>
                <textarea rows={6} value={content.report || ""} onChange={(e) => setContent((c) => ({ ...c, report: e.target.value }))} />
              </label>
              <label className="mg-field"><span>Röportaj</span>
                <textarea rows={3} value={content.interview || ""} onChange={(e) => setContent((c) => ({ ...c, interview: e.target.value }))} />
              </label>
            </div>
            <fieldset className="mg-box">
              <legend>Kapak görseli</legend>
              <div className="pt-cover">{content.coverImage ? <img src={content.coverImage} alt="Kapak" /> : <span className="mg-muted">Kapak yok</span>}</div>
              <div className="mg-inline mg-wrap">
                <button type="button" className="btn btn--sm" onClick={uploadCover} disabled={uploading}><Icon name="upload" size={13} /> {uploading ? "Yükleniyor…" : "Bilgisayardan yükle"}</button>
                {content.coverImage && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setContent((c) => ({ ...c, coverImage: "" }))}>Kaldır</button>}
              </div>
              <label className="mg-field"><span>Kapak adresi</span>
                <input value={content.coverImage || ""} placeholder="https://…" onChange={(e) => setContent((c) => ({ ...c, coverImage: e.target.value.trim() }))} />
              </label>
            </fieldset>
          </div>
          <div className="mg-inline mg-end">
            <button type="button" className="btn btn--sm btn--ghost" disabled={!contentDirty || busy} onClick={revertContent}>Geri al</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={!contentDirty || busy} onClick={saveContent}><Icon name="check" size={13} /> Kaydet</button>
          </div>
        </div>
      )}

      {cur === "stats" && <StatsPanel matchId={matchId} live={live} />}
    </div>
  );
}
