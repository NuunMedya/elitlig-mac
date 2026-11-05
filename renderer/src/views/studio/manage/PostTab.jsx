// Maç yönetimi · MAÇ SONU (web MatchPostStep + mobil PostStep):
//   Özet         skor, golcüler, kartlar, değişiklik sayısı + "Maçı yayınla / sonuçlandır"
//   Puanlar      iki takımın oyuncuları 1–10 (PATCH /api/maclar/:id/kadro/puan)
//   Enler        MVP ve mevki ödülleri, maçın golü / kurtarışı (puan + gollerden öneri)
//   İçerik       manşet, rapor, kapak görseli, canlı yayın, röportaj, foto
//                (PATCH /maclar/:id buildPostPayload)
//   İstatistik   oyuncu maç istatistikleri (StatsPanel)
import React, { useEffect, useMemo, useState } from "react";
import { Icon, useConfirm, useToast } from "../../../components/ui";
import {
  POST_HIGHLIGHT_FIELDS, buildPostPayload, highlightSuggestions, postSummary, ratingsPayload, ratingsSummary, readPostContent, readSavedRatings,
} from "../../../lib/studio/manage";
import { readHighlights } from "../../../lib/studio/manageBroadcast";
import { normalizeMatchStatus } from "../../../lib/studio/match";
import { pickAndUploadImage } from "../graphics/graphicsApi";
import * as api from "./manageApi";
import { PlayerSelect } from "./pickers";
import RatingsPanel from "./RatingsPanel";
import StatsPanel from "./StatsPanel";
import { useRun } from "./useManage";

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

export default function PostTab({ matchId, match, live }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run, busy } = useRun();
  const [tab, setTab] = useState("ratings");
  const players = useMemo(() => [...(live?.squads?.home || []), ...(live?.squads?.away || [])], [live?.squads]);
  const nameOf = (id) => players.find((p) => p.id === String(id))?.name || "";
  const finished = normalizeMatchStatus(match?.mac_durumu) === "yayinlanmis";
  const summary = useMemo(() => postSummary(live?.events, { homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf: live?.nameOf }), [live?.events, live?.homeTeamId, live?.awayTeamId, live?.nameOf]);

  /* ---------------- puanlar ---------------- */
  const savedRatings = useMemo(() => readSavedRatings(live?.lineup), [live?.lineup]);
  const [ratings, setRatings] = useState(savedRatings);
  useEffect(() => setRatings(savedRatings), [savedRatings]);
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
  const [content, setContent] = useState(savedContent);
  const [highlights, setHighlights] = useState(savedHighlights);
  useEffect(() => setContent(savedContent), [savedContent]);
  useEffect(() => setHighlights(savedHighlights), [savedHighlights]);
  const contentDirty = JSON.stringify(content) !== JSON.stringify(savedContent) || POST_HIGHLIGHT_FIELDS.some(({ key }) => (highlights[key] || "") !== (savedHighlights[key] || ""));
  const suggestions = useMemo(() => highlightSuggestions(players, ratings, live?.events), [players, ratings, live?.events]);
  const saveContent = async () => {
    const ok = await run(() => api.updateMatch(matchId, buildPostPayload(content, highlights, nameOf)), { ok: "Maç sonu içerikleri kaydedildi.", fail: "Maç sonu içerikleri kaydedilemedi." });
    if (ok) live?.refresh?.();
  };
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

  return (
    <div className="mg-stack pt">
      <section className="mg-card pt-summary">
        <SideSummary name={live?.homeName} goals={summary.goals.home} cards={summary.cards.home} />
        <div className="pt-score">
          <strong>{live?.score?.home ?? 0} – {live?.score?.away ?? 0}</strong>
          {summary.subs ? <small>{summary.subs} değişiklik</small> : null}
          {finished ? <span className="pill pill--xs pill--green">Yayınlandı</span> : (
            <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={publish}><Icon name="checks" size={13} /> Maçı yayınla / sonuçlandır</button>
          )}
        </div>
        <SideSummary name={live?.awayName} goals={summary.goals.away} cards={summary.cards.away} right />
      </section>
      {!finished && <p className="mg-note">Maç henüz tamamlanmadı. Skorun tescili için maçı Reji'den bitir ya da buradan yayınla.</p>}

      <nav className="mg-subnav" aria-label="Maç sonu">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={13} /> {t.label}
            {t.key === "ratings" && rSummary.dirty && <span className="gx-dot is-amber" />}
            {(t.key === "awards" || t.key === "content") && contentDirty && <span className="gx-dot is-amber" />}
          </button>
        ))}
      </nav>

      {tab === "ratings" && <RatingsPanel live={live} ratings={ratings} setRatings={setRatings} summary={rSummary} saving={busy} onSave={saveRatings} onReset={() => setRatings(savedRatings)} />}

      {tab === "awards" && (
        <div className="mg-stack">
          <div className="pt-awards">
            {POST_HIGHLIGHT_FIELDS.map((f) => {
              const sug = suggestions[f.key];
              return (
                <div key={f.key} className="mg-box">
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
          <div className="mg-inline mg-end">
            <button type="button" className="btn btn--sm btn--ghost" disabled={!contentDirty || busy} onClick={() => { setContent(savedContent); setHighlights(savedHighlights); }}>Geri al</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={!contentDirty || busy} onClick={saveContent}><Icon name="check" size={13} /> Kaydet</button>
          </div>
        </div>
      )}

      {tab === "content" && (
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
            <button type="button" className="btn btn--sm btn--ghost" disabled={!contentDirty || busy} onClick={() => { setContent(savedContent); setHighlights(savedHighlights); }}>Geri al</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={!contentDirty || busy} onClick={saveContent}><Icon name="check" size={13} /> Kaydet</button>
          </div>
        </div>
      )}

      {tab === "stats" && <StatsPanel matchId={matchId} live={live} />}
    </div>
  );
}
