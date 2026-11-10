// Ortak "Ne aktarılsın?" penceresi (web + masaüstü).
// BU DOSYA elitlig-mac (renderer/src/lib/export) ve elitlig-client (src/features/export)
// depolarında AYNIDIR. Platforma özgü kaydetme / indirme ./platform.js'tedir (depoya göre farklı).
//
// Doğrudan kullanmak yerine her deponun ExportButton bileşenini kullanın:
//
//   <ExportButton id="todos" title="Yapılacaklar"
//     report={({ scope }) => todosReport(scope === "all" ? allItems : shownItems)}
//     scopes={[{ value: "view", label: "Şu anki görünüm" }, { value: "all", label: "Tümü" }]} />
//
// id: son seçimlerin hatırlanacağı anahtar. report: rapor modeli ya da onu döndüren
// (async olabilir) işlev — model biçimi exportCore.js başında. scopes: isteğe bağlı kapsam
// seçenekleri; işlev { scope } ile çağrılır. formats: gösterilecek biçimler (varsayılan
// PDF/Excel/Word/CSV + Markdown).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { defaultFileName, formatInfo, groupableColumns, hasDateFilter, loadPrefs, prepareReport, renderReport, savePrefs, sectionId } from "./index";
import { deliverExport, getLogo } from "./platform";
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

const resolveReport = async (report, scope) => (typeof report === "function" ? report({ scope }) : report);

/** Pencere durumu + aktarma işlemi (UI'dan bağımsız; testlerde de kullanılır). */
export function useExportState({ id, report, scopes, formats, initialFormat }) {
  const prefs = useMemo(() => (id ? loadPrefs(id) : null) || {}, [id]);
  const allowed = useMemo(() => (formats?.length ? formats : ["pdf", "xlsx", "docx", "csv", "md"]).map(formatInfo), [formats]);
  const [format, setFormat] = useState(() => (allowed.some((f) => f.key === initialFormat) ? initialFormat : allowed.some((f) => f.key === prefs.format) ? prefs.format : allowed[0].key));
  const [scope, setScope] = useState(() => (scopes?.some((s) => s.value === prefs.scope) ? prefs.scope : scopes?.[0]?.value || "view"));
  const [model, setModel] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [columns, setColumns] = useState(prefs.columns || {});
  const [groupBy, setGroupBy] = useState(prefs.groupBy || {});
  const [sections, setSections] = useState(prefs.sections || null);
  const [preset, setPreset] = useState(prefs.preset || "all");
  const [range, setRange] = useState(() => (prefs.preset === "custom" ? { from: prefs.from || "", to: prefs.to || "" } : rangePreset(prefs.preset || "all")));
  const [includeSummary, setIncludeSummary] = useState(prefs.includeSummary !== false);
  const [orientation, setOrientation] = useState(prefs.orientation || "auto");
  const [fileName, setFileNameState] = useState("");
  const fileTouched = useRef(false);
  const setFileName = (v) => { fileTouched.current = true; setFileNameState(v); };
  const [busy, setBusy] = useState(false);

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
  /** Seçili sütunlar (kayıtlı tercih, rapordaki sütunlara göre süzülür). */
  const columnsOf = useCallback((s, sid) => {
    const keys = (s.columns || []).map((c) => c.key);
    const saved = columns[sid]?.filter((k) => keys.includes(k));
    return saved?.length ? saved : (s.columns || []).filter((c) => !c.hidden).map((c) => c.key);
  }, [columns]);
  const sectionOn = (sid) => !sections || sections.includes(sid) || !tables.some((t) => sections.includes(t.id));

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
      includeSummary, orientation, scopeLabel: scopeLabel && scope !== "view" ? scopeLabel : "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, tables, columns, groupBy, sections, range, includeSummary, orientation, scope, scopes]);

  const preview = useMemo(() => {
    if (!model || !options) return null;
    try {
      const p = prepareReport(model, options);
      return { rows: p.sections.reduce((n, s) => n + (s.rowCount || 0), 0), tables: p.sections.filter((s) => s.kind === "table").length, sections: p.sections.length, orientation: p.orientation };
    } catch { return null; }
  }, [model, options]);

  const run = useCallback(async () => {
    if (!model || !options) return { ok: false };
    setBusy(true);
    try {
      const logo = format === "pdf" || format === "docx" ? await getLogo().catch(() => ({})) : {};
      const out = renderReport(model, format, { ...options, ...logo, fileName });
      const res = await deliverExport(out);
      if (id) savePrefs(id, { format, scope, columns, groupBy, sections, preset, from: range.from, to: range.to, includeSummary, orientation });
      return { ...(res || { ok: false }), fileName: out.fileName, format };
    } catch (e) {
      return { ok: false, error: { message: e?.message || "Dışa aktarılamadı." } };
    } finally { setBusy(false); }
  }, [model, options, format, fileName, id, scope, columns, groupBy, sections, preset, range, includeSummary, orientation]);

  return {
    allowed, format, setFormat, scope, setScope, model, loadError, tables, columnsOf, sectionOn,
    setColumns, groupBy, setGroupBy, sections, setSections, preset, range, includeSummary, setIncludeSummary,
    orientation, setOrientation, fileName, setFileName, busy, preview, run,
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

/**
 * Pencere. props: id, title, report, scopes, formats, initialFormat,
 * onClose(), onDone(result) — result: { ok, path?, fileName, format, printed? }.
 */
export default function ExportDialog({ id, title, report, scopes, formats, initialFormat, onClose, onDone }) {
  const st = useExportState({ id, report, scopes, formats, initialFormat });
  const ref = useRef(null);
  const [error, setError] = useState(null);
  const titleId = `xp-title-${id || "rapor"}`;

  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector(".xp-formats button.is-on, button")?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); try { prev?.focus?.({ preventScroll: true }); } catch { /* yoksay */ } };
  }, [onClose]);

  const submit = async (e) => {
    e?.preventDefault();
    setError(null);
    const res = await st.run();
    if (res.ok || res.printed) { onDone?.(res); onClose?.(); } else if (res.error) setError(res.error.message);
  };

  const m = st.model;
  const dateOn = m && hasDateFilter(m);
  const tableList = st.tables.filter((t) => (t.s.kind || "table") === "table");
  const showSections = st.tables.length > 1;
  const fmt = formatInfo(st.format);
  const paged = st.format === "pdf" || st.format === "docx" || st.format === "xlsx";

  // Belge köküne çizilir: transform / backdrop-filter taşıyan başlık şeritleri
  // position:fixed pencereyi kırpmasın ve takvim gibi katmanların altında kalmasın.
  return createPortal(
    <div className="xp-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <form ref={ref} className="xp-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <header className="xp-head">
          <div>
            <h2 id={titleId}>Dışa aktar</h2>
            <p>{title || m?.title || "Rapor"}{m?.filters?.length ? ` · ${m.filters.join(" · ")}` : ""}</p>
          </div>
          <button type="button" className="xp-x" aria-label="Kapat" onClick={onClose}>×</button>
        </header>

        <div className="xp-body">
          <div className="xp-formats" role="radiogroup" aria-label="Biçim">
            {st.allowed.map((f) => (
              <button key={f.key} type="button" role="radio" aria-checked={st.format === f.key} className={st.format === f.key ? "is-on" : ""} onClick={() => st.setFormat(f.key)}>
                <b>{f.label}</b><small>.{f.ext}</small>
              </button>
            ))}
          </div>
          <p className="xp-hint">{fmt.hint}</p>

          {st.loadError && <p className="xp-error" role="alert">{st.loadError}</p>}
          {!m && !st.loadError && <p className="xp-hint">Hazırlanıyor…</p>}

          {m && (
            <>
              {scopes?.length > 1 && (
                <fieldset className="xp-group">
                  <legend>Ne aktarılsın?</legend>
                  <div className="xp-row">
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
                  <div className="xp-row">
                    <select aria-label="Hazır aralık" value={st.preset} onChange={(e) => st.choosePreset(e.target.value)}>
                      {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <input type="date" aria-label="Başlangıç" value={st.range.from} onChange={(e) => st.setRange({ ...st.range, from: e.target.value })} />
                    <span className="xp-dash">–</span>
                    <input type="date" aria-label="Bitiş" value={st.range.to} onChange={(e) => st.setRange({ ...st.range, to: e.target.value })} />
                  </div>
                </fieldset>
              )}

              {showSections && (
                <fieldset className="xp-group">
                  <legend>Bölümler</legend>
                  <div className="xp-row xp-wrap">
                    {st.tables.map(({ s, id: sid }) => (
                      <Check key={sid} checked={st.sectionOn(sid)} onChange={(on) => {
                        const cur = st.tables.filter((t) => st.sectionOn(t.id)).map((t) => t.id);
                        const next = on ? [...new Set([...cur, sid])] : cur.filter((x) => x !== sid);
                        if (next.length) st.setSections(next);
                      }}>{s.title || "Bölüm"}</Check>
                    ))}
                  </div>
                </fieldset>
              )}

              {tableList.filter((t) => st.sectionOn(t.id)).map(({ s, id: sid }) => {
                const chosen = st.columnsOf(s, sid);
                const groupable = groupableColumns(s);
                const gv = st.groupBy[sid] ?? s.groupBy ?? "";
                return (
                  <fieldset key={sid} className="xp-group" data-section={sid}>
                    <legend>{tableList.length > 1 ? `${s.title || "Tablo"} — sütunlar` : "Sütunlar"}</legend>
                    <div className="xp-row xp-wrap">
                      {(s.columns || []).map((c) => (
                        <Check key={c.key} checked={chosen.includes(c.key)} disabled={chosen.length === 1 && chosen.includes(c.key)}
                          onChange={(on) => st.setColumns((all) => {
                            const order = (s.columns || []).map((x) => x.key);
                            const next = on ? [...chosen, c.key] : chosen.filter((k) => k !== c.key);
                            return { ...all, [sid]: order.filter((k) => next.includes(k)) };
                          })}>{c.label}</Check>
                      ))}
                    </div>
                    <div className="xp-mini">
                      <button type="button" onClick={() => st.setColumns((all) => ({ ...all, [sid]: (s.columns || []).map((c) => c.key) }))}>Tümünü seç</button>
                      <button type="button" onClick={() => st.setColumns((all) => { const n = { ...all }; delete n[sid]; return n; })}>Varsayılan</button>
                      {groupable.length > 0 && (
                        <label className="xp-inline">Grupla:
                          <select value={gv} onChange={(e) => st.setGroupBy((all) => ({ ...all, [sid]: e.target.value }))} aria-label={`${s.title || "Tablo"} gruplama`}>
                            <option value="">Yok</option>
                            {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  </fieldset>
                );
              })}

              <fieldset className="xp-group">
                <legend>Belge</legend>
                <div className="xp-row xp-wrap">
                  {(m.summary || []).length > 0 && <Check checked={st.includeSummary} onChange={st.setIncludeSummary}>Özet kartları</Check>}
                  {paged && (
                    <label className="xp-inline">Yön:
                      <select value={st.orientation} onChange={(e) => st.setOrientation(e.target.value)} aria-label="Sayfa yönü">
                        {ORIENTATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}{o.value === "auto" && st.preview ? ` (${st.preview.orientation === "landscape" ? "yatay" : "dikey"})` : ""}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <label className="xp-file">Dosya adı
                  <span><input type="text" value={st.fileName} onChange={(e) => st.setFileName(e.target.value)} aria-label="Dosya adı" /><em>.{fmt.ext}</em></span>
                </label>
              </fieldset>
            </>
          )}
          {error && <p className="xp-error" role="alert">{error}</p>}
        </div>

        <footer className="xp-foot">
          <span className="xp-count" aria-live="polite">{st.preview ? `${st.preview.rows} kayıt${st.preview.sections > 1 ? ` · ${st.preview.sections} bölüm` : ""}` : ""}</span>
          <button type="button" className="xp-btn" onClick={onClose}>Vazgeç</button>
          <button type="submit" className="xp-btn xp-btn--primary" disabled={!m || st.busy}>{st.busy ? "Hazırlanıyor…" : `${fmt.label} olarak aktar`}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
