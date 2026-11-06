// Yayın Stüdyosu · KAYNAK KİTAPLIĞI ve kaynak penceresi.
//
//   SourceLibrary  KAYNAKLAR sekmesi (kartlar): canlı küçük resim, durum, kaç sahnede
//                  kullanıldığı, ayarlar, yeniden bağlan, sahneye ekle, "sahne oluştur", sil.
//                  Bir kaynak birçok sahnede katman olabilir (akış bir kez açılır).
//                  Kaynak eklemek sahne oluşturmaz.
//   SourceDialog   yeni kaynak / kaynak ayarları: Kamera (çözünürlük, fps, ayna),
//                  Ekran, Pencere, Görsel, Video / medya (döngü, görününce baştan),
//                  Görüntü dizisi (slayt), Renk / gradyan, Metin, Saat / geri sayım,
//                  Tekrar (son tekrar açısı), Ses girişi (Ses sekmesine eklenir).
//
// Web sayfası kaynağı yok: Electron'da <webview> / iframe içeriği tuvale
// çizilemez (yakalanamaz). LED / skor sayfası için "LED ekran" sekmesi kullanılır.
//
// Açılır menüler kapanmasın diye: seçenek listeleri memo'lu, panel memo'lu ve
// pencerenin onClose'u kimliği değişmeyen bir işlevdir (useStable).
import React, { memo, useEffect, useRef, useState } from "react";
import { Field, Icon, MenuButton, Modal } from "../../components/ui";
import { RESOLUTIONS, deviceName } from "../../lib/studio/layouts";
import { FONTS, SOURCE_TYPES, sourceDefaults, sourceKindIcon, sourceKindLabel, sourceUsage } from "../../lib/studio/scenes";
import { drawSource } from "./draw";
import { useStable } from "./useStable";

export const STATUS_TEXT = { waiting: "Açılıyor…", live: "Canlı", missing: "Kaynak yok", denied: "İzin yok", ended: "Bağlantı koptu", busy: "Meşgul", error: "Açılamadı", file: "Dosya seçilmeli", empty: "Tekrar yok" };
export const BAD = ["missing", "denied", "ended", "busy", "error", "file"];
const SYNTHETIC = new Set(["color", "text", "clock"]);

/** Kaynağın canlı küçük resmi (yarım saniyede bir; görünmüyorsa çizilmez). */
export function SourceThumb({ source, runtimeRef, width = 96 }) {
  const ref = useRef(null);
  const srcRef = useRef(source);
  srcRef.current = source;
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c || !c.isConnected || c.offsetParent === null) return;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      drawSource(ctx, srcRef.current, runtimeRef.current.get(srcRef.current.id), { x: 0, y: 0, w: c.width, h: c.height }, srcRef.current.kind === "image" ? "contain" : "cover", { placeholders: true });
    };
    draw();
    const t = setInterval(draw, 600);
    return () => clearInterval(t);
  }, [runtimeRef]);
  return <canvas ref={ref} className="st-thumb" width={width} height={Math.round((width * 9) / 16)} />;
}

/**
 * KAYNAKLAR sekmesi: kart ızgarası. Kaynak eklemek sahne OLUŞTURMAZ; kartta
 * "Sahne oluştur" (bu kaynaktan tam ekran sahne) ve "Sahneye ekle ▸" açık eylemlerdir.
 */
function SourceLibraryInner({ config, runtimeRef, version, actions }) {
  void version;
  const { onNewSource, onEditSource, onRemoveSource, onReacquire, onRequestAccess, onAddToScene, onSceneFromSource } = actions;
  const sources = config.sources;
  return (
    <section className="st-srcs">
      <header className="st-srcs__head">
        <div>
          <h4>Kaynaklar</h4>
          <p className="st-hint">Kaynak = giriş (kamera, ekran, görsel, video, metin, saat…). Yayına <b>sahne</b> gider: kaynağı bir sahneye katman olarak ekle ya da kaynaktan sahne oluştur.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={onNewSource}><Icon name="plus" size={13} /> Kaynak ekle</button>
      </header>
      <ul className="st-srcs__grid">
        {sources.map((src) => {
          const rt = runtimeRef.current.get(src.id);
          const st = SYNTHETIC.has(src.kind) ? "live" : rt?.status || "waiting";
          const bad = BAD.includes(st);
          const used = sourceUsage(config, src.id);
          return (
            <li key={src.id} className={`st-srcard ${bad ? "is-bad" : ""}`}>
              <button type="button" className="st-srcard__thumb" onClick={() => onEditSource(src)} title="Kaynak ayarları">
                <SourceThumb source={src} runtimeRef={runtimeRef} width={224} />
                <span className={`st-srcard__status is-${st}`}><span className={`st-dot is-${st}`} /> {st === "live" ? (rt?.label || "Hazır") : STATUS_TEXT[st] || st}</span>
              </button>
              <div className="st-srcard__body">
                <strong title={src.name}><Icon name={sourceKindIcon(src.kind)} size={12} /> {src.name}</strong>
                <small className="muted">{sourceKindLabel(src.kind)} · <span title={used.join(", ") || "Hiçbir sahnede değil"}>{used.length ? `${used.length} sahnede` : "sahnede değil"}</span></small>
                {bad && rt?.message && <small className="st-src__msg">{rt.message}</small>}
              </div>
              <div className="st-srcard__tools">
                {st === "denied" && (src.kind === "camera" || src.kind === "screen" || src.kind === "window") && <button type="button" className="btn btn--xs" onClick={() => onRequestAccess(src.kind === "camera" ? "camera" : "screen")}>İzin iste</button>}
                {st === "file" ? <button type="button" className="btn btn--xs" onClick={() => onEditSource(src)}>Dosya seç</button>
                  : bad && <button type="button" className="btn btn--xs" onClick={() => onReacquire(src)}>Yeniden dene</button>}
                <button type="button" className="btn btn--xs btn--soft" onClick={() => onSceneFromSource(src.id)} title="Bu kaynağı tam ekran gösteren yeni sahne"><Icon name="layers" size={11} /> Sahne oluştur</button>
                <MenuButton label="Sahneye ekle" icon="plus" size={13} items={[
                  ...config.scenes.map((sc) => ({ label: `“${sc.name}” sahnesine ekle`, icon: "layers", onClick: () => onAddToScene(src, sc.id) })),
                ]} />
                <MenuButton label="Kaynak" size={14} items={[
                  { label: "Ayarlar…", icon: "sliders", onClick: () => onEditSource(src) },
                  { label: "Bu kaynaktan sahne oluştur", icon: "layers", onClick: () => onSceneFromSource(src.id) },
                  { label: "Yeniden bağlan", icon: "refresh", onClick: () => onReacquire(src) },
                  "-",
                  { label: "Kaynağı sil", icon: "trash", danger: true, onClick: () => onRemoveSource(src) },
                ]} />
              </div>
            </li>
          );
        })}
        <li className="st-srcard is-add">
          <button type="button" onClick={onNewSource}><Icon name="plus" size={20} /><strong>Kaynak ekle</strong><small>Kamera, ekran, pencere, görsel, video, metin, saat…</small></button>
        </li>
      </ul>
    </section>
  );
}
export const SourceLibrary = memo(SourceLibraryInner);

/* ------------------------------ kaynak penceresi ------------------------------ */

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

const baseName = (file) => file.name.replace(/\.[^.]+$/, "");

/** Metin / saat görünüm alanları (ortak). */
function TextStyleFields({ draft, set }) {
  return (
    <>
      <div className="st-row">
        <Field label="Yazı tipi">
          <select value={draft.font || "Archivo"} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
        </Field>
        <Field label={`Boyut · ${draft.size || 64} px`}><input type="range" min={16} max={260} step={2} value={draft.size || 64} onChange={(e) => set({ size: Number(e.target.value) })} /></Field>
        <Field label="Hiza">
          <select value={draft.align || "center"} onChange={(e) => set({ align: e.target.value })}>
            <option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option>
          </select>
        </Field>
      </div>
      <div className="st-row st-row--wrap">
        <Field label="Renk"><input type="color" value={draft.color || "#ffffff"} onChange={(e) => set({ color: e.target.value })} /></Field>
        <label className="toggle st-toggle-field"><input type="checkbox" checked={draft.bold !== false} onChange={(e) => set({ bold: e.target.checked })} /> Kalın</label>
        <label className="toggle st-toggle-field"><input type="checkbox" checked={Boolean(draft.outline)} onChange={(e) => set({ outline: e.target.checked })} /> Kontur</label>
        {draft.outline && <Field label="Kontur rengi"><input type="color" value={draft.outlineColor || "#000000"} onChange={(e) => set({ outlineColor: e.target.value })} /></Field>}
        {draft.outline && <Field label={`Kalınlık · ${draft.outlineWidth || 4}`}><input type="range" min={1} max={16} value={draft.outlineWidth || 4} onChange={(e) => set({ outlineWidth: Number(e.target.value) })} /></Field>}
        <label className="toggle st-toggle-field"><input type="checkbox" checked={Boolean(draft.background)} onChange={(e) => set({ background: e.target.checked })} /> Zemin</label>
        {draft.background && <Field label="Zemin rengi"><input type="color" value={draft.bgColor || "#54009c"} onChange={(e) => set({ bgColor: e.target.value })} /></Field>}
      </div>
    </>
  );
}

const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Yeni kaynak / kaynak ayarları. initial: { kind } ya da var olan kaynak. */
function SourceDialogInner({ initial, cameraCount = 0, devices, access, onRequestAccess, onRefreshDevices, onSave, onClose: onCloseProp }) {
  // Ortak Modal, onClose kimliği her değiştiğinde ilk alana odaklanır; stüdyo
  // saniyede birkaç kez çizildiği için açık <select> menüsü hemen kapanıyordu.
  const onClose = useStable(onCloseProp);
  const editing = Boolean(initial?.id);
  const [draft, setDraft] = useState(() => ({ ...(initial || {}) }));
  const [screens, setScreens] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const kind = draft.kind;
  const studio = window.elitlig?.studio;
  const isCapture = kind === "screen" || kind === "window";

  useEffect(() => {
    if (kind === "camera" || kind === "audio") onRefreshDevices?.();
    if (!isCapture) return undefined;
    let live = true;
    setScreens(null);
    Promise.resolve(studio?.listScreens?.()).then((list) => { if (live) setScreens(Array.isArray(list) ? list : []); }).catch(() => { if (live) setScreens([]); });
    return () => { live = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const keepName = (fallback) => (draft.name && draft.name !== sourceKindLabel(kind) ? draft.name : fallback);
  const pickFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      if (kind === "image") {
        // Küçük görsel kalıcı saklanır (data: adresi); büyükse yalnız bu oturum.
        const url = file.size <= 3 * 1024 * 1024 ? await readDataUrl(file) : URL.createObjectURL(file);
        set({ url, fileName: file.name, name: keepName(baseName(file)) });
      } else {
        // Nesne adresi: tuval kirletilmez; dosyalar oturumlar arasında saklanmaz.
        const url = URL.createObjectURL(file);
        set({ url, fileName: file.name, name: keepName(baseName(file)) });
      }
    } finally { setBusy(false); }
  };
  const pickSlides = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of [...files].slice(0, 40)) urls.push(f.size <= 2 * 1024 * 1024 ? await readDataUrl(f) : URL.createObjectURL(f));
      set({ images: [...(draft.images || []), ...urls].slice(0, 40) });
    } finally { setBusy(false); }
  };

  const cams = devices.video;
  useEffect(() => {
    if (kind !== "camera" || draft.deviceId) return;
    const dev = cams[Number(draft.deviceIndex) || 0];
    if (dev?.deviceId) set({ deviceId: dev.deviceId, deviceLabel: dev.label || "" });
  }, [kind, cams, draft.deviceId, draft.deviceIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelsHidden = cams.length > 0 && cams.every((d) => !d.label);
  const camDenied = access?.camera === "denied" || access?.camera === "restricted";
  const screenDenied = access?.screen === "denied" || access?.screen === "restricted";
  const valid = kind === "camera" ? true
    : isCapture ? Boolean(draft.screenId)
      : kind === "image" || kind === "video" ? Boolean(draft.url)
        : kind === "slideshow" ? (draft.images || []).length > 0
          : kind === "text" ? Boolean(String(draft.text || "").trim())
            : Boolean(kind);
  const visibleScreens = (screens || []).filter((sc) => (kind === "window" ? sc.kind === "window" || String(sc.id).startsWith("window:") : sc.kind !== "window" && !String(sc.id).startsWith("window:")));

  return (
    <Modal title={editing ? `${sourceKindLabel(kind)} ayarları` : kind ? `${sourceKindLabel(kind)} ekle` : "Kaynak ekle"} onClose={onClose} width={isCapture ? 680 : kind ? 560 : 640} className="st-modal"
      footer={kind ? <>
        {!editing && <button type="button" className="btn btn--ghost" onClick={() => setDraft({})}>Geri</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={!valid || busy} onClick={() => onSave({ ...draft, name: String(draft.name || sourceKindLabel(kind)).trim() || sourceKindLabel(kind) })}>{editing ? "Kaydet" : kind === "audio" ? "Ses sekmesine ekle" : "Ekle"}</button>
      </> : null}>
      {!kind ? (
        <div className="st-kinds">
          {SOURCE_TYPES.map((k) => (
            <button key={k.kind} type="button" className="st-kind" onClick={() => setDraft(sourceDefaults(k.kind, { cameraCount }))}>
              <span className="st-kind__icon"><Icon name={k.icon} size={18} /></span>
              <span><strong>{k.label}</strong><small>{k.hint}</small></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="st-stack">
          <Field label="Ad"><input value={draft.name || ""} onChange={(e) => set({ name: e.target.value })} maxLength={60} /></Field>

          {kind === "camera" && (
            <>
              {(camDenied || labelsHidden || !cams.length) && (
                <div className="st-note is-warn">
                  <Icon name="lock" size={14} />
                  <span>{camDenied ? "Kamera izni verilmemiş. Sistem Ayarları › Gizlilik ve Güvenlik › Kamera bölümünden ElitLig Araçlar'ı açın." : !cams.length ? "Kamera bulunamadı. USB kamera / yakalama kartı takılıysa izin verip listeyi yenileyin." : "Kamera adlarını görmek için izin verin."}</span>
                  <button type="button" className="btn btn--xs" onClick={() => onRequestAccess("camera")}>İzin iste</button>
                </div>
              )}
              <Field label="Kamera" hint="iPhone'u Süreklilik Kamerası olarak kullanmak için aynı Apple hesabıyla yakına getirin; listede görünür.">
                <select value={draft.deviceId || `#${draft.deviceIndex ?? 0}`} onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("#")) set({ deviceId: null, deviceIndex: Number(v.slice(1)), deviceLabel: "" });
                  else set({ deviceId: v, deviceLabel: cams.find((d) => d.deviceId === v)?.label || "" });
                }}>
                  {!cams.some((d) => d.deviceId === draft.deviceId) && draft.deviceId && <option value={draft.deviceId}>{draft.deviceLabel || "Kayıtlı kamera (takılı değil)"}</option>}
                  {cams.map((d, i) => (d.deviceId ? <option key={d.deviceId} value={d.deviceId}>{deviceName(d, i)}</option> : <option key={`#${i}`} value={`#${i}`}>{deviceName(d, i)}</option>))}
                  {!cams.length && <option value="#0">Varsayılan kamera</option>}
                </select>
              </Field>
              <div className="st-row">
                <Field label="Çözünürlük">
                  <select value={draft.resolution || "1080p"} onChange={(e) => set({ resolution: e.target.value })}>{RESOLUTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
                </Field>
                <Field label="Kare hızı">
                  <select value={draft.fps || 30} onChange={(e) => set({ fps: Number(e.target.value) })}>{[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select>
                </Field>
                <label className="toggle st-toggle-field"><input type="checkbox" checked={Boolean(draft.mirror)} onChange={(e) => set({ mirror: e.target.checked })} /> Ayna görüntü</label>
              </div>
            </>
          )}

          {isCapture && (
            <>
              {screenDenied && <div className="st-note is-warn"><Icon name="lock" size={14} /><span>Ekran kaydı izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Ekran ve Sistem Sesi Kaydı'ndan izin verin, sonra uygulamayı yeniden açın.</span></div>}
              {!studio?.listScreens ? <p className="st-hint">Ekran yakalama bu sürümde yok.</p>
                : screens == null ? <p className="st-hint">{kind === "window" ? "Pencereler" : "Ekranlar"} listeleniyor…</p>
                  : !visibleScreens.length ? <p className="st-hint">Paylaşılabilir {kind === "window" ? "pencere" : "ekran"} bulunamadı.</p>
                    : (
                      <div className="st-screens">
                        {visibleScreens.map((sc) => (
                          <button key={sc.id} type="button" className={`st-screen ${draft.screenId === sc.id ? "is-on" : ""}`} onClick={() => set({ screenId: sc.id, screenName: sc.name, name: keepName(sc.name) })}>
                            {sc.thumbnail ? <img src={sc.thumbnail} alt="" /> : <span className="st-screen__blank" />}
                            <small><Icon name={kind === "window" ? "file" : "overview"} size={11} /> {sc.name}</small>
                          </button>
                        ))}
                      </div>
                    )}
            </>
          )}

          {(kind === "image" || kind === "video") && (
            <>
              <Field label={kind === "image" ? "Görsel dosyası" : "Video / medya dosyası"} hint={kind === "video" ? "Video dosyaları oturumlar arasında saklanmaz; uygulama yeniden açılınca dosyayı tekrar seçin." : "3 MB'a kadar görseller kalıcı saklanır."}>
                <input type="file" accept={kind === "image" ? "image/*" : "video/*,audio/*"} onChange={(e) => pickFile(e.target.files?.[0])} />
              </Field>
              {draft.url && kind === "image" && <img className="st-file-preview" src={draft.url} alt="" />}
              {draft.fileName && <p className="st-hint">Seçili: {draft.fileName}</p>}
              {kind === "video" && (
                <div className="st-row st-row--wrap">
                  <label className="toggle"><input type="checkbox" checked={draft.loop !== false} onChange={(e) => set({ loop: e.target.checked })} /> Döngüde oynat</label>
                  <label className="toggle" title="Sahne yayına alındığında video baştan başlar"><input type="checkbox" checked={draft.restartOnShow !== false} onChange={(e) => set({ restartOnShow: e.target.checked })} /> Yayına gelince baştan başlat</label>
                </div>
              )}
              {kind === "video" && <p className="st-hint">Videonun sesi yayına gitmez (sessiz oynar).</p>}
            </>
          )}

          {kind === "slideshow" && (
            <>
              <Field label="Görseller" hint="Birden çok görsel seçebilirsin (en çok 40). 2 MB'a kadar olanlar kalıcı saklanır.">
                <input type="file" accept="image/*" multiple onChange={(e) => pickSlides(e.target.files)} />
              </Field>
              {(draft.images || []).length > 0 && (
                <div className="st-slides">
                  {draft.images.map((u, i) => (
                    <span key={`${i}_${u.slice(-12)}`} className="st-slide">
                      <img src={u} alt="" />
                      <button type="button" className="icon-btn icon-btn--xs" title="Çıkar" onClick={() => set({ images: draft.images.filter((_, j) => j !== i) })}><Icon name="x" size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <Field label={`Görsel süresi · ${Math.round((draft.intervalMs || 5000) / 1000)} sn`}><input type="range" min={1000} max={30000} step={500} value={draft.intervalMs || 5000} onChange={(e) => set({ intervalMs: Number(e.target.value) })} /></Field>
            </>
          )}

          {kind === "color" && (
            <>
              <div className="st-row st-row--wrap">
                <Field label="Renk"><input type="color" value={draft.color || "#54009c"} onChange={(e) => set({ color: e.target.value })} /></Field>
                <label className="toggle st-toggle-field"><input type="checkbox" checked={Boolean(draft.gradient)} onChange={(e) => set({ gradient: e.target.checked })} /> Gradyan</label>
                {draft.gradient && <Field label="İkinci renk"><input type="color" value={draft.color2 || "#c026d3"} onChange={(e) => set({ color2: e.target.value })} /></Field>}
                {draft.gradient && <Field label={`Açı · ${draft.gradientAngle ?? 135}°`}><input type="range" min={0} max={360} step={5} value={draft.gradientAngle ?? 135} onChange={(e) => set({ gradientAngle: Number(e.target.value) })} /></Field>}
                <Field label="Yazı rengi"><input type="color" value={draft.textColor || "#ffffff"} onChange={(e) => set({ textColor: e.target.value })} /></Field>
              </div>
              <Field label="Yazı (isteğe bağlı)"><textarea rows={3} value={draft.text || ""} onChange={(e) => set({ text: e.target.value })} placeholder="Maç arası · Sponsorumuz …" /></Field>
            </>
          )}

          {kind === "text" && (
            <>
              <Field label="Metin"><textarea rows={3} value={draft.text || ""} onChange={(e) => set({ text: e.target.value })} placeholder="Devre arası · 15 dk" /></Field>
              <TextStyleFields draft={draft} set={set} />
            </>
          )}

          {kind === "clock" && (
            <>
              <Field label="Tür">
                <div className="st-seg">
                  {[["clock", "Saat"], ["countdown", "Geri sayım"], ["countup", "Kronometre"], ["match", "Maç saati"]].map(([k, l]) => (
                    <button key={k} type="button" className={(draft.mode || "clock") === k ? "is-on" : ""} onClick={() => set({ mode: k, ...(k === "countup" ? { startedAt: Date.now() } : {}) })}>{l}</button>
                  ))}
                </div>
              </Field>
              {draft.mode === "countdown" && (
                <div className="st-row">
                  <Field label="Bitiş anı"><input type="datetime-local" value={toLocalInput(draft.targetAt)} onChange={(e) => set({ targetAt: e.target.value ? new Date(e.target.value).getTime() : null })} /></Field>
                  <Field label="ya da şimdiden"><select value="" onChange={(e) => e.target.value && set({ targetAt: Date.now() + Number(e.target.value) * 60_000 })}>
                    <option value="">dakika seç…</option>{[1, 2, 5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} dk</option>)}
                  </select></Field>
                </div>
              )}
              {draft.mode === "countup" && <button type="button" className="btn btn--xs" onClick={() => set({ startedAt: Date.now() })}><Icon name="refresh" size={11} /> Sıfırla (şimdi başlat)</button>}
              {(draft.mode || "clock") === "clock" && <label className="toggle"><input type="checkbox" checked={Boolean(draft.seconds)} onChange={(e) => set({ seconds: e.target.checked })} /> Saniyeyi göster</label>}
              <TextStyleFields draft={draft} set={set} />
            </>
          )}

          {kind === "replay" && (
            <>
              <Field label="Açı" hint="En son kaydedilen tekrarın bu açısı döngüde oynar; yeni tekrar gelince kendiliğinden değişir.">
                <select value={draft.angle || "program"} onChange={(e) => set({ angle: e.target.value })}>
                  <option value="program">Program (yayın görüntüsü)</option>
                  {(initial?.angleOptions || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <label className="toggle"><input type="checkbox" checked={draft.loop !== false} onChange={(e) => set({ loop: e.target.checked })} /> Döngüde oynat</label>
            </>
          )}

          {kind === "audio" && (
            <>
              <Field label="Ses aygıtı" hint="Yalnız ses: Ses sekmesindeki karıştırıcıya eklenir (seviye, sessiz).">
                <select value={draft.deviceId || ""} onChange={(e) => set({ deviceId: e.target.value, name: keepName(devices.audio.find((d) => d.deviceId === e.target.value)?.label || "Ses girişi") })}>
                  <option value="">Aygıt seç…</option>
                  {devices.audio.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Ses girişi ${i + 1}`}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Kaynak penceresi: yalnız kendi girdileri değişince yeniden çizilir. */
export const SourceDialog = memo(SourceDialogInner);
export default SourceLibrary;
