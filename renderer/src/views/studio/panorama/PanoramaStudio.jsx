// YAYIN STÜDYOSU · PANORAMA KİPİ — maç seçmeden, web sitesinin içerikleriyle stüdyo programı
// (haber masası / yayın stüdyosu düzeni).
//
//   KAYNAKLAR   kamera, ekran, pencere, görsel, video, renk… (Maç yayınıyla aynı SourceDialog ve
//               useStudioSources; panorama kendi kaynak listesini tutar: studio.panorama.v1)
//   AÇILAR      4-5 kamerayı aynı anda gösteren düzenler (ızgara, 2+3, büyük + küçükler, şerit,
//               sunucu + konuk, sunucu + içerik…). Tık: ÖNİZLEME, çift tık / Shift+sayı: doğrudan
//               PROGRAM; GEÇİŞ (Boşluk / Enter), KES (C), 1–9 önizlemeye. Açılar stüdyo sahnesidir
//               (lib/studio/panorama/model.js buildPanoramaScenes) ve Maç yayınının karıştırıcısı
//               (useCompositor: işçi motoru, geçişler, FTB) çizer — kopya yok.
//   KARTLAR     web sitesinin verisi (puan durumu, fikstür, sonuçlar, canlı skorlar, krallıklar,
//               haftanın enleri, haberler, takım kartı, karşılaştırma, sponsorlar, QR, saat…)
//               oynatma listesiyle döner (kart başına süre, elle sabitleme, ← / → ve P). Kartlar
//               GRAFİK KATMANINDA program tuvaline çizilir (lib/studio/panorama/draw.js) — yayına,
//               kayda ve LED'e giden görüntüde görünür.
//   YAYIN       aynı motor (useEngine → ana süreç ffmpeg → RTMP / RTMPS, YouTube yayın anahtarı,
//               prova / yalnız kayıt, yerel tam kayıt). Müzik çalar ve LED çıkışı aynı modüller.
//   ŞABLONLAR   açılar + kart sırası + alt bant + tema; hazır sekiz şablon, kaydedilebilir.
//   MARKALAR    marka profilleri (BrandPanel.jsx; lib/studio/panorama/brands.js): logo, renk, yazı tipi,
//               kart / künye / bant / saat stili, animasyon, filigran; 16 hazır tema; dışa / içe aktarma.
//   HAZIR AYAR  marka + açılar + kartlar + kaynaklar + kapsam (PresetsPanel.jsx; presets.js); son
//               kullanılan açılışta yüklenir, üst çubuktan ve ⌥1–9 ile tek tıkla geçiş. Web Panorama
//               yönetimindeki kayıtlı yayınlar içe aktarılır.
//   WEB SAHNELERİ web Panorama rejisinin 51 sahnesi kart olarak (webScenes.js, drawWeb.js).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Modal, useConfirm, useToast } from "../../../components/ui";
import { setLeaveGuard } from "../../../lib/leaveGuard";
import { encodingPreset, normalizeEncoding, statusPill } from "../../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../../lib/studio/transitions";
import { DEFAULT_BRANDING } from "../../../lib/studio/stinger";
import { drawGraphics } from "../../../lib/studio/graphics";
import { uid } from "../../../lib/studio/scenes";
import {
  PANORAMA_KEY, applyTemplate, buildPanoramaScenes, buildPanoramaSnapshot, cardLabel, currentCard, currentMedia, defaultPanoramaState, fillSlots, gotoCard, layoutOf,
  loadPanoramaState, loadTemplates, normalizeAngle, normalizeCard, normalizePanoramaState, pinCard, remainingSec, savePanoramaState, saveTemplates,
  setCustomLayouts, stepCard, templateFromState, tickPlaylist, webCardKey,
} from "../../../lib/studio/panorama/model";
import { BUILTIN_BRANDS, findBrand, loadBrands, saveBrands } from "../../../lib/studio/panorama/brands";
import { applyPreset, bootState, loadPresets, presetDirty, presetFromState, savePresets } from "../../../lib/studio/panorama/presets";
import { AngleEditor, LayoutEditor, LayoutPic } from "./AngleEditor";
import { AddCardSelect, CardOptions } from "./CardEditor";
import BrandPanel from "./BrandPanel";
import PresetsPanel from "./PresetsPanel";
import { usePanoramaExtras } from "./usePanoramaExtras";
import { brandTokens as brandTokensOf } from "../../../lib/studio/panorama/brands";
import { useStudioSources } from "../useStudioSources";
import { useAudioMixer } from "../useAudioMixer";
import { useCanvasImage, useCompositor } from "../useCompositor";
import { useEngine } from "../useEngine";
import { drawScene } from "../draw";
import { canvasLoop } from "../perf/renderLoad";
import { useStudioSettings } from "../settings/useStudioSettings";
import { SourceDialog, SourceThumb } from "../SourcesPanel";
import Monitor from "../scenes/Monitor";
import HealthChip from "../scenes/HealthChip";
import OutMuteButton from "../audio/OutMuteButton";
import { MusicPanel, useMusicPlayer } from "../music";
import { useLed } from "../led/useLed";
import LedPanel from "../led/LedPanel";
import { resolveScene } from "../../../lib/studio/scenes";
import { usePanoramaData } from "./usePanoramaData";
import logoInline from "../../../assets/elitlig-beyaz.png?inline";
import "../studio.css";
import "./panorama.css";

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

/** Açı küçük resimleri: sahne + panorama katmanı (kart, künye, bant) — program ile aynı çizim. */
function useAngleTiles(configRef, runtimeRef, snapRef) {
  const canvases = useRef(new Map());
  useEffect(() => canvasLoop("Panorama açıları (küçük resim)", { fps: 5 }, () => {
    const cfg = configRef.current;
    if (!cfg) return;
    const now = performance.now();
    for (const [c, id] of canvases.current) {
      if (!c.isConnected || c.offsetParent === null) continue;
      const ctx = c.getContext("2d", { alpha: false });
      drawScene(ctx, resolveScene(cfg, id), cfg.sources, runtimeRef.current, c.width, c.height, { placeholders: true, now, noFx: true });
      try { drawGraphics(ctx, { width: c.width, height: c.height, now: Date.now(), sceneId: id }, snapRef.current); } catch { /* yoksay */ }
    }
  }), [configRef, runtimeRef, snapRef]);
  return useCallback((id) => (el) => {
    for (const [c, cid] of canvases.current) if (cid === id && c !== el) canvases.current.delete(c);
    if (el) canvases.current.set(el, id);
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

function LookPanel({ pano, setPano }) {
  const tk = pano.ticker;
  const setTk = (patch) => setPano((p) => ({ ...p, ticker: { ...p.ticker, ...patch } }));
  const srcs = [["live", "Canlı skorlar"], ["results", "Son sonuçlar"], ["fixtures", "Yaklaşan maçlar"], ["news", "Haber başlıkları"], ["custom", "Serbest metin"]];
  return (
    <div className="pn-look">
      <label className="field pn-mini"><span>Program başlığı</span><input className="input" value={pano.title} maxLength={60} onChange={(e) => setPano((p) => ({ ...p, title: e.target.value }))} /></label>
      <p className="st-hint">Tema, logo ve renkler: <b>Marka</b> sekmesi. Marka profilinde program başlığı yazılıysa o kullanılır.</p>
      <label className="pn-check"><input type="checkbox" checked={tk.on} onChange={(e) => setTk({ on: e.target.checked })} /> Alt bant (kayan haber şeridi)</label>
      <div className="pn-checks pn-checks--col">{srcs.map(([k, l]) => (
        <label key={k}><input type="checkbox" checked={tk.sources.includes(k)} onChange={(e) => setTk({ sources: e.target.checked ? [...tk.sources, k] : tk.sources.filter((x) => x !== k) })} /> {l}</label>
      ))}</div>
      <label className="field pn-mini"><span>Serbest metin (her satır bir öğe)</span><textarea className="input" rows={3} value={tk.text} maxLength={600} onChange={(e) => setTk({ text: e.target.value })} /></label>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Bant etiketi</span><input className="input" value={tk.label} maxLength={24} onChange={(e) => setTk({ label: e.target.value })} /></label>
        <label className="field pn-mini"><span>Hız (px/sn)</span><input className="input" type="number" min={40} max={400} value={tk.speed} onChange={(e) => setTk({ speed: Number(e.target.value) || 120 })} /></label>
      </div>
      <label className="pn-check"><input type="checkbox" checked={pano.band.on} onChange={(e) => setPano((p) => ({ ...p, band: { on: e.target.checked } }))} /> Sponsor kutusu (sağ altta dönen logolar)</label>
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
  const [prefs, setPrefsState] = useState(readPrefs);
  const setPrefs = useCallback((patch) => setPrefsState((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) })), []);
  useEffect(() => { try { store?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);
  const [templates, setTemplatesState] = useState(() => loadTemplates(store));
  const setTemplates = useCallback((list) => { setTemplatesState(list); saveTemplates(store, list); }, []);
  const { settings } = useStudioSettings(null);
  const preset = useMemo(() => encodingPreset(prefs.encoding), [prefs.encoding]);

  /* ── veri ── */
  const pd = usePanoramaData(pano.scope);
  // İlk açılışta kapsam eksikse sunucunun seçtiği (öncelikli lig / sezon) yazılır.
  useEffect(() => {
    const s = pd.data.scope;
    if (!s?.city) return;
    setPano((p) => (p.scope.leagueId && p.scope.seasonId ? p : { ...p, scope: { ...p.scope, cityId: s.city.id, leagueId: p.scope.leagueId || s.league?.id || null, seasonId: p.scope.seasonId || s.season?.id || null } }));
  }, [pd.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── marka, ek veri (web sahneleri, hava, iller) ── */
  const brand = useMemo(() => findBrand(brands, pano.brandId), [brands, pano.brandId]);
  const ex = usePanoramaExtras(pano, pd.data);

  /* ── kart döngüsü ── */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setPano((p) => { const pl = tickPlaylist(p.playlist, n); return pl === p.playlist ? p : { ...p, playlist: pl }; });
    }, 250);
    return () => clearInterval(t);
  }, [setPano]);
  const setPlaylist = useCallback((fn) => setPano((p) => ({ ...p, playlist: fn(p.playlist) })), [setPano]);
  const card = currentCard(pano.playlist);
  // Çıkış animasyonu için bir önceki kart.
  const prevRef = useRef({ card: null, since: 0, at: 0, last: null, lastSince: 0 });
  if (prevRef.current.last?.id !== card?.id) prevRef.current = { card: prevRef.current.last, since: prevRef.current.lastSince, at: prevRef.current.last ? Date.now() : 0, last: card, lastSince: pano.playlist.startedAt };
  else prevRef.current.lastSince = pano.playlist.startedAt;
  const prev = prevRef.current.card ? { card: prevRef.current.card, since: prevRef.current.since, at: prevRef.current.at } : null;
  // Slayt / sponsor kartının videosu: program sahnesinde kart kutusunda katman.
  const media = currentMedia(card, now, pano.playlist.startedAt);
  const mediaKey = media?.kind === "video" ? media.src : "";
  const cardMedia = useMemo(() => (mediaKey ? { kind: "video", src: mediaKey, fit: card?.opts?.fit } : null), [mediaKey, card?.opts?.fit]);

  /* ── sahneler (açılardan) ── */
  const tokensKey = `${brand.id}|${brand.colors.background}|${brand.colors.primary}|${brand.colors.secondary}|${brand.colors.accent}`;
  const config = useMemo(() => buildPanoramaScenes({ sources: pano.sources, angles: pano.angles, theme: findBrand(brands, pano.brandId) ? brandTokensOf(findBrand(brands, pano.brandId)) : pano.theme, programId: pano.programId, previewId: pano.previewId, cardMedia }), [pano.sources, pano.angles, tokensKey, pano.programId, pano.previewId, cardMedia, pano.customLayouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const configRef = useRef(config);
  configRef.current = config;
  const onResolve = useCallback((id, patch) => setPano((p) => ({ ...p, sources: p.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) })), [setPano]);
  const src = useStudioSources(config.sources, { onResolve, replayUrlOf: () => null });

  /* ── ses: mikrofon + müzik (aynı karıştırıcı) ── */
  const mixer = useAudioMixer({ mic: prefs.mic, inputs: [], replayEls: [], replayAudio: false });
  const music = useMusicPlayer({ mixer: mixer?.attachStream ? mixer : null, toast });

  /* ── grafik anlık görüntüsü (program + önizleme + işçi + LED) ── */
  const defaultLogo = useCanvasImage(logoInline, { inline: true });
  const branding = DEFAULT_BRANDING;
  const snapshot = useMemo(() => buildPanoramaSnapshot({
    branding, theme: pano.theme, brand, angles: pano.angles, sources: pano.sources, card, cardSince: pano.playlist.startedAt, prev,
    data: pd.data, ticker: pano.ticker, title: pano.title, logoUrl: logoInline, siteUrl: "https://elitlig.com", band: { ...pano.band, sponsors: pd.data.sponsors, since: pano.playlist.startedAt },
    scope: pano.scope, web: ex.web, weather: ex.weather, cities: ex.cities,
  }), [branding, pano.theme, brand, pano.angles, pano.sources, card, pano.playlist.startedAt, prev?.card?.id, prev?.at, pd.data, pano.ticker, pano.title, pano.band, pano.scope, ex.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const overlayRef = useRef(null);
  overlayRef.current = (ctx, info) => drawGraphics(ctx, { width: info.width, height: info.height, now: Date.now(), sceneId: info.sceneId ?? null }, snapRef.current);
  const brandRef = useRef(null);
  brandRef.current = { logo: defaultLogo, branding };
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
  try { globalThis.__elitligPanorama = { draw: comp.getStats, engine: comp.engine, snapshot: () => snapRef.current, config: () => configRef.current, program: () => comp.getCanvas(), overlay: (ctx, info) => overlayRef.current(ctx, info), state: () => panoRef.current, brands: () => brands, presets: () => presetData }; } catch { /* yoksay */ }

  /* ── yayın motoru ── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, getCanvas: comp.getCanvas, subscribeFrames: comp.subscribeFrames, getRemoteEncoder: comp.getRemoteEncoder, getDrawStats: comp.getStats, onError: onEngineError });
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
  const ledFrameRef = useRef(null);
  ledFrameRef.current = () => {
    const c = ledFrameRef.canvas || (ledFrameRef.canvas = document.createElement("canvas"));
    if (c.width !== 960) { c.width = 960; c.height = 540; }
    c.getContext("2d", { alpha: false }).drawImage(comp.program, 0, 0, 960, 540);
    return c.toDataURL("image/jpeg", 0.72);
  };
  const led = useLed({ configRef, programIdRef, previewIdRef, graphicsRef: snapRef, brandingRef, matchId: null, ledMode: null, programId: config.programSceneId, previewId: config.previewSceneId, frameRef: ledFrameRef });

  /* ── açılar: önizleme → program ── */
  const toPreview = useCallback((id) => setPano((p) => ({ ...p, previewId: id })), [setPano]);
  const take = useCallback((kindKey) => {
    const cfg = configRef.current;
    const to = cfg.previewSceneId;
    const from = cfg.programSceneId;
    if (!to || to === from) return;
    const kind = transitionKind(kindKey || prefs.transition);
    comp.startTransition(from, to, kind.key, transitionMs(kind.key, prefs.transitionMs));
    configRef.current = { ...cfg, programSceneId: to, previewSceneId: from };
    setPano((p) => ({ ...p, programId: to, previewId: from }));
  }, [comp, prefs.transition, prefs.transitionMs, setPano]);
  const cutTo = useCallback((id) => {
    const cfg = configRef.current;
    if (!id || id === cfg.programSceneId) return;
    comp.startTransition(cfg.programSceneId, id, "cut", 0);
    configRef.current = { ...cfg, programSceneId: id };
    setPano((p) => ({ ...p, programId: id, previewId: p.programId }));
  }, [comp, setPano]);
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

  /* ── şablon ── */
  const applyTpl = async (t) => {
    if (engine.active && !(await ask({ title: "Şablonu uygula", message: "Yayın sürüyor. Açılar ve kartlar değişecek; program ilk açıya geçer. Devam edilsin mi?", confirmLabel: "Uygula" }))) return;
    const r = applyTemplate(t, pano.sources);
    // Hazır tema kullanılıyorsa şablonun teması seçilir; kendi marka profili korunur.
    setPano((p) => normalizePanoramaState({ ...p, ...r, templateKey: t.key, brandId: /^th_/.test(p.brandId) ? `th_${r.theme}` : p.brandId, programId: r.angles[0]?.id, previewId: r.angles[1]?.id || r.angles[0]?.id, playlist: { ...r.playlist, startedAt: Date.now() } }));
    toast(`“${t.name}” şablonu uygulandı.`, { tone: "success", timeout: 2500 });
  };

  /* ── marka ve hazır ayarlar ── */
  const selectBrand = useCallback((id) => setPano((p) => ({ ...p, brandId: id, theme: BUILTIN_BRANDS.find((b) => b.id === id)?.theme || p.theme })), [setPano]);
  const activePreset = presetData.list.find((p) => p.id === pano.presetId) || null;
  const dirty = useMemo(() => (activePreset ? presetDirty(pano, activePreset) : false), [pano, activePreset]);
  const loadPreset = async (pr) => {
    if (!pr) return;
    if (engine.active && !(await ask({ title: "Hazır ayarı yükle", message: `Yayın sürüyor. “${pr.name}” yüklenince marka, açılar ve kartlar değişir; program ilk açıya geçer. Devam edilsin mi?`, confirmLabel: "Yükle" }))) return;
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

  /* ── klavye ── */
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || editAngle || dialog || editLayout) return;
    // ⌥1–9: hazır ayarlar arasında geçiş (yayın sırasında da).
    if (e.altKey) { const m = /^Digit([1-9])$/.exec(e.code)?.[1]; const pr = m ? presetData.list[Number(m) - 1] : null; if (pr) { e.preventDefault(); loadPreset(pr); } return; }
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (n) { const a = pano.angles[Number(n) - 1]; if (a) { e.preventDefault(); if (e.shiftKey) cutTo(a.id); else toPreview(a.id); } return; }
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); take(); return; }
    if (e.key === "c" || e.key === "C") { e.preventDefault(); cutTo(configRef.current.previewSceneId); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); setPlaylist((p) => stepCard(p, 1, Date.now())); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); setPlaylist((p) => stepCard(p, -1, Date.now())); return; }
    if ((e.key === "p" || e.key === "P") && card) { e.preventDefault(); setPlaylist((p) => pinCard(p, card.id, Date.now())); }
  };
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  const tab = prefs.tab;
  const setTab = (t) => setPrefs({ tab: t });
  const st = engine.status || { state: "idle" };
  const onAir = engine.active;
  const programName = pano.angles.find((a) => a.id === config.programSceneId)?.name || "—";
  const previewName = pano.angles.find((a) => a.id === config.previewSceneId)?.name || "—";
  const toggleMic = () => setPrefs((p) => ({ mic: { ...p.mic, muted: !p.mic.muted } }));

  const TABS = [["kartlar", "Kartlar", "layers"], ["marka", "Marka", "palette"], ["sablon", "Hazır ayar", "grid"], ["veri", "Veri", "overview"], ["gorunum", "Bant", "sliders"], ["yayin", "Yayın", "broadcast"], ["ses", "Ses", "music"], ["led", "LED", "overview"]];

  return (
    <div className="studio pn" onPointerDown={() => mixer.resume?.()} data-panorama="">
      <header className="st-top pn-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        <div className="pn-mode" role="tablist" aria-label="Yayın türü">
          <button type="button" role="tab" aria-selected="false" disabled={onAir} onClick={onSwitchMode} title={onAir ? "Yayın sürerken tür değiştirilemez" : "Maç yayınına geç"}>Maç yayını</button>
          <button type="button" role="tab" aria-selected="true" className="is-on">Panorama</button>
        </div>
        <span className="pn-scope">{[pd.data.scope.city?.label, pd.data.scope.league?.label, pd.data.scope.season?.label].filter(Boolean).join(" · ") || "Kapsam seçilmedi"}</span>
        <div className="pn-presetbar" aria-label="Hazır ayarlar">
          <select className="input pn-brandsel" value={pano.brandId} onChange={(e) => selectBrand(e.target.value)} title="Marka / tema (yayında da anında)" data-field="brand-quick">
            <optgroup label="Marka profillerim">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
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
        <button type="button" className={`btn btn--sm ${prefs.mic.muted ? "" : "btn--red"}`} onClick={toggleMic} title="Mikrofon"><Icon name={prefs.mic.muted ? "micOff" : "mic"} size={13} /> {prefs.mic.muted ? "Mikrofon kapalı" : "Mikrofon açık"}</button>
        <OutMuteButton />
        {!onAir
          ? <button type="button" className="btn btn--red st-golive" disabled={busy} onClick={() => (ingestOf(prefs) ? startWith(ingestOf(prefs)) : setTab("yayin"))}><Icon name="broadcast" size={14} /> Yayını başlat</button>
          : <button type="button" className="btn st-golive" onClick={stop}><Icon name="stop" size={14} /> {engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat"}</button>}
        <span className="st-top__sep" />
        <button type="button" className="st-exit" onClick={() => go?.("today")}><Icon name="logout" size={14} /> Programdan çık</button>
      </header>

      <div className="pn-body">
        <section className="pn-main">
          <div className="pn-monitors">
            <figure className="st-monitor is-preview pn-mon">
              <figcaption><span className="st-tag is-pvw">ÖNİZLEME</span><span className="st-monitor__name">{previewName}</span></figcaption>
              <Monitor canvas={comp.preview} className="st-monitor__screen" />
            </figure>
            <div className="pn-take">
              <button type="button" className="pn-takebtn" onClick={() => take()} title="Önizlemeyi geçişle yayına al (Boşluk / Enter)"><Icon name="chevronRight" size={20} /><span>GEÇİŞ</span><Kbd>Boşluk</Kbd></button>
              <button type="button" className="pn-cutbtn" onClick={() => cutTo(config.previewSceneId)} title="Kes (C)"><span>KES</span><Kbd>C</Kbd></button>
              <select className="input pn-trsel" value={prefs.transition} onChange={(e) => setPrefs({ transition: e.target.value })} title="Geçiş türü">
                {TRANSITION_KINDS.filter((t) => !/stinger/i.test(t.key)).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <button type="button" className={`btn btn--sm ${comp.programFx().ftb ? "btn--red" : ""}`} onClick={() => { comp.setFtb(); setNow(Date.now()); }} title="Siyaha geç / geri aç">FTB</button>
            </div>
            <figure className={`st-monitor is-program pn-mon ${st.state === "live" ? "is-live" : ""}`}>
              <figcaption><span className={`st-tag ${onAir ? "is-live" : "is-pgm"}`}>{onAir ? "● YAYINDA" : "PROGRAM"}</span><span className="st-monitor__name">{programName}</span>{card && <span className="pn-oncard">Kart: {cardLabel(card, ex.catalog.scenes)}</span>}</figcaption>
              <Monitor canvas={comp.program} className="st-monitor__screen" />
            </figure>
          </div>

          <div className="pn-strip" aria-label="Açılar">
            <div className="pn-strip__head">
              <h3>Açılar</h3><small>tık: önizleme · çift tık / Shift+sayı: doğrudan yayın · 1–9</small>
              <span className="st-top__spacer" />
              <div className="pn-quick">{["grid4", "twoThree", "bigSmall", "pip", "newsDesk", "interview", "side6040", "diagonal", "host", "content"].map((k) => (
                <button key={k} type="button" className="pn-quickbtn" onClick={() => newAngle(k)} title={`Yeni açı: ${layoutOf(k).label}`}><LayoutPic layout={k} /></button>
              ))}</div>
              <button type="button" className="btn btn--sm" onClick={() => newAngle()}><Icon name="plus" size={12} /> Açı</button>
              <button type="button" className="btn btn--sm" onClick={() => setEditLayout({})} title="Kendi kamera düzenini kur" data-act="new-layout"><Icon name="layout" size={12} /> Düzen editörü</button>
            </div>
            <ol className="pn-angles">
              {pano.angles.map((a, i) => {
                const isPgm = a.id === config.programSceneId;
                const isPvw = a.id === config.previewSceneId;
                return (
                  <li key={a.id} className={`pn-angle ${isPgm ? "is-pgm" : ""} ${isPvw ? "is-pvw" : ""}`} data-angle={a.id}>
                    <button type="button" className="pn-angle__view" onClick={() => toPreview(a.id)} onDoubleClick={() => cutTo(a.id)} title={`${a.name} — tık: önizleme, çift tık: yayına`}>
                      <canvas ref={registerTile(a.id)} width={320} height={180} />
                      <span className="pn-angle__num">{i + 1}</span>
                      {isPgm && <span className="pn-angle__tag is-pgm">YAYINDA</span>}
                      {isPvw && !isPgm && <span className="pn-angle__tag is-pvw">ÖNİZLEME</span>}
                    </button>
                    <div className="pn-angle__foot"><LayoutPic layout={a.layout} /><span>{a.name}</span><button type="button" className="icon-btn" onClick={() => setEditAngle(a)} title="Düzenle"><Icon name="pencil" size={12} /></button></div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="pn-sources">
            <div className="pn-strip__head"><h3>Kaynaklar</h3><small>kamera, ekran, pencere, görsel, video, renk, metin, saat…</small><span className="st-top__spacer" />
              <button type="button" className="btn btn--sm" onClick={() => setDialog({ initial: {} })}><Icon name="plus" size={12} /> Kaynak ekle</button>
            </div>
            <ul className="pn-srclist">
              {pano.sources.map((s) => {
                const rt = src.runtimeRef.current.get(s.id);
                return (
                  <li key={s.id} data-source={s.id}>
                    <SourceThumb source={s} runtimeRef={src.runtimeRef} width={128} />
                    <div><b>{s.name}</b><small>{rt?.status === "live" ? "Canlı" : rt?.status || "—"}</small></div>
                    <button type="button" className="icon-btn" onClick={() => setDialog({ initial: s })} title="Ayarlar"><Icon name="sliders" size={12} /></button>
                    <button type="button" className="icon-btn" onClick={() => removeSource(s)} title="Sil"><Icon name="trash" size={12} /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <aside className="pn-side">
          <nav className="pn-tabs">{TABS.map(([k, l, ic]) => <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)} data-tab={k}><Icon name={ic} size={13} /> {l}</button>)}</nav>
          <div className="pn-pane">
            {tab === "kartlar" && <CardsPanel pano={pano} setPlaylist={setPlaylist} data={pd.data} now={now} ex={ex} />}
            {tab === "veri" && <DataPanel pano={pano} setScope={(scope) => setPano((p) => ({ ...p, scope }))} pd={pd} />}
            {tab === "gorunum" && <LookPanel pano={pano} setPano={setPano} />}
            {tab === "marka" && <BrandPanel brands={brands} setBrands={setBrands} activeId={pano.brandId} onSelect={selectBrand} ask={ask} presets={presetData.list} onImportPresets={importPresets} />}
            {tab === "sablon" && (
              <PresetsPanel presets={presetData.list} activeId={pano.presetId} dirty={dirty} onApply={loadPreset} onSave={savePresetOver} onSaveAs={savePresetAs} onRename={renamePreset} onDelete={deletePreset}
                brands={brands} templates={templates} templateKey={pano.templateKey} onApplyTemplate={applyTpl}
                onSaveTemplate={(name) => setTemplates([...templates, templateFromState(name || `Şablon ${templates.length + 1}`, pano)])}
                onDeleteTemplate={async (t) => { if (await ask({ title: "Şablonu sil", message: `“${t.name}” silinsin mi?`, confirmLabel: "Sil", danger: true })) setTemplates(templates.filter((x) => x.key !== t.key)); }}
                sources={pano.sources} onWebImport={webImport} />
            )}
            {tab === "yayin" && <BroadcastBox prefs={prefs} setPrefs={setPrefs} engine={engine} busy={busy} onStart={() => startWith(ingestOf(prefs))} onRehearsal={() => startWith(null)} onStop={stop} chooseDir={chooseDir} />}
            {tab === "ses" && (
              <div className="pn-audio">
                <label className="field pn-mini"><span>Mikrofon</span>
                  <select className="input" value={prefs.mic.deviceId || ""} onChange={(e) => setPrefs((p) => ({ mic: { ...p.mic, deviceId: e.target.value || null } }))}>
                    <option value="">Varsayılan</option>
                    {(src.devices.audio || []).map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Mikrofon"}</option>)}
                  </select>
                </label>
                <label className="field pn-mini"><span>Mikrofon seviyesi ({prefs.mic.volume}%)</span><input type="range" min={0} max={150} value={prefs.mic.volume} onChange={(e) => setPrefs((p) => ({ mic: { ...p.mic, volume: Number(e.target.value) } }))} /></label>
                <button type="button" className={`btn btn--sm ${prefs.mic.muted ? "" : "btn--red"}`} onClick={toggleMic}><Icon name={prefs.mic.muted ? "micOff" : "mic"} size={12} /> {prefs.mic.muted ? "Mikrofonu aç" : "Mikrofonu kapat"}</button>
                <MusicPanel mp={music} />
              </div>
            )}
            {tab === "led" && <LedPanel led={led} scenes={config.scenes} matchId={null} ledMode={null} g={null} live={null} />}
          </div>
          <p className="pn-keys"><Kbd>1–9</Kbd> önizleme · <Kbd>⇧</Kbd>+sayı yayına · <Kbd>Boşluk</Kbd> geçiş · <Kbd>C</Kbd> kes · <Kbd>←</Kbd><Kbd>→</Kbd> kart · <Kbd>P</Kbd> sabitle · <Kbd>⌥</Kbd>+sayı hazır ayar</p>
        </aside>
      </div>

      {editAngle && <AngleEditor angle={editAngle} sources={pano.sources} onSave={saveAngle} onDelete={pano.angles.some((a) => a.id === editAngle.id) ? () => deleteAngle(editAngle) : null} onClose={() => setEditAngle(null)} onSaveLayout={saveLayout} onEditLayout={(l) => setEditLayout(l)} />}
      {editLayout && <LayoutEditor layout={editLayout.key ? editLayout : null} onSave={saveLayout} onDelete={pano.customLayouts.some((x) => x.key === editLayout.key) ? deleteLayout : null} onClose={() => setEditLayout(null)} />}
      {dialog && (
        <SourceDialog initial={dialog.initial} cameraCount={pano.sources.filter((s) => s.kind === "camera").length} devices={src.devices} access={src.access}
          onRequestAccess={src.requestAccess} onRefreshDevices={src.refreshDevices} onSave={saveSource} onClose={() => setDialog(null)} runtimeRef={src.runtimeRef}
          config={config} onPatchSource={onResolve} />
      )}
    </div>
  );
}
