// Yayın Stüdyosu · "Tekrar & Özet" sekmesi — ÖZET ÇIKAR bölümü.
//
//   Sol    özetin sırası (sürükle-bırak ya da ↑ ↓), her öğede açılar; varsayılan
//          bu maçın tüm golleri + "özete ekle" işaretli önemli anlar.
//   Orta   plan (giriş kartı · klipler · kapanış kartı, toplam süre), "Özeti
//          oluştur", gerçek zamanlı ilerleme, vazgeç.
//   Sağ    sonucun önizlemesi, "Maç sayfasına yükle"; sunucuda özet varsa
//          "Özeti sil" / "Yeniden oluştur" (onaylı — yanlışlık geri alınabilsin).
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon, MenuButton } from "../../components/ui";
import { buildHighlightPlan, defaultHighlightItems, eventsUntil, mmss, moveItem, normalizeHighlightMusic, scoreForReplay } from "../../lib/studio/highlights";
import { PROGRAM_ANGLE, angleLabel, anglesOf, defaultAngles, metaFor, replayBanner, replayOfMatch, replayTitle } from "../../lib/studio/replays";
import { scorerLines } from "../../lib/studio/scorebug";
import { cardInfo } from "./modes/useHighlightMode";
import UploadLog from "./modes/UploadLog";

const MUSIC_KEY = "elitlig.studio.highlightMusic";
const PHASE = { preparing: "Klipler hazırlanıyor…", rendering: "Özet oluşturuluyor (gerçek zamanlı)…", finishing: "Dosya yazılıyor…", uploading: "Maç sayfasına yükleniyor…" };

function HighlightsPanel(props) {
  const a = props.api;
  const p = a ? {
    replays: a.replays?.replays || [], meta: a.replays?.meta || {}, sources: a.sources?.list || [], matchId: a.matchId, live: a.live,
    recordAngles: a.replays?.recordAngles || [PROGRAM_ANGLE], hl: a.hm.hl, imagesRef: a.imagesRef, ask: a.ask, toast: a.toast,
    stingerKind: a.cfg.between.kind === "cut" ? "stinger" : a.cfg.between.kind, onAir: a.airMode === "ozet", inModes: true,
  } : props;
  return <HighlightsInner {...p} />;
}

function HighlightsInner({ replays, meta, sources, matchId, live, recordAngles, hl, imagesRef, ask, toast, stingerKind = "stinger", onAir = false, inModes = false }) {
  const mine = useMemo(() => replays.filter((r) => replayOfMatch(r, meta[r.id], matchId) && anglesOf(r).length), [replays, meta, matchId]);
  const defaults = useMemo(() => defaultHighlightItems(mine, { preferredAngles: [PROGRAM_ANGLE] }), [mine]);
  const [items, setItems] = useState(defaults);
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setItems(defaults); }, [defaults, edited]);
  useEffect(() => { setEdited(false); }, [matchId]);
  const byId = useMemo(() => new Map(mine.map((r) => [r.id, r])), [mine]);
  const edit = (fn) => { setEdited(true); setItems(fn); };
  const dragFrom = useRef(null);

  const finalScore = live.score;
  const scoreOf = (r) => scoreForReplay(r, metaFor(r, meta), { events: live.events, homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, fallback: finalScore });
  const plan = useMemo(() => buildHighlightPlan({ items, replays: mine, scoreOf }), [items, mine, live.events]); // eslint-disable-line react-hooks/exhaustive-deps
  const notIn = mine.filter((r) => !items.some((i) => i.replayId === r.id));

  // Arka plan müziği (isteğe bağlı): kliplerde orijinal sesin altında kısılır.
  const [music, setMusicState] = useState(() => { try { return normalizeHighlightMusic(JSON.parse(localStorage.getItem(MUSIC_KEY) || "null")); } catch { return normalizeHighlightMusic(null); } });
  const setMusic = (patch) => setMusicState((m) => { const n = normalizeHighlightMusic({ ...m, ...patch }); try { localStorage.setItem(MUSIC_KEY, JSON.stringify(n)); } catch { /* yoksay */ } return n; });
  const pickMusic = async () => {
    const r = await window.elitlig?.studio?.media?.pick?.({ kind: "audio" });
    const f = r?.files?.[0];
    if (f?.url) setMusic({ url: f.url, name: f.name || "Müzik" });
    else if (!window.elitlig?.studio?.media?.pick) toast("Müzik seçimi bu uygulama sürümünde yok.", { tone: "warn" });
  };
  const sameAudio = plan.segments.filter((x) => x.type === "clip" && x.audioUrl).length;

  const job = hl.job;
  const busy = ["preparing", "rendering", "finishing", "uploading"].includes(job.phase);
  const existing = hl.server.item;

  const build = async () => {
    if (!plan.clipCount) { toast("Özete klip ekle.", { tone: "warn" }); return; }
    if (job.file && job.phase !== "uploaded" && !(await ask({ title: "Yeniden oluştur", message: "Önizlemedeki özet atılıp yenisi oluşturulsun mu?", confirmLabel: "Yeniden oluştur" }))) return;
    const info = { ...cardInfo(live), score: finalScore };
    const boardOf = (seg) => {
      const r = seg.replay;
      const mm = metaFor(r, meta);
      const known = mm.minute != null;
      return {
        homeName: live.homeName,
        awayName: live.awayName,
        homeScore: seg.score?.home ?? 0,
        awayScore: seg.score?.away ?? 0,
        clockMs: known ? mm.minute * 60000 : 0,
        period: mm.period || 1,
        clockLabel: known ? null : "MAÇ ÖZETİ",
        scorers: scorerLines(eventsUntil(live.events, r, mm), { homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, nameOf: live.nameOf }),
        event: replayBanner(r, mm),
      };
    };
    await hl.build({ plan, info, images: imagesRef?.current || {}, boardOf, stingerKind, music: music.url ? music : null });
  };

  const upload = async () => {
    if (existing && !(await ask({ title: "Özeti değiştir", message: "Maç sayfasında zaten bir özet var. Yenisiyle değiştirilsin mi?", confirmLabel: "Değiştir", danger: true }))) return;
    const res = await hl.upload();
    if (res.ok) toast("Özet maç sayfasına yüklendi.", { tone: "success" });
    else if (res.error) toast(res.error, { tone: "error", timeout: 6000 });
  };
  const remove = async () => {
    if (!(await ask({ title: "Özeti sil", message: "Maç sayfasındaki özet silinsin mi? Bu bilgisayardaki tekrarlar kalır; istersen yeniden oluşturabilirsin.", confirmLabel: "Sil", danger: true }))) return;
    const res = await hl.remove();
    toast(res.ok ? "Özet silindi." : res.error || "Özet silinemedi.", { tone: res.ok ? "success" : "error" });
  };

  if (!matchId) return <p className="st-hint st-pad">Özet için üstten maç seç.</p>;

  return (
    <div className="st-hl">
      <section className="st-hl__order">
        <header className="st-dock-head">
          <h4>Özetin sırası <span className="muted">({items.length})</span></h4>
          <span className="st-top__spacer" />
          {edited && <button type="button" className="btn btn--xs" onClick={() => { setEdited(false); setItems(defaults); }} title="Goller + özete eklenen anlar">Varsayılana dön</button>}
          <MenuButton label="Tekrar ekle" icon="plus" text="Ekle" size={12} className="st-menu-sm"
            items={notIn.length ? notIn.map((r) => ({ label: replayTitle(r, metaFor(r, meta)), icon: r.kind === "goal" ? "ball" : "star", onClick: () => edit((l) => [...l, { replayId: r.id, angles: defaultAngles(r, recordAngles) }]) })) : [{ label: "Eklenecek tekrar yok", disabled: true, onClick: () => {} }]} />
        </header>
        <ol className="st-hl__list">
          {items.map((it, i) => {
            const r = byId.get(it.replayId);
            if (!r) return null;
            return (
              <li key={it.replayId} draggable onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom.current != null) edit((l) => moveItem(l, dragFrom.current, i)); dragFrom.current = null; }}>
                <span className="st-hl__grip"><Icon name="grip" size={13} /></span>
                <span className="st-hl__no">{i + 1}</span>
                <span className="st-hl__text"><strong>{replayTitle(r, metaFor(r, meta))}</strong>
                  <span className="st-row st-row--wrap">
                    {r.angles.filter((a) => a.url).map((a) => (
                      <button key={a.angle} type="button" className={`st-chip ${it.angles.includes(a.angle) ? "is-on" : ""}`}
                        onClick={() => edit((l) => l.map((x) => (x.replayId === r.id ? { ...x, angles: r.angles.map((y) => y.angle).filter((y) => (y === a.angle ? !x.angles.includes(y) : x.angles.includes(y))) } : x)))}>
                        {angleLabel(a, sources)}
                      </button>
                    ))}
                  </span>
                </span>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === 0} onClick={() => edit((l) => moveItem(l, i, i - 1))} title="Yukarı"><Icon name="chevronUp" size={13} /></button>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === items.length - 1} onClick={() => edit((l) => moveItem(l, i, i + 1))} title="Aşağı"><Icon name="chevronDown" size={13} /></button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => edit((l) => l.filter((x) => x.replayId !== r.id))} title="Özetten çıkar"><Icon name="x" size={13} /></button>
              </li>
            );
          })}
          {!items.length && <li className="st-hint">Özete girecek tekrar yok. Goller kendiliğinden girer; önemli anları ★ ile ekle.</li>}
        </ol>
      </section>

      <section className="st-hl__build">
        <h5 className="st-group">Plan</h5>
        <p className="st-hint">Sinematik giriş kartı (logo, armalar, son skor {finalScore.home}–{finalScore.away}, lig · saha · tarih) · {plan.clipCount} klip (kendi sesiyle) · kapanış kartı · aralarda logo geçişi. Klipte orta-alt büyük skorbord o anın skorunu gösterir.{inModes ? " Giriş kartı şu an önizlemede." : ""}</p>
        {sameAudio > 0 && <p className="st-hint">{sameAudio} kamera açısında ses, o anın program sesinden (yorum mikrofonu dahil) alınır.</p>}
        <div className="st-hl__music">
          <div className="st-row">
            <Icon name="music" size={13} /><strong>Arka plan müziği</strong>
            <span className="st-top__spacer" />
            {music.url
              ? <><small className="muted" title={music.name}>{music.name || "Müzik"}</small><button type="button" className="icon-btn icon-btn--xs" title="Müziği kaldır" disabled={busy} onClick={() => setMusic({ url: null, name: "" })}><Icon name="x" size={12} /></button></>
              : <button type="button" className="btn btn--xs" disabled={busy} onClick={pickMusic}><Icon name="folder" size={11} /> Müzik seç</button>}
          </div>
          {music.url && (
            <>
              <label className="st-row" title="Giriş / kapanış kartlarındaki müzik seviyesi"><small>Seviye</small><input type="range" min={-40} max={0} step={1} value={music.volumeDb} onChange={(e) => setMusic({ volumeDb: Number(e.target.value) })} /><small>{music.volumeDb} dB</small></label>
              <label className="st-row" title="Klip oynarken müzik bu kadar kısılır (orijinal ses öne çıkar)"><small>Kliplerde kıs</small><input type="range" min={-40} max={0} step={1} value={music.duckDb} onChange={(e) => setMusic({ duckDb: Number(e.target.value) })} /><small>{music.duckDb} dB</small></label>
            </>
          )}
          {!music.url && <small className="muted">İsteğe bağlı: kartlarda tam, kliplerde orijinal sesin altında kısık çalar.</small>}
        </div>
        <p className="st-hl__total">Toplam ≈ <strong>{mmss(plan.durationMs)}</strong> · 1920×1080 · 30 fps</p>
        {busy ? (
          <>
            <div className="st-progress"><i style={{ width: `${Math.round((job.phase === "preparing" ? (job.total ? job.loaded / job.total : 0) : job.progress) * 100)}%` }} /></div>
            <p className="st-hint">{PHASE[job.phase]} {job.phase === "rendering" ? `${mmss(job.elapsedMs)} / ${mmss(job.durationMs)}` : job.phase === "preparing" && job.total ? `${job.loaded}/${job.total}` : ""}</p>
            {job.phase !== "uploading" && <button type="button" className="btn btn--block" onClick={hl.cancel}><Icon name="x" size={13} /> Vazgeç</button>}
            {job.phase === "rendering" && <p className="st-hint">Özet gerçek zamanlı çizilir; bu sırada pencereyi kapatma.</p>}
          </>
        ) : (
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!plan.clipCount || !hl.available} onClick={build}>
            <Icon name="sparkles" size={14} /> {job.file ? "Yeniden oluştur" : "Özeti oluştur"}
          </button>
        )}
        {!hl.available && <p className="st-hint">Özet oluşturma bu uygulama sürümünde yok.</p>}
        {job.error && <p className="st-hint text-red">{job.error}</p>}
      </section>

      <section className="st-hl__result">
        <h5 className="st-group">Sonuç</h5>
        {job.file ? (
          <>
            <video className="st-hl__video" src={job.file.url} controls preload="metadata" />
            <small className="muted">{mmss(job.file.durationMs)} · {job.file.sizeBytes ? `${(job.file.sizeBytes / 1048576).toFixed(1)} MB` : ""}</small>
            {inModes && <p className="st-hint">{onAir ? <><span className="md-chip is-live"><i /> YAYINDA</span> Özet programda kendi sesiyle oynuyor.</> : "Özet önizlemedeyse GEÇİŞ (Boşluk) ya da soldaki “Yayına al” onu yayına verir; değilse önce “Önizlemeye al”."}</p>}
            {job.phase === "uploaded"
              ? <p className="st-hint"><Icon name="check" size={12} /> Maç sayfasına yüklendi.</p>
              : <button type="button" className="btn btn--red btn--block" disabled={busy} onClick={upload}><Icon name="upload" size={13} /> Maç sayfasına yükle</button>}
          </>
        ) : <p className="st-hint">Oluşturulan özet burada önizlenir; beğenirsen maç sayfasına yükle.</p>}
        {existing && (
          <div className="st-hl__server">
            <span><Icon name="globe" size={12} /> Maç sayfasında özet var{existing.duration_ms ? ` · ${mmss(existing.duration_ms)}` : ""}{existing.created_at ? ` · ${new Date(existing.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            <span className="st-row">
              {existing.url && <button type="button" className="btn btn--xs" onClick={() => window.elitlig?.app?.openExternal?.(existing.url)}><Icon name="external" size={11} /> Aç</button>}
              <button type="button" className="btn btn--xs" disabled={busy} onClick={build}><Icon name="refresh" size={11} /> Yeniden oluştur</button>
              <button type="button" className="btn btn--xs btn--danger-ghost" disabled={busy} onClick={remove}><Icon name="trash" size={11} /> Özeti sil</button>
            </span>
          </div>
        )}
        <UploadLog />
      </section>
    </div>
  );
}

export default memo(HighlightsPanel);
