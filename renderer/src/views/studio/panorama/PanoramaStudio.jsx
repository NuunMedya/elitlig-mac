// YAYIN STÜDYOSU · PANORAMA REJİSİ — maç seçmeden, web sitesinin içerikleriyle stüdyo programı.
// Maç rejisiyle aynı mantık ve aynı motor; burada maç yerine PANORAMA rejisi:
//
//   YERLEŞİM    Maç rejisinin yerleşim düzeni (dockview; regi/PanoramaWorkspace): önizleme / program
//               monitörleri, GEÇİŞ paneli, sahneler, çoklu görünüm, kaynaklar, medya kutusu, grafikler,
//               içerik, kartlar, veri, tema stüdyosu, hazır ayarlar, butonlar, yayın, ses, müzik, LED,
//               ayarlar. Düzenle: sürükle / böl / sekmele / yüzen pencere; 5 hazır düzen.
//   SAHNELER    açılar = stüdyo sahneleri (lib/studio/panorama/model.js buildPanoramaScenes): 1/2/3/4/5
//               kameralı, PiP, bölünmüş, ızgara, büyük + şerit… Tık önizleme, çift tık / ⇧+sayı yayın,
//               GEÇİŞ (seçili tür + süre; sahneye özel geçiş), KES, FTB, son sahne. Karıştırıcı Maç
//               rejisinin useCompositor'ı (işçi motoru, geçişler, logo geçişleri tema logosuyla).
//   TEMA        30 tema (themeCatalog.js; zemin + doku + hareket, çerçeve, alt yazı, bant, saat, rozet,
//               logo hareketi, yazı tipleri, yumuşatma) — Tema stüdyosunda her ayrıntı (regi/ThemeStudio).
//   GRAFİKLER   alt yazılar (kısayol, otomatik gizle, oynatma listesi), tam ekran kartlar (başlık / geri
//               sayım / ara / sosyal), kayan bant kuyruğu, CANLI rozeti (gfx.js → drawTheme.js).
//   MEDYA       dışarıdan görsel / video: tam ekran (önizleme → geçiş), PiP / üst katman, kamera yuvası;
//               video denetimi, giriş-çıkış, ses (mediaBin.js, regi/usePanoramaMedia.js).
//   KARTLAR     sitenin verisi dönen kartlarla (puan, fikstür, sonuçlar, krallıklar, web sahneleri…).
//   YAYIN       aynı motor (useEngine → ffmpeg → RTMP / RTMPS / YouTube; prova; yerel kayıt).
//   HAZIR AYAR  bütün gösteri tek tıkla (tema + sahneler + kartlar + grafikler + medya + reji ayarları).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, MenuButton, useConfirm, useToast } from "../../../components/ui";
import { setLeaveGuard } from "../../../lib/leaveGuard";
import { encodingPreset, normalizeEncoding, statusPill } from "../../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../../lib/studio/transitions";
import { DEFAULT_BRANDING } from "../../../lib/studio/stinger";
import { drawGraphics } from "../../../lib/studio/graphics";
import { uid } from "../../../lib/studio/scenes";
import {
  PANORAMA_KEY, applyTemplate, buildPanoramaScenes, buildPanoramaSnapshot, cardLabel, currentCard, currentMedia, defaultPanoramaState, fillSlots, gotoCard,
  loadPanoramaState, loadTemplates, makeCard, normalizeAngle, normalizeCard, normalizePanoramaState, pinCard, remainingSec, savePanoramaState, saveTemplates,
  setCustomLayouts, stepCard, templateFromState, tickPlaylist, webCardKey,
} from "../../../lib/studio/panorama/model";
import { BUILTIN_BRANDS, findBrand, loadBrands, saveBrands, brandTokens as brandTokensOf } from "../../../lib/studio/panorama/brands";
import { applyPreset, bootState, loadPresets, presetDirty, presetFromState, savePresets } from "../../../lib/studio/panorama/presets";
import { hideLower, hideTitle, nextLower, showLower, tickGfx, toggleLower, toggleTitle } from "../../../lib/studio/panorama/gfx";
import { addItems, hideOverlay, kindFromUrl, mediaSceneId, mediaSourceId, removeItem, setSlot, showOverlay, tickMedia } from "../../../lib/studio/panorama/mediaBin";
import { actionForKey, afterTake, keyName, planTake, sceneForKey, setSceneSetting } from "../../../lib/studio/panorama/regi";
import { AngleEditor, LayoutEditor } from "./AngleEditor";
import { AddCardSelect, CardOptions } from "./CardEditor";
import BrandPanel from "./BrandPanel";
import PresetsPanel from "./PresetsPanel";
import { usePanoramaExtras } from "./usePanoramaExtras";
import { useStudioSources } from "../useStudioSources";
import { useAudioMixer } from "../useAudioMixer";
import { useCanvasImage, useCompositor } from "../useCompositor";
import { useEngine } from "../useEngine";
import { drawScene } from "../draw";
import { canvasLoop } from "../perf/renderLoad";
import { useStudioSettings } from "../settings/useStudioSettings";
import { SourceDialog } from "../SourcesPanel";
import HealthChip from "../scenes/HealthChip";
import OutMuteButton from "../audio/OutMuteButton";
import { useMusicPlayer } from "../music";
import { useLed } from "../led/useLed";
import LedPanel from "../led/LedPanel";
import { resolveScene } from "../../../lib/studio/scenes";
import { usePanoramaData } from "./usePanoramaData";
import PanoramaWorkspace, { LAYOUT_PRESETS } from "./regi/PanoramaWorkspace";
import { RegiCtx } from "./regi/RegiCtx";
import { AudioPane, MonitorPanel, MultiviewPanel, MusicPane, ScenesPanel, SourcesPane, TakePanel } from "./regi/panels";
import GraphicsPanel from "./regi/GraphicsPanel";
import MediaPanel, { draftFromFile } from "./regi/MediaPanel";
import ThemeStudio from "./regi/ThemeStudio";
import ButtonGrid from "./regi/ButtonGrid";
import RegiSettings from "./regi/RegiSettings";
import ContentPanel from "./regi/ContentPanel";
import { usePanoramaMedia } from "./regi/usePanoramaMedia";
import { backgroundImage } from "./regi/themePreview";
import logoInline from "../../../assets/elitlig-beyaz.png?inline";
import "../studio.css";
import "./panorama.css";
import "./regi/regi.css";

const store = (() => { try { return window.localStorage; } catch { return null; } })();
const PREFS_KEY = "studio.panorama.prefs.v1";
const DEFAULT_PREFS = {
  encoding: { resolution: "1080p", fps: 30, bitrateKbps: 4500 },
  transition: "fade",
  transitionMs: {},
  target: "youtube",
  ytKey: "",
  rtmpServer: "",
  rtmpKey: "",
  localRec: { enabled: false, dir: null },
  mic: { deviceId: null, muted: true, volume: 100, noiseSuppression: false },
  tab: "kartlar",
};
function readPrefs() {
  try {
    const p = JSON.parse(store?.getItem(PREFS_KEY) || "null") || {};
    return { ...DEFAULT_PREFS, ...p, encoding: normalizeEncoding(p.encoding || DEFAULT_PREFS.encoding), localRec: { ...DEFAULT_PREFS.localRec, ...(p.localRec || {}) }, mic: { ...DEFAULT_PREFS.mic, ...(p.mic || {}) } };
  } catch { return DEFAULT_PREFS; }
}
const YT_INGEST = "rtmp://a.rtmp.youtube.com/live2";
/** Yayın adresi: YouTube anahtarı ya da sunucu + anahtar (sunucu adresinde anahtar da olabilir). */
export function ingestOf(p) {
  if (p.target === "youtube") return p.ytKey?.trim() ? `${YT_INGEST}/${p.ytKey.trim()}` : null;
  const s = String(p.rtmpServer || "").trim().replace(/\/+$/, "");
  if (!/^rtmps?:\/\//i.test(s)) return null;
  const k = String(p.rtmpKey || "").trim();
  return k ? `${s}/${k}` : s;
}

const isTyping = (e) => {
  const t = e.target;
  return t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

function StatusPill({ state, since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!since) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [since]);
  const pill = statusPill(state, since, now);
  return <span className={`st-pill is-${pill.tone}`}><i />{pill.label}</span>;
}

/**
 * Açı küçük resimleri: sahne + panorama katmanı (kart, künye, bant) — program ile aynı çizim.
 * registerTile(anahtar, sahne = anahtar): aynı sahne birden çok panelde (Sahneler, Çoklu görünüm).
 */
function useAngleTiles(configRef, runtimeRef, snapRef) {
  const canvases = useRef(new Map()); // canvas → { key, id }
  useEffect(() => canvasLoop("Panorama açıları (küçük resim)", { fps: 5 }, () => {
    const cfg = configRef.current;
    if (!cfg) return;
    const now = performance.now();
    for (const [c, { id }] of canvases.current) {
      if (!c.isConnected || c.offsetParent === null) continue;
      const ctx = c.getContext("2d", { alpha: false });
      drawScene(ctx, resolveScene(cfg, id), cfg.sources, runtimeRef.current, c.width, c.height, { placeholders: true, now, noFx: true });
      try { drawGraphics(ctx, { width: c.width, height: c.height, now: Date.now(), sceneId: id }, snapRef.current); } catch { /* yoksay */ }
    }
  }), [configRef, runtimeRef, snapRef]);
  const refs = useRef(new Map());
  return useCallback((key, id = key) => {
    const k = `${key}|${id}`;
    if (!refs.current.has(k)) {
      refs.current.set(k, (el) => {
        for (const [c, v] of canvases.current) if (v.key === key && c !== el) canvases.current.delete(c);
        if (el) canvases.current.set(el, { key, id });
      });
    }
    return refs.current.get(k);
  }, []);
}

/* ─────────────────────────────── yan paneller ─────────────────────────────── */

function CardsPanel({ pano, setPlaylist, data, now, ex }) {
  const pl = pano.playlist;
  const cur = currentCard(pl);
  const rem = remainingSec(pl, now);
  const [openId, setOpenId] = useState(null);
  const update = (c) => setPlaylist((p) => ({ ...p, items: p.items.map((x) => (x.id === c.id ? normalizeCard(c) : x)) }));
  const move = (i, d) => setPlaylist((p) => { const items = [...p.items]; const j = i + d; if (j < 0 || j >= items.length) return p; [items[i], items[j]] = [items[j], items[i]]; return { ...p, items, index: items.indexOf(currentCard(p)) }; });
  const remove = (id) => setPlaylist((p) => { const items = p.items.filter((x) => x.id !== id); return { ...p, items, pinnedId: p.pinnedId === id ? null : p.pinnedId, index: Math.min(p.index, Math.max(0, items.length - 1)) }; });
  const add = (card) => { const c = normalizeCard(card); if (c) { setPlaylist((p) => ({ ...p, items: [...p.items, c] })); setOpenId(c.id); } };
  const status = (c) => {
    if (c.kind !== "web") return null;
    const r = ex.web.get(webCardKey(c, pano.scope));
    if (!r) return <em className="pn-cst">yükleniyor</em>;
    if (r.missing?.length) return <em className="pn-cst is-warn">seçim eksik</em>;
    if (r.error && !r.payload) return <em className="pn-cst is-err" title={r.error}>alınamadı</em>;
    return r.payload ? <em className="pn-cst is-ok">hazır</em> : <em className="pn-cst">boş</em>;
  };
  return (
    <div className="pn-cards">
      <div className="pn-cards__bar">
        <button type="button" className="btn btn--sm" onClick={() => setPlaylist((p) => stepCard(p, -1, Date.now()))} title="Önceki kart (←)"><Icon name="chevronLeft" size={13} /></button>
        <button type="button" className={`btn btn--sm ${pl.auto ? "btn--primary" : ""}`} onClick={() => setPlaylist((p) => ({ ...p, auto: !p.auto, startedAt: Date.now() }))} title="Otomatik döngü">
          <Icon name={pl.auto ? "play" : "stop"} size={12} /> {pl.auto ? "Döngü açık" : "Döngü kapalı"}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setPlaylist((p) => stepCard(p, 1, Date.now()))} title="Sonraki kart (→)"><Icon name="chevronRight" size={13} /></button>
        <span className="pn-cards__now">{cur ? <>{pl.pinnedId ? "Sabit: " : "Yayında: "}<b>{cardLabel(cur, ex.catalog.scenes)}</b>{rem != null && <em> · {rem} sn</em>}</> : "Kart yok"}</span>
      </div>
      <ol className="pn-cardlist">
        {pl.items.map((c, i) => {
          const on = cur?.id === c.id;
          return (
            <li key={c.id} className={`${on ? "is-on" : ""} ${c.off ? "is-off" : ""}`} data-card={c.kind} data-scene={c.opts?.scene || undefined}>
              <div className="pn-cardrow">
                <button type="button" className="pn-cardrow__go" onClick={() => setPlaylist((p) => gotoCard(p, i, Date.now()))} title="Bu kartı şimdi göster">
                  <Icon name={c.kind === "web" ? "globe" : "layers"} size={14} /><span>{cardLabel(c, ex.catalog.scenes)}</span>{status(c)}
                </button>
                <input className="input pn-sec" type="number" min={4} max={600} value={c.sec} onChange={(e) => update({ ...c, sec: Number(e.target.value) || c.sec })} title="Süre (sn)" />
                <button type="button" className={`icon-btn ${pl.pinnedId === c.id ? "is-on" : ""}`} onClick={() => setPlaylist((p) => pinCard(p, c.id, Date.now()))} title="Sabitle (P): döngü bu kartta durur"><Icon name="pin" size={13} /></button>
                <button type="button" className="icon-btn" onClick={() => update({ ...c, off: !c.off })} title={c.off ? "Döngüye al" : "Döngüden çıkar"}><Icon name={c.off ? "eye" : "check"} size={13} /></button>
                <button type="button" className={`icon-btn ${openId === c.id ? "is-on" : ""}`} onClick={() => setOpenId(openId === c.id ? null : c.id)} title="Ayarlar"><Icon name="sliders" size={13} /></button>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Yukarı"><Icon name="chevronUp" size={13} /></button>
                <button type="button" className="icon-btn" disabled={i === pl.items.length - 1} onClick={() => move(i, 1)} title="Aşağı"><Icon name="arrowDown" size={13} /></button>
                <button type="button" className="icon-btn" onClick={() => remove(c.id)} title="Kaldır"><Icon name="trash" size={13} /></button>
              </div>
              {openId === c.id && <div className="pn-cardopts"><CardOptions card={c} data={data} onChange={update} catalog={ex.catalog} scope={pano.scope} onRefresh={ex.refresh} /></div>}
            </li>
          );
        })}
      </ol>
      <AddCardSelect onAdd={add} catalog={ex.catalog} />
      <p className="st-hint">Web Panorama: web yönetimindeki Panorama rejisinin {ex.catalog.scenes.length} sahnesi ({ex.catalog.source === "server" ? "sunucu kataloğu" : "gömülü katalog"}).</p>
    </div>
  );
}

function DataPanel({ pano, setScope, pd }) {
  const d = pd.data;
  const sc = pano.scope;
  const counts = [["Puan", d.standings.rows.length], ["Fikstür", d.fixtures.length], ["Sonuç", d.results.length], ["Canlı", d.live.length], ["Gol krallığı", d.scorers.length], ["Haber", d.news.length], ["Sponsor", d.sponsors.length], ["Haftanın enleri", d.weekly ? d.weekly.items.length : 0]];
  const sel = (key, list, label, reset) => (
    <label className="field pn-mini"><span>{label}</span>
      <select className="input" value={sc[key] || d.scope?.[key.replace("Id", "")]?.id || ""} onChange={(e) => setScope({ ...sc, [key]: Number(e.target.value) || null, ...reset })}>
        {key === "groupId" && <option value="">Tüm sezon</option>}
        {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="pn-data">
      {sel("cityId", d.options.cities.length ? d.options.cities : sc.cityId ? [{ id: sc.cityId, label: `İl #${sc.cityId}` }] : [], "Şehir / il", { leagueId: null, seasonId: null, groupId: null })}
      {sel("leagueId", d.options.leagues, "Lig", { seasonId: null, groupId: null })}
      {sel("seasonId", d.options.seasons, "Sezon", { groupId: null })}
      {d.options.groups.length > 0 && sel("groupId", d.options.groups, "Grup / etap", {})}
      <div className="pn-data__status">
        <button type="button" className="btn btn--sm" onClick={pd.refresh} disabled={pd.loading}><Icon name="refresh" size={12} /> {pd.loading ? "Yükleniyor…" : "Tazele"}</button>
        <small>{pd.at ? `${new Date(pd.at).toLocaleTimeString("tr-TR")} · ${d.source === "server" ? "toplu uç" : "herkese açık uçlar"}` : "—"}</small>
      </div>
      {pd.error && <p className="pn-err"><Icon name="info" size={12} /> {pd.error}</p>}
      <dl className="pn-counts">{counts.map(([l, n]) => <React.Fragment key={l}><dt>{l}</dt><dd>{n}</dd></React.Fragment>)}</dl>
      {d.errors?.length > 0 && <p className="st-hint">Alınamayan bölümler: {d.errors.join(", ")}</p>}
      <p className="st-hint">Veri her 45 sn'de bir tazelenir. Kartlar yalnız sitedeki herkese açık bilgileri gösterir.</p>
    </div>
  );
}

function BroadcastBox({ prefs, setPrefs, engine, busy, onStart, onRehearsal, onStop, chooseDir }) {
  const live = engine.active;
  const url = ingestOf(prefs);
  const res = prefs.encoding.resolution;
  return (
    <div className="pn-bcast">
      <div className="pn-seg">
        <button type="button" className={prefs.target === "youtube" ? "is-on" : ""} onClick={() => setPrefs({ target: "youtube" })} disabled={live}>YouTube</button>
        <button type="button" className={prefs.target === "rtmp" ? "is-on" : ""} onClick={() => setPrefs({ target: "rtmp" })} disabled={live}>Özel RTMP / RTMPS</button>
      </div>
      {prefs.target === "youtube" ? (
        <label className="field pn-mini"><span>YouTube yayın anahtarı (YouTube Studio › Canlı yayın)</span><input className="input" type="password" autoComplete="off" value={prefs.ytKey} disabled={live} onChange={(e) => setPrefs({ ytKey: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx" /></label>
      ) : (
        <>
          <label className="field pn-mini"><span>Sunucu adresi</span><input className="input" value={prefs.rtmpServer} disabled={live} onChange={(e) => setPrefs({ rtmpServer: e.target.value })} placeholder="rtmp://sunucu/app" /></label>
          <label className="field pn-mini"><span>Yayın anahtarı</span><input className="input" type="password" autoComplete="off" value={prefs.rtmpKey} disabled={live} onChange={(e) => setPrefs({ rtmpKey: e.target.value })} /></label>
        </>
      )}
      <div className="pn-row2">
        <label className="field pn-mini"><span>Kalite</span>
          <select className="input" value={`${res}${prefs.encoding.fps}`} disabled={live} onChange={(e) => {
            const [r, f] = e.target.value === "720p30" ? ["720p", 30] : e.target.value === "1080p60" ? ["1080p", 60] : ["1080p", 30];
            setPrefs({ encoding: normalizeEncoding({ resolution: r, fps: f, bitrateKbps: r === "720p" ? 3000 : f === 60 ? 6800 : 4500 }) });
          }}>
            <option value="720p30">720p · 30 fps · 3 Mbps</option>
            <option value="1080p30">1080p · 30 fps · 4,5 Mbps</option>
            <option value="1080p60">1080p · 60 fps · 6,8 Mbps</option>
          </select>
        </label>
        <label className="field pn-mini"><span>Geçiş</span>
          <select className="input" value={prefs.transition} onChange={(e) => setPrefs({ transition: e.target.value })}>
            {TRANSITION_KINDS.filter((t) => !/stinger/i.test(t.key)).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
      </div>
      <label className="pn-check"><input type="checkbox" checked={prefs.localRec.enabled} disabled={live} onChange={(e) => setPrefs({ localRec: { ...prefs.localRec, enabled: e.target.checked } })} /> Bu bilgisayara da kaydet (MP4)</label>
      {prefs.localRec.enabled && <div className="pn-row2"><small className="pn-path">{prefs.localRec.dir || "Varsayılan: Filmler / Videolar › ElitLig"}</small><button type="button" className="btn btn--sm" disabled={live} onClick={chooseDir}><Icon name="folder" size={12} /> Klasör</button></div>}
      <div className="pn-bcast__go">
        {!live ? (
          <>
            <button type="button" className="btn btn--red" disabled={busy || !url} onClick={onStart} title={url ? "" : "Önce yayın anahtarını gir"}><Icon name="broadcast" size={14} /> Yayını başlat</button>
            <button type="button" className="btn" disabled={busy} onClick={onRehearsal} title="Yayın yok: yalnız kayıt (prova)"><Icon name="video" size={14} /> Prova / yalnız kayıt</button>
          </>
        ) : <button type="button" className="btn btn--red" onClick={onStop}><Icon name="stop" size={14} /> {engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat"}</button>}
      </div>
      {engine.status?.message && <p className="pn-err">{engine.status.message}</p>}
      {engine.localRecord?.path && <p className="st-hint">Kayıt: {engine.localRecord.path}</p>}
    </div>
  );
}

/* ─────────────────────────────── ana görünüm ─────────────────────────────── */


/** Panorama rejisinin panelleri (yerleşimdeki türler). */
const PANEL_DEFS = [
  ["pvw", "Önizleme", "eye", "Önizlemedeki sahne"], ["pgm", "Program", "broadcast", "Yayına giden görüntü"], ["gecis", "Geçiş", "swap", "GEÇİŞ / KES / FTB, tür ve süre"],
  ["sahneler", "Sahneler", "layers", "Kamera açıları: 1/2/3/4/5'li, PiP, bölünmüş, ızgara…; kısayol, sahne ayarı"], ["multiview", "Çoklu görünüm", "grid", "Program, önizleme ve bütün sahneler"],
  ["kaynaklar", "Kaynaklar", "camera", "Kamera, ekran, pencere, görsel, video…"], ["medya", "Medya kutusu", "image", "Dışarıdan görsel / video: tam ekran, PiP, yuvaya"],
  ["grafikler", "Grafikler", "type", "Alt yazılar, tam ekran kartlar, kayan bant, CANLI rozeti"], ["icerik", "İçerik", "globe", "Sitenin içeriği: maçlar, puan, krallıklar, haberler → kart / alt yazı / bant"],
  ["kartlar", "Kartlar", "layers", "Dönen içerik kartları (oynatma listesi)"], ["veri", "Veri", "overview", "Kapsam: il, lig, sezon, grup"],
  ["tema", "Tema stüdyosu", "palette", "30 tema, canlı önizleme, her ayrıntı, dışa / içe aktar"], ["hazir", "Hazır ayarlar", "grid", "Bütün gösteri tek tıkla; şablonlar; markalar"],
  ["butonlar", "Butonlar", "zap", "Stream deck benzeri buton ızgarası"], ["yayin", "Yayın", "broadcast", "YouTube / RTMP, prova, yerel kayıt"],
  ["ses", "Ses", "mic", "Program sesi, mikrofon"], ["muzik", "Müzik çalar", "music", "Müzik listesi"], ["led", "LED", "overview", "LED ekran çıkışı"],
  ["ayarlar", "Ayarlar", "sliders", "Çıkış, geçiş süreleri, güvenli alan, kısayollar, yerleşim"],
];

export default function PanoramaStudio({ go, onSwitchMode }) {
  const toast = useToast();
  const confirm = useConfirm();
  const ask = useCallback((opts) => (confirm ? confirm(opts) : Promise.resolve(window.confirm(opts.message))), [confirm]);

  // Hazır ayarlar ve marka profilleri. Kayıtlı durum yoksa (ör. başka bilgisayara taşınan ayarlar)
  // son kullanılan hazır ayardan kurulur.
  const [presetData, setPresetDataState] = useState(() => loadPresets(store));
  const setPresetData = useCallback((fn) => setPresetDataState((d) => { const n = typeof fn === "function" ? fn(d) : fn; savePresets(store, n); return n; }), []);
  const [brands, setBrandsState] = useState(() => loadBrands(store));
  const setBrands = useCallback((list) => { setBrandsState(list); if (!saveBrands(store, list)) toast("Marka profilleri kaydedilemedi (depolama dolu olabilir: büyük logoları küçült).", { tone: "error", timeout: 6000 }); }, [toast]);
  const [pano, setPanoState] = useState(() => {
    let stored = null;
    try { stored = store?.getItem(PANORAMA_KEY) ? loadPanoramaState(store) : null; } catch { stored = null; }
    return bootState(stored, loadPresets(store), stored || defaultPanoramaState());
  });
  setCustomLayouts(pano.customLayouts);
  const panoRef = useRef(pano);
  panoRef.current = pano;
  const setPano = useCallback((fn) => setPanoState((p) => { const n = typeof fn === "function" ? fn(p) : fn; panoRef.current = n; return n; }), []);
  useEffect(() => { const t = setTimeout(() => savePanoramaState(store, pano), 300); return () => clearTimeout(t); }, [pano]);
  const setGfx = useCallback((fn) => setPano((p) => ({ ...p, gfx: typeof fn === "function" ? fn(p.gfx) : fn })), [setPano]);
  const setMedia = useCallback((fn) => setPano((p) => ({ ...p, media: typeof fn === "function" ? fn(p.media) : fn })), [setPano]);
  const setRegi = useCallback((fn) => setPano((p) => ({ ...p, regi: typeof fn === "function" ? fn(p.regi) : fn })), [setPano]);
  const [prefs, setPrefsState] = useState(readPrefs);
  const setPrefs = useCallback((patch) => setPrefsState((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) })), []);
  useEffect(() => { try { store?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);
  const [templates, setTemplatesState] = useState(() => loadTemplates(store));
  const setTemplates = useCallback((list) => { setTemplatesState(list); saveTemplates(store, list); }, []);
  const { settings } = useStudioSettings(null);
  const preset = useMemo(() => encodingPreset(prefs.encoding), [prefs.encoding]);

  /* ── veri ── */
  const pd = usePanoramaData(pano.scope);
  useEffect(() => {
    const s = pd.data.scope;
    if (!s?.city) return;
    setPano((p) => (p.scope.leagueId && p.scope.seasonId ? p : { ...p, scope: { ...p.scope, cityId: s.city.id, leagueId: p.scope.leagueId || s.league?.id || null, seasonId: p.scope.seasonId || s.season?.id || null } }));
  }, [pd.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── marka / tema, ek veri ── */
  const brand = useMemo(() => findBrand(brands, pano.brandId), [brands, pano.brandId]);
  const tokens = useMemo(() => brandTokensOf(brand), [brand]);
  const ex = usePanoramaExtras(pano, pd.data);

  /* ── zaman: kart döngüsü, yazı bantları, medya katmanı, görsel tutma ── */
  const animMsRef = useRef(520);
  animMsRef.current = tokens.anim?.ms || 520;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setPano((p) => {
        const pl = tickPlaylist(p.playlist, n);
        const gfx = tickGfx(p.gfx, n, Math.max(400, animMsRef.current || 520) + 60);
        const media = tickMedia(p.media, n);
        return pl === p.playlist && gfx === p.gfx && media === p.media ? p : { ...p, playlist: pl, gfx, media };
      });
    }, 250);
    return () => clearInterval(t);
  }, [setPano]);
  const setPlaylist = useCallback((fn) => setPano((p) => ({ ...p, playlist: fn(p.playlist) })), [setPano]);
  const card = currentCard(pano.playlist);
  const prevRef = useRef({ card: null, since: 0, at: 0, last: null, lastSince: 0 });
  if (prevRef.current.last?.id !== card?.id) prevRef.current = { card: prevRef.current.last, since: prevRef.current.lastSince, at: prevRef.current.last ? Date.now() : 0, last: card, lastSince: pano.playlist.startedAt };
  else prevRef.current.lastSince = pano.playlist.startedAt;
  const prev = prevRef.current.card ? { card: prevRef.current.card, since: prevRef.current.since, at: prevRef.current.at } : null;
  const media = currentMedia(card, now, pano.playlist.startedAt);
  const mediaKey = media?.kind === "video" ? media.src : "";
  const cardMedia = useMemo(() => (mediaKey ? { kind: "video", src: mediaKey, fit: card?.opts?.fit } : null), [mediaKey, card?.opts?.fit]);

  /* ── sahneler (açılar + medya) ── */
  // Tema zemini (gradyan türü + doku + vinyet) bir kez görsele çizilir; tema değişince yeniden.
  const bgKey = `${brand.id}|${brand.savedAt || 0}|${JSON.stringify(brand.bg)}|${JSON.stringify(brand.colors)}`;
  const bgImage = useMemo(() => backgroundImage(tokens, bgKey), [bgKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mediaCfgKey = JSON.stringify([pano.media.items.map((x) => [x.id, x.url, x.fit, x.muted, x.loop, x.kind]), pano.media.overlay, pano.media.slots]);
  // Son kullanılan 3 medya öğesinin kaynağı açık tutulur (yeniden yayına alınca ilk kare beklenmez).
  const [mediaWarm, setMediaWarm] = useState([]);
  const warmUp = useCallback((id) => setMediaWarm((w) => (w[0] === id ? w : [id, ...w.filter((x) => x !== id)].slice(0, 3))), []);
  const config = useMemo(() => buildPanoramaScenes({ sources: pano.sources, angles: pano.angles, theme: tokens, programId: pano.programId, previewId: pano.previewId, cardMedia, mediaBin: pano.media, mediaWarm, bgImage }),
    [pano.sources, pano.angles, tokens, pano.programId, pano.previewId, cardMedia, pano.customLayouts, mediaCfgKey, mediaWarm, bgImage]); // eslint-disable-line react-hooks/exhaustive-deps
  const configRef = useRef(config);
  configRef.current = config;
  const onResolve = useCallback((id, patch) => setPano((p) => ({ ...p, sources: p.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) })), [setPano]);
  const src = useStudioSources(config.sources, { onResolve, replayUrlOf: () => null });

  /* ── ses ── */
  const mixer = useAudioMixer({ mic: prefs.mic, inputs: [], replayEls: [], replayAudio: false });
  const music = useMusicPlayer({ mixer: mixer?.attachStream ? mixer : null, toast });
  const mediaCtlRef = useRef(null);
  const mediaCtl = usePanoramaMedia({ pano, setPano, runtimeRef: src.runtimeRef, mixer, programId: config.programSceneId });

  mediaCtlRef.current = mediaCtl;
  /* ── grafik anlık görüntüsü ── */
  const defaultLogo = useCanvasImage(logoInline, { inline: true });
  const themeLogo = useCanvasImage(tokens.logo || null, { inline: /^data:/.test(tokens.logo || "") });
  const branding = useMemo(() => ({ ...DEFAULT_BRANDING, primary: tokens.primary, secondary: tokens.secondary, accent: tokens.accent, name: brand.title || pano.title || DEFAULT_BRANDING.name }), [tokens, brand.title, pano.title]);
  const engineRef = useRef({ active: false });
  const snapshot = useMemo(() => buildPanoramaSnapshot({
    branding, theme: pano.theme, brand, angles: pano.angles, sources: pano.sources, card, cardSince: pano.playlist.startedAt, prev,
    data: pd.data, ticker: pano.ticker, title: pano.title, logoUrl: logoInline, siteUrl: "https://elitlig.com", band: { ...pano.band, sponsors: pd.data.sponsors, since: pano.playlist.startedAt },
    scope: pano.scope, web: ex.web, weather: ex.weather, cities: ex.cities, gfx: pano.gfx, onAir: engineRef.current.active,
  }), [branding, pano.theme, brand, pano.angles, pano.sources, card, pano.playlist.startedAt, prev?.card?.id, prev?.at, pd.data, pano.ticker, pano.title, pano.band, pano.scope, ex.version, pano.gfx, engineRef.current.active]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const overlayRef = useRef(null);
  overlayRef.current = (ctx, info) => drawGraphics(ctx, { width: info.width, height: info.height, now: Date.now(), sceneId: info.sceneId ?? null }, snapRef.current);
  const brandRef = useRef(null);
  brandRef.current = { logo: themeLogo || defaultLogo, branding };
  const replayRef = useRef({ active: false });
  const varRef = useRef({ active: false });
  const overrideRef = useRef(null);
  const previewGraphicsRef = useRef(true);
  const matchClockRef = useRef(() => null);
  const modesRef = useRef({ previewOverride: null, programOverride: null });
  const pgmFxRef = useRef(null);
  const timerRef = useRef(null);
  const comp = useCompositor({ width: preset.width, height: preset.height, fps: preset.fps, configRef, runtimeRef: src.runtimeRef, overlayRef, replayRef, varRef, brandRef, overrideRef, previewGraphicsRef, matchClockRef, modesRef, pgmFxRef, engine: settings.stream.compositor, snapshotRef: snapRef, timerRef, workerGraphics: true });
  const registerTile = useAngleTiles(configRef, src.runtimeRef, snapRef);
  try { globalThis.__elitligPanorama = { draw: comp.getStats, engine: comp.engine, snapshot: () => snapRef.current, config: () => configRef.current, program: () => comp.getCanvas(), preview: () => comp.preview, overlay: (ctx, info) => overlayRef.current(ctx, info), state: () => panoRef.current, brands: () => brands, presets: () => presetData, setPano: (fn) => setPano(fn), mediaStatus: (id) => mediaCtlRef.current?.status(id) }; } catch { /* yoksay */ }

  /* ── yayın motoru ── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, getCanvas: comp.getCanvas, subscribeFrames: comp.subscribeFrames, getRemoteEncoder: comp.getRemoteEncoder, getDrawStats: comp.getStats, onError: onEngineError });
  try { if (globalThis.__elitligPanorama) { globalThis.__elitligPanorama.enc = engine.getEncodeStats; globalThis.__elitligPanorama.audio = mixer.health; } } catch { /* yoksay */ }
  engineRef.current = engine;
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(false);
  activeRef.current = engine.active;
  useEffect(() => setLeaveGuard(async () => {
    if (!activeRef.current) return true;
    return ask({ title: "Programdan çık", message: "Panorama yayını / kaydı sürüyor. Çıkarsanız yayın kopar. Emin misiniz?", confirmLabel: "Evet, çık", danger: true });
  }), [ask]);
  const startWith = async (url) => {
    setBusy(true);
    try {
      mixer.resume?.();
      const lr = prefs.localRec.enabled ? { enabled: true, ...(prefs.localRec.dir ? { dir: prefs.localRec.dir } : {}) } : null;
      await engine.start({ url, preset, localRecord: lr, stream: settings.stream });
      toast(url ? "Panorama yayını başladı." : "Prova (yalnız kayıt) başladı.", { tone: "success", timeout: 3500 });
    } catch (e) {
      toast(e?.message || "Yayın başlatılamadı.", { tone: "error", timeout: 6000 });
    } finally { setBusy(false); }
  };
  const stop = async () => { if (await ask({ title: "Yayını kapat", message: "Panorama yayını / kaydı durdurulsun mu?", confirmLabel: "Durdur", danger: true })) await engine.stop(); };
  const chooseDir = async () => { const d = await window.elitlig?.studio?.chooseRecordDir?.(); if (d) setPrefs((p) => ({ localRec: { ...p.localRec, dir: typeof d === "string" ? d : d.dir || p.localRec.dir } })); };

  /* ── LED ── */
  const programIdRef = useRef(config.programSceneId);
  programIdRef.current = config.programSceneId;
  const previewIdRef = useRef(config.previewSceneId);
  previewIdRef.current = config.previewSceneId;
  const brandingRef = useRef(branding);
  brandingRef.current = branding;
  const ledFrameRef = useRef(null);
  ledFrameRef.current = () => {
    const c = ledFrameRef.canvas || (ledFrameRef.canvas = document.createElement("canvas"));
    if (c.width !== 960) { c.width = 960; c.height = 540; }
    c.getContext("2d", { alpha: false }).drawImage(comp.program, 0, 0, 960, 540);
    return c.toDataURL("image/jpeg", 0.72);
  };
  const led = useLed({ configRef, programIdRef, previewIdRef, graphicsRef: snapRef, brandingRef, matchId: null, ledMode: null, programId: config.programSceneId, previewId: config.previewSceneId, frameRef: ledFrameRef });

  /* ── önizleme → program ── */
  const [lastProgram, setLastProgram] = useState(null);
  const toPreview = useCallback((id) => setPano((p) => ({ ...p, previewId: id })), [setPano]);
  /** Yayına gelen sahnenin ayarı: otomatik alt yazı. */
  const onAirScene = useCallback((id) => {
    const s = panoRef.current.regi.scenes[id];
    if (s?.lower) setGfx((g) => showLower(g, s.lower, Date.now()));
  }, [setGfx]);
  const take = useCallback((force = null) => {
    const cfg = configRef.current;
    const plan = planTake({ programId: cfg.programSceneId, previewId: cfg.previewSceneId }, { kind: transitionKind(prefs.transition).key, msOf: (k) => transitionMs(k, prefs.transitionMs), sceneSettings: panoRef.current.regi.scenes, force });
    if (!plan) return;
    comp.startTransition(plan.from, plan.to, plan.kind, plan.ms);
    configRef.current = { ...cfg, programSceneId: plan.to, previewSceneId: plan.from };
    setLastProgram(plan.from);
    setPano((p) => ({ ...p, ...afterTake({ programId: p.programId, previewId: p.previewId }, plan), programId: plan.to, previewId: plan.from }));
    onAirScene(plan.to);
  }, [comp, prefs.transition, prefs.transitionMs, setPano, onAirScene]);
  const cutTo = useCallback((id, kindKey = "cut") => {
    const cfg = configRef.current;
    if (!id || id === cfg.programSceneId) return;
    const k = transitionKind(kindKey).key;
    comp.startTransition(cfg.programSceneId, id, k, k === "cut" ? 0 : transitionMs(k, prefs.transitionMs));
    configRef.current = { ...cfg, programSceneId: id };
    setLastProgram(cfg.programSceneId);
    setPano((p) => ({ ...p, programId: id, previewId: p.programId }));
    onAirScene(id);
  }, [comp, prefs.transitionMs, setPano, onAirScene]);
  const ftb = useCallback(() => { comp.setFtb(); setNow(Date.now()); }, [comp]);
  const lastScene = useCallback(() => { if (lastProgram) cutTo(lastProgram); }, [lastProgram, cutTo]);
  const [editAngle, setEditAngle] = useState(null);
  const saveAngle = (a) => {
    setPano((p) => ({ ...p, angles: p.angles.some((x) => x.id === a.id) ? p.angles.map((x) => (x.id === a.id ? a : x)) : [...p.angles, a] }));
    setEditAngle(null);
  };
  const deleteAngle = async (a) => {
    if (pano.angles.length <= 1) { toast("En az bir açı kalmalı.", { tone: "warn" }); return; }
    if (a.id === config.programSceneId && engine.active) { toast("Yayındaki açı silinemez: önce başka açıyı yayına al.", { tone: "warn" }); return; }
    if (!(await ask({ title: "Açıyı sil", message: `“${a.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    setPano((p) => ({ ...p, angles: p.angles.filter((x) => x.id !== a.id) }));
    setEditAngle(null);
  };
  const newAngle = (layout = "grid4") => setEditAngle(normalizeAngle({ id: uid("pa"), layout, slots: fillSlots(layout, pano.sources) }));

  /* ── medya kutusu ── */
  const holdRef = useRef(null);
  const srcRuntimeRef = src.runtimeRef;
  const mediaOps = useMemo(() => ({
    async addFiles(files) {
      const out = [];
      for (const f of files.slice(0, 40)) {
        try { const r = await window.elitlig?.studio?.media?.allowFile?.(f); const d = r ? draftFromFile({ ...r, type: r.type || f.type }) : null; if (d) out.push(d); } catch { /* yoksay */ }
      }
      if (!out.length) { toast("Bu dosyalar eklenemedi (görsel ya da video sürükle).", { tone: "warn" }); return; }
      setMedia((m) => addItems(m, out));
      toast(`${out.length} medya eklendi.`, { tone: "success", timeout: 2000 });
    },
    async pick() {
      const r = await window.elitlig?.studio?.media?.pick?.({ multiple: true });
      if (!r?.files?.length) { if (r?.error) toast(r.error.message, { tone: "error" }); return; }
      const out = r.files.map((f) => draftFromFile(f)).filter(Boolean);
      if (!out.length) { toast("Görsel ya da video seç.", { tone: "warn" }); return; }
      setMedia((m) => addItems(m, out));
      toast(`${out.length} medya eklendi.`, { tone: "success", timeout: 2000 });
    },
    addUrl(u) {
      const kind = kindFromUrl(u) || (/youtube|vimeo/.test(u) ? null : "image");
      if (!kind) { toast("Bu adres doğrudan oynatılamaz (görsel ya da video dosyası adresi gir).", { tone: "warn" }); return; }
      setMedia((m) => addItems(m, [{ kind, url: u }]));
    },
    cue: (id) => { warmUp(id); toPreview(mediaSceneId(id)); },
    air: (id) => {
      const sid = mediaSceneId(id);
      const it = panoRef.current.media.items.find((x) => x.id === id);
      warmUp(id);
      toPreview(sid);
      // Önizlemede kaynak açılıp ilk kare hazır olunca (en çok 4 sn) seçili geçişle yayına —
      // soğuk açılan video yayına siyah kare göndermez.
      const t0 = Date.now();
      const go = () => {
        const cfg = configRef.current;
        if (cfg.previewSceneId !== sid) { if (Date.now() - t0 < 1000) setTimeout(go, 60); return; }
        const rt = srcRuntimeRef.current?.get(mediaSourceId(id));
        if (rt?.status !== "live" && Date.now() - t0 < 4000) { setTimeout(go, 80); return; }
        take();
        if (it?.kind === "image" && it.holdSec > 0) { clearTimeout(holdRef.current); holdRef.current = setTimeout(() => { if (configRef.current.programSceneId === sid) take(); }, it.holdSec * 1000); }
      };
      setTimeout(go, 60);
    },
    overlay: (id, opts) => {
      // Kaynak açık değilse önce ısıt; ilk kare hazır olunca (en çok 4 sn) katman girer.
      warmUp(id);
      const t0 = Date.now();
      const go = () => {
        const rt = srcRuntimeRef.current?.get(mediaSourceId(id));
        if (rt?.status !== "live" && Date.now() - t0 < 4000) { setTimeout(go, 80); return; }
        setMedia((m) => showOverlay(m, id, opts, Date.now()));
      };
      go();
    },
    hideOverlay: () => setMedia((m) => hideOverlay(m, Date.now())),
    slot: (aid, k, id) => setMedia((m) => setSlot(m, aid, k, id)),
    remove: async (id) => {
      const sid = mediaSceneId(id);
      if (configRef.current.programSceneId === sid) { toast("Yayındaki medya kaldırılamaz: önce başka sahneye geç.", { tone: "warn" }); return; }
      setPano((p) => ({ ...p, media: removeItem(p.media, id), previewId: p.previewId === sid ? p.angles[0]?.id || null : p.previewId }));
    },
  }), [setMedia, setPano, take, toPreview, toast, warmUp, srcRuntimeRef]);

  /* ── kaynaklar ── */
  const [dialog, setDialog] = useState(null);
  const saveSource = (draft) => {
    setDialog(null);
    const { angleOptions, ...clean } = draft; void angleOptions;
    if (clean.kind === "audio") { toast("Ses girişleri Maç yayınının Ses panelinden yönetilir; panoramada mikrofon ve müzik çalar kullanılır.", { tone: "info", timeout: 5000 }); return; }
    if (clean.id) { setPano((p) => ({ ...p, sources: p.sources.map((s) => (s.id === clean.id ? { ...s, ...clean } : s)) })); return; }
    const s = { ...clean, id: uid("src") };
    setPano((p) => ({ ...p, sources: [...p.sources, s] }));
    toast(`“${s.name}” eklendi. Açı düzenleyicisinden bir yere koy.`, { tone: "success" });
  };
  const removeSource = async (s) => {
    const used = pano.angles.filter((a) => a.slots.includes(s.id)).map((a) => a.name);
    if (!(await ask({ title: "Kaynağı sil", message: used.length ? `“${s.name}” silinir ve şu açılardan çıkarılır: ${used.join(", ")}.` : `“${s.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    setPano((p) => ({ ...p, sources: p.sources.filter((x) => x.id !== s.id), angles: p.angles.map((a) => ({ ...a, slots: a.slots.map((x) => (x === s.id ? null : x)) })) }));
  };

  /* ── kullanıcı düzenleri ── */
  const [editLayout, setEditLayout] = useState(null);
  const saveLayout = (l) => {
    setPano((p) => { const list = p.customLayouts.some((x) => x.key === l.key) ? p.customLayouts.map((x) => (x.key === l.key ? l : x)) : [...p.customLayouts, l]; setCustomLayouts(list); return normalizePanoramaState({ ...p, customLayouts: list }); });
    setEditLayout(null);
    toast(`“${l.label}” düzeni kaydedildi (Açı düzenleyici › Benim düzenlerim).`, { tone: "success", timeout: 3000 });
  };
  const deleteLayout = async (l) => {
    const used = pano.angles.filter((a) => a.layout === l.key).map((a) => a.name);
    if (used.length) { toast(`Bu düzen şu açılarda kullanılıyor: ${used.join(", ")}`, { tone: "warn", timeout: 5000 }); return; }
    if (!(await ask({ title: "Düzeni sil", message: `“${l.label}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    setPano((p) => { const list = p.customLayouts.filter((x) => x.key !== l.key); setCustomLayouts(list); return { ...p, customLayouts: list }; });
    setEditLayout(null);
  };

  /* ── şablon, marka, hazır ayar ── */
  const applyTpl = async (t) => {
    if (engine.active && !(await ask({ title: "Şablonu uygula", message: "Yayın sürüyor. Açılar ve kartlar değişecek; program ilk açıya geçer. Devam edilsin mi?", confirmLabel: "Uygula" }))) return;
    const r = applyTemplate(t, pano.sources);
    setPano((p) => normalizePanoramaState({ ...p, ...r, templateKey: t.key, brandId: /^th_/.test(p.brandId) ? `th_${r.theme}` : p.brandId, programId: r.angles[0]?.id, previewId: r.angles[1]?.id || r.angles[0]?.id, playlist: { ...r.playlist, startedAt: Date.now() } }));
    toast(`“${t.name}” şablonu uygulandı.`, { tone: "success", timeout: 2500 });
  };
  const selectBrand = useCallback((id) => setPano((p) => ({ ...p, brandId: id, theme: BUILTIN_BRANDS.find((b) => b.id === id)?.theme || p.theme })), [setPano]);
  const activePreset = presetData.list.find((p) => p.id === pano.presetId) || null;
  const dirty = useMemo(() => (activePreset ? presetDirty(pano, activePreset) : false), [pano, activePreset]);
  const loadPreset = async (pr) => {
    if (!pr) return;
    if (engine.active && !(await ask({ title: "Hazır ayarı yükle", message: `Yayın sürüyor. “${pr.name}” yüklenince tema, açılar, kartlar ve grafikler değişir; program ilk açıya geçer. Devam edilsin mi?`, confirmLabel: "Yükle" }))) return;
    const n = applyPreset(panoRef.current, pr, { now: Date.now() });
    if (n.programId && engine.active) comp.startTransition(configRef.current.programSceneId, n.programId, "cut", 0);
    setPano(n);
    setPresetData((d) => ({ ...d, lastId: pr.id }));
    toast(`“${pr.name}” yüklendi.`, { tone: "success", timeout: 2000 });
  };
  const savePresetAs = (name) => {
    const pr = presetFromState(name, panoRef.current);
    setPresetData((d) => ({ list: [...d.list, pr], lastId: pr.id }));
    setPano((p) => ({ ...p, presetId: pr.id }));
    toast(`“${pr.name}” hazır ayarı kaydedildi.`, { tone: "success", timeout: 2500 });
  };
  const savePresetOver = () => {
    if (!activePreset) return;
    const pr = presetFromState(activePreset.name, panoRef.current, activePreset.id);
    setPresetData((d) => ({ list: d.list.map((x) => (x.id === pr.id ? pr : x)), lastId: pr.id }));
    toast(`“${pr.name}” güncellendi.`, { tone: "success", timeout: 2000 });
  };
  const renamePreset = (pr, name) => { const n = String(name || "").trim().slice(0, 60); if (n) setPresetData((d) => ({ ...d, list: d.list.map((x) => (x.id === pr.id ? { ...x, name: n } : x)) })); };
  const deletePreset = async (pr) => {
    if (!(await ask({ title: "Hazır ayarı sil", message: `“${pr.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    setPresetData((d) => ({ list: d.list.filter((x) => x.id !== pr.id), lastId: d.lastId === pr.id ? null : d.lastId }));
    if (pano.presetId === pr.id) setPano((p) => ({ ...p, presetId: null }));
  };
  const importPresets = (list) => setPresetData((d) => ({ ...d, list: [...d.list, ...list.map((p) => ({ ...p, id: d.list.some((x) => x.id === p.id) ? `${p.id}_i` : p.id }))].slice(0, 60) }));
  const webImport = ({ brand: b, preset: pr, sources }) => {
    setBrands([...brands, b]);
    setPresetData((d) => ({ list: [...d.list, pr], lastId: pr.id }));
    setPano((p) => applyPreset({ ...p, sources }, pr, { now: Date.now() }));
  };
  /** İçerik panelinden: türün kartı listede yoksa eklenir; kart yayına gelir (sabitlenmez). */
  const showCardKind = useCallback((kind) => {
    if (!kind) return;
    setPlaylist((pl) => {
      let i = pl.items.findIndex((c) => c.kind === kind && !c.off);
      let items = pl.items;
      if (i < 0) { const c = normalizeCard(makeCard(kind)); if (!c) return pl; items = [...items, c]; i = items.length - 1; }
      return gotoCard({ ...pl, items }, i, Date.now());
    });
  }, [setPlaylist]);

  /* ── buton ızgarası eylemleri ── */
  const workspace = useRef(null);
  const fireButton = useCallback((b) => {
    const n = Date.now();
    switch (b.type) {
      case "take": take(); break;
      case "cut": take("cut"); break;
      case "ftb": ftb(); break;
      case "scene": if (b.ref) toPreview(b.ref); break;
      case "sceneAir": if (b.ref) cutTo(b.ref, prefs.transition); break;
      case "lower": setGfx((g) => toggleLower(g, b.ref, n)); break;
      case "lowerNext": setGfx((g) => nextLower(g, n)); break;
      case "lowerHide": setGfx((g) => hideLower(g, n)); break;
      case "title": setGfx((g) => toggleTitle(g, b.ref, n)); break;
      case "media": mediaOps.cue(b.ref); break;
      case "mediaAir": mediaOps.air(b.ref); break;
      case "overlay": { const o = panoRef.current.media.overlay; if (o?.id === b.ref && !o.hideAt) mediaOps.hideOverlay(); else mediaOps.overlay(b.ref, {}); break; }
      case "mediaStop": mediaOps.hideOverlay(); break;
      case "ticker": setGfx((g) => ({ ...g, tickerOn: !g.tickerOn })); break;
      case "live": setGfx((g) => ({ ...g, live: !g.live })); break;
      case "theme": if (b.ref) selectBrand(b.ref); break;
      case "preset": loadPreset(presetData.list.find((p) => p.id === b.ref)); break;
      case "cardNext": setPlaylist((p) => stepCard(p, 1, n)); break;
      case "transition": if (b.ref) setPrefs({ transition: b.ref }); break;
      default: break;
    }
  }, [take, ftb, toPreview, cutTo, prefs.transition, setGfx, mediaOps, selectBrand, presetData.list, setPlaylist, setPrefs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── klavye ── */
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || editAngle || dialog || editLayout) return;
    if (document.querySelector(".modal, [role='dialog'][aria-modal='true']")) return;
    if (e.altKey) { const m = /^Digit([1-9])$/.exec(e.code)?.[1]; const pr = m ? presetData.list[Number(m) - 1] : null; if (pr) { e.preventDefault(); loadPreset(pr); } return; }
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (n) { const a = pano.angles[Number(n) - 1]; if (a) { e.preventDefault(); if (e.shiftKey) cutTo(a.id); else toPreview(a.id); } return; }
    const name = keyName(e);
    const act = actionForKey(name, pano.regi.hotkeys);
    const t = Date.now();
    if (act) {
      e.preventDefault();
      switch (act) {
        case "take": take(); break;
        case "cut": take("cut"); break;
        case "ftb": ftb(); break;
        case "lowerHide": setGfx((g) => hideLower(g, t)); break;
        case "lowerNext": setGfx((g) => nextLower(g, t)); break;
        case "titleHide": setGfx((g) => hideTitle(g, t)); break;
        case "ticker": setGfx((g) => ({ ...g, tickerOn: !g.tickerOn })); break;
        case "live": setGfx((g) => ({ ...g, live: !g.live })); break;
        case "mediaStop": mediaOps.hideOverlay(); break;
        case "cardNext": setPlaylist((p) => stepCard(p, 1, t)); break;
        case "cardPrev": setPlaylist((p) => stepCard(p, -1, t)); break;
        case "cardPin": if (card) setPlaylist((p) => pinCard(p, card.id, t)); break;
        case "safe": setRegi((r) => ({ ...r, safe: { ...r.safe, on: !r.safe.on } })); break;
        default: break;
      }
      return;
    }
    // Öğe kısayolları: alt yazı / tam ekran kart (göster-gizle), sahne (önizlemeye).
    const lw = pano.gfx.lowers.find((l) => l.key && l.key === name);
    if (lw) { e.preventDefault(); setGfx((g) => toggleLower(g, lw.id, t)); return; }
    const tc = pano.gfx.titles.find((l) => l.key && l.key === name);
    if (tc) { e.preventDefault(); setGfx((g) => toggleTitle(g, tc.id, t)); return; }
    const sc = sceneForKey(pano.regi, name);
    if (sc) { e.preventDefault(); if (e.shiftKey) cutTo(sc); else toPreview(sc); }
  };
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  const [wsEdit, setWsEdit] = useState(false);
  const st = engine.status || { state: "idle" };
  const onAir = engine.active;
  const toggleMic = () => setPrefs((p) => ({ mic: { ...p.mic, muted: !p.mic.muted } }));
  const setSceneSetting_ = useCallback((id, patch) => setRegi((r) => setSceneSetting(r, id, patch)), [setRegi]);
  const applyLayout = useCallback((key) => { if (workspace.current?.applyPreset(key)) setRegi((r) => ({ ...r, layout: key })); }, [setRegi]);

  const R = {
    pano, setPano, setGfx, setMedia, setRegi, config, configRef, comp, src, engine, prefs, setPrefs, preset, brand, brands, setBrands, selectBrand, tokens,
    take, cutTo, toPreview, ftb, lastProgram, lastScene, registerTile, newAngle, setEditAngle, setEditLayout, setDialog, removeSource, mediaOps, mediaCtl,
    pd, ex, now, card, cardLabel: card ? cardLabel(card, ex.catalog.scenes) : "", setPlaylist, music, mixer, led, toast, ask, presetData, importPresets, onAir,
    fireButton, showCardKind, setSceneSetting: setSceneSetting_, applyLayout,
  };
  const panels = {};
  const BODY = {
    pvw: () => <MonitorPanel kind="pvw" />,
    pgm: () => <MonitorPanel kind="pgm" />,
    gecis: () => <TakePanel />,
    sahneler: () => <ScenesPanel />,
    multiview: () => <MultiviewPanel />,
    kaynaklar: () => <SourcesPane />,
    medya: () => <MediaPanel />,
    grafikler: () => <GraphicsPanel />,
    icerik: () => <ContentPanel />,
    kartlar: () => <div className="pr-pad"><CardsPanel pano={pano} setPlaylist={setPlaylist} data={pd.data} now={now} ex={ex} /></div>,
    veri: () => <div className="pr-pad"><DataPanel pano={pano} setScope={(scope) => setPano((p) => ({ ...p, scope }))} pd={pd} /></div>,
    tema: () => <ThemeStudio />,
    hazir: () => (
      <div className="pr-pad">
        <PresetsPanel presets={presetData.list} activeId={pano.presetId} dirty={dirty} onApply={loadPreset} onSave={savePresetOver} onSaveAs={savePresetAs} onRename={renamePreset} onDelete={deletePreset}
          brands={brands} templates={templates} templateKey={pano.templateKey} onApplyTemplate={applyTpl}
          onSaveTemplate={(name) => setTemplates([...templates, templateFromState(name || `Şablon ${templates.length + 1}`, pano)])}
          onDeleteTemplate={async (t) => { if (await ask({ title: "Şablonu sil", message: `“${t.name}” silinsin mi?`, confirmLabel: "Sil", danger: true })) setTemplates(templates.filter((x) => x.key !== t.key)); }}
          sources={pano.sources} onWebImport={webImport} />
        <details className="pr-details"><summary>Marka profilleri (eski görünüm: logo, renk, yazı tipi)</summary>
          <BrandPanel brands={brands} setBrands={setBrands} activeId={pano.brandId} onSelect={selectBrand} ask={ask} presets={presetData.list} onImportPresets={importPresets} />
        </details>
      </div>
    ),
    butonlar: () => <ButtonGrid />,
    yayin: () => <div className="pr-pad"><BroadcastBox prefs={prefs} setPrefs={setPrefs} engine={engine} busy={busy} onStart={() => startWith(ingestOf(prefs))} onRehearsal={() => startWith(null)} onStop={stop} chooseDir={chooseDir} /></div>,
    ses: () => <AudioPane />,
    muzik: () => <MusicPane />,
    led: () => <div className="pr-pad"><LedPanel led={led} scenes={config.scenes} matchId={null} ledMode={null} g={null} live={null} /></div>,
    ayarlar: () => <RegiSettings />,
  };
  for (const [k, title, icon, hint] of PANEL_DEFS) {
    panels[k] = {
      title, icon, hint, render: BODY[k], monitor: k === "pvw" || k === "pgm",
      ...(k === "grafikler" ? { badge: () => (pano.gfx.lowerOn && !pano.gfx.lowerOn.hideAt ? { text: "YAYINDA", tone: "live" } : null) } : {}),
      ...(k === "medya" ? { badge: () => (pano.media.items.length ? { text: String(pano.media.items.length), tone: mediaCtl.airIds.size ? "live" : "info" } : null) } : {}),
    };
  }

  return (
    <RegiCtx.Provider value={R}>
    <div className="studio pn pr" onPointerDown={() => mixer.resume?.()} data-panorama="" data-regi="">
      <header className="st-top pn-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        <div className="pn-mode" role="tablist" aria-label="Yayın türü">
          <button type="button" role="tab" aria-selected="false" disabled={onAir} onClick={onSwitchMode} title={onAir ? "Yayın sürerken tür değiştirilemez" : "Maç rejisine geç"}>Maç rejisi</button>
          <button type="button" role="tab" aria-selected="true" className="is-on">Panorama rejisi</button>
        </div>
        <span className="pn-scope">{[pd.data.scope.city?.label, pd.data.scope.league?.label, pd.data.scope.season?.label].filter(Boolean).join(" · ") || "Kapsam seçilmedi"}</span>
        <div className="pn-presetbar" aria-label="Tema ve hazır ayarlar">
          <select className="input pn-brandsel" value={pano.brandId} onChange={(e) => selectBrand(e.target.value)} title="Tema / marka (yayında da anında)" data-field="brand-quick">
            {brands.length > 0 && <optgroup label="Özel temalar / markalarım">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
            <optgroup label="Hazır temalar">{BUILTIN_BRANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
          </select>
          {presetData.list.slice(0, 6).map((pr, i) => (
            <button key={pr.id} type="button" className={`pn-presetchip ${pr.id === pano.presetId ? "is-on" : ""}`} onClick={() => loadPreset(pr)} title={`${pr.name} (⌥${i + 1})`} data-preset-chip={pr.id}>
              {pr.name}{pr.id === pano.presetId && dirty ? " •" : ""}
            </button>
          ))}
          {activePreset && dirty && <button type="button" className="btn btn--sm" onClick={savePresetOver} title="Hazır ayarı güncelle" data-act="preset-quick-save"><Icon name="check" size={12} /> Kaydet</button>}
        </div>
        <StatusPill state={st.state} since={engine.since} />
        <HealthChip status={st} getStats={comp.getStats} getEncodeStats={engine.getEncodeStats} targetFps={preset.fps} encoding={onAir} />
        <span className="st-top__spacer" />
        <button type="button" className={`btn btn--sm ${prefs.mic.muted ? "" : "btn--red"}`} onClick={toggleMic} title={prefs.mic.muted ? "Mikrofon kapalı — aç" : "Mikrofon açık — kapat"} data-act="mic-label"><Icon name={prefs.mic.muted ? "micOff" : "mic"} size={13} /> <span>{prefs.mic.muted ? "Mikrofon kapalı" : "Mikrofon açık"}</span></button>
        <OutMuteButton />
        <MenuButton text="Hazır düzen" icon="layout" label="Ekran yerleşimi" align="end" className="btn btn--sm" items={LAYOUT_PRESETS.map((p) => ({ label: p.label, icon: pano.regi.layout === p.key ? "check" : "layout", onClick: () => applyLayout(p.key) }))} />
        <button type="button" className={`btn btn--sm ${wsEdit ? "btn--primary" : ""}`} onClick={() => setWsEdit((v) => !v)} title="Yerleşimi düzenle: panelleri sürükle, böl, sekmele" data-act="ws-edit"><Icon name="pencil" size={13} /> {wsEdit ? "Bitti" : "Düzenle"}</button>
        <button type="button" className="btn btn--sm" onClick={() => workspace.current?.focus("ayarlar")} title="Panorama rejisi ayarları" data-act="open-settings"><Icon name="sliders" size={13} /></button>
        {!onAir
          ? <button type="button" className="btn btn--red st-golive" disabled={busy} onClick={() => (ingestOf(prefs) ? startWith(ingestOf(prefs)) : workspace.current?.focus("yayin"))}><Icon name="broadcast" size={14} /> Yayını başlat</button>
          : <button type="button" className="btn st-golive" onClick={stop}><Icon name="stop" size={14} /> {engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat"}</button>}
        <span className="st-top__sep" />
        <button type="button" className="st-exit" onClick={() => go?.("today")}><Icon name="logout" size={14} /> Programdan çık</button>
      </header>

      <PanoramaWorkspace ref={workspace} panels={panels} edit={wsEdit} onPreset={(k) => setRegi((r) => ({ ...r, layout: k }))} />

      {editAngle && <AngleEditor angle={editAngle} sources={pano.sources} onSave={saveAngle} onDelete={pano.angles.some((a) => a.id === editAngle.id) ? () => deleteAngle(editAngle) : null} onClose={() => setEditAngle(null)} onSaveLayout={saveLayout} onEditLayout={(l) => setEditLayout(l)} />}
      {editLayout && <LayoutEditor layout={editLayout.key ? editLayout : null} onSave={saveLayout} onDelete={pano.customLayouts.some((x) => x.key === editLayout.key) ? deleteLayout : null} onClose={() => setEditLayout(null)} />}
      {dialog && (
        <SourceDialog initial={dialog.initial} cameraCount={pano.sources.filter((s) => s.kind === "camera").length} devices={src.devices} access={src.access}
          onRequestAccess={src.requestAccess} onRefreshDevices={src.refreshDevices} onSave={saveSource} onClose={() => setDialog(null)} runtimeRef={src.runtimeRef}
          config={config} onPatchSource={onResolve} />
      )}
    </div>
    </RegiCtx.Provider>
  );
}
