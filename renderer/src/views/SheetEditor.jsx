// Hesap tablosu düzenleyicisi.
//
// Formül motoru, sayfa işlemleri ve Excel dönüştürücüleri web sitesindekiyle
// aynıdır (lib/sheets, testli). Masaüstüne özgü: tam klavye kullanımı, yerel
// pano, sütun genişliğini sürükleme, Excel/CSV/PDF dosyaları doğrudan diske,
// otomatik kayıt; aynı anda başkası düzenlerse değişiklikler birleştirilir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field, Icon, MenuButton, Modal, Spinner, useConfirm, useResult, useToast } from "../components/ui";
import { get, put, request } from "../api";
import { FUNCTION_LIST, addr, colName, createEvaluator, formatValue, isNumeric, rangeStats, toCsvText } from "../lib/sheets/sheetEngine";
import {
  MAX_COLS, MAX_ROWS, blankSheet, blockFromText, blockToText, clearRange, copyBlock, eachCell, fill, mergeWorkbooks,
  normRange, pasteBlock, rangeLabel, renameSheet, shiftAxis, sortRange, styleRange, uniqueSheetName, usedBounds, workbooksDiffer, writeCells,
} from "../lib/sheets/sheetOps";
import { workbookToXlsx } from "../lib/sheets/xlsxExport";
import { importFile as readSheetFile } from "../lib/sheets/importFile";
import { relativeTime } from "../lib/helpers";

const ROW_H = 24;
const HEAD_W = 46;
const DEF_W = 100;
const FORMATS = [["general", "Genel"], ["number", "Sayı"], ["money", "Para (₺)"], ["percent", "Yüzde"], ["date", "Tarih"], ["text", "Metin"]];
const TEXT_COLORS = ["", "#111827", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#6b7280"];
const FILL_COLORS = ["", "#fef3c7", "#fee2e2", "#dcfce7", "#dbeafe", "#ede9fe", "#fce7f3", "#f3f4f6"];
const clone = (o) => JSON.parse(JSON.stringify(o));

export default function SheetEditor({ id, onClose }) {
  const toast = useToast();
  const result = useResult();
  const confirm = useConfirm();
  const [meta, setMeta] = useState(null);
  const [book, setBook] = useState(null);
  const [si, setSi] = useState(0);
  const [sel, setSel] = useState({ a: { row: 0, col: 0 }, b: { row: 0, col: 0 } });
  const [edit, setEdit] = useState(null); // { row, col, value, fromBar }
  const [saveState, setSaveState] = useState("saved"); // saved | dirty | saving | error | conflict
  const [title, setTitle] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [fnOpen, setFnOpen] = useState(false);
  const [scroll, setScroll] = useState({ top: 0, left: 0, height: 600 });
  const [loadError, setLoadError] = useState(null);

  const history = useRef({ undo: [], redo: [] });
  const base = useRef(null);        // son eşitlenen çalışma kitabı
  const version = useRef(null);
  const saveTimer = useRef(null);
  const gridRef = useRef(null);
  const clipRef = useRef(null);      // dahili pano (biçim ve formül kaydırma için)

  const readOnly = meta?.access === "viewer";

  /* ------------------------------- yükleme ------------------------------- */
  const load = useCallback(async () => {
    const res = await request({ path: `/api/tools/sheets/${id}`, cache: true });
    if (!res.ok) { setLoadError(res.error); return; }
    const item = res.data.item;
    setMeta(item);
    setTitle(item.title);
    setBook(item.data);
    base.current = clone(item.data);
    version.current = item.version;
    setSaveState("saved");
    if (res.offline) toast("Çevrimdışı: tablo salt okunur açıldı (son kaydedilen hali).", { tone: "warn" });
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  const sheet = book?.sheets[si] || book?.sheets[0];
  const evaluator = useMemo(() => (book ? createEvaluator(book) : null), [book]);
  const range = normRange(sel.a, sel.b);

  /* -------------------------------- kayıt -------------------------------- */
  const save = useCallback(async (nextBook) => {
    setSaveState("saving");
    const res = await request({ method: "PATCH", path: `/api/tools/sheets/${id}`, body: { data: nextBook, base_version: version.current }, queue: false });
    if (res.ok) {
      base.current = clone(nextBook);
      version.current = res.data?.item?.version ?? version.current;
      setMeta((m) => ({ ...m, ...res.data?.item }));
      setSaveState("saved");
      return;
    }
    if (res.error?.code === "VERSION_CONFLICT" && res.error.details?.[0]) {
      // Başkası değiştirmiş: benim değişikliklerim onların üstüne birleştirilir.
      const theirs = res.error.details[0];
      const merged = mergeWorkbooks(base.current, nextBook, theirs.data);
      base.current = clone(theirs.data);
      version.current = theirs.version;
      setBook(merged);
      toast(`${theirs.updated_by_name || "Başka biri"} de bu tabloyu düzenledi; değişiklikler birleştirildi.`, { tone: "warn", timeout: 6000 });
      setSaveState("dirty");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(merged), 400);
      return;
    }
    setSaveState(res.offline ? "offline" : "error");
    if (!res.offline) toast(res.error?.message || "Tablo kaydedilemedi.", { tone: "error" });
  }, [id, toast]);

  const commit = useCallback((next, { record = true } = {}) => {
    if (readOnly || !next) return;
    setBook((prev) => {
      if (record && prev) {
        history.current.undo.push(prev);
        if (history.current.undo.length > 100) history.current.undo.shift();
        history.current.redo = [];
      }
      return next;
    });
    setSaveState("dirty");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 1200);
  }, [readOnly, save]);

  // Ayrılırken bekleyen kayıt gönderilir.
  const bookRef = useRef(book);
  bookRef.current = book;
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (bookRef.current && base.current && workbooksDiffer(bookRef.current, base.current)) save(bookRef.current);
  }, [save]);

  // Canlı: 15 sn'de bir sürüm kontrolü; değişiklik yoksa sessizce yenilenir.
  useEffect(() => {
    const t = setInterval(async () => {
      if (saveState !== "saved") return;
      const res = await get(`/api/tools/sheets/${id}/version`);
      if (res.ok && !res.offline && res.data?.version != null && res.data.version !== version.current) {
        const full = await request({ path: `/api/tools/sheets/${id}`, cache: true });
        if (full.ok && !full.offline) {
          base.current = clone(full.data.item.data);
          version.current = full.data.item.version;
          setBook(full.data.item.data);
          setMeta(full.data.item);
          toast(`${res.data.updated_by_name || "Biri"} tabloyu güncelledi.`, { tone: "info" });
        }
      }
    }, 15000);
    return () => clearInterval(t);
  }, [id, saveState, toast]);

  const undo = useCallback(() => {
    const prev = history.current.undo.pop();
    if (!prev) return;
    history.current.redo.push(bookRef.current);
    commit(prev, { record: false });
  }, [commit]);
  const redo = useCallback(() => {
    const next = history.current.redo.pop();
    if (!next) return;
    history.current.undo.push(bookRef.current);
    commit(next, { record: false });
  }, [commit]);
  useEffect(() => {
    const u = () => undo();
    const r = () => redo();
    window.addEventListener("elitlig:undo", u);
    window.addEventListener("elitlig:redo", r);
    return () => { window.removeEventListener("elitlig:undo", u); window.removeEventListener("elitlig:redo", r); };
  }, [undo, redo]);

  /* ------------------------------ düzenleme ------------------------------ */
  const raw = (row, col) => sheet?.cells[addr(col, row)]?.v ?? "";
  const style = (row, col) => sheet?.cells[addr(col, row)]?.s || {};
  const active = sel.b;

  const startEdit = (value, fromBar = false) => { if (!readOnly) setEdit({ row: active.row, col: active.col, value, fromBar }); };
  const finishEdit = (move = null) => {
    if (!edit) return;
    const key = addr(edit.col, edit.row);
    if ((sheet.cells[key]?.v ?? "") !== edit.value) commit(writeCells(book, si, { [key]: { v: edit.value } }));
    setEdit(null);
    if (move) moveBy(move.dr, move.dc, false);
    gridRef.current?.focus();
  };
  const moveBy = (dr, dc, extend) => {
    setSel((s) => {
      const b = { row: Math.max(0, Math.min(sheet.rows - 1, s.b.row + dr)), col: Math.max(0, Math.min(sheet.cols - 1, s.b.col + dc)) };
      return extend ? { a: s.a, b } : { a: b, b };
    });
  };
  const apply = (fn) => { if (!readOnly) commit(fn(book)); };
  const toggleStyle = (k) => apply((b) => styleRange(b, si, range, { [k]: !style(active.row, active.col)[k] }));

  // Seçili hücre görünür kalsın.
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !sheet) return;
    const top = active.row * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = top - el.clientHeight + ROW_H * 2;
    let left = 0;
    for (let c = 0; c < active.col; c += 1) left += sheet.colW?.[colName(c)] || DEF_W;
    const w = sheet.colW?.[colName(active.col)] || DEF_W;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (left + w + HEAD_W > el.scrollLeft + el.clientWidth) el.scrollLeft = left + w + HEAD_W - el.clientWidth;
  }, [active.row, active.col, sheet]);

  const onKeyDown = (e) => {
    if (!sheet || edit) return;
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key;
    if (meta && k.toLowerCase() === "b") { e.preventDefault(); toggleStyle("b"); return; }
    if (meta && k.toLowerCase() === "i") { e.preventDefault(); toggleStyle("i"); return; }
    if (meta && k.toLowerCase() === "u") { e.preventDefault(); toggleStyle("u"); return; }
    if (meta && k.toLowerCase() === "d") { e.preventDefault(); apply((b) => fill(b, si, range, "down")); return; }
    if (meta && k.toLowerCase() === "a") { e.preventDefault(); setSel({ a: { row: 0, col: 0 }, b: { row: sheet.rows - 1, col: sheet.cols - 1 } }); return; }
    if (meta && k === "ArrowDown") { e.preventDefault(); const u = usedBounds(sheet); setSel({ a: sel.a, b: { row: Math.max(0, u.rows - 1), col: active.col } }); return; }
    if (meta && k === "ArrowUp") { e.preventDefault(); setSel({ a: { row: 0, col: active.col }, b: { row: 0, col: active.col } }); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) { e.preventDefault(); moveBy(...arrows[k], e.shiftKey); return; }
    if (k === "Tab") { e.preventDefault(); moveBy(0, e.shiftKey ? -1 : 1, false); return; }
    if (k === "Enter") { e.preventDefault(); if (e.shiftKey) moveBy(-1, 0, false); else startEdit(String(raw(active.row, active.col))); return; }
    if (k === "F2") { e.preventDefault(); startEdit(String(raw(active.row, active.col))); return; }
    if (k === "Backspace" || k === "Delete") { e.preventDefault(); apply((b) => clearRange(b, si, range)); return; }
    if (k.length === 1 && !meta && !e.altKey) { e.preventDefault(); startEdit(k); }
  };

  // Pano: hücre metni (sekmeli) dışarıya, biçimli blok içeride.
  const onCopy = (e, cut = false) => {
    if (edit || !sheet) return;
    e.preventDefault();
    const block = copyBlock(sheet, range);
    const text = range.r1 === range.r2 && range.c1 === range.c2 ? String(displayOf(range.r1, range.c1)) : blockToText({ rows: block.rows.map((row, i) => row.map((c, j) => ({ v: displayOf(range.r1 + i, range.c1 + j) }))) });
    e.clipboardData.setData("text/plain", text);
    clipRef.current = { block, text };
    if (cut) apply((b) => clearRange(b, si, range, { values: true, styles: true }));
  };
  const onPaste = (e) => {
    if (edit || readOnly || !sheet) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const block = clipRef.current && clipRef.current.text === text ? clipRef.current.block : blockFromText(text);
    apply((b) => pasteBlock(b, si, range, block));
    const h = block.rows.length;
    const w = block.rows[0]?.length || 1;
    if (range.r1 === range.r2 && range.c1 === range.c2) setSel({ a: { row: range.r1, col: range.c1 }, b: { row: Math.min(sheet.rows - 1, range.r1 + h - 1), col: Math.min(sheet.cols - 1, range.c1 + w - 1) } });
  };

  const displayOf = (row, col) => {
    const key = addr(col, row);
    const cell = sheet.cells[key];
    if (!cell || cell.v === "") return "";
    return formatValue(evaluator.value(si, key), cell.s || {});
  };

  /* ---------------------------- satır / sütun ---------------------------- */
  const insert = (axis, after) => apply((b) => shiftAxis(b, si, axis, (axis === "row" ? (after ? range.r2 + 1 : range.r1) : (after ? range.c2 + 1 : range.c1)), axis === "row" ? range.r2 - range.r1 + 1 : range.c2 - range.c1 + 1));
  const remove = (axis) => apply((b) => shiftAxis(b, si, axis, axis === "row" ? range.r1 : range.c1, -(axis === "row" ? range.r2 - range.r1 + 1 : range.c2 - range.c1 + 1)));
  const sort = (asc) => {
    const r = range.r1 === range.r2 ? { ...range, r1: sheet.freeze ? 1 : 0, r2: Math.max(0, usedBounds(sheet).rows - 1), c1: 0, c2: Math.max(range.c2, usedBounds(sheet).cols - 1) } : range;
    apply((b) => sortRange(b, si, r, active.col, asc, (key) => evaluator.value(si, key)));
  };
  const grow = (axis) => apply((b) => ({ ...b, sheets: b.sheets.map((s, i) => (i === si ? { ...s, [axis === "row" ? "rows" : "cols"]: Math.min(axis === "row" ? MAX_ROWS : MAX_COLS, s[axis === "row" ? "rows" : "cols"] + (axis === "row" ? 50 : 5)) } : s)) }));

  /* ----------------------------- sayfa sekmeleri ----------------------------- */
  const addSheet = () => { apply((b) => ({ ...b, sheets: [...b.sheets, blankSheet(uniqueSheetName(b))] })); setSi(book.sheets.length); };
  const deleteSheet = async (index) => {
    if (book.sheets.length < 2) return;
    if (!(await confirm({ title: "Sayfayı sil", message: `“${book.sheets[index].name}” sayfası silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    apply((b) => ({ ...b, sheets: b.sheets.filter((_, i) => i !== index) }));
    setSi(Math.max(0, index - 1));
  };

  /* ------------------------------- dışa aktar ------------------------------- */
  const exportXlsx = async () => {
    const bytes = workbookToXlsx(book, evaluator, { title });
    const res = await window.elitlig.files.save(`${title}.xlsx`, bytes, [{ name: "Excel", extensions: ["xlsx"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  const exportCsv = async () => {
    const u = usedBounds(sheet);
    const rows = Array.from({ length: u.rows }, (_, r) => Array.from({ length: u.cols }, (_, c) => String(displayOf(r, c))));
    const res = await window.elitlig.files.save(`${title}-${sheet.name}.csv`, toCsvText(rows), [{ name: "CSV", extensions: ["csv"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  // Excel/CSV dosyasının sayfalarını açık tabloya yeni sekme olarak ekler.
  const importIntoBook = async () => {
    const file = await window.elitlig.files.open([{ name: "Excel / CSV", extensions: ["xlsx", "xlsm", "csv", "tsv", "txt"] }]);
    if (!file.ok) return;
    try {
      const { book: incoming, warnings } = await readSheetFile(file.name, file.data);
      const names = new Set(book.sheets.map((s) => s.name.toLocaleLowerCase("tr-TR")));
      const added = incoming.sheets.slice(0, 20 - book.sheets.length).map((sh) => {
        let name = sh.name;
        let n = 2;
        while (names.has(name.toLocaleLowerCase("tr-TR"))) { name = `${sh.name.slice(0, 34)} (${n})`; n += 1; }
        names.add(name.toLocaleLowerCase("tr-TR"));
        return { ...sh, name };
      });
      if (!added.length) { toast("Bir dosyada en fazla 20 sayfa olabilir.", { tone: "error" }); return; }
      commit({ ...book, sheets: [...book.sheets, ...added] });
      setSi(book.sheets.length);
      toast(`${added.length} sayfa eklendi.${warnings.length ? ` Not: ${warnings[0]}` : ""}`, { tone: warnings.length ? "warn" : "success" });
    } catch (error) {
      toast(error?.message || "Dosya okunamadı.", { tone: "error" });
    }
  };

  const printSheet = (pdf) => {
    const html = sheetHtml(sheet, title, displayOf);
    if (pdf) window.elitlig.pdf(html, title, { landscape: usedBounds(sheet).cols > 7 });
    else window.elitlig.print(html, title);
  };

  useEffect(() => window.elitlig.onCommand((cmd) => {
    if (cmd === "export") exportXlsx();
    if (cmd === "print") printSheet(false);
    if (cmd === "find") document.querySelector(".formula-bar input")?.focus();
  }));

  /* -------------------------------- görünüm -------------------------------- */
  if (loadError) return <div className="view"><button type="button" className="link-btn" onClick={onClose}>← Tablolar</button><p className="error-note">{loadError.message}</p></div>;
  if (!book || !sheet) return <Spinner label="Tablo açılıyor…" />;

  const widths = Array.from({ length: sheet.cols }, (_, c) => sheet.colW?.[colName(c)] || DEF_W);
  const lefts = widths.reduce((acc, w, i) => { acc.push(i ? acc[i - 1] + widths[i - 1] : 0); return acc; }, []);
  const totalW = lefts[sheet.cols - 1] + widths[sheet.cols - 1];
  const first = Math.max(0, Math.floor(scroll.top / ROW_H) - 5);
  const last = Math.min(sheet.rows - 1, Math.ceil((scroll.top + scroll.height) / ROW_H) + 5);
  const visibleRows = [];
  for (let r = first; r <= last; r += 1) visibleRows.push(r);
  if (sheet.freeze && first > 0) visibleRows.unshift(0);
  const activeStyle = style(active.row, active.col);
  const stats = rangeStats((() => { const vals = []; if ((range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) <= 20000) eachCell(range, (key) => { if (sheet.cells[key]) vals.push(evaluator.value(si, key)); }); return vals.map((v) => (isNumeric(v) && typeof v === "object" ? v.date : v)); })());
  const inRange = (r, c) => r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  const startResize = (c, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[c];
    const onMove = (ev) => {
      const w = Math.max(30, Math.min(600, Math.round(startW + ev.clientX - startX)));
      setBook((b) => ({ ...b, sheets: b.sheets.map((s, i) => (i === si ? { ...s, colW: { ...s.colW, [colName(c)]: w } } : s)) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!readOnly) commit(bookRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const saveLabel = { saved: "Kaydedildi", dirty: "Kaydedilecek…", saving: "Kaydediliyor…", error: "Kaydedilemedi", offline: "Çevrimdışı — bağlantı gelince kaydedin" }[saveState];

  return (
    <div className="sheet-editor">
      <header className="sheet-top">
        <button type="button" className="icon-btn" onClick={onClose} title="Tablolar"><Icon name="chevronLeft" /></button>
        <span className="file-icon"><Icon name="grid" /></span>
        <input className="sheet-title" value={title} readOnly={meta.access !== "owner"} onChange={(e) => setTitle(e.target.value)}
          onBlur={async () => { if (title.trim() && title !== meta.title) { const res = await request({ method: "PATCH", path: `/api/tools/sheets/${id}`, body: { title: title.trim() }, queue: false }); if (result(res)) setMeta((m) => ({ ...m, title: title.trim() })); } }} />
        <span className={`save-state save-state--${saveState}`}>{saveLabel}</span>
        {readOnly && <span className="pill">Yalnız görüntüleme</span>}
        <span className="spacer" />
        {meta.updated_by_name && <span className="muted small">Son: {meta.updated_by_name} · {relativeTime(meta.updatedAt)}</span>}
        {!readOnly && <button type="button" className="btn btn--sm btn--ghost" onClick={importIntoBook}><Icon name="upload" /> Sayfa içe aktar</button>}
        <MenuButton icon="download" label="Dışa aktar" items={[
          { label: "Excel (.xlsx)", icon: "grid", onClick: exportXlsx },
          { label: "CSV (bu sayfa)", icon: "download", onClick: exportCsv },
          { label: "PDF", icon: "printer", onClick: () => printSheet(true) },
          { label: "Yazdır", icon: "printer", onClick: () => printSheet(false) },
        ]} />
        {meta.access === "owner" && <button type="button" className="btn btn--sm" onClick={() => setShareOpen(true)}><Icon name="share" /> Paylaş{meta.shares?.length ? ` (${meta.shares.length})` : ""}</button>}
      </header>

      {!readOnly && (
        <div className="sheet-toolbar" role="toolbar">
          <button type="button" className="icon-btn" title="Geri al (⌘Z)" onClick={undo} disabled={!history.current.undo.length}><Icon name="undo" /></button>
          <button type="button" className="icon-btn" title="Yinele (⇧⌘Z)" onClick={redo} disabled={!history.current.redo.length}><Icon name="redo" /></button>
          <span className="tb-sep" />
          <button type="button" className={`icon-btn ${activeStyle.b ? "is-on" : ""}`} title="Kalın (⌘B)" onClick={() => toggleStyle("b")}><Icon name="bold" /></button>
          <button type="button" className={`icon-btn ${activeStyle.i ? "is-on" : ""}`} title="İtalik (⌘I)" onClick={() => toggleStyle("i")}><Icon name="italic" /></button>
          <button type="button" className={`icon-btn ${activeStyle.u ? "is-on" : ""}`} title="Altı çizili (⌘U)" onClick={() => toggleStyle("u")}><Icon name="underline" /></button>
          <span className="tb-sep" />
          {[["left", "alignLeft"], ["center", "alignCenter"], ["right", "alignRight"]].map(([al, icon]) => <button key={al} type="button" className={`icon-btn ${activeStyle.al === al ? "is-on" : ""}`} title="Hizala" onClick={() => apply((b) => styleRange(b, si, range, { al: activeStyle.al === al ? null : al }))}><Icon name={icon} /></button>)}
          <span className="tb-sep" />
          <select className="select-sm" value={activeStyle.f || "general"} onChange={(e) => apply((b) => styleRange(b, si, range, { f: e.target.value === "general" ? null : e.target.value }))} title="Sayı biçimi">{FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button type="button" className="icon-btn" title="Ondalık azalt" onClick={() => apply((b) => styleRange(b, si, range, { d: Math.max(0, (activeStyle.d ?? 2) - 1) }))}>.0</button>
          <button type="button" className="icon-btn" title="Ondalık artır" onClick={() => apply((b) => styleRange(b, si, range, { d: Math.min(6, (activeStyle.d ?? 0) + 1) }))}>.00</button>
          <span className="tb-sep" />
          <span className="swatches" title="Yazı rengi">A{TEXT_COLORS.map((c) => <button key={c || "x"} type="button" style={{ background: c || "transparent" }} className={!c ? "is-none" : ""} onClick={() => apply((b) => styleRange(b, si, range, { c: c || null }))} />)}</span>
          <span className="swatches" title="Dolgu rengi"><Icon name="palette" size={14} />{FILL_COLORS.map((c) => <button key={c || "x"} type="button" style={{ background: c || "transparent" }} className={!c ? "is-none" : ""} onClick={() => apply((b) => styleRange(b, si, range, { bg: c || null }))} />)}</span>
          <span className="tb-sep" />
          <MenuButton icon="sliders" label="Satır ve sütun" items={[
            { label: "Üste satır ekle", onClick: () => insert("row", false) },
            { label: "Alta satır ekle", onClick: () => insert("row", true) },
            { label: "Satırları sil", danger: true, onClick: () => remove("row") },
            "-",
            { label: "Sola sütun ekle", onClick: () => insert("col", false) },
            { label: "Sağa sütun ekle", onClick: () => insert("col", true) },
            { label: "Sütunları sil", danger: true, onClick: () => remove("col") },
            "-",
            { label: "Aşağı doldur (⌘D)", onClick: () => apply((b) => fill(b, si, range, "down")) },
            { label: "Sağa doldur", onClick: () => apply((b) => fill(b, si, range, "right")) },
            { label: sheet.freeze ? "Üst satırı çöz" : "Üst satırı dondur", onClick: () => apply((b) => ({ ...b, sheets: b.sheets.map((s, i) => (i === si ? { ...s, freeze: !s.freeze } : s)) })) },
            { label: "Biçimi temizle", onClick: () => apply((b) => clearRange(b, si, range, { values: false, styles: true })) },
            { label: "+50 satır", onClick: () => grow("row") },
            { label: "+5 sütun", onClick: () => grow("col") },
          ]} />
          <button type="button" className="btn btn--xs" title="Seçili sütuna göre A→Z" onClick={() => sort(true)}>A→Z</button>
          <button type="button" className="btn btn--xs" title="Seçili sütuna göre Z→A" onClick={() => sort(false)}>Z→A</button>
          <button type="button" className="btn btn--xs" onClick={() => setFnOpen(true)}>ƒx İşlevler</button>
        </div>
      )}

      <div className="formula-bar">
        <span className="formula-bar__ref">{rangeLabel(range)}</span>
        <span className="formula-bar__fx">ƒx</span>
        <input value={edit ? edit.value : String(raw(active.row, active.col))} readOnly={readOnly}
          onFocus={() => { if (!edit) startEdit(String(raw(active.row, active.col)), true); }}
          onChange={(e) => setEdit({ row: active.row, col: active.col, value: e.target.value, fromBar: true })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finishEdit({ dr: 1, dc: 0 }); } if (e.key === "Escape") { setEdit(null); gridRef.current?.focus(); } }}
          onBlur={() => edit?.fromBar && finishEdit()} placeholder="Değer ya da =formül (örn. =TOPLA(B2:B10))" />
      </div>

      <div className="grid" ref={gridRef} tabIndex={0} onKeyDown={onKeyDown} onCopy={onCopy} onCut={(e) => onCopy(e, true)} onPaste={onPaste}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft, height: e.currentTarget.clientHeight })}>
        <div className="grid__inner" style={{ width: totalW + HEAD_W, height: (sheet.rows + 1) * ROW_H }}>
          <div className="grid__colhead" style={{ width: totalW + HEAD_W, top: scroll.top }}>
            <div className="grid__corner" style={{ width: HEAD_W, left: scroll.left }} onClick={() => setSel({ a: { row: 0, col: 0 }, b: { row: sheet.rows - 1, col: sheet.cols - 1 } })} />
            {widths.map((w, c) => (
              <div key={c} className={`grid__ch ${c >= range.c1 && c <= range.c2 ? "is-sel" : ""}`} style={{ left: HEAD_W + lefts[c], width: w }}
                onMouseDown={(e) => setSel(e.shiftKey ? { a: sel.a, b: { row: sheet.rows - 1, col: c } } : { a: { row: 0, col: c }, b: { row: sheet.rows - 1, col: c } })}>
                {colName(c)}
                <span className="grid__resize" onMouseDown={(e) => startResize(c, e)} />
              </div>
            ))}
          </div>
          {visibleRows.map((r) => (
            <div key={r} className={`grid__row ${sheet.freeze && r === 0 ? "is-frozen" : ""}`} style={{ top: sheet.freeze && r === 0 ? scroll.top + ROW_H : (r + 1) * ROW_H, width: totalW + HEAD_W }}>
              <div className={`grid__rh ${r >= range.r1 && r <= range.r2 ? "is-sel" : ""}`} style={{ width: HEAD_W, left: scroll.left }}
                onMouseDown={(e) => setSel(e.shiftKey ? { a: sel.a, b: { row: r, col: sheet.cols - 1 } } : { a: { row: r, col: 0 }, b: { row: r, col: sheet.cols - 1 } })}>{r + 1}</div>
              {widths.map((w, c) => {
                const key = addr(c, r);
                const cell = sheet.cells[key];
                const s = cell?.s || {};
                const value = cell && cell.v !== "" ? evaluator.value(si, key) : null;
                const text = value == null ? "" : formatValue(value, s);
                const isActive = active.row === r && active.col === c;
                const align = s.al || (isNumeric(value) && s.f !== "text" ? "right" : typeof value === "boolean" ? "center" : "left");
                return (
                  <div key={c} className={`grid__cell ${inRange(r, c) ? "is-sel" : ""} ${isActive ? "is-active" : ""} ${value && typeof value === "object" && value.code ? "is-err" : ""}`}
                    style={{ left: HEAD_W + lefts[c], width: w, textAlign: align, fontWeight: s.b ? 700 : undefined, fontStyle: s.i ? "italic" : undefined, textDecoration: s.u ? "underline" : undefined, color: s.c, background: s.bg }}
                    onMouseDown={(e) => {
                      if (edit) finishEdit();
                      const p = { row: r, col: c };
                      setSel((cur) => (e.shiftKey ? { a: cur.a, b: p } : { a: p, b: p }));
                      const onMove = (ev) => {
                        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-cell]");
                        if (el) { const [rr, cc] = el.dataset.cell.split(":").map(Number); setSel((cur) => ({ a: cur.a, b: { row: rr, col: cc } })); }
                      };
                      const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                    onDoubleClick={() => startEdit(String(raw(r, c)))}
                    data-cell={`${r}:${c}`} title={value && typeof value === "object" && value.code ? value.message || value.code : undefined}>
                    {edit && edit.row === r && edit.col === c && !edit.fromBar ? (
                      <input autoFocus className="grid__editor" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); finishEdit({ dr: e.shiftKey ? -1 : 1, dc: 0 }); }
                          else if (e.key === "Tab") { e.preventDefault(); finishEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
                          else if (e.key === "Escape") { setEdit(null); gridRef.current?.focus(); }
                        }}
                        onBlur={() => finishEdit()} />
                    ) : text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="sheet-bottom">
        <div className="sheet-tabs">
          {book.sheets.map((s, i) => (
            <SheetTab key={i} name={s.name} active={i === si} readOnly={readOnly} canDelete={book.sheets.length > 1}
              onClick={() => { setSi(i); setSel({ a: { row: 0, col: 0 }, b: { row: 0, col: 0 } }); }}
              onRename={(name) => apply((b) => renameSheet(b, i, name))} onDelete={() => deleteSheet(i)} />
          ))}
          {!readOnly && book.sheets.length < 20 && <button type="button" className="icon-btn" title="Sayfa ekle" onClick={addSheet}><Icon name="plus" /></button>}
        </div>
        <div className="sheet-stats">
          {stats.numbers > 0 && <>
            <span>Toplam <b>{formatValue(stats.sum, { f: "number" })}</b></span>
            <span>Ortalama <b>{formatValue(stats.avg, { f: "number" })}</b></span>
            {stats.numbers > 1 && <><span>Min <b>{formatValue(stats.min, {})}</b></span><span>Maks <b>{formatValue(stats.max, {})}</b></span></>}
          </>}
          {stats.count > 1 && <span>Sayı <b>{stats.count}</b></span>}
        </div>
      </footer>

      {shareOpen && <ShareDialog sheetId={id} shares={meta.shares || []} onClose={() => setShareOpen(false)} onSaved={(shares) => { setMeta((m) => ({ ...m, shares })); setShareOpen(false); }} />}
      {fnOpen && <FunctionHelp onClose={() => setFnOpen(false)} onPick={(fn) => { setFnOpen(false); startEdit(`=${fn}(`, false); }} />}
    </div>
  );
}

function SheetTab({ name, active, readOnly, canDelete, onClick, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  if (editing) {
    return <input className="sheet-tab sheet-tab--edit" autoFocus value={value} maxLength={40} onChange={(e) => setValue(e.target.value)}
      onBlur={() => { setEditing(false); if (value.trim() && value.trim() !== name) onRename(value.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setValue(name); setEditing(false); } }} />;
  }
  return (
    <span className={`sheet-tab ${active ? "is-active" : ""}`}>
      <button type="button" onClick={onClick} onDoubleClick={() => !readOnly && setEditing(true)} title="Yeniden adlandırmak için çift tıklayın">{name}</button>
      {active && !readOnly && canDelete && <button type="button" className="sheet-tab__x" onClick={onDelete} aria-label="Sayfayı sil">×</button>}
    </span>
  );
}

function ShareDialog({ sheetId, shares, onClose, onSaved }) {
  const result = useResult();
  const [list, setList] = useState(shares.map((s) => ({ user_id: s.user_id, role: s.role, name: s.name, city: s.city })));
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => get("/api/tools/sheets/share-candidates", { q: q || undefined }).then((res) => res.ok && setCandidates(res.data?.items || [])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const save = async () => {
    setBusy(true);
    const res = await put(`/api/tools/sheets/${sheetId}/shares`, { shares: list.map(({ user_id, role }) => ({ user_id, role })) });
    setBusy(false);
    if (result(res, "Paylaşım güncellendi; kişilere Yapılacaklar kartı gönderildi.")) onSaved(res.data?.item?.shares || res.data?.shares || list);
  };
  return (
    <Modal title="Tabloyu paylaş" onClose={onClose} width={520} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>Kaydet</button>
    </>}>
      <p className="muted small">Yalnız yönetim paneli kullanıcılarıyla paylaşılabilir. Düzenleyiciler aynı anda çalışabilir; değişiklikler birleştirilir.</p>
      <ul className="share-list">
        {list.map((s) => (
          <li key={s.user_id}>
            <span className="avatar">{(s.name || "?")[0]}</span>
            <span><strong>{s.name}</strong><small className="muted">{s.city}</small></span>
            <select className="select-sm" value={s.role} onChange={(e) => setList(list.map((x) => (x.user_id === s.user_id ? { ...x, role: e.target.value } : x)))}><option value="viewer">Görüntüleyebilir</option><option value="editor">Düzenleyebilir</option></select>
            <button type="button" className="icon-btn" onClick={() => setList(list.filter((x) => x.user_id !== s.user_id))} aria-label="Kaldır"><Icon name="x" /></button>
          </li>
        ))}
        {!list.length && <li className="muted">Henüz kimseyle paylaşılmadı.</li>}
      </ul>
      <Field label="Kişi ekle"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad ya da kullanıcı adı" /></Field>
      <div className="pick-list">
        {candidates.filter((c) => !list.some((s) => s.user_id === c.id)).slice(0, 8).map((c) => (
          <button key={c.id} type="button" onClick={() => setList([...list, { user_id: c.id, role: "viewer", name: c.name, city: c.city }])}>{c.name}<small>{c.city}</small></button>
        ))}
      </div>
    </Modal>
  );
}

function FunctionHelp({ onClose, onPick }) {
  const [q, setQ] = useState("");
  const list = FUNCTION_LIST.filter((f) => !q || `${f.tr} ${f.en} ${f.hint}`.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
  return (
    <Modal title="İşlevler" onClose={onClose} width={560}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İşlev ara (TOPLA, EĞER…)" autoFocus />
      <p className="muted small">Bağımsız değişkenler noktalı virgülle ayrılır: =EĞER(A1&gt;10; "Çok"; "Az"). İngilizce adlar da çalışır (SUM, IF…).</p>
      <ul className="fn-list">{list.map((f) => <li key={f.en}><button type="button" onClick={() => onPick(f.tr)}><strong>{f.tr}</strong><small>{f.en}</small><span>{f.hint}</span></button></li>)}</ul>
    </Modal>
  );
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function sheetHtml(sheet, title, displayOf) {
  const u = usedBounds(sheet);
  const rows = [];
  for (let r = 0; r < u.rows; r += 1) {
    const tds = [];
    for (let c = 0; c < u.cols; c += 1) {
      const s = sheet.cells[addr(c, r)]?.s || {};
      const css = [s.b && "font-weight:bold", s.i && "font-style:italic", s.u && "text-decoration:underline", s.c && `color:${s.c}`, s.bg && `background:${s.bg}`, s.al && `text-align:${s.al}`].filter(Boolean).join(";");
      tds.push(`<td style="${css}">${esc(displayOf(r, c))}</td>`);
    }
    rows.push(`<tr>${tds.join("")}</tr>`);
  }
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:10px -apple-system,Helvetica,Arial,sans-serif;margin:18px}h1{font-size:15px;margin:0 0 8px}
    table{border-collapse:collapse}td{border:1px solid #d4d4d8;padding:3px 6px;white-space:nowrap}
  </style></head><body><h1>${esc(title)} — ${esc(sheet.name)}</h1><table>${rows.join("")}</table></body></html>`;
}

