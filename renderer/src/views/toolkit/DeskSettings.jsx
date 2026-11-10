// Masaüstü araçları (⌘,): araç takımı paneli, pencere yerleştirme kısayolları (kaydet / kapat /
// varsayılan), Erişilebilirlik izni, müzik çalar (medya tuşları, stüdyo kuralı), ekranı uyanık tut.
// Ayarlar ana süreçte (userData/deskkit.json, app/toolkit.js) tutulur; değişiklik hemen uygulanır.
import React, { useEffect, useRef, useState } from "react";
import { Icon, Segmented, ViewHeader, isMac, useToast } from "../../components/ui";
import { acceleratorFromEvent, acceleratorLabel } from "./shortcutUtils";
import LayoutTool, { LayoutPreview, PermissionNote } from "./LayoutTool";
import { deskkit } from "./toolkitUi";
import "./toolkit.css";

/** Kısayol kaydedici: tıkla, tuşlara bas; Esc vazgeç, ⌫ (değiştiricisiz) kapat. */
export function ShortcutRecorder({ value, onChange, conflict = false, label }) {
  const [rec, setRec] = useState(false);
  const [hint, setHint] = useState(null);
  const mac = isMac();
  const ref = useRef(null);
  useEffect(() => {
    if (!rec) return undefined;
    deskkit()?.suspendShortcuts(true);
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) { setRec(false); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { onChange(""); setRec(false); return; }
      const r = acceleratorFromEvent(e, mac);
      if (r.pending) { setHint("…"); return; }
      if (r.error) { setHint(r.error); return; }
      onChange(r.accelerator);
      setRec(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); deskkit()?.suspendShortcuts(false); setHint(null); };
  }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button ref={ref} type="button" className={`desk-key${rec ? " is-recording" : !value ? " is-off" : ""}${conflict ? " is-conflict" : ""}`}
      onClick={() => setRec((v) => !v)} onBlur={() => setRec(false)} aria-label={`${label}: ${value ? acceleratorLabel(value, mac) : "kapalı"}. Değiştirmek için tıklayın`}
      title={rec ? "Tuşlara basın · Esc: vazgeç · ⌫: kapat" : "Değiştirmek için tıklayın"}>
      {rec ? (hint || "Tuşlara basın…") : value ? acceleratorLabel(value, mac) : "Kapalı"}
    </button>
  );
}

const STUDIO_RULES = [
  { value: "pause", label: "Duraklat, çıkınca sürdür" },
  { value: "keep", label: "Çalmaya devam et" },
];

export default function DeskSettings({ arg, go }) {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [awake, setAwake] = useState({ on: false, until: null });
  const permRef = useRef(null);
  const dk = deskkit();
  const mac = isMac();

  useEffect(() => {
    if (!dk) return undefined;
    dk.settings().then(setInfo).catch(() => {});
    dk.awake().then(setAwake).catch(() => {});
    const a = dk.onSettings(setInfo);
    const b = dk.onAwake(setAwake);
    return () => { a(); b(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (arg === "permission" && info) permRef.current?.scrollIntoView({ block: "center" }); }, [arg, info]);

  if (!dk) return <div className="view"><ViewHeader icon="toolbox" title="Masaüstü araçları" /><p className="muted">Bu özellik masaüstü uygulamasında çalışır.</p></div>;
  if (!info) return <div className="view"><ViewHeader icon="toolbox" title="Masaüstü araçları" /><p className="muted">Yükleniyor…</p></div>;

  const s = info.settings;
  const save = async (patch, msg) => {
    const v = await dk.setSettings(patch);
    setInfo(v);
    const failed = Object.keys(v.failed || {});
    if (failed.length) toast(`${failed.length} kısayol kaydedilemedi: başka bir uygulama kullanıyor olabilir.`, { tone: "warn", timeout: 6000 });
    else if (msg) toast(msg, { tone: "success", timeout: 1800 });
  };
  const conflictKeys = new Set(Object.values(info.conflicts || {}).flat());
  const setShortcut = (key, acc) => save({ layouts: { shortcuts: { [key]: acc } } }, acc ? `Kısayol: ${acceleratorLabel(acc, mac)}` : "Kısayol kapatıldı.");

  return (
    <div className="view">
      <ViewHeader icon="toolbox" title="Masaüstü araçları" subtitle="Araç takımı paneli, Magnet benzeri pencere yerleştirme, müzik çalar ve ekranı uyanık tutma. Değişiklikler hemen uygulanır.">
        <button type="button" className="btn" onClick={() => go?.("toolkit")}><Icon name="toolbox" size={14} /> Araç Takımı <kbd className="kbd">{mac ? "⇧⌘A" : "Ctrl+Shift+A"}</kbd></button>
        <button type="button" className="btn btn--primary" onClick={() => dk.showPanel()}><Icon name="zap" size={14} /> Paneli aç <kbd className="kbd">{acceleratorLabel(s.toolkit.shortcut, mac) || "—"}</kbd></button>
      </ViewHeader>

      <div className="desk-grid">
        <section className="card">
          <h3 className="card__title"><Icon name="toolbox" /> Araç takımı paneli</h3>
          <p className="muted">Menü çubuğu simgesinden ya da her yerden kısayolla açılan küçük panel: pencere düzeni, renk, hesap ve döviz, yüzde / KDV, tarih ve iş günü, metin, emoji ve özel karakter, dolgu metni, JSON, Base64 / URL, UUID, QR, dünya saatleri, sayaç, parola, ekran görüntüsü, hızlı not ve müzik. Aynı araçlar uygulamada <b>Araç Takımı</b> sayfasında da var.</p>
          {mac && s.toolkit.shortcut === "Control+Alt+Space" && <p className="tk-err">⌃⌥Boşluk macOS'ta “giriş kaynağını değiştir” kısayoludur; panel açılmayabilir. ⌃⌥B gibi başka bir kısayol seçin.</p>}
          <div className="desk-rows">
            <div className="desk-row">
              <span className="desk-row__label">Paneli aç / kapat</span>
              <ShortcutRecorder label="Araç takımı" value={s.toolkit.shortcut} conflict={conflictKeys.has("toolkit")} onChange={(acc) => save({ toolkit: { shortcut: acc } }, acc ? `Kısayol: ${acceleratorLabel(acc, mac)}` : "Kısayol kapatıldı.")} />
              {info.failed?.toolkit && <span className="desk-row__warn"><Icon name="alert" size={12} /> kullanımda</span>}
            </div>
            <label className="desk-switch">
              <span>Odak gidince gizle<p>Panel dışına tıklayınca kapanır (panelde iğne ile açık tutulabilir).</p></span>
              <input type="checkbox" className="switch" checked={s.toolkit.hideOnBlur} onChange={(e) => save({ toolkit: { hideOnBlur: e.target.checked } })} aria-label="Odak gidince gizle" />
            </label>
          </div>
        </section>

        <section className="card">
          <h3 className="card__title"><Icon name="grid" /> Masaüstü widget'ları</h3>
          <p className="muted">Saat, ajanda, yapılacaklar, hızlı not, müzik, pano, sayaç, sistem, hava durumu, yaklaşan maçlar ve döviz — masaüstünüzde duran küçük pencereler. Konumları hatırlanır, uygulama açılınca geri gelir.</p>
          <div className="desk-rows">
            <div className="desk-row">
              <span className="desk-row__label">Widget'ları göster / gizle</span>
              <ShortcutRecorder label="Widget'lar" value={s.widgets?.shortcut || ""} conflict={conflictKeys.has("widgets")} onChange={(acc) => save({ widgets: { shortcut: acc } }, acc ? `Kısayol: ${acceleratorLabel(acc, mac)}` : "Kısayol kapatıldı.")} />
              {info.failed?.widgets && <span className="desk-row__warn"><Icon name="alert" size={12} /> kullanımda</span>}
            </div>
          </div>
          <div className="row-gap">
            <button type="button" className="btn btn--sm btn--primary" onClick={() => go?.("toolkit:widgets")}><Icon name="plus" size={13} /> Widget ekle / yönet</button>
            <button type="button" className="btn btn--sm" onClick={() => window.elitlig.widgets?.toggle()}><Icon name="eye" size={13} /> Göster / gizle</button>
          </div>
        </section>

        <section className="card">
          <h3 className="card__title"><Icon name="coffee" /> Ekranı uyanık tut</h3>
          <p className="muted">Sunum, yayın ya da uzun bir indirme sırasında ekranın kararmasını ve bilgisayarın uykuya geçmesini engeller. Menü çubuğundan ve panelden de açılır.</p>
          <div className="row-gap">
            {awake.on ? (
              <button type="button" className="btn btn--soft" onClick={async () => setAwake(await dk.setAwake({ on: false }))}><Icon name="coffee" size={14} /> Uyanık{awake.until ? ` · ${Math.max(1, Math.round((awake.until - Date.now()) / 60000))} dk kaldı` : ""} — kapat</button>
            ) : [0, 30, 60, 120].map((m) => (
              <button key={m} type="button" className="btn btn--sm" onClick={async () => setAwake(await dk.setAwake({ on: true, minutes: m }))}>{m ? `${m >= 60 ? `${m / 60} saat` : `${m} dk`}` : "Süresiz"}</button>
            ))}
          </div>
        </section>

        <section className="card" ref={permRef} style={{ gridColumn: "1 / -1" }}>
          <h3 className="card__title"><Icon name="layout" /> Pencere yerleştirme</h3>
          <p className="muted">Öndeki uygulamanın penceresini klavyeyle ya da menüden yarım, çeyrek, üçte bir ekrana yerleştirin. Menü çubuğu ve {mac ? "Dock" : "görev çubuğu"} hariç çalışma alanı kullanılır; birden çok ekran desteklenir.</p>
          {!info.supported && <p className="tk-err">Bu işletim sisteminde desteklenmiyor.</p>}
          <PermissionNote permission={info.permission} onChange={(p) => setInfo((x) => ({ ...x, permission: p }))} />
          <label className="desk-switch">
            <span>Kısayollar açık<p>Kapalıyken menü ve paneldeki ızgara yine çalışır.</p></span>
            <input type="checkbox" className="switch" checked={s.layouts.enabled} onChange={(e) => save({ layouts: { enabled: e.target.checked } })} aria-label="Pencere kısayolları" />
          </label>
          <label className="desk-switch">
            <span>Pencereler arası boşluk<p>Kenarlarda ve yan yana pencereler arasında bırakılan boşluk.</p></span>
            <select value={s.layouts.gap} onChange={(e) => save({ layouts: { gap: Number(e.target.value) } })} aria-label="Boşluk">
              {[0, 4, 8, 12, 16, 24].map((g) => <option key={g} value={g}>{g ? `${g} px` : "Yok"}</option>)}
            </select>
          </label>
          <div className="desk-rows" role="table" aria-label="Pencere kısayolları">
            {info.layouts.map((l) => (
              <div key={l.key} className="desk-row" role="row">
                <span className="desk-row__label" role="cell"><LayoutPreview layout={l} size={30} /> {l.label}</span>
                {info.failed?.[l.key] && s.layouts.enabled && <span className="desk-row__warn" role="cell" title="Başka bir uygulama bu kısayolu kullanıyor"><Icon name="alert" size={12} /> kullanımda</span>}
                {conflictKeys.has(l.key) && <span className="desk-row__warn" role="cell"><Icon name="alert" size={12} /> çakışıyor</span>}
                <span role="cell"><ShortcutRecorder label={l.label} value={s.layouts.shortcuts[l.key]} conflict={conflictKeys.has(l.key)} onChange={(acc) => setShortcut(l.key, acc)} /></span>
                <button type="button" className="icon-btn" role="cell" onClick={() => setShortcut(l.key, info.defaults.layouts.shortcuts[l.key])} disabled={s.layouts.shortcuts[l.key] === info.defaults.layouts.shortcuts[l.key]} aria-label={`${l.label}: varsayılan kısayol`} title={`Varsayılan: ${acceleratorLabel(info.defaults.layouts.shortcuts[l.key], mac)}`}><Icon name="rotate" size={14} /></button>
              </div>
            ))}
          </div>
          <div className="row-gap">
            <button type="button" className="btn btn--sm" onClick={() => save({ layouts: { shortcuts: info.defaults.layouts.shortcuts } }, "Pencere kısayolları varsayılana döndü.")}><Icon name="rotate" size={13} /> Tüm kısayolları varsayılana döndür</button>
          </div>
          <details className="desk-preview">
            <summary>Denemek için ızgara (bu pencereye uygulanır)</summary>
            <LayoutTool info={info} inPanel={false} onPermission={(p) => p && setInfo((x) => ({ ...x, permission: p }))} />
          </details>
          <p className="tk-note"><Icon name="info" size={12} /> Pencereyi ekran kenarına sürükleyince yapıştırma yoktur: diğer uygulamaların sürüklenmesi Electron'dan güvenilir izlenemiyor. Kısayollar, menü ve ızgara kullanın.{mac ? " Windows'ta ⌃ yerine Ctrl, ⌥ yerine Alt; ekran değiştirmede ⌘ yerine Shift." : ""}</p>
        </section>

        <section className="card">
          <h3 className="card__title"><Icon name="music" /> Müzik çalar</h3>
          <p className="muted">Müzik uygulamanın her yerinde çalar; kenar çubuğundaki mini çalar, menü çubuğu ve panelden yönetilir.</p>
          <label className="desk-switch">
            <span>Klavyedeki medya tuşları<p>⏯ ⏭ ⏮ tuşları müzik çalarken bu çaları yönetir (çalmıyorken diğer uygulamalara kalır).{mac ? " macOS'ta Erişilebilirlik izni gerekebilir." : ""}</p></span>
            <input type="checkbox" className="switch" checked={s.music.mediaKeys} onChange={(e) => save({ music: { mediaKeys: e.target.checked } })} aria-label="Medya tuşları" />
          </label>
          <div className="desk-switch">
            <span>Yayın Stüdyosu açılınca<p>Stüdyonun kendi müzik çaları yayına giden sesi yönetir; genel çalar ona karışmaz.</p></span>
          </div>
          <Segmented size="sm" value={s.music.studioRule} onChange={(v) => save({ music: { studioRule: v } })} options={STUDIO_RULES} ariaLabel="Stüdyo kuralı" />
        </section>
      </div>
    </div>
  );
}
