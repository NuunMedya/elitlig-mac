// Yayın Stüdyosu · Kaynaklar: önizlemedeki sahnenin katmanları (görünürlük,
// yerleşim, sıra) ve tüm kaynaklar (canlı küçük resim, durum, izin, ayarlar).
import React, { useEffect, useRef, useState } from "react";
import { Field, Icon, MenuButton, Modal } from "../../components/ui";
import { LAYOUTS, PIP_CORNERS, RESOLUTIONS, SOURCE_KINDS, deviceName, kindIcon, kindLabel, layoutLabel } from "../../lib/studio/layouts";
import { drawSource } from "./draw";

const STATUS_TEXT = { waiting: "Açılıyor…", live: "Canlı", missing: "Kaynak yok", denied: "İzin yok", ended: "Bağlantı koptu", busy: "Meşgul", error: "Açılamadı", file: "Dosya seçilmeli" };

/** Kaynağın canlı küçük resmi (yarım saniyede bir çizilir). */
export function SourceThumb({ source, runtimeRef, width = 96 }) {
  const ref = useRef(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      drawSource(ctx, source, runtimeRef.current.get(source.id), { x: 0, y: 0, w: c.width, h: c.height }, "cover", { placeholders: false });
    };
    draw();
    const t = setInterval(draw, 500);
    return () => clearInterval(t);
  }, [source, runtimeRef]);
  return <canvas ref={ref} className="st-thumb" width={width * 2} height={Math.round((width * 2 * 9) / 16)} style={{ width, height: Math.round((width * 9) / 16) }} />;
}

function LayerEditor({ layer, onChange }) {
  const l = layer.layout || { type: "full" };
  const setLayout = (patch) => onChange({ layout: { ...l, ...patch } });
  return (
    <div className="st-layer-edit" onClick={(e) => e.stopPropagation()}>
      <div className="st-row">
        <Field label="Yerleşim">
          <select value={l.type} onChange={(e) => setLayout({ type: e.target.value, ...(e.target.value === "pip" ? { corner: l.corner || "br", size: l.size || 30 } : {}), ...(e.target.value === "rect" ? { x: l.x ?? 5, y: l.y ?? 5, w: l.w ?? 40, h: l.h ?? 40 } : {}) })}>
            {LAYOUTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Sığdır">
          <select value={layer.fit || "cover"} onChange={(e) => onChange({ fit: e.target.value })}>
            <option value="cover">Doldur (kırp)</option>
            <option value="contain">Sığdır (boşluklu)</option>
            <option value="stretch">Uzat</option>
          </select>
        </Field>
      </div>
      {l.type === "pip" && (
        <div className="st-row">
          <Field label="Köşe">
            <select value={l.corner || "br"} onChange={(e) => setLayout({ corner: e.target.value })}>{PIP_CORNERS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </Field>
          <Field label={`Boyut · %${l.size || 30}`}><input type="range" min={10} max={60} step={1} value={l.size || 30} onChange={(e) => setLayout({ size: Number(e.target.value) })} /></Field>
        </div>
      )}
      {l.type === "rect" && (
        <div className="st-row st-row--4">
          {[["x", "Sol %"], ["y", "Üst %"], ["w", "Genişlik %"], ["h", "Yükseklik %"]].map(([k, label]) => (
            <Field key={k} label={label}><input type="number" min={0} max={100} value={l[k] ?? 0} onChange={(e) => setLayout({ [k]: Number(e.target.value) })} /></Field>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SourcesPanel({ scene, sources, runtimeRef, version, onAddLayer, onUpdateLayer, onMoveLayer, onRemoveLayer, onNewSource, onEditSource, onRemoveSource, onReacquire, onRequestAccess }) {
  const [open, setOpen] = useState(null);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const layers = scene ? [...scene.layers].reverse() : [];
  const notInScene = sources.filter((s) => !scene?.layers.some((l) => l.sourceId === s.id));
  void version;

  return (
    <>
      <section className="st-panel st-layers">
        <header className="st-panel__head">
          <h4 title={scene?.name}>Sahnede: {scene?.name || "—"}</h4>
          <MenuButton label="Katman ekle" icon="plus" size={14} items={[
            { label: "Yeni kaynak…", icon: "plus", onClick: () => onNewSource(true) },
            notInScene.length ? "-" : null,
            ...notInScene.map((s) => ({ label: s.name, icon: kindIcon(s.kind), onClick: () => onAddLayer(s.id) })),
          ]} />
        </header>
        {layers.length ? (
          <ul className="st-list">
            {layers.map((layer, i) => {
              const src = byId.get(layer.sourceId);
              if (!src) return null;
              const rt = runtimeRef.current.get(src.id);
              const isOpen = open === layer.id;
              return (
                <li key={layer.id} className={`st-layer ${layer.visible ? "" : "is-hidden"} ${isOpen ? "is-open" : ""}`}>
                  <div className="st-layer__row" onClick={() => setOpen(isOpen ? null : layer.id)}>
                    <button type="button" className="icon-btn icon-btn--xs" title={layer.visible ? "Gizle" : "Göster"} onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, { visible: !layer.visible }); }}>
                      <Icon name={layer.visible ? "eye" : "ban"} size={13} />
                    </button>
                    <span className={`st-dot is-${rt?.status || "waiting"}`} title={STATUS_TEXT[rt?.status] || ""} />
                    <span className="st-layer__text"><strong>{src.name}</strong><small>{layoutLabel(layer.layout)}</small></span>
                    <button type="button" className="icon-btn icon-btn--xs" title="Üste al" disabled={i === 0} onClick={(e) => { e.stopPropagation(); onMoveLayer(layer.id, 1); }}><Icon name="chevronUp" size={13} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" title="Alta al" disabled={i === layers.length - 1} onClick={(e) => { e.stopPropagation(); onMoveLayer(layer.id, -1); }}><Icon name="chevronDown" size={13} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" title="Sahneden çıkar" onClick={(e) => { e.stopPropagation(); onRemoveLayer(layer.id); }}><Icon name="x" size={13} /></button>
                  </div>
                  {isOpen && <LayerEditor layer={layer} onChange={(patch) => onUpdateLayer(layer.id, patch)} />}
                </li>
              );
            })}
          </ul>
        ) : <p className="st-hint st-pad">Bu sahnede kaynak yok. “+” ile kamera, ekran ya da görsel ekle.</p>}
      </section>

      <section className="st-panel st-sources">
        <header className="st-panel__head">
          <h4>Kaynaklar</h4>
          <button type="button" className="btn btn--xs btn--soft" onClick={() => onNewSource(false)}><Icon name="plus" size={12} /> Kaynak ekle</button>
        </header>
        <ul className="st-src-list">
          {sources.map((src) => {
            const rt = runtimeRef.current.get(src.id);
            const st = rt?.status || "waiting";
            const bad = ["missing", "denied", "ended", "busy", "error", "file"].includes(st);
            return (
              <li key={src.id} className={`st-src ${bad ? "is-bad" : ""}`}>
                <SourceThumb source={src} runtimeRef={runtimeRef} width={72} />
                <div className="st-src__text">
                  <strong title={src.name}>{src.name}</strong>
                  <small><span className={`st-dot is-${st}`} /> {st === "live" ? (rt?.label || kindLabel(src.kind)) : STATUS_TEXT[st]}</small>
                  {bad && rt?.message && <small className="st-src__msg">{rt.message}</small>}
                  {bad && (
                    <span className="st-row st-row--wrap">
                      {st === "denied" && (src.kind === "camera" || src.kind === "screen") && <button type="button" className="btn btn--xs" onClick={() => onRequestAccess(src.kind === "camera" ? "camera" : "screen")}>İzin iste</button>}
                      {st === "file" ? <button type="button" className="btn btn--xs" onClick={() => onEditSource(src)}>Dosya seç</button>
                        : <button type="button" className="btn btn--xs" onClick={() => onReacquire(src)}>Yeniden dene</button>}
                    </span>
                  )}
                </div>
                <MenuButton label="Kaynak" size={14} items={[
                  { label: "Ayarlar…", icon: "sliders", onClick: () => onEditSource(src) },
                  { label: "Yeniden bağlan", icon: "refresh", onClick: () => onReacquire(src) },
                  "-",
                  { label: "Kaynağı sil", icon: "trash", danger: true, onClick: () => onRemoveSource(src) },
                ]} />
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/* ------------------------------ kaynak penceresi ------------------------------ */

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

/** Yeni kaynak / kaynak ayarları. initial: { kind } ya da var olan kaynak. */
export function SourceDialog({ initial, cameraCount = 0, devices, access, onRequestAccess, onRefreshDevices, onSave, onClose }) {
  const editing = Boolean(initial?.id);
  const [draft, setDraft] = useState(() => ({ ...(initial || {}) }));
  const [screens, setScreens] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const kind = draft.kind;
  const studio = window.elitlig?.studio;

  useEffect(() => {
    if (kind === "camera") onRefreshDevices?.();
    if (kind !== "screen") return;
    let live = true;
    setScreens(null);
    Promise.resolve(studio?.listScreens?.()).then((list) => { if (live) setScreens(Array.isArray(list) ? list : []); }).catch(() => { if (live) setScreens([]); });
    return () => { live = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      if (kind === "image") {
        // Küçük görsel kalıcı saklanır (data: adresi); büyükse yalnız bu oturum.
        const url = file.size <= 3 * 1024 * 1024 ? await readDataUrl(file) : URL.createObjectURL(file);
        set({ url, fileName: file.name, name: draft.name && draft.name !== kindLabel(kind) ? draft.name : file.name.replace(/\.[^.]+$/, "") });
      } else {
        set({ url: URL.createObjectURL(file), fileName: file.name, name: draft.name && draft.name !== kindLabel(kind) ? draft.name : file.name.replace(/\.[^.]+$/, "") });
      }
    } finally { setBusy(false); }
  };

  const cams = devices.video;
  // Sıra numarasıyla seçilmiş kamera, kimlikler görününce kimliğe bağlanır.
  useEffect(() => {
    if (kind !== "camera" || draft.deviceId) return;
    const dev = cams[Number(draft.deviceIndex) || 0];
    if (dev?.deviceId) set({ deviceId: dev.deviceId, deviceLabel: dev.label || "" });
  }, [kind, cams, draft.deviceId, draft.deviceIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelsHidden = cams.length > 0 && cams.every((d) => !d.label);
  const camDenied = access?.camera === "denied" || access?.camera === "restricted";
  const screenDenied = access?.screen === "denied" || access?.screen === "restricted";
  const valid = kind === "camera" ? true : kind === "screen" ? Boolean(draft.screenId) : kind === "image" || kind === "video" ? Boolean(draft.url) : kind === "color";

  return (
    <Modal title={editing ? `${kindLabel(kind)} ayarları` : kind ? `${kindLabel(kind)} ekle` : "Kaynak ekle"} onClose={onClose} width={kind === "screen" ? 680 : 520} className="st-modal"
      footer={kind ? <>
        {!editing && <button type="button" className="btn btn--ghost" onClick={() => setDraft({})}>Geri</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={!valid || busy} onClick={() => onSave({ ...draft, name: String(draft.name || kindLabel(kind)).trim() || kindLabel(kind) })}>{editing ? "Kaydet" : "Ekle"}</button>
      </> : null}>
      {!kind ? (
        <div className="st-kinds">
          {SOURCE_KINDS.map((k) => (
            <button key={k.kind} type="button" className="st-kind" onClick={() => setDraft({ kind: k.kind, name: k.kind === "camera" ? `Kamera ${cameraCount + 1}` : k.label, deviceIndex: cameraCount, resolution: "1080p", mirror: false, loop: true, color: "#54009c", textColor: "#ffffff" })}>
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
                <label className="toggle st-toggle-field"><input type="checkbox" checked={Boolean(draft.mirror)} onChange={(e) => set({ mirror: e.target.checked })} /> Ayna görüntü</label>
              </div>
            </>
          )}

          {kind === "screen" && (
            <>
              {screenDenied && <div className="st-note is-warn"><Icon name="lock" size={14} /><span>Ekran kaydı izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Ekran ve Sistem Sesi Kaydı'ndan izin verin, sonra uygulamayı yeniden açın.</span></div>}
              {!studio?.listScreens ? <p className="st-hint">Ekran yakalama bu sürümde yok.</p>
                : screens == null ? <p className="st-hint">Ekranlar ve pencereler listeleniyor…</p>
                  : !screens.length ? <p className="st-hint">Paylaşılabilir ekran / pencere bulunamadı.</p>
                    : (
                      <div className="st-screens">
                        {screens.map((sc) => (
                          <button key={sc.id} type="button" className={`st-screen ${draft.screenId === sc.id ? "is-on" : ""}`} onClick={() => set({ screenId: sc.id, screenName: sc.name, name: draft.name && draft.name !== kindLabel("screen") ? draft.name : sc.name })}>
                            {sc.thumbnail ? <img src={sc.thumbnail} alt="" /> : <span className="st-screen__blank" />}
                            <small><Icon name={sc.kind === "window" ? "file" : "overview"} size={11} /> {sc.name}</small>
                          </button>
                        ))}
                      </div>
                    )}
            </>
          )}

          {(kind === "image" || kind === "video") && (
            <>
              <Field label={kind === "image" ? "Görsel dosyası" : "Video dosyası"} hint={kind === "video" ? "Video dosyaları oturumlar arasında saklanmaz; uygulama yeniden açılınca dosyayı tekrar seçin." : "3 MB'a kadar görseller kalıcı saklanır."}>
                <input type="file" accept={kind === "image" ? "image/*" : "video/*"} onChange={(e) => pickFile(e.target.files?.[0])} />
              </Field>
              {draft.url && kind === "image" && <img className="st-file-preview" src={draft.url} alt="" />}
              {draft.fileName && <p className="st-hint">Seçili: {draft.fileName}</p>}
              {kind === "video" && <label className="toggle"><input type="checkbox" checked={draft.loop !== false} onChange={(e) => set({ loop: e.target.checked })} /> Döngüde oynat (sessiz)</label>}
            </>
          )}

          {kind === "color" && (
            <>
              <div className="st-row">
                <Field label="Zemin rengi"><input type="color" value={draft.color || "#54009c"} onChange={(e) => set({ color: e.target.value })} /></Field>
                <Field label="Yazı rengi"><input type="color" value={draft.textColor || "#ffffff"} onChange={(e) => set({ textColor: e.target.value })} /></Field>
              </div>
              <Field label="Yazı (en çok 3 satır)"><textarea rows={3} value={draft.text || ""} onChange={(e) => set({ text: e.target.value })} placeholder="Maç arası · Sponsorumuz …" /></Field>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
