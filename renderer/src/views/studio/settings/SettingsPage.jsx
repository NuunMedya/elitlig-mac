// Yayın Stüdyosu · AYARLAR sayfası (dişli simgesi): stüdyonun üstünde tam sayfa.
//
//   Genel      Yayın · Kayıt (kayıt kalitesi + 10 dk boyut tahmini) · Tekrar · Geçiş ·
//              LED · Görünüm · Bildirimler
//   Grafikler  Skorbord · Altyazı · Marka & ön ayarlar · Sponsor & linkler (eskiden alt
//              panel sekmeleri; aynı bileşenler Studio'dan extraSections ile gelir)
//   Yerleşim   Ekran yerleşimi (hazır düzenler, bölme / sekme grubu / sekme / pano ağacı,
//              ekranda olmayanlar) · Kısayollar panosu · Panel parçaları (gizle / göster)
//   Paneller   Ses (karıştırıcının tamamı) · Klavye kısayolları
//   Şablonlar  Ayar şablonları (kaydet / uygula / dışa – içe aktar) · Gelişmiş
//
// Ayarlar ilgili kod yollarını besler: kodlama (prefs.encoding), geçiş
// (prefs.transition / transitionMs), çalışma alanı, LED tercihleri ve
// studio.settings.v1 (kodlayıcı, ses bit hızı, kayıt kalitesi, kısayollar, uyarılar).
import React, { memo, useEffect, useState } from "react";
import { Field, Icon, Kbd } from "../../../components/ui";
import { BITRATE_PRESETS, FPS_CHOICES, RESOLUTION_CHOICES, encodingPreset, recommendedBitrate } from "../../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../../lib/studio/transitions";
import { WORKSPACES, FIXED_SHORTCUTS } from "../../../lib/studio/scenesWorkspace";
import { AUDIO_KBPS_CHOICES, ENCODER_PREFS, HOTKEY_ACTIONS, KEYFRAME_CHOICES, PIPELINES, RECORD_QUALITIES, RESERVED_KEYS, bindHotkey, keyText, recordEstimate } from "./settings";
import QualityPresets from "../QualityPresets";
import { RAIL_SIZES, RAIL_WIDGETS, addWidget, moveWidget, removeWidget, resizeWidget, sizeKey, sizesOf, widgetOf } from "../shortcuts/railModel";
import { RailCatalog } from "../shortcuts/ShortcutRail";
import TransitionsTab from "../scenes/TransitionsTab";
import { normalizeModeSettings } from "../../../lib/studio/modes";
import { TRANSITIONS } from "../../../lib/studio/transitions";
import DockSettings from "./DockSettings";
import ProfilesSection from "./ProfilesSection";
import "./settings.css";
import "../dock/dock.css";
import VarThemeSection, { VAR_THEME_SECTION } from "./VarThemeSection"; // [var-tema]
import CoverSection, { COVER_SECTION } from "../youtube/cover/CoverSection"; // [kapak]

export const SETTINGS_GROUPS = [
  { key: "genel", label: "Genel" },
  { key: "yerlesim", label: "Yerleşim" },
  { key: "grafik", label: "Grafikler" },
  { key: "panel", label: "Paneller" },
  { key: "sablon", label: "Şablonlar" },
];
export const SETTINGS_SECTIONS = [
  { key: "yayin", label: "Yayın", icon: "broadcast", group: "genel" },
  { key: "kayit", label: "Kayıt", icon: "download", group: "genel" },
  { ...COVER_SECTION, group: "genel" }, // [kapak] Ayarlar › Genel › YouTube kapağı
  { key: "tekrar", label: "Tekrar", icon: "repeat", group: "genel" },
  { ...VAR_THEME_SECTION, group: "grafik" }, // [var-tema] Ayarlar › Grafikler › VAR teması
  { key: "gecis", label: "Geçiş", icon: "swap", group: "genel" },
  { key: "led", label: "LED ekran", icon: "overview", group: "genel" },
  { key: "gorunum", label: "Görünüm", icon: "grid", group: "genel" },
  { key: "bildirim", label: "Bildirimler", icon: "bell", group: "genel" },
  { key: "serit", label: "Kısayollar panosu", icon: "zap", group: "yerlesim" },
  { key: "panel", label: "Panel parçaları", icon: "eye", group: "yerlesim" },
  { key: "kisayol", label: "Klavye kısayolları", icon: "command", group: "panel" },
  { key: "sablon", label: "Ayar şablonları", icon: "copy", group: "sablon" },
  { key: "gelismis", label: "Gelişmiş", icon: "sliders", group: "sablon" },
];

function Choice({ on, title, text, onClick, disabled }) {
  return (
    <button type="button" className={`st-choice ${on ? "is-on" : ""}`} onClick={onClick} disabled={disabled} aria-pressed={on}>
      <i className="st-choice__radio" />
      <span><strong>{title}</strong>{text && <small>{text}</small>}</span>
    </button>
  );
}

function Toggle({ checked, onChange, title, text }) {
  return (
    <label className="st-switchrow">
      <span><strong>{title}</strong>{text && <small>{text}</small>}</span>
      <input type="checkbox" className="st-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Section({ title, sub, children }) {
  return (
    <section className="st-set__card">
      <header><h3>{title}</h3>{sub && <p>{sub}</p>}</header>
      <div className="st-set__card-body">{children}</div>
    </section>
  );
}

/** Kısayol satırı: "Değiştir" → sonraki tuş. */
function HotkeyRow({ action, keys, onBind, onReset }) {
  const [listen, setListen] = useState(false);
  useEffect(() => {
    if (!listen) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setListen(false); return; }
      if (["Shift", "Meta", "Control", "Alt"].includes(e.key)) return;
      onBind(e.key);
      setListen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listen, onBind]);
  return (
    <div className={`st-hk ${listen ? "is-listen" : ""}`}>
      <span className="st-hk__label">{action.label}</span>
      <span className="st-hk__keys">{listen ? <em>Bir tuşa bas… (Esc: vazgeç)</em> : keys.length ? keys.map((k) => <Kbd key={k}>{keyText(k)}</Kbd>) : <em>atanmadı</em>}</span>
      <button type="button" className="btn btn--xs" onClick={() => setListen((v) => !v)}>{listen ? "Vazgeç" : "Değiştir"}</button>
      <button type="button" className="icon-btn icon-btn--xs" onClick={onReset} title="Varsayılana dön"><Icon name="undo" size={12} /></button>
    </div>
  );
}

/** Sol şeritteki kısayol düğmeleri: sıra, boyut, kaldır (+ katalog). */
function RailManager({ rail, scenes, ctx = null }) {
  const { items, setItems, reset } = rail;
  const nameOf = (it) => (it.type === "scene" ? `Sahne · ${scenes.find((s) => s.id === it.opts?.sceneId)?.name || "?"}` : widgetOf(it.type)?.label || it.type);
  return (
    <>
      <Section title="Şeritteki kısayollar" sub="Yukarıdan aşağı sıra. Stüdyoda şeride sağ tık ya da “Düzenle” ile de sürükleyip boyutlayabilirsin.">
        <ol className="st-railman">
          {items.map((it, i) => (
            <li key={it.id}>
              <Icon name={widgetOf(it.type)?.icon || "zap"} size={14} />
              <span className="st-railman__name">{nameOf(it)}</span>
              <div className="st-seg">
                {sizesOf(it.type).map((sz) => <button key={sz} type="button" className={sizeKey(it) === sz ? "is-on" : ""} onClick={() => setItems((c) => resizeWidget(c, it.id, sz))}>{RAIL_SIZES[sz].label}</button>)}
              </div>
              <button type="button" className="icon-btn icon-btn--xs" disabled={i === 0} onClick={() => setItems((c) => moveWidget(c, it.id, c[i - 1]?.id))} title="Yukarı"><Icon name="chevronUp" size={13} /></button>
              <button type="button" className="icon-btn icon-btn--xs" disabled={i === items.length - 1} onClick={() => setItems((c) => moveWidget(c, it.id, c[i + 1]?.id))} title="Aşağı"><Icon name="chevronDown" size={13} /></button>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setItems((c) => removeWidget(c, it.id))} title="Kaldır"><Icon name="x" size={13} /></button>
            </li>
          ))}
          {!items.length && <li className="st-hint">Şerit boş. Sağdan kısayol ekle.</li>}
        </ol>
        <button type="button" className="btn btn--sm btn--ghost" onClick={reset}><Icon name="undo" size={13} /> Varsayılan düzene dön</button>
      </Section>
      <Section title="Kısayol ekle" sub={`${RAIL_WIDGETS.length} parçacık çeşidi: her biri işlevseldir (durumunu gösterir, açılır panelle seçim yapar). Boyutlar 1×1, 1×2, 2×1, 2×2.`}>
        <RailCatalog compact ctx={ctx} items={items} scenes={scenes} onAdd={(type, size, opts) => setItems((c) => addWidget(c, type, { size, opts }))} />
      </Section>
    </>
  );
}

function SettingsPage({
  section, onSection, settings, set, onReset, prefs, setPref, led, scenes, engine, onClose, toast, rail = null, hasModes = false, brandRef = null,
  railCtx = null, extraSections = [], dock = null, setDock = null, resetDock = null, dockDefs = {}, onProfileApplied = null, canReload = true, RoutePicker = null, audio = null,
  renderRail = null,
}) {
  const allSections = [...SETTINGS_SECTIONS, ...extraSections.map((x) => ({ group: "panel", ...x }))];
  const enc = prefs.encoding;
  const preset = encodingPreset(enc);
  const est = recordEstimate(settings.record, { streamVideoKbps: preset.videoBitrateKbps, audioKbps: settings.stream.audioKbps });
  const tKind = transitionKind(prefs.transition);
  const tMs = transitionMs(tKind.key, prefs.transitionMs);
  const recQualitySupported = Boolean(engine?.info?.features?.localRecordQuality || engine?.info?.localRecordQuality);
  const setEnc = (patch) => setPref("encoding", { ...enc, ...patch });
  const chooseDir = async () => {
    try {
      const res = await window.elitlig?.studio?.chooseRecordDir?.();
      if (res?.path) set("record", { dir: res.path });
    } catch { /* yoksay */ }
  };

  let body;
  if (section === "yayin") {
    body = (
      <>
        <Section title="Görüntü" sub="Yayın sekmesindeki kalite ayarıyla aynıdır.">
          <Field label="Çözünürlük">
            <div className="st-seg">{RESOLUTION_CHOICES.map((r) => <button key={r.key} type="button" className={enc.resolution === r.key ? "is-on" : ""} onClick={() => setEnc({ resolution: r.key, bitrateKbps: recommendedBitrate(r.key, enc.fps) })}>{r.label}</button>)}</div>
          </Field>
          <Field label="Kare hızı">
            <div className="st-seg">{FPS_CHOICES.map((f) => <button key={f} type="button" className={Number(enc.fps) === f ? "is-on" : ""} onClick={() => setEnc({ fps: f, bitrateKbps: recommendedBitrate(enc.resolution, f) })}>{f} fps</button>)}</div>
          </Field>
          <Field label={`Görüntü bit hızı · ${enc.bitrateKbps} kbps`}>
            <div className="st-chips">{BITRATE_PRESETS.map((b) => <button key={b.kbps} type="button" className={`st-chip ${Number(enc.bitrateKbps) === b.kbps ? "is-on" : ""}`} onClick={() => setEnc({ bitrateKbps: b.kbps })} title={b.hint}>{b.label}</button>)}</div>
          </Field>
        </Section>
        <Section title="Yayın kalitesi" sub="Hızlı ayar: çözünürlük, kare hızı ve bit hızı birlikte.">
          <QualityPresets encoding={enc} onEncoding={(v) => setEnc(v)} locked={Boolean(engine?.active)} network={engine?.status?.network || null} />
        </Section>
        <Section title="Kodlama yolu" sub="Tek kodlama (WebCodecs): görüntü bir kez, donanımda kodlanır; ffmpeg yalnız kopyalar (OBS gibi). Sorun olursa yayın kesilmeden eski yola geçilir.">
          <div className="st-choices">{PIPELINES.map((p) => <Choice key={p.key} on={settings.stream.pipeline === p.key} title={p.label} text={p.hint} onClick={() => set("stream", { pipeline: p.key })} />)}</div>
        </Section>
        <Section title="Kodlayıcı" sub="Eski kodlama yolunda ffmpeg'in kodlayıcısı. Uygulama sürümü desteklemiyorsa otomatik seçim kullanılır.">
          <div className="st-choices">{ENCODER_PREFS.map((e) => <Choice key={e.key} on={settings.stream.encoder === e.key} title={e.label} text={e.hint} onClick={() => set("stream", { encoder: e.key })} />)}</div>
          <div className="st-row st-row--wrap">
            <Field label="Anahtar kare aralığı">
              <div className="st-seg">{KEYFRAME_CHOICES.map((k) => <button key={k} type="button" className={settings.stream.keyframeSec === k ? "is-on" : ""} onClick={() => set("stream", { keyframeSec: k })}>{k} sn</button>)}</div>
            </Field>
            <Field label="Ses bit hızı">
              <div className="st-seg">{AUDIO_KBPS_CHOICES.map((k) => <button key={k} type="button" className={settings.stream.audioKbps === k ? "is-on" : ""} onClick={() => set("stream", { audioKbps: k })}>{k}</button>)}</div>
            </Field>
          </div>
          <p className="st-hint">YouTube 2 sn anahtar kare önerir. Ses 128 kbps çoğu yayın için yeterli.</p>
        </Section>
      </>
    );
  } else if (section === "kayit") {
    body = (
      <>
        <Section title="Maçı bilgisayara kaydet" sub="Yayınla birlikte tam maç kaydı (MP4).">
          <Toggle checked={settings.record.enabled} onChange={(v) => set("record", { enabled: v })} title="Yayında / provada yerel kayıt varsayılan olarak açık" text="Yayın sekmesindeki “Maçı bilgisayara kaydet” ile aynı" />
          <div className="st-row">
            <span className="st-mono st-set__path">{settings.record.dir || "Varsayılan klasör (Filmler / ElitLig)"}</span>
            <button type="button" className="btn btn--sm" onClick={chooseDir}><Icon name="folder" size={13} /> Klasör</button>
            {settings.record.dir && <button type="button" className="btn btn--sm btn--ghost" onClick={() => set("record", { dir: null })}>Varsayılan</button>}
          </div>
        </Section>
        <Section title="Kayıt kalitesi" sub="Kayıt kalitesini yayından ayrı seç; tahmini dosya boyutu aşağıda.">
          <div className="st-choices is-grid">
            {RECORD_QUALITIES.map((q) => {
              const e = recordEstimate({ ...settings.record, quality: q.key }, { streamVideoKbps: preset.videoBitrateKbps, audioKbps: settings.stream.audioKbps });
              return <Choice key={q.key} on={settings.record.quality === q.key} title={q.label} text={`${q.hint} · ${e.text}`} onClick={() => set("record", { quality: q.key })} />;
            })}
          </div>
          {settings.record.quality === "custom" && (
            <div className="st-row st-row--wrap">
              <Field label={`Görüntü bit hızı · ${settings.record.customKbps} kbps`}>
                <input type="range" min={2000} max={30000} step={500} value={settings.record.customKbps} onChange={(e) => set("record", { customKbps: Number(e.target.value) })} />
              </Field>
              <Field label="Çözünürlük">
                <div className="st-seg">{[720, 1080].map((h) => <button key={h} type="button" className={settings.record.customHeight === h ? "is-on" : ""} onClick={() => set("record", { customHeight: h })}>{h}p</button>)}</div>
              </Field>
            </div>
          )}
          <div className="st-estimate">
            <Icon name="download" size={18} />
            <span><strong>{est.text}</strong><small>{est.videoKbps} kbps görüntü + {est.audioKbps} kbps ses · saatte {est.perHourText.replace(" / 60 dk", "")}</small></span>
          </div>
          {!recQualitySupported && settings.record.quality !== "stream" && (
            <p className="st-note is-warn"><Icon name="info" size={13} /> Bu uygulama sürümü ayrı kayıt kalitesini desteklemiyorsa kayıt yayın kalitesinde yapılır ({preset.videoBitrateKbps} kbps).</p>
          )}
        </Section>
      </>
    );
  } else if (section === "tekrar") {
    // Yayın modları varsa hız / aradaki geçiş kip ayarlarında (prefs.modes), yoksa eski tercihte.
    const mcfg = hasModes ? normalizeModeSettings(prefs.modes) : null;
    const rate = mcfg ? mcfg.rate : Number(prefs.replayRate) || 1;
    const setRate = (r) => (mcfg ? setPref("modes", (m) => ({ ...normalizeModeSettings(m), rate: r })) : setPref("replayRate", r));
    const stingers = [{ key: "cut", label: "Kesme" }, ...TRANSITIONS.filter((t) => t.stinger)];
    body = (
      <>
        <Section title="Tekrar varsayılanları" sub="GOL ve ÖNEMLİ AN tekrarlarına uygulanır.">
          <Field label={`Golden önce kaydedilen süre · ${settings.replay.seconds} sn`} hint="Gol / önemli ana basıldığı andan geriye doğru yazılan süre.">
            <input type="range" min={5} max={30} step={1} value={settings.replay.seconds} onChange={(e) => set("replay", { seconds: Number(e.target.value) })} />
          </Field>
          <Field label={`Oynatma hızı · ${String(rate).replace(".", ",")}×`}>
            <div className="st-seg">{[0.25, 0.5, 0.75, 1].map((r) => <button key={r} type="button" className={Number(rate) === r ? "is-on" : ""} onClick={() => setRate(r)}>{String(r).replace(".", ",")}×</button>)}</div>
          </Field>
          {/* [önizleme-geçiş] R kısayolu: varsayılan son tekrarı ÖNİZLEME'ye yükler; açıksa aynı GEÇİŞ yoluyla hemen yayına alır. */}
          <Toggle checked={Boolean(settings.replay.directTake)} onChange={(v) => set("replay", { directTake: v })} title="R = doğrudan yayına"
            text="Kapalıyken R (ve “Son tekrar” düğmeleri) son tekrarı önizlemeye yükler, yayına GEÇİŞ alır. Açıkken önizlemeye yükleyip hemen aynı geçişle yayına verir." />
          {mcfg && (
            <Field label="Tekrarlar arasındaki geçiş">
              <select value={mcfg.between.kind} onChange={(e) => setPref("modes", (m) => ({ ...normalizeModeSettings(m), between: { kind: e.target.value } }))}>
                {stingers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
          )}
          {mcfg && (
            <Field label="Yayına alma geçişi (Tekrar / VAR / Röportaj / Özet)">
              <select value={mcfg.transition.kind} onChange={(e) => setPref("modes", (m) => ({ ...normalizeModeSettings(m), transition: { kind: e.target.value } }))}>
                {TRANSITIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
          )}
        </Section>
        <Section title="Kaydedilecek açılar" sub="Tekrar panelindeki “Kaydedilecek açılar” ile aynı.">
          <Toggle checked={prefs.angles?.program !== false} onChange={(v) => setPref("angles", (a) => ({ ...a, program: v }))} title="Program açısını kaydet" text="Yayına giden görüntü" />
          <Toggle checked={prefs.angles?.all !== false} onChange={(v) => setPref("angles", (a) => ({ ...a, all: v }))} title="Tüm kameraları ayrı açı olarak kaydet" text="Her kamera / ekran kaynağı kendi tekrar açısı olur" />
          {!hasModes && <Toggle checked={Boolean(prefs.replayAudio)} onChange={(v) => setPref("replayAudio", v)} title="Tekrarın sesi yayına gitsin" />}
        </Section>
        {RoutePicker && audio?.setRoute && (
          <Section title="Yayına giden ses" sub="Tekrar / VAR ve özet oynarken yayına hangi sesler gitsin (alt paneldeki seçiciyle aynı).">
            <RoutePicker audio={audio} context="replay" />
            <RoutePicker audio={audio} context="highlight" />
          </Section>
        )}
        <p className="st-hint st-set__wide">Panelin her ayrıntısı (katmanlar, kuyruk, düzenleyici…) için: Ayarlar › Alt panel › Tekrar › Parçalar › “Paneli burada aç”.</p>
      </>
    );
  } else if (section === COVER_SECTION.key) { // [kapak]
    body = <CoverSection toast={toast} />;
  } else if (section === VAR_THEME_SECTION.key) { // [var-tema]
    body = <VarThemeSection prefs={prefs} setPref={setPref} />;
  } else if (section === "gecis") {
    body = <div className="st-set__wide"><TransitionsTab prefs={prefs} setPref={setPref} hasModes={hasModes} brandRef={brandRef} /></div>;
  } else if (section === "led") {
    body = (
      <Section title="LED ekran varsayılanları" sub="LED ekran sekmesiyle aynı ayarlar.">
        <Field label="Ekran">
          <select value={led.prefs.displayId ?? ""} onChange={(e) => led.setPref({ displayId: e.target.value === "" ? null : (Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) })}>
            {!led.displays.length && <option value="">Ekran bulunamadı</option>}
            {led.displays.map((d) => <option key={d.id} value={d.id}>{d.label || `Ekran ${d.id}`}{d.primary ? " (ana ekran)" : ""}</option>)}
          </select>
        </Field>
        <div className="st-choices">
          <Choice on={!led.prefs.web && led.prefs.route === "program"} title="Yayın (Program)" text="Varsayılan: LED yayındaki sahneyi izler" onClick={() => { led.setPref({ web: false }); led.setRoute({ route: "program" }); }} />
          <Choice on={!led.prefs.web && led.prefs.route === "preview"} title="Önizleme" onClick={() => { led.setPref({ web: false }); led.setRoute({ route: "preview" }); }} />
          <Choice on={!led.prefs.web && led.prefs.route === "scene"} title="Belirli sahne" text={led.prefs.route === "scene" ? scenes.find((s) => s.id === led.prefs.sceneId)?.name : "Sahne kutusundaki “LED'e ver” ile seçilir"} onClick={() => { led.setPref({ web: false }); led.setRoute({ route: "scene", sceneId: led.prefs.sceneId || scenes[0]?.id }); }} />
          <Choice on={!led.prefs.web && led.prefs.route === "off"} title="Kapalı" onClick={() => { led.setPref({ web: false }); led.setRoute({ route: "off" }); }} />
          <Choice on={led.prefs.web} title="Sitenin LED sayfası" text="elitlig.com/led/<maç>" onClick={() => led.setPref({ web: true })} />
        </div>
      </Section>
    );
  } else if (section === "gorunum") {
    body = (
      <>
        <Section title="Çalışma alanı" sub="Ekran bölgesinin (monitörler, geçiş, sahneler) hızlı düzeni; öbür bölmeler korunur. Ekranın tamamı için Ayarlar › Yerleşim ya da üst çubukta Hazır düzen / Düzenle.">
          <div className="st-wsgrid">
            {WORKSPACES.map((w) => (
              <button key={w.key} type="button" className={`st-wscard ${prefs.workspace === w.key ? "is-on" : ""}`} onClick={() => setPref("workspace", w.key)}>
                <WorkspacePic ws={w} /><strong>{w.label}</strong><small>{w.hint}</small>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Arayüz">
          <Field label="Arayüz ölçeği">
            <div className="st-seg">{[90, 100, 110, 125].map((v) => <button key={v} type="button" className={settings.view.scale === v ? "is-on" : ""} onClick={() => set("view", { scale: v })}>%{v}</button>)}</div>
          </Field>
          <Toggle checked={settings.view.hints} onChange={(v) => set("view", { hints: v })} title="Kısayol rozetlerini göster" text="Düğmelerdeki tuş ipuçları (B, R, V …)" />
          <Toggle checked={settings.view.tooltips} onChange={(v) => set("view", { tooltips: v })} title="Açıklama balonlarını göster" />
          <Toggle checked={Boolean(prefs.previewGraphics)} onChange={(v) => setPref("previewGraphics", v)} title="Önizlemede grafikleri göster" text="Skorbord ve bantlar önizlemede soluk görünür" />
          <Toggle checked={Boolean(prefs.sceneInline)} onChange={(v) => setPref("sceneInline", v)} title="Sahne katmanlarını yanda göster" text="Kalem büyük düzenleyici penceresi yerine Sahneler panelinde seçili sahnenin katmanlarını yanda açar" />
        </Section>
      </>
    );
  } else if (section === "panel") {
    body = dock && setDock
      ? <DockSettings Section={Section} Choice={Choice} dock={dock} setDock={setDock} resetDock={resetDock} defs={dockDefs} partsOnly />
      : <p className="st-hint">Alt panel düzeni yüklenemedi.</p>;
  } else if (section === "sablon") {
    body = <ProfilesSection Section={Section} onApplied={onProfileApplied} canReload={canReload} toast={toast} />;
  } else if (extraSections.some((x) => x.key === section)) {
    const x = extraSections.find((e) => e.key === section);
    body = x.group === "yerlesim" ? x.render({ Section }) : <div className="st-set__wide st-set__embed">{x.render()}</div>;
  } else if (section === "serit") {
    const railBoard = renderRail?.(Section);
    body = railBoard
      ? (
        <>
          {railBoard}
          <Section title="Düğme ekle" sub="Her düğme (parçacık) işlevseldir; Kısayollar panosuna eklenir. Stüdyoda Düzenle › Kutu ekle ile herhangi bir panoya / sekmeye de konur.">
            <RailCatalog compact ctx={railCtx} items={[]} scenes={scenes} onAdd={(type, size, opts) => railCtx?.addToRail?.(type, size, opts)} />
          </Section>
        </>
      )
      : rail ? <RailManager rail={rail} scenes={scenes} ctx={railCtx} /> : <p className="st-hint">Kısayol şeridi yüklenemedi.</p>;
  } else if (section === "kisayol") {
    const row = (a) => (
      <HotkeyRow key={a.key} action={a} keys={settings.hotkeys[a.key] || []}
        onBind={(k) => { if (RESERVED_KEYS.has(k.length === 1 ? k.toLowerCase() : k)) { toast?.(`“${keyText(k)}” tuşu ayrılmış (sahne / gol tuşları).`, { tone: "warn" }); return; } set("hotkeys", bindHotkey(settings.hotkeys, a.key, k)); }}
        onReset={() => set("hotkeys", (a.default.length ? a.default : [""]).reduce((h, k, i) => (k ? bindHotkey(h, a.key, k, { replace: i === 0 }) : { ...h, [a.key]: [] }), settings.hotkeys))} />
    );
    const rest = HOTKEY_ACTIONS.filter((a) => a.default.length);
    const extra = HOTKEY_ACTIONS.filter((a) => !a.default.length);
    body = (
      <>
        <Section title="Temel tuşlar" sub="Bir eylemin tuşunu değiştirmek için “Değiştir”e bas, sonra tuşa bas. 1–9 sahne tuşları sabittir.">
          <div className="st-hks">{rest.map(row)}</div>
        </Section>
        <Section title="Kısayol düğmeleriyle aynı eylemler" sub="Sol şeritteki parçacıkların eylemlerine de tuş atayabilirsin (varsayılan: atanmamış).">
          <div className="st-hks">{extra.map(row)}</div>
        </Section>
        <Section title="Sabit tuşlar">
          <dl className="st-keys st-keys--fixed">{FIXED_SHORTCUTS.map(([k, v]) => <React.Fragment key={k}><dt><Kbd>{k}</Kbd></dt><dd>{v}</dd></React.Fragment>)}</dl>
        </Section>
      </>
    );
  } else if (section === "bildirim") {
    body = (
      <Section title="Uyarılar" sub="Yalnız operatör ekranında görünür; yayına gitmez.">
        <Toggle checked={settings.notify.micOpen} onChange={(v) => set("notify", { micOpen: v })} title="VAR sırasında mikrofon açık uyarısı" text="Kırmızı yanıp sönen çerçeve ve “MİKROFON AÇIK”" />
        <Toggle checked={settings.notify.lowBitrate} onChange={(v) => set("notify", { lowBitrate: v })} title="Düşük bit hızı uyarısı" text="Bağlantı hedefin %60'ının altına düşünce" />
        <Toggle checked={settings.notify.silence} onChange={(v) => set("notify", { silence: v })} title="Sessiz yayın uyarısı" text={`Yayındayken mikrofon ${settings.notify.silenceSec} sn sessiz kalırsa`} />
        {settings.notify.silence && (
          <Field label={`Sessizlik süresi · ${settings.notify.silenceSec} sn`}>
            <input type="range" min={10} max={120} step={5} value={settings.notify.silenceSec} onChange={(e) => set("notify", { silenceSec: Number(e.target.value) })} />
          </Field>
        )}
      </Section>
    );
  } else {
    body = (
      <>
        <Section title="Tanılama" sub="Yayın kopmaları ve kodlayıcı sorunları için günlük dosyaları.">
          <button type="button" className="btn btn--sm" onClick={() => window.elitlig?.studio?.revealDiagnostics?.()} disabled={!window.elitlig?.studio?.revealDiagnostics}><Icon name="folder" size={13} /> Tanılama günlüğünü göster</button>
          {engine?.info?.ffmpeg && <p className="st-hint">ffmpeg {engine.info.ffmpeg.version || "?"} · {Object.entries(engine.info.ffmpeg.encoders || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "kodlayıcı yok"}</p>}
        </Section>
        <Section title="Sıfırla" sub="Kodlayıcı, kayıt kalitesi, kısayollar, uyarılar ve görünüm ayarları varsayılana döner. Sahneler ve kaynaklar silinmez.">
          <button type="button" className="btn btn--sm btn--danger" onClick={onReset}><Icon name="refresh" size={13} /> Stüdyo ayarlarını sıfırla</button>
        </Section>
      </>
    );
  }

  return (
    <div className="st-set" role="dialog" aria-label="Stüdyo ayarları">
      <nav className="st-set__nav">
        <header><Icon name="sliders" size={16} /><strong>Ayarlar</strong></header>
        {SETTINGS_GROUPS.map((grp) => {
          const list = allSections.filter((s) => s.group === grp.key);
          if (!list.length) return null;
          return (
            <React.Fragment key={grp.key}>
              <h6 className="st-set__navgroup">{grp.label}</h6>
              {list.map((s) => (
                <button key={s.key} type="button" className={section === s.key ? "is-on" : ""} onClick={() => onSection(s.key)}><Icon name={s.icon} size={14} /> {s.label}</button>
              ))}
            </React.Fragment>
          );
        })}
      </nav>
      <div className="st-set__main">
        <header className="st-set__head">
          <h2>{allSections.find((s) => s.key === section)?.label}</h2>
          <span className="st-top__spacer" />
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}><Icon name="check" size={13} /> Kapat</button>
        </header>
        <div className="st-set__body">{body}</div>
      </div>
    </div>
  );
}

/** Çalışma alanı küçük çizimi (SVG; yeşil = önizleme, kırmızı = program, gri = sahneler). */
export function WorkspacePic({ ws }) {
  const P = (x, y, w, h) => <rect x={x} y={y} width={w} height={h} rx="1.4" className="is-pgm" />;
  const V = (x, y, w, h) => <rect x={x} y={y} width={w} height={h} rx="1.4" className="is-pvw" />;
  const S = (x, y, w, h, k) => <rect key={k} x={x} y={y} width={w} height={h} rx="1" className="is-sc" />;
  let body;
  if (ws.key === "program") body = <>{P(1, 1, 31, 28)}{V(34, 1, 13, 8)}{S(34, 11, 13, 5, 1)}{S(34, 17.5, 13, 5, 2)}{S(34, 24, 13, 5, 3)}</>;
  else if (ws.key === "single") body = <>{P(1, 1, 46, 21)}{[0, 1, 2, 3].map((i) => S(1 + i * 11.75, 24, 10.5, 5, i))}</>;
  else if (ws.grid) {
    const n = ws.grid;
    const cw = (22 - (n - 1) * 1.5) / n;
    const ch = (28 - (n - 1) * 1.5) / n;
    body = <>{Array.from({ length: n * n }, (_, i) => S(1 + (i % n) * (cw + 1.5), 1 + Math.floor(i / n) * (ch + 1.5), cw, ch, i))}{P(25, 1, 22, 15)}{V(25, 18, 14, 11)}</>;
  } else body = <>{V(1, 1, 22.5, 17)}{P(24.5, 1, 22.5, 17)}{[0, 1, 2, 3].map((i) => S(1 + i * 11.75, 21, 10.5, 8, i))}</>;
  return <svg className={`st-wspic is-${ws.key}`} viewBox="0 0 48 30" aria-hidden="true">{body}</svg>;
}

export default memo(SettingsPage);
