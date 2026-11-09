// Yayın grafikleri · GRAFİK PAKETLERİ (Ayarlar › Grafikler ve Kontrol merkezi).
//
// Galeri: her paket gerçek çizim koduyla (drawGraphics) üç küçük resimde —
// skorbord, alt bant, devre arası ekranı. "Uygula" bütün görünümü tek dokunuşta
// değiştirir (hemen yumuşak geçişle ya da sonraki GEÇİŞ'te). Lig / turnuva
// varsayılanı, çoğalt + düzenle (palet, yazı tipi, öğe başına renk), JSON dışa /
// içe aktarma. Model: lib/studio/graphics/packages.js · uygulama: usePackageControl.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Modal, useConfirm } from "../../../components/ui";
import logoInline from "../../../assets/elitlig-beyaz.png?inline";
import { DEFAULT_BRANDING, buildGraphicsSnapshot, drawGraphics } from "../../../lib/studio/graphics";
import {
  APPLY_MODES, MAX_CUSTOM_PACKAGES, PACKAGE_COVER_TEMPLATES, PACKAGE_ELEMENTS, PACKAGE_FONTS, PACKAGE_TRANSITIONS, PACKAGE_VAR_THEMES,
  SCOREBUG_STYLES, SPONSOR_TONES, applyPackageToSnapshot, duplicatePackage, exportPackagesJson, materializePackage, mergePackage,
  packageSummary, packageSwatches, parsePackagesImport, removePackage, upsertPackage, validatePackageName, withLeagueDefault,
} from "../../../lib/studio/graphics/packages";
import { INTERVIEW_STYLES } from "../../../lib/studio/graphics/drawInterview";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";
import { VAR_THEMES } from "../../../lib/studio/varThemes";
import { COVER_TEMPLATES } from "../../../lib/studio/cover/model";
import GraphicsPreview from "./GraphicsPreview";
import { teamColorsFor } from "./usePackageControl";
import "./packages.css";

/* ------------------------------ örnek maç (maç seçilmediyse) ------------------------------ */

const SAMPLE_LIVE = {
  match: { id: 0, first_team_name: "Ankara Gençlikspor", second_team_name: "Karadeniz FK", league_name: "Elit Lig", season_name: "2026 Güz", match_field: "Yenimahalle Sahası", date: "2026-11-09", time: "21:00" },
  homeName: "Ankara Gençlikspor", awayName: "Karadeniz FK", score: { home: 2, away: 1 }, period: 2, running: true, status: "canli",
  timer: { base_ms: 63 * 60000 + 12000, base_at: null, running: false },
  events: [
    { id: 1, takim_id: 3, olay_kodu: "GOAL_RIGHT_FOOT", dakika: 6, oyuncu_id: 101 },
    { id: 2, takim_id: 8, olay_kodu: "GOAL_HEADER", dakika: 14, oyuncu_id: 201 },
    { id: 3, takim_id: 8, olay_kodu: "YELLOW_CARD", dakika: 19, oyuncu_id: 202 },
    { id: 4, takim_id: 3, olay_kodu: "GOAL_PENALTY", dakika: 38, oyuncu_id: 102 },
  ],
  homeTeamId: 3, awayTeamId: 8, logos: { home: null, away: null },
  nameOf: (id) => ({ 101: "Can Aydın", 102: "Mert Kılıç", 201: "Selim Kara", 202: "Hakan Öz" }[id] || null),
  squads: { home: [], away: [] },
};
const SAMPLE_SUBTITLE = { customHeadlines: [{ tag: "MANŞET", text: "Elit Lig'de haftanın maçı canlı yayında" }, { tag: "DUYURU", text: "Maç sonu röportajları birazdan" }], sections: { custom: true, headlines: true, scorers: false, ai: false } };

function sampleSnapshot() {
  return buildGraphicsSnapshot(SAMPLE_LIVE, { branding: DEFAULT_BRANDING, defaultLogo: logoInline, variant: "scoreboard", variantSince: 1, subtitle: { onAir: true, settings: SAMPLE_SUBTITLE, epoch: 1 } });
}

/** Önizleme anlık görüntüsü: maçın paketsiz görüntüsü (yoksa örnek maç) + paket. */
export function previewSnapshot(base, pkg, { teams = null } = {}) {
  const snap0 = base?.match?.id ? { ...base, variantSince: 1, subtitle: { ...base.subtitle, onAir: true, epoch: 1, blocks: base.subtitle?.blocks?.length ? base.subtitle.blocks : sampleSnapshot().subtitle.blocks } } : sampleSnapshot();
  const p = pkg ? materializePackage(pkg, { teams }) : null;
  return applyPackageToSnapshot({ ...snap0, variant: p ? p.scorebug.variant : "scoreboard", fade: null, qr: null }, p);
}

/* ------------------------------ küçük resimler ------------------------------ */

/** Sahnenin bir bölgesi (1920×1080 sahne pikseli) büyütülmüş: küçük skorbord / alt bant okunur olsun. */
const CROPS = {
  top: { x: 30, y: 22, w: 760, h: 238 },
  bottom: { x: 440, y: 790, w: 1040, h: 325 },
  lower: { x: 24, y: 950, w: 860, h: 124 },
};
export const cropFor = (variant) => (variant === "bottomboard" ? CROPS.bottom : CROPS.top);

function paintField(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#2c5236"); g.addColorStop(1, "#13261a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

export function CropPreview({ snapshot, region, width = 300, fps = 0.25, delay = 0, className = "", title }) {
  const ref = useRef(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const height = Math.round((width * region.h) / region.w);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    let timer = null;
    let visible = true;
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    io?.observe(canvas);
    const paint = () => {
      if (visible && snapRef.current && ctx) {
        const s = canvas.width / region.w;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        paintField(ctx, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(-region.x * s, -region.y * s);
        drawGraphics(ctx, { width: 1920 * s, height: 1080 * s, now: Date.now() }, snapRef.current);
        ctx.restore();
      }
      timer = setTimeout(paint, 1000 / fps);
    };
    timer = setTimeout(paint, delay);
    return () => { clearTimeout(timer); io?.disconnect(); };
  }, [width, height, fps, delay, region]);
  return <canvas ref={ref} className={`gx-preview ${className}`} style={{ width, height, aspectRatio: `${region.w} / ${region.h}` }} title={title} aria-label={title || "Grafik önizlemesi"} />;
}

export function PackageThumbs({ snapshot, width = 300, live = false, compact = false }) {
  const scoreSnap = useMemo(() => ({ ...snapshot, subtitle: { ...snapshot.subtitle, onAir: false }, interview: { ...snapshot.interview, onAir: false } }), [snapshot]);
  const lowerSnap = useMemo(() => ({ ...snapshot, variant: "off" }), [snapshot]);
  const fps = live ? 2 : 0.25;
  return (
    <div className={`gpk-thumbs ${compact ? "is-compact" : ""}`}>
      <CropPreview snapshot={scoreSnap} region={cropFor(scoreSnap.variant)} width={width} fps={fps} className="gpk-thumb is-crop" title="Skorbord önizlemesi" />
      {!compact && (
        <>
          <CropPreview snapshot={lowerSnap} region={CROPS.lower} width={width} fps={fps} delay={120} className="gpk-thumb is-crop" title="Alt bant önizlemesi" />
          <div className="gpk-thumbs__row">
            <GraphicsPreview snapshot={scoreSnap} variant="halftime" width={Math.round(width / 2) - 3} fps={fps} delay={240} className="gpk-thumb" title="Devre arası ekranı önizlemesi" />
            <GraphicsPreview snapshot={scoreSnap} variant="pre_match" width={Math.round(width / 2) - 3} fps={fps} delay={360} className="gpk-thumb" title="Maç öncesi ekranı önizlemesi" />
          </div>
        </>
      )}
    </div>
  );
}

export const PackageSwatches = ({ pkg }) => <span className="gpk-sw" aria-hidden="true">{packageSwatches(pkg).map((c, i) => <i key={i} style={{ background: c }} />)}</span>;

/* ------------------------------ dosya yardımcıları ------------------------------ */

async function downloadJson(name, text) {
  const save = window.elitlig?.files?.save;
  if (save) {
    const r = await save(name, text, [{ name: "Grafik paketi", extensions: ["json"] }]);
    return r?.ok ? { ok: true } : { ok: false, canceled: true };
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true };
}
const fileSafe = (s) => String(s || "paket").toLocaleLowerCase("tr-TR").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c])).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paket";

/* ------------------------------ düzenleyici ------------------------------ */

function Color({ label, value, onChange, allowEmpty = false }) {
  return (
    <label className="gpk-color">
      <span>{label}</span>
      <span className="gpk-color__in">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <code>{value || "—"}</code>
        {allowEmpty && value && <button type="button" className="icon-btn icon-btn--xs" onClick={() => onChange(null)} title="Paketten al"><Icon name="x" size={11} /></button>}
      </span>
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="gpk-field"><span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
    </label>
  );
}

const TR_OPTS = PACKAGE_TRANSITIONS.map((k) => ({ key: k, label: TRANSITION_KINDS.find((t) => t.key === k)?.label || k }));
const VAR_OPTS = PACKAGE_VAR_THEMES.map((k) => ({ key: k, label: VAR_THEMES.find((t) => t.key === k)?.label || k }));
const COVER_OPTS = PACKAGE_COVER_TEMPLATES.map((k) => ({ key: k, label: COVER_TEMPLATES.find((t) => t.key === k)?.label || k }));
const FONT_OPTS = PACKAGE_FONTS.map((f) => ({ key: f.key, label: f.label }));

export function PackageEditor({ pkg, list, baseSnapshot, teams, onSave, onClose }) {
  const [draft, setDraft] = useState(pkg);
  const [element, setElement] = useState("scorebug");
  const set = (patch) => setDraft((d) => mergePackage(d, patch));
  const problem = validatePackageName(draft.name, list, pkg.id);
  const snap = useMemo(() => previewSnapshot(baseSnapshot, draft, { teams }), [baseSnapshot, draft, teams]);
  const c = draft.colors;
  const ov = draft.overrides[element] || null;
  return (
    <Modal title={`Grafik paketini düzenle · ${pkg.name}`} onClose={onClose} width={1040} className="st-modal gpk-modal"
      footer={(
        <>
          {problem && <span className="gpk-warn"><Icon name="alert" size={13} /> {problem}</span>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn" disabled={Boolean(problem)} onClick={() => onSave(draft, { apply: false })}>Kaydet</button>
          <button type="button" className="btn btn--primary" disabled={Boolean(problem)} onClick={() => onSave(draft, { apply: true })}><Icon name="check" size={13} /> Kaydet ve uygula</button>
        </>
      )}>
      <div className="gpk-edit">
        <div className="gpk-edit__form">
          <fieldset className="gpk-box">
            <legend>Ad</legend>
            <label className="gpk-field"><span>Paket adı</span><input value={draft.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="gpk-field"><span>Açıklama</span><input value={draft.desc} maxLength={160} onChange={(e) => set({ desc: e.target.value })} /></label>
          </fieldset>
          <fieldset className="gpk-box">
            <legend>Palet {draft.auto === "teams" && <em className="gpk-tag">takım renklerinden</em>}</legend>
            {draft.auto === "teams"
              ? <p className="gpk-muted">Zemin, aksan ve takım renkleri uygulama anında iki takımın armasından üretilir. Elle renk vermek için “Takım renklerinden üretme”yi kapat.</p>
              : null}
            <div className="gpk-grid">
              <Color label="Zemin" value={c.base} onChange={(v) => set({ colors: { base: v } })} />
              <Color label="Aksan" value={c.accent} onChange={(v) => set({ colors: { accent: v } })} />
              <Color label="Yazı" value={c.text} onChange={(v) => set({ colors: { text: v } })} />
              <Color label="Ev sahibi" value={c.home} allowEmpty onChange={(v) => set({ colors: { home: v } })} />
              <Color label="Deplasman" value={c.away} allowEmpty onChange={(v) => set({ colors: { away: v } })} />
            </div>
            <label className="gpk-check"><input type="checkbox" checked={c.light} onChange={(e) => set({ colors: { light: e.target.checked, text: e.target.checked ? "#111827" : "#ffffff" } })} /> Açık (beyaz) görünüm <small>skorbord ve ekranlar beyaz zeminli</small></label>
            {draft.auto === "teams" && <label className="gpk-check"><input type="checkbox" checked onChange={() => set({ auto: null })} /> Takım renklerinden üret</label>}
          </fieldset>
          <fieldset className="gpk-box">
            <legend>Yazı ve biçim</legend>
            <div className="gpk-grid">
              <Select label="Yazı tipi" value={draft.font} onChange={(v) => set({ font: v })} options={FONT_OPTS} />
              <label className="gpk-field"><span>Yazı boyutu · %{draft.fontScale}</span><input type="range" min={80} max={130} value={draft.fontScale} onChange={(e) => set({ fontScale: Number(e.target.value) })} /></label>
              <label className="gpk-field"><span>Köşe yuvarlaklığı · ×{draft.radius.toFixed(2)}</span><input type="range" min={0} max={2} step={0.05} value={draft.radius} onChange={(e) => set({ radius: Number(e.target.value) })} /></label>
              <Select label="Logo" value={draft.logoPosition} onChange={(v) => set({ logoPosition: v })} options={[{ key: "medal", label: "Ortada (madalya)" }, { key: "left", label: "Solda" }, { key: "off", label: "Gizli" }]} />
            </div>
          </fieldset>
          <fieldset className="gpk-box">
            <legend>Öğeler</legend>
            <div className="gpk-grid">
              <Select label="Skorbord" value={draft.scorebug.variant} onChange={(v) => set({ scorebug: { variant: v } })} options={SCOREBUG_STYLES} />
              <Select label="Röportaj bandı" value={draft.interview.style} onChange={(v) => set({ interview: { style: v } })} options={INTERVIEW_STYLES} />
              <Select label="Sponsor şeridi" value={draft.sponsor.tone} onChange={(v) => set({ sponsor: { tone: v } })} options={SPONSOR_TONES} />
              <Select label="Geçiş / stinger" value={draft.transition.kind} onChange={(v) => set({ transition: { kind: v } })} options={TR_OPTS} />
              <Select label="VAR teması" value={draft.var.theme} onChange={(v) => set({ var: { theme: v } })} options={VAR_OPTS} />
              <Select label="YouTube kapağı" value={draft.cover.template} onChange={(v) => set({ cover: { template: v } })} options={COVER_OPTS} />
              <Select label="Kapak rengi" value={draft.cover.accentMode} onChange={(v) => set({ cover: { accentMode: v } })} options={[{ key: "team", label: "Takım renkleri" }, { key: "brand", label: "Marka teması" }, { key: "custom", label: "Özel renk" }]} />
              {draft.cover.accentMode === "custom" && <Color label="Kapak özel rengi" value={draft.cover.color || c.accent} onChange={(v) => set({ cover: { color: v } })} />}
            </div>
            <div className="gpk-grid">
              <Color label="Stinger · koyu" value={draft.transition.primary} allowEmpty onChange={(v) => set({ transition: { primary: v } })} />
              <Color label="Stinger · orta" value={draft.transition.secondary} allowEmpty onChange={(v) => set({ transition: { secondary: v } })} />
              <Color label="Stinger · parlak" value={draft.transition.accent} allowEmpty onChange={(v) => set({ transition: { accent: v } })} />
              <Color label="LED · zemin" value={draft.led.base} allowEmpty onChange={(v) => set({ led: { base: v } })} />
              <Color label="LED · aksan" value={draft.led.accent} allowEmpty onChange={(v) => set({ led: { accent: v } })} />
            </div>
          </fieldset>
          <fieldset className="gpk-box">
            <legend>Öğe başına renk</legend>
            <div className="st-seg st-seg--wrap gpk-seg">
              {PACKAGE_ELEMENTS.map((e) => <button key={e.key} type="button" className={element === e.key ? "is-on" : ""} onClick={() => setElement(e.key)}>{e.label.split(" · ")[0]}{draft.overrides[e.key] ? " •" : ""}</button>)}
            </div>
            <label className="gpk-check"><input type="checkbox" checked={Boolean(ov)} onChange={(e) => set({ overrides: { [element]: e.target.checked ? { base: c.base, accent: c.accent, text: c.text, light: c.light } : null } })} /> {PACKAGE_ELEMENTS.find((e) => e.key === element)?.label}: ayrı renk kullan</label>
            {ov && (
              <div className="gpk-grid">
                <Color label="Zemin" value={ov.base || c.base} onChange={(v) => set({ overrides: { [element]: { base: v } } })} />
                <Color label="Aksan" value={ov.accent || c.accent} onChange={(v) => set({ overrides: { [element]: { accent: v } } })} />
                <Color label="Yazı" value={ov.text || c.text} onChange={(v) => set({ overrides: { [element]: { text: v } } })} />
                <label className="gpk-check"><input type="checkbox" checked={ov.light === null ? c.light : ov.light} onChange={(e) => set({ overrides: { [element]: { light: e.target.checked, text: e.target.checked ? "#111827" : "#ffffff" } } })} /> Açık zemin</label>
              </div>
            )}
          </fieldset>
        </div>
        <div className="gpk-edit__side">
          <PackageThumbs snapshot={snap} width={380} live />
          <ul className="gpk-sum">{packageSummary(draft).map((r) => <li key={r.key}><span>{r.label}</span><b>{r.value}</b></li>)}</ul>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ bölüm ------------------------------ */

export default function PackagesSection({ pk, g, live, toast }) {
  const confirm = useConfirm();
  const ask = (opts) => (confirm ? confirm(opts) : Promise.resolve(window.confirm(opts.message)));
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  if (!pk) return <p className="st-hint">Grafik paketleri yüklenemedi.</p>;
  const { store, setStore, list, activeId, pending } = pk;
  const base = g?.baseSnapshot || null;
  const teams = teamColorsFor(g, live);
  const shown = list.filter((p) => (filter === "custom" ? !p.builtin : filter === "builtin" ? p.builtin : true));
  const leagueName = pk.league?.label || null;

  const duplicate = (p, edit = true) => {
    if (store.custom.length >= MAX_CUSTOM_PACKAGES) { toast?.(`En çok ${MAX_CUSTOM_PACKAGES} özel paket saklanır.`, { tone: "warn" }); return; }
    const copy = duplicatePackage(materializePackage(p, { teams }), list);
    // Takım paketinin kopyası o anki takım renklerini taşır (elle düzenlenebilir).
    setStore((s) => upsertPackage(s, copy));
    if (edit) setEditing(copy);
    toast?.(`“${copy.name}” oluşturuldu.`, { tone: "success", timeout: 2000 });
  };
  const remove = async (p) => {
    if (!(await ask({ title: "Paket silinsin mi?", message: `“${p.name}” bu bilgisayardan silinir. Bu paketi kullanan maçlar varsayılan görünüme döner; lig varsayılanı olarak seçildiyse o da kaldırılır.`, confirmLabel: "Sil", danger: true }))) return;
    setStore((s) => removePackage(s, p.id));
  };
  const exportOne = async (p) => { const r = await downloadJson(`grafik-paketi-${fileSafe(p.name)}.json`, exportPackagesJson([p])); if (r.ok) toast?.("Paket dosyaya aktarıldı.", { tone: "success" }); };
  const exportAll = async () => { const r = await downloadJson("grafik-paketleri.json", exportPackagesJson(store.custom.length ? store.custom : list)); if (r.ok) toast?.(store.custom.length ? "Özel paketler dosyaya aktarıldı." : "Hazır paketler dosyaya aktarıldı.", { tone: "success" }); };
  const importText = (text) => {
    const r = parsePackagesImport(text, list);
    if (!r.ok) { toast?.(r.error, { tone: "error", timeout: 5000 }); return; }
    setStore((s) => r.packages.reduce((acc, p) => upsertPackage(acc, p), s));
    toast?.(`${r.packages.length} paket içe aktarıldı${r.skipped ? ` (${r.skipped} geçersiz atlandı)` : ""}.`, { tone: "success" });
  };
  const save = (draft, { apply }) => {
    setStore((s) => upsertPackage(s, draft));
    setEditing(null);
    if (apply || draft.id === activeId) pk.apply(draft.id, { mode: apply ? null : "fade", quiet: !apply });
    toast?.(`“${draft.name}” kaydedildi.`, { tone: "success", timeout: 2000 });
  };

  return (
    <div className="gpk">
      <section className="gpk-bar">
        <div className="gpk-bar__now">
          <small>Etkin paket{g?.matchId ? ` · maç #${g.matchId}` : ""}</small>
          <strong>{pk.active ? pk.active.name : "Yok (marka ayarları)"}</strong>
          {pending && <span className="pill pill--xs pill--amber" title="Bir sonraki GEÇİŞ'te uygulanır">Sırada: {list.find((p) => p.id === pending.id)?.name || "paket"} <button type="button" className="gpk-x" onClick={pk.cancelPending} title="Vazgeç"><Icon name="x" size={10} /></button></span>}
        </div>
        <div className="gpk-bar__opts">
          <span className="gpk-lbl">Uygulama</span>
          <div className="st-seg st-seg--xs">
            {APPLY_MODES.map((m) => <button key={m.key} type="button" className={store.applyMode === m.key ? "is-on" : ""} title={m.hint} onClick={() => setStore((s) => ({ ...s, applyMode: m.key }))}>{m.label}</button>)}
          </div>
          <label className="gpk-check" title="Renk ve yazı tipini maçın marka kaydına da yazar (OBS / web kaplamaları, LED sayfası)"><input type="checkbox" checked={store.writeWeb !== false} onChange={(e) => setStore((s) => ({ ...s, writeWeb: e.target.checked }))} /> Web kaplamalarına da yaz</label>
        </div>
        <div className="gpk-bar__league">
          <span className="gpk-lbl">Lig varsayılanı</span>
          {pk.league ? (
            <select value={pk.leagueDefault || ""} onChange={(e) => { pk.setLeagueDefault(e.target.value || null); toast?.(e.target.value ? `${leagueName} maçları açılınca “${list.find((p) => p.id === e.target.value)?.name}” uygulanır.` : `${leagueName} için varsayılan paket kaldırıldı.`, { tone: "success", timeout: 2600 }); }} aria-label={`${leagueName} varsayılan paketi`}>
              <option value="">{leagueName}: yok</option>
              {list.map((p) => <option key={p.id} value={p.id}>{leagueName}: {p.name}</option>)}
            </select>
          ) : <span className="gpk-muted">Lig bilgisi olan bir maç seç.</span>}
          {Object.entries(store.leagueDefaults).filter(([k]) => k !== pk.league?.key).slice(0, 4).map(([k, v]) => (
            <span key={k} className="gpk-chip" title="Bu ligin maçı açılınca uygulanır">{v.label || k}: {list.find((p) => p.id === v.id)?.name || "?"}
              <button type="button" className="gpk-x" onClick={() => setStore((s) => withLeagueDefault(s, { key: k }, null))} title="Kaldır"><Icon name="x" size={10} /></button>
            </span>
          ))}
        </div>
        <div className="gpk-bar__io">
          <div className="st-seg st-seg--xs">
            {[["all", "Tümü"], ["builtin", "Hazır"], ["custom", `Benim (${store.custom.length})`]].map(([k, l]) => <button key={k} type="button" className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <button type="button" className="btn btn--xs" onClick={() => fileRef.current?.click()}><Icon name="upload" size={12} /> İçe aktar</button>
          <button type="button" className="btn btn--xs" onClick={exportAll}><Icon name="download" size={12} /> Dışa aktar</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importText(await f.text()); }} />
        </div>
      </section>

      <div className="gpk-gallery">
        {shown.map((p) => {
          const on = p.id === activeId;
          const isPending = pending?.id === p.id;
          return (
            <article key={p.id} className={`gpk-card ${on ? "is-on" : ""}`} data-pkg={p.id}>
              <PackageCardThumbs base={base} pkg={p} teams={teams} />
              <header className="gpk-card__head">
                <PackageSwatches pkg={p} />
                <span className="gpk-card__name"><strong>{p.name}</strong><small>{p.desc || (p.builtin ? "Hazır paket" : "Özel paket")}</small></span>
                {on && <span className="pill pill--xs pill--red">Yayında</span>}
                {!on && isPending && <span className="pill pill--xs pill--amber">Sırada</span>}
                {pk.leagueDefault === p.id && <span className="pill pill--xs" title={`${leagueName} varsayılanı`}>Lig</span>}
              </header>
              <ul className="gpk-card__sum">{packageSummary(p).slice(2, 7).map((r) => <li key={r.key} title={r.label}>{r.value}</li>)}</ul>
              <footer className="gpk-card__act">
                <button type="button" className="btn btn--xs btn--primary" onClick={() => pk.apply(p.id)} title={store.applyMode === "next" ? "Sonraki geçişte uygular" : "Hemen uygular (yumuşak geçiş)"}><Icon name="check" size={12} /> {on ? "Yeniden uygula" : "Uygula"}</button>
                {store.applyMode !== "next"
                  ? <button type="button" className="btn btn--xs" onClick={() => pk.apply(p.id, { mode: "next" })} title="Bir sonraki GEÇİŞ'te uygula">Geçişte</button>
                  : <button type="button" className="btn btn--xs" onClick={() => pk.apply(p.id, { mode: "fade" })} title="Şimdi uygula (yumuşak geçiş)">Şimdi</button>}
                <span className="gpk-sp" />
                {!p.builtin && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setEditing(p)} title="Düzenle"><Icon name="pencil" size={12} /></button>}
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => duplicate(p)} title="Çoğalt ve düzenle"><Icon name="copy" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => exportOne(p)} title="Dosyaya aktar (.json)"><Icon name="download" size={12} /></button>
                {!p.builtin && <button type="button" className="icon-btn icon-btn--xs" onClick={() => remove(p)} title="Sil"><Icon name="trash" size={12} /></button>}
              </footer>
            </article>
          );
        })}
        {!shown.length && <p className="gpk-muted">Henüz özel paket yok: hazır bir paketi “Çoğalt” ile kopyalayıp düzenle ya da dosyadan içe aktar.</p>}
      </div>
      <p className="gpk-muted gpk-foot">Önizlemeler yayındaki çizimin aynısıdır ({base?.match?.id ? "seçili maçın verisiyle" : "örnek maçla"}). Paket; skorbord, alt bant, röportaj bandı, ekranlar, logo geçişi, VAR teması, YouTube kapağı ve LED ekranı birlikte değiştirir. Paketler bu bilgisayarda saklanır ve ayar şablonlarına (“Grafik paketleri”) girer.</p>
      {editing && <PackageEditor pkg={editing} list={list} baseSnapshot={base} teams={teams} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PackageCardThumbs({ base, pkg, teams }) {
  const snap = useMemo(() => previewSnapshot(base, pkg, { teams }), [base, pkg, teams?.home, teams?.away]); // eslint-disable-line react-hooks/exhaustive-deps
  return <PackageThumbs snapshot={snap} width={300} />;
}
