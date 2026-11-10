// Ortak "Yazdır / Dışa aktar" stüdyosu (web + masaüstü).
// BU DOSYA elitlig-mac (renderer/src/lib/export) ve elitlig-client (src/features/export)
// depolarında AYNIDIR. Platforma özgü kaydetme / indirme / yazdırma ./platform.js'tedir.
//
// Doğrudan kullanmak yerine her deponun ExportButton bileşenini kullanın:
//
//   <ExportButton id="todos" title="Yapılacaklar"
//     report={({ scope }) => todosReport(scope === "all" ? allItems : shownItems)}
//     scopes={[{ value: "view", label: "Şu anki görünüm" }, { value: "all", label: "Tümü" }]} />
//
// id: son seçimlerin hatırlanacağı anahtar. report: rapor modeli ya da onu döndüren
// (async olabilir) işlev — model biçimi exportCore.js başında. scopes: isteğe bağlı kapsam
// seçenekleri; işlev { scope } ile çağrılır. formats: gösterilecek biçimler.
// defaultDesign: sayfaya özgü varsayılan görünüm / tasarım (exportTheme.js).
//
// Pencere: solda seçenekler (İçerik · Görünüm · Tasarım · Sayfa sekmeleri), sağda canlı,
// sayfalı önizleme. Sütunlar açılıp kapatılır ve sürükleyerek / oklarla sıralanır; 6 görünüm,
// 7 tema (Siyah-Beyaz ve Mürekkep tasarrufu dahil), yazı boyu, sıklık, zebra, vurgu rengi,
// kâğıt boyu, yön, kenar boşluğu; başlık / logo / süzgeç / özet / toplam / sayfa no / tarih /
// imza / alt not açılıp kapatılır. Seçimler kimliğe göre hatırlanır; hazır ayarlar kaydedilir.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ACCENTS, BUILTIN_PRESETS, DEFAULT_DESIGN, DENSITIES, FONT_SIZES, LAYOUTS, MARGINS, PAGE_SIZES, SHOW_KEYS, THEMES,
  applyPreset, defaultFileName, designPrepOptions, formatInfo, groupableColumns, hasDateFilter, loadPrefs, loadPresets,
  normalizeDesign, prepareReport, presetFromDesign, renderReport, savePrefs, savePresets, sectionId, suggestGroupColumn, themeInfo, themeTokens,
} from "./index";
import { reportHtmlParts } from "./exportHtml";
import { paginate } from "./exportPaginate";
import { deliverExport, getLogo, printExport } from "./platform";
import "./exportDialog.css";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Hazır tarih aralıkları. */
export function rangePreset(key, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "thisMonth": return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case "lastMonth": return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "next30": return { from: ymd(now), to: ymd(new Date(y, m, now.getDate() + 30)) };
    case "thisYear": return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return { from: "", to: "" };
  }
}
const PRESETS = [{ key: "all", label: "Tümü" }, { key: "thisMonth", label: "Bu ay" }, { key: "lastMonth", label: "Geçen ay" }, { key: "next30", label: "Önümüzdeki 30 gün" }, { key: "thisYear", label: "Bu yıl" }, { key: "custom", label: "Özel" }];
const ORIENTATIONS = [{ value: "auto", label: "Otomatik" }, { value: "portrait", label: "Dikey" }, { value: "landscape", label: "Yatay" }];
const TABS = [{ key: "content", label: "İçerik" }, { key: "layout", label: "Görünüm" }, { key: "design", label: "Tasarım" }, { key: "page", label: "Sayfa" }];
const PAGED = new Set(["pdf", "docx"]);

const resolveReport = async (report, scope) => (typeof report === "function" ? report({ scope }) : report);
const moveItem = (list, from, to) => { const a = [...list]; const [x] = a.splice(from, 1); a.splice(Math.max(0, Math.min(a.length, to)), 0, x); return a; };

/** Pencere durumu + aktarma işlemi (UI'dan bağımsız; testlerde de kullanılır). */
export function useExportState({ id, report, scopes, formats, initialFormat, defaultDesign }) {
  const prefs = useMemo(() => (id ? loadPrefs(id) : null) || {}, [id]);
  const baseDesign = useMemo(() => normalizeDesign({ ...DEFAULT_DESIGN, ...(defaultDesign || {}), show: { ...DEFAULT_DESIGN.show, ...(defaultDesign?.show || {}) } }), [defaultDesign]);
  const allowed = useMemo(() => (formats?.length ? formats : ["pdf", "xlsx", "docx", "csv", "md"]).map(formatInfo), [formats]);
  const [format, setFormat] = useState(() => (allowed.some((f) => f.key === initialFormat) ? initialFormat : allowed.some((f) => f.key === prefs.format) ? prefs.format : allowed[0].key));
  const [scope, setScope] = useState(() => (scopes?.some((s) => s.value === prefs.scope) ? prefs.scope : scopes?.[0]?.value || "view"));
  const [model, setModel] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [columns, setColumns] = useState(prefs.columns || {});
  const [order, setOrder] = useState(prefs.order || {});
  const [groupBy, setGroupBy] = useState(prefs.groupBy || {});
  const [sections, setSections] = useState(prefs.sections || null);
  const [preset, setPreset] = useState(prefs.preset || "all");
  const [range, setRange] = useState(() => (prefs.preset === "custom" ? { from: prefs.from || "", to: prefs.to || "" } : rangePreset(prefs.preset || "all")));
  const [includeSummary, setIncludeSummary] = useState(prefs.includeSummary !== false);
  const [query, setQuery] = useState("");
  // Eski kayıtlarda yön ayrı tutuluyordu; tasarıma taşınır.
  const [design, setDesignState] = useState(() => normalizeDesign({ ...baseDesign, ...(prefs.design || {}), orientation: prefs.design?.orientation || prefs.orientation || baseDesign.orientation, show: { ...baseDesign.show, ...(prefs.design?.show || {}) }, title: "", subtitle: "" }));
  const [fileName, setFileNameState] = useState("");
  const fileTouched = useRef(false);
  const setFileName = (v) => { fileTouched.current = true; setFileNameState(v); };
  const [busy, setBusy] = useState(false);
  const setDesign = useCallback((patch) => setDesignState((d) => normalizeDesign({ ...d, ...(typeof patch === "function" ? patch(d) : patch) })), []);
  const setShow = useCallback((key, on) => setDesignState((d) => normalizeDesign({ ...d, show: { ...d.show, [key]: on } })), []);
  const orientation = design.orientation;

  useEffect(() => {
    let alive = true;
    setModel(null);
    setLoadError(null);
    Promise.resolve().then(() => resolveReport(report, scope)).then((m) => {
      if (!alive) return;
      setModel(m);
      // Kapsam değişince başlık da değişir; kullanıcı adı elle yazmadıysa önerilen ad güncellenir.
      if (!fileTouched.current) setFileNameState(defaultFileName(m?.title));
    }).catch((e) => { if (alive) setLoadError(e?.message || "Veriler hazırlanamadı."); });
    return () => { alive = false; };
    // report işlevi her çizimde yenilenebilir; yalnız kapsam değişince yeniden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const tables = useMemo(() => (model?.sections || []).map((s, i) => ({ s, id: sectionId(s, i) })), [model]);
  /** Bölümün tüm sütun anahtarları, kullanıcı sırasıyla. */
  const orderOf = useCallback((s, sid) => {
    const keys = (s.columns || []).map((c) => c.key);
    const saved = (order[sid] || []).filter((k) => keys.includes(k));
    return [...saved, ...keys.filter((k) => !saved.includes(k))];
  }, [order]);
  /** Seçili sütunlar (kayıtlı tercih, rapordaki sütunlara göre süzülür), sıralı. */
  const columnsOf = useCallback((s, sid) => {
    const keys = (s.columns || []).map((c) => c.key);
    const saved = columns[sid]?.filter((k) => keys.includes(k));
    const on = saved?.length ? saved : (s.columns || []).filter((c) => !c.hidden).map((c) => c.key);
    return orderOf(s, sid).filter((k) => on.includes(k));
  }, [columns, orderOf]);
  const sectionOn = (sid) => !sections || sections.includes(sid) || !tables.some((t) => sections.includes(t.id));
  const toggleColumn = (s, sid, key, on) => {
    const chosen = columnsOf(s, sid);
    const next = on ? [...chosen, key] : chosen.filter((k) => k !== key);
    if (!next.length) return;
    setColumns((all) => ({ ...all, [sid]: orderOf(s, sid).filter((k) => next.includes(k)) }));
  };
  const moveColumn = (s, sid, key, to) => {
    const ord = orderOf(s, sid);
    const from = ord.indexOf(key);
    if (from < 0 || to < 0 || to >= ord.length || from === to) return;
    const next = moveItem(ord, from, to);
    const chosen = columnsOf(s, sid);
    setOrder((all) => ({ ...all, [sid]: next }));
    setColumns((all) => ({ ...all, [sid]: next.filter((k) => chosen.includes(k)) }));
  };

  const options = useMemo(() => {
    if (!model) return null;
    const cols = {};
    const groups = {};
    tables.forEach(({ s, id: sid }) => {
      if ((s.kind || "table") !== "table") return;
      cols[sid] = columnsOf(s, sid);
      const g = groupBy[sid] ?? s.groupBy ?? "";
      groups[sid] = g && (s.columns || []).some((c) => c.key === g) ? g : "";
    });
    const picked = tables.filter((t) => sectionOn(t.id)).map((t) => t.id);
    const scopeLabel = scopes && scopes.length > 1 ? scopes.find((x) => x.value === scope)?.label : "";
    return {
      columns: cols, groupBy: groups, sections: picked.length ? picked : undefined,
      from: hasDateFilter(model) ? range.from : "", to: hasDateFilter(model) ? range.to : "",
      includeSummary: includeSummary && design.show.summary, orientation, query, scopeLabel: scopeLabel && scope !== "view" ? scopeLabel : "",
      design,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, tables, columns, order, groupBy, sections, range, includeSummary, orientation, scope, scopes, query, design]);

  const prepared = useMemo(() => {
    if (!model || !options) return null;
    try { return prepareReport(model, designPrepOptions(options)); } catch { return null; }
  }, [model, options]);
  const preview = useMemo(() => (prepared
    ? { rows: prepared.sections.reduce((n, s) => n + (s.rowCount || 0), 0), tables: prepared.sections.filter((s) => s.kind === "table").length, sections: prepared.sections.length, orientation: prepared.orientation }
    : null), [prepared]);

  const prefsNow = useCallback(() => ({ format, scope, columns, order, groupBy, sections, preset, from: range.from, to: range.to, includeSummary, orientation, design: { ...design, title: "", subtitle: "" } }), [format, scope, columns, order, groupBy, sections, preset, range, includeSummary, orientation, design]);
  // Seçimler değiştikçe hatırlanır (pencere kapansa da).
  const loaded = useRef(false);
  useEffect(() => {
    if (!model || !id) return;
    if (!loaded.current) { loaded.current = true; return; }
    savePrefs(id, prefsNow());
  }, [model, id, prefsNow]);

  const outOpts = useCallback(async (fmt) => {
    const logo = fmt === "pdf" || fmt === "docx" ? await getLogo().catch(() => ({})) : {};
    return { ...options, ...logo, fileName };
  }, [options, fileName]);

  const run = useCallback(async (fmtArg) => {
    const fmt = typeof fmtArg === "string" ? fmtArg : format;
    if (!model || !options) return { ok: false };
    setBusy(true);
    try {
      const out = renderReport(model, fmt, await outOpts(fmt));
      const res = await deliverExport(out);
      if (id) savePrefs(id, { ...prefsNow(), format: fmt });
      return { ...(res || { ok: false }), fileName: out.fileName, format: fmt };
    } catch (e) {
      return { ok: false, error: { message: e?.message || "Dışa aktarılamadı." } };
    } finally { setBusy(false); }
  }, [model, options, format, id, prefsNow, outOpts]);

  const print = useCallback(async () => {
    if (!model || !options) return { ok: false };
    setBusy(true);
    try {
      const out = renderReport(model, "pdf", await outOpts("pdf"));
      const res = await printExport(out);
      if (id) savePrefs(id, prefsNow());
      return { ...(res && typeof res === "object" ? res : { ok: true }), printed: true, format: "print" };
    } catch (e) {
      return { ok: false, error: { message: e?.message || "Yazdırılamadı." } };
    } finally { setBusy(false); }
  }, [model, options, id, prefsNow, outOpts]);

  /** Varsayılana dön: sütunlar, sıra, gruplama, bölümler, aralık, tasarım ve kayıtlı tercih sıfırlanır. */
  const reset = useCallback(() => {
    setColumns({}); setOrder({}); setGroupBy({}); setSections(null); setPreset("all"); setRange(rangePreset("all"));
    setIncludeSummary(true); setQuery(""); setDesignState(baseDesign);
    if (id) savePrefs(id, null);
    loaded.current = false;
  }, [baseDesign, id]);

  return {
    allowed, format, setFormat, scope, setScope, model, loadError, tables, columnsOf, orderOf, sectionOn, toggleColumn, moveColumn,
    setColumns, setOrder, groupBy, setGroupBy, sections, setSections, preset, range, includeSummary, setIncludeSummary,
    orientation, setOrientation: (v) => setDesign({ orientation: v }), fileName, setFileName, busy, preview, prepared, options, run, print, reset,
    query, setQuery, design, setDesign, setShow,
    choosePreset: (key) => { setPreset(key); if (key !== "custom") setRange(rangePreset(key)); },
    setRange: (next) => { setPreset("custom"); setRange(next); },
  };
}

function Check({ checked, onChange, children, disabled }) {
  return (
    <label className={`xp-chip ${checked ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Tek seçimli düğme grubu. */
function Seg({ label, value, options, onChange }) {
  return (
    <div className="xp-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={value === o.key ? "is-on" : ""} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Görünüm küçük resmi (CSS çizimi). */
function LayoutIcon({ k }) {
  const bars = (n, cls = "") => Array.from({ length: n }, (_, i) => <i key={i} className={cls} />);
  switch (k) {
    case "compact": return <span className="xp-li xp-li--compact">{bars(9)}</span>;
    case "cards": return <span className="xp-li xp-li--cards">{bars(4)}</span>;
    case "list": return <span className="xp-li xp-li--list">{bars(5)}</span>;
    case "detail": return <span className="xp-li xp-li--detail">{bars(2)}</span>;
    case "grouped": return <span className="xp-li xp-li--grouped"><b />{bars(2)}<b />{bars(2)}</span>;
    default: return <span className="xp-li xp-li--table"><b />{bars(5)}</span>;
  }
}

/** Tema küçük resmi: başlık şeridi, tablo başlığı ve satır renkleri temanın kendisinden. */
function ThemeSwatch({ design, theme }) {
  const k = themeTokens({ ...design, theme });
  const fill = (v, fb) => (v && v !== "none" ? v : fb);
  return (
    <span className="xp-ts" style={{ fontFamily: k.font }} aria-hidden="true">
      <span className="xp-ts-strip" style={{ background: fill(k.stripBg, "transparent"), color: k.stripInk, borderLeft: k.stripBorder !== "none" ? k.stripBorder : undefined, borderBottom: k.key === "bw" || k.key === "classic" ? `2px ${k.key === "classic" ? "double" : "solid"} ${k.ink}` : undefined, textAlign: k.stripAlign }}>Aa</span>
      <span className="xp-ts-head" style={{ background: fill(k.headBg, "transparent"), borderBottom: k.headBorder }} />
      <span className="xp-ts-row" style={{ borderBottom: k.cellBorder }} />
      <span className="xp-ts-row" style={{ borderBottom: k.cellBorder, background: fill(k.zebraBg, "transparent") }} />
      <span className="xp-ts-row" style={{ borderTop: k.totBorder }} />
    </span>
  );
}

/** Canlı, sayfalı önizleme (gölge kök: uygulama stilleri karışmaz). */
function Preview({ prepared, design, logo, onPages }) {
  const host = useRef(null);
  const outer = useRef(null);
  const [zoom, setZoom] = useState("fit");
  const [info, setInfo] = useState(null);
  const parts = useMemo(() => (prepared ? reportHtmlParts(prepared, { design, logo }) : null), [prepared, design, logo]);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !parts) return undefined;
    const t = setTimeout(() => {
      try {
        const root = el.shadowRoot || el.attachShadow({ mode: "open" });
        const r = paginate(root, parts, prepared.orientation);
        setInfo(r);
        onPages?.(r);
      } catch { setInfo(null); onPages?.(null); }
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);
  useLayoutEffect(() => {
    const fit = () => {
      const w = outer.current?.clientWidth || 0;
      if (!info?.width || !w) return;
      setScale(zoom === "fit" ? Math.min(1, (w - 36) / info.width) : Number(zoom));
    };
    fit();
    if (typeof ResizeObserver === "undefined" || !outer.current) return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(outer.current);
    return () => ro.disconnect();
  }, [info, zoom]);
  useEffect(() => { if (info?.wrap) info.wrap.style.zoom = String(scale); }, [info, scale]);
  return (
    <div className="xp-preview">
      <div className="xp-pv-bar">
        <span className="xp-pv-count" aria-live="polite" data-pages={info?.pages || 0}>{info ? `${info.truncated ? `${info.pages}+` : info.pages} sayfa` : "Önizleme hazırlanıyor…"}</span>
        <span className="xp-pv-meta">{prepared ? `${themeInfo(design.theme).label} · ${LAYOUTS.find((l) => l.key === design.layout)?.label} · ${design.pageSize} ${prepared.orientation === "landscape" ? "yatay" : "dikey"}` : ""}</span>
        <select aria-label="Önizleme ölçeği" value={zoom} onChange={(e) => setZoom(e.target.value)}>
          <option value="fit">Sığdır</option><option value="0.5">%50</option><option value="0.75">%75</option><option value="1">%100</option>
        </select>
      </div>
      <div className="xp-pv-scroll" ref={outer}>
        <div ref={host} className="xp-pv-host" data-testid="export-preview" />
      </div>
    </div>
  );
}

/**
 * Pencere. props: id, title, report, scopes, formats, initialFormat, defaultDesign,
 * onClose(), onDone(result) — result: { ok, path?, fileName, format, printed? }.
 */
export default function ExportDialog({ id, title, report, scopes, formats, initialFormat, defaultDesign, onClose, onDone }) {
  const st = useExportState({ id, report, scopes, formats, initialFormat, defaultDesign });
  const ref = useRef(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("content");
  const [logo, setLogo] = useState(null);
  const [pages, setPages] = useState(null);
  const [presets, setPresets] = useState(() => loadPresets());
  const [presetName, setPresetName] = useState("");
  const [dragKey, setDragKey] = useState(null);
  const titleId = `xp-title-${id || "rapor"}`;

  useEffect(() => { let alive = true; getLogo().then((l) => { if (alive) setLogo(l?.logo || null); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector(".xp-formats button.is-on, button")?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); try { prev?.focus?.({ preventScroll: true }); } catch { /* yoksay */ } };
  }, [onClose]);

  const finish = (res) => {
    if (res.ok || res.printed) { onDone?.(res); onClose?.(); } else if (res.error) setError(res.error.message);
  };
  const submit = async (e) => { e?.preventDefault(); setError(null); finish(await st.run()); };
  const doPrint = async () => { setError(null); finish(await st.print()); };

  const m = st.model;
  const d = st.design;
  const dateOn = m && hasDateFilter(m);
  const tableList = st.tables.filter((t) => (t.s.kind || "table") === "table");
  const showSections = st.tables.length > 1;
  const fmt = formatInfo(st.format);
  const paged = PAGED.has(st.format) || st.format === "xlsx";
  const bwTheme = themeInfo(d.theme).bw;
  const tabular = !PAGED.has(st.format);

  const groupSelect = ({ s, id: sid }, label) => {
    const groupable = groupableColumns(s);
    if (!groupable.length) return null;
    const gv = st.groupBy[sid] ?? s.groupBy ?? "";
    const auto = d.layout === "grouped" && !gv ? suggestGroupColumn({ columns: (s.columns || []).filter((c) => st.columnsOf(s, sid).includes(c.key)), rows: s.rows })?.label : "";
    return (
      <label className="xp-inline">{label}
        <select value={gv} onChange={(e) => st.setGroupBy((all) => ({ ...all, [sid]: e.target.value }))} aria-label={`${s.title || "Tablo"} gruplama`}>
          <option value="">{auto ? `Otomatik (${auto})` : "Yok"}</option>
          {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
    );
  };

  const contentTab = m && (
    <>
      {scopes?.length > 1 && (
        <fieldset className="xp-group">
          <legend>Ne aktarılsın?</legend>
          <div className="xp-row xp-wrap">
            {scopes.map((s) => (
              <label key={s.value} className={`xp-radio ${st.scope === s.value ? "is-on" : ""} ${s.disabled ? "is-disabled" : ""}`}>
                <input type="radio" name="xp-scope" value={s.value} checked={st.scope === s.value} disabled={s.disabled} onChange={() => st.setScope(s.value)} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {dateOn && (
        <fieldset className="xp-group">
          <legend>Tarih aralığı</legend>
          <div className="xp-row xp-wrap">
            <select aria-label="Hazır aralık" value={st.preset} onChange={(e) => st.choosePreset(e.target.value)}>
              {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <input type="date" aria-label="Başlangıç" value={st.range.from} onChange={(e) => st.setRange({ ...st.range, from: e.target.value })} />
            <span className="xp-dash">–</span>
            <input type="date" aria-label="Bitiş" value={st.range.to} onChange={(e) => st.setRange({ ...st.range, to: e.target.value })} />
          </div>
        </fieldset>
      )}

      {tableList.length > 0 && (
        <label className="xp-search">
          <span>Satırları süz</span>
          <input type="search" value={st.query} placeholder="Yalnız bu metni içeren satırlar…" onChange={(e) => st.setQuery(e.target.value)} aria-label="Satırları süz" />
        </label>
      )}

      {showSections && (
        <fieldset className="xp-group">
          <legend>Bölümler</legend>
          <div className="xp-row xp-wrap">
            {st.tables.map(({ s, id: sid }) => (
              <Check key={sid} checked={st.sectionOn(sid)} onChange={(on) => {
                const cur = st.tables.filter((t) => st.sectionOn(t.id)).map((t) => t.id);
                const next = on ? [...new Set([...cur, sid])] : cur.filter((x) => x !== sid);
                if (next.length) st.setSections(st.tables.map((t) => t.id).filter((x) => next.includes(x)));
              }}>{s.title || "Bölüm"}</Check>
            ))}
          </div>
        </fieldset>
      )}

      {tableList.filter((t) => st.sectionOn(t.id)).map((t) => {
        const { s, id: sid } = t;
        const chosen = st.columnsOf(s, sid);
        const ord = st.orderOf(s, sid);
        const byKey = Object.fromEntries((s.columns || []).map((c) => [c.key, c]));
        return (
          <fieldset key={sid} className="xp-group" data-section={sid}>
            <legend>{tableList.length > 1 ? `${s.title || "Tablo"} — sütunlar` : "Sütunlar"}</legend>
            <p className="xp-tip">İşareti kaldırarak çıkarın; sürükleyerek ya da oklarla sıralayın.</p>
            <ul className="xp-cols" aria-label={`${s.title || "Tablo"} sütunları`}>
              {ord.map((key, i) => {
                const c = byKey[key];
                const on = chosen.includes(key);
                return (
                  <li key={key} className={`${on ? "is-on" : ""} ${dragKey === key ? "is-drag" : ""}`} draggable
                    onDragStart={(e) => { setDragKey(key); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); } catch { /* yoksay */ } }}
                    onDragOver={(e) => { if (dragKey) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragKey && dragKey !== key) st.moveColumn(s, sid, dragKey, i); setDragKey(null); }}
                    onDragEnd={() => setDragKey(null)}>
                    <span className="xp-grip" aria-hidden="true">⋮⋮</span>
                    <label>
                      <input type="checkbox" checked={on} disabled={on && chosen.length === 1} onChange={(e) => st.toggleColumn(s, sid, key, e.target.checked)} />
                      <span>{c.label}</span>
                    </label>
                    <button type="button" className="xp-arrow" aria-label={`${c.label} sütununu yukarı taşı`} disabled={i === 0} onClick={() => st.moveColumn(s, sid, key, i - 1)}>↑</button>
                    <button type="button" className="xp-arrow" aria-label={`${c.label} sütununu aşağı taşı`} disabled={i === ord.length - 1} onClick={() => st.moveColumn(s, sid, key, i + 1)}>↓</button>
                  </li>
                );
              })}
            </ul>
            <div className="xp-mini">
              <button type="button" onClick={() => st.setColumns((all) => ({ ...all, [sid]: ord }))}>Tümünü seç</button>
              <button type="button" onClick={() => { st.setColumns((all) => { const n = { ...all }; delete n[sid]; return n; }); st.setOrder((all) => { const n = { ...all }; delete n[sid]; return n; }); }}>Varsayılan</button>
              {groupSelect(t, "Grupla:")}
            </div>
          </fieldset>
        );
      })}
    </>
  );

  const layoutTab = (
    <>
      <fieldset className="xp-group">
        <legend>Görünüm</legend>
        <div className="xp-cardsel" role="radiogroup" aria-label="Görünüm">
          {LAYOUTS.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={d.layout === l.key} className={d.layout === l.key ? "is-on" : ""} onClick={() => st.setDesign({ layout: l.key })} title={l.hint}>
              <LayoutIcon k={l.key} /><b>{l.label}</b><small>{l.hint}</small>
            </button>
          ))}
        </div>
        {tabular && <p className="xp-tip">Görünüm PDF / yazdırma içindir; {fmt.label} tablo olarak çıkar (sütun ve sıra seçimi korunur).</p>}
      </fieldset>
      {tableList.length > 0 && (d.layout === "grouped" || tableList.some((t) => st.groupBy[t.id])) && (
        <fieldset className="xp-group">
          <legend>Gruplama</legend>
          {tableList.filter((t) => st.sectionOn(t.id)).map((t) => <div key={t.id} className="xp-row">{groupSelect(t, tableList.length > 1 ? `${t.s.title || "Tablo"}:` : "Gruplanacak sütun:")}</div>)}
        </fieldset>
      )}
    </>
  );

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [{ id: `u${Date.now().toString(36)}`, label: name.slice(0, 40), design: presetFromDesign(d) }, ...presets.filter((p) => p.label !== name)];
    setPresets(next); savePresets(next); setPresetName("");
  };
  const designTab = (
    <>
      <fieldset className="xp-group">
        <legend>Tasarım</legend>
        <div className="xp-themes" role="radiogroup" aria-label="Tasarım">
          {THEMES.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={d.theme === t.key} className={d.theme === t.key ? "is-on" : ""} onClick={() => st.setDesign({ theme: t.key })} title={t.hint}>
              <ThemeSwatch design={d} theme={t.key} /><b>{t.label}</b><small>{t.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="xp-group">
        <legend>Biçim</legend>
        <div className="xp-field"><span>Vurgu rengi</span>
          <div className="xp-accents" role="radiogroup" aria-label="Vurgu rengi">
            <button type="button" role="radio" aria-checked={!d.accent} className={`xp-acc xp-acc--auto ${!d.accent ? "is-on" : ""}`} disabled={bwTheme} onClick={() => st.setDesign({ accent: "" })} title="Temanın rengi">A</button>
            {ACCENTS.map((c) => <button key={c} type="button" role="radio" aria-checked={d.accent === c} aria-label={c} className={`xp-acc ${d.accent === c ? "is-on" : ""}`} style={{ background: c }} disabled={bwTheme} onClick={() => st.setDesign({ accent: c })} />)}
            <input type="color" aria-label="Özel vurgu rengi" value={d.accent || themeInfo(d.theme).accent} disabled={bwTheme} onChange={(e) => st.setDesign({ accent: e.target.value })} />
          </div>
        </div>
        {bwTheme && <p className="xp-tip">Bu tema renk kullanmaz: dolgu yok, yalnız çizgi — siyah-beyaz yazıcıda net ve az mürekkep.</p>}
        <div className="xp-field"><span>Yazı boyu</span><Seg label="Yazı boyu" value={d.fontSize} options={FONT_SIZES} onChange={(v) => st.setDesign({ fontSize: v })} /></div>
        <div className="xp-field"><span>Satır sıklığı</span><Seg label="Satır sıklığı" value={d.density} options={DENSITIES} onChange={(v) => st.setDesign({ density: v })} /></div>
        <div className="xp-field"><span>Satırlar</span><Check checked={d.zebra} onChange={(v) => st.setDesign({ zebra: v })}>Zebra şerit</Check></div>
      </fieldset>
      <fieldset className="xp-group">
        <legend>Hazır ayarlar</legend>
        <div className="xp-row xp-wrap">
          {BUILTIN_PRESETS.map((p) => <button key={p.id} type="button" className="xp-pill" onClick={() => st.setDesign(applyPreset(d, p))}>{p.label}</button>)}
          {presets.map((p) => (
            <span key={p.id} className="xp-pill xp-pill--user">
              <button type="button" onClick={() => st.setDesign(applyPreset(d, p))}>{p.label}</button>
              <button type="button" aria-label={`${p.label} hazır ayarını sil`} onClick={() => { const next = presets.filter((x) => x.id !== p.id); setPresets(next); savePresets(next); }}>×</button>
            </span>
          ))}
        </div>
        <div className="xp-row xp-preset-save">
          <input type="text" value={presetName} placeholder="Bu tasarımı adlandırın…" aria-label="Hazır ayar adı" onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); savePreset(); } }} />
          <button type="button" className="xp-btn xp-btn--sm" disabled={!presetName.trim()} onClick={savePreset}>Kaydet</button>
        </div>
      </fieldset>
    </>
  );

  const pageTab = m && (
    <>
      <fieldset className="xp-group">
        <legend>Başlık</legend>
        <label className="xp-file">Başlık<span><input type="text" value={d.title} placeholder={m.title || title || "Rapor"} onChange={(e) => st.setDesign({ title: e.target.value })} aria-label="Belge başlığı" /></span></label>
        <label className="xp-file">Alt başlık<span><input type="text" value={d.subtitle} placeholder={m.subtitle || "(yok)"} onChange={(e) => st.setDesign({ subtitle: e.target.value })} aria-label="Alt başlık" /></span></label>
      </fieldset>
      {paged && (
        <fieldset className="xp-group">
          <legend>Kâğıt</legend>
          <div className="xp-field"><span>Boyut</span><Seg label="Kâğıt boyutu" value={d.pageSize} options={PAGE_SIZES} onChange={(v) => st.setDesign({ pageSize: v })} /></div>
          <div className="xp-field"><span>Yön</span><Seg label="Sayfa yönü" value={d.orientation} options={ORIENTATIONS.map((o) => ({ key: o.value, label: o.value === "auto" && st.preview ? `Otomatik (${st.preview.orientation === "landscape" ? "yatay" : "dikey"})` : o.label }))} onChange={(v) => st.setDesign({ orientation: v })} /></div>
          <div className="xp-field"><span>Kenar boşluğu</span><Seg label="Kenar boşluğu" value={d.margins} options={MARGINS} onChange={(v) => st.setDesign({ margins: v })} /></div>
        </fieldset>
      )}
      <fieldset className="xp-group">
        <legend>Belgede gösterilecekler</legend>
        <div className="xp-row xp-wrap">
          {SHOW_KEYS.filter((s) => s.key !== "summary" || (m.summary || []).length).map((s) => (
            <Check key={s.key} checked={s.key === "summary" ? st.includeSummary && d.show.summary : Boolean(d.show[s.key])} onChange={(on) => { if (s.key === "summary") st.setIncludeSummary(on); st.setShow(s.key, on); }}>{s.key === "summary" ? "Özet kartları" : s.label}</Check>
          ))}
        </div>
        {d.show.signatures && (
          <div className="xp-signs">
            {[0, 1, 2].map((i) => (
              <input key={i} type="text" value={d.signatures[i] || ""} placeholder={i === 0 ? "Hazırlayan" : i === 1 ? "Onaylayan" : "(3. imza — isteğe bağlı)"} aria-label={`İmza ${i + 1}`}
                onChange={(e) => { const next = [...d.signatures]; while (next.length <= i) next.push(""); next[i] = e.target.value; st.setDesign({ signatures: next }); }} />
            ))}
          </div>
        )}
        <label className="xp-file">Alt bilgi notu<span><input type="text" value={d.footerNote} placeholder="Ör. Gizlidir — yalnız iç kullanım" onChange={(e) => st.setDesign({ footerNote: e.target.value })} aria-label="Alt bilgi notu" /></span></label>
        <label className="xp-file">Filigran<span><input type="text" value={d.watermark} placeholder={d.theme === "draft" ? "TASLAK" : "Ör. TASLAK, KOPYA"} onChange={(e) => st.setDesign({ watermark: e.target.value })} aria-label="Filigran" /></span></label>
      </fieldset>
      <fieldset className="xp-group">
        <legend>Dosya</legend>
        <label className="xp-file">Dosya adı
          <span><input type="text" value={st.fileName} onChange={(e) => st.setFileName(e.target.value)} aria-label="Dosya adı" /><em>.{fmt.ext}</em></span>
        </label>
      </fieldset>
    </>
  );

  const pageCount = pages?.pages;
  // Belge köküne çizilir: transform / backdrop-filter taşıyan başlık şeritleri
  // position:fixed pencereyi kırpmasın ve takvim gibi katmanların altında kalmasın.
  return createPortal(
    <div className="xp-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <form ref={ref} className="xp-dialog xp-studio" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <header className="xp-head">
          <div>
            <h2 id={titleId}>Dışa aktar</h2>
            <p>{title || m?.title || "Rapor"}{m?.filters?.length ? ` · ${m.filters.join(" · ")}` : ""}</p>
          </div>
          <button type="button" className="xp-x" aria-label="Kapat" onClick={onClose}>×</button>
        </header>

        <div className="xp-split">
          <div className="xp-side">
            <div className="xp-formats" role="radiogroup" aria-label="Biçim">
              {st.allowed.map((f) => (
                <button key={f.key} type="button" role="radio" aria-checked={st.format === f.key} className={st.format === f.key ? "is-on" : ""} onClick={() => st.setFormat(f.key)}>
                  <b>{f.label}</b><small>.{f.ext}</small>
                </button>
              ))}
            </div>
            <p className="xp-hint">{fmt.hint}</p>
            <div className="xp-tabs" role="tablist" aria-label="Seçenekler">
              {TABS.map((t) => <button key={t.key} type="button" role="tab" id={`xp-tab-${t.key}`} aria-selected={tab === t.key} aria-controls="xp-tabpanel" className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
            </div>
            <div className="xp-body" role="tabpanel" id="xp-tabpanel" aria-labelledby={`xp-tab-${tab}`}>
              {st.loadError && <p className="xp-error" role="alert">{st.loadError}</p>}
              {!m && !st.loadError && <p className="xp-hint">Hazırlanıyor…</p>}
              {tab === "content" && contentTab}
              {tab === "layout" && layoutTab}
              {tab === "design" && designTab}
              {tab === "page" && pageTab}
              {error && <p className="xp-error" role="alert">{error}</p>}
            </div>
          </div>
          <Preview prepared={st.prepared} design={d} logo={logo} onPages={setPages} />
        </div>

        <footer className="xp-foot">
          <span className="xp-count" aria-live="polite">{st.preview ? `${st.preview.tables ? `${st.preview.rows} kayıt` : ""}${st.preview.sections > 1 || !st.preview.tables ? `${st.preview.tables ? " · " : ""}${st.preview.sections} bölüm` : ""}${pageCount && PAGED.has(st.format) ? ` · ${pageCount}${pages?.truncated ? "+" : ""} sayfa` : ""}` : ""}</span>
          <button type="button" className="xp-link" onClick={() => { st.reset(); setError(null); }} title="Bu sayfa için tüm seçimleri sıfırlar">Varsayılana dön</button>
          <button type="button" className="xp-btn" onClick={onClose}>Vazgeç</button>
          <button type="button" className="xp-btn" onClick={doPrint} disabled={!m || st.busy}>Yazdır…</button>
          <button type="submit" className="xp-btn xp-btn--primary" disabled={!m || st.busy}>{st.busy ? "Hazırlanıyor…" : `${fmt.label} olarak aktar`}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
