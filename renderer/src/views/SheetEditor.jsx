// Hesap tablosu düzenleyicisi.
//
// Formül motoru, sayfa işlemleri ve Excel dönüştürücüleri web sitesindekiyle
// aynıdır (lib/sheets, testli). Izgara tuvale çizilir (views/sheets/SheetGrid):
// 20 000 satırda da akıcı kaydırma, yakınlaştırma, dondurulmuş bölmeler,
// birleştirilmiş hücreler, kenarlıklar, koşullu biçim ve süzgeç. Masaüstüne
// özgü: tam klavye kullanımı (Excel kısayolları, ⌘ ve Ctrl), yerel pano
// (Excel / Google E-Tablolar biçimleriyle), Excel/CSV/PDF dosyaları doğrudan
// diske, otomatik kayıt; aynı anda başkası düzenlerse değişiklikler birleştirilir.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Field, Icon, Modal, Spinner, keyLabel, useConfirm, useResult, useToast } from "../components/ui";
import { get, put, request } from "../api";
import { FUNCTION_LIST, addr, colName, createEvaluator, formatValue, isError, isNumeric, parseLiteral, shiftFormula, toCsvText } from "../lib/sheets/sheetEngine";
import {
  addCfRule, applyBorders, blankSheet, blockFromText, blockToText, clearRange, copyBlock, currentRegion, duplicateSheet,
  fill, fillSeries, jumpEdge, mapStyles, mergeCells, mergeWorkbooks, moveSheet, normRange, pasteBlock, rangeLabel, removeCfRules,
  removeDuplicateRows, renameSheet, replaceCells, findCells, setColWidths, setFilter, setFilterCrit, setFrozen, setHidden, setRowHeights,
  setSheetProps, setValidation, shiftAxis, sortRange, styleRange, uniqueSheetName, unmergeCells, usedBounds, workbooksDiffer, writeCells,
} from "../lib/sheets/sheetOps";
import {
  DEF_FONT_PT, DEF_H, contains, createCfEvaluator, expandToMerges, filterValues, filteredRows, getFrozen, inRect, isValidEntry, mergeIndex,
  parseRange, rangeText, selectionStats, styleAt, validationAt, validationItems,
} from "../lib/sheets/sheetModel";
import { sheetLayout } from "../lib/sheets/sheetLayout";
import { blockFromHtml, blockToHtml, styleCss } from "../lib/sheets/clipboard";
import { workbookToXlsx } from "../lib/sheets/xlsxExport";
import ExportButton from "../components/ExportButton";
import { sheetReport } from "../lib/export/reports";
import { markPrintHandled } from "../lib/export/exportRegistry";
import { useCommandGate } from "../workspace/gate";
import { importFile as readSheetFile } from "../lib/sheets/importFile";
import { relativeTime } from "../lib/helpers";
import {
  acceptFunction, autoSumFormula, canPoint, closeParens, colorSegments, cycleAbsolute, functionContext, functionMatches,
  guessSumRange, isFormulaText, pointArrow, pointBase, pointInsert, pointLive, scanRefs, signatureParts, wordAt,
} from "../lib/sheets/formulaEdit";
import SheetGrid, { fontOf, wrapLines } from "./sheets/SheetGrid";
import SheetRibbon from "./sheets/SheetRibbon";
import { CfDialog, FilterMenu, FindPanel, FormatCellsDialog, GoToDialog, ListPicker, SizeDialog, SortDialog, ValidationDialog } from "./sheets/SheetDialogs";
import { ColorGrid, MenuList, Popover, SIcon } from "./sheets/sheetUi";
import "./sheets/sheets.css";

const clone = (o) => JSON.parse(JSON.stringify(o));
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sameSheetName = (a, b) => (a || "").toLocaleLowerCase("tr-TR") === (b || "").toLocaleLowerCase("tr-TR");
const EMPTY = new Set();
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const readZoom = (id) => { try { const z = Number(localStorage.getItem(`sheets.zoom.${id}`)); return z >= 0.25 && z <= 4 ? z : 1; } catch { return 1; } };
const fullRows = (sheet, r) => r.c1 === 0 && r.c2 >= sheet.cols - 1;
const fullCols = (sheet, r) => r.r1 === 0 && r.r2 >= sheet.rows - 1;

let measureCtx = null;
const measure = () => { if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d"); return measureCtx; };

export default function SheetEditor({ id, onClose }) {
  const toast = useToast();
  const result = useResult();
  const confirm = useConfirm();
  const [meta, setMeta] = useState(null);
  const [book, setBook] = useState(null);
  const [si, setSi] = useState(0);
  // a: etkin hücre (çapa), b: seçimin öbür köşesi, extra: ⌘/Ctrl ile eklenen aralıklar
  const [sel, setSelState] = useState({ a: { row: 0, col: 0 }, b: { row: 0, col: 0 }, extra: [] });
  const selRef = useRef(sel);
  const setSel = (next) => { const v = typeof next === "function" ? next(selRef.current) : next; selRef.current = { extra: [], ...v }; setSelState(selRef.current); };
  // { row, col, si, value, caret, fromBar, point } — point: formüle işaretlenen son başvuru (formulaEdit)
  const [edit, setEditState] = useState(null);
  const editRef = useRef(null);
  const setEdit = (next) => { editRef.current = next; setEditState(next); };
  const caretRef = useRef(null);
  const cellInputRef = useRef(null);
  const barInputRef = useRef(null);
  const cellMirrorRef = useRef(null);
  const barMirrorRef = useRef(null);
  const gridRef = useRef(null);
  const [popPos, setPopPos] = useState(null);
  const [suggestOff, setSuggestOff] = useState(null);
  const [fnPick, setFnPick] = useState(0);
  const [saveState, setSaveState] = useState("saved");
  const [title, setTitle] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [fnOpen, setFnOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [zoom, setZoomState] = useState(() => readZoom(id));
  const [clip, setClip] = useState(null);           // { si, rect, cut, block, text }
  const [fillPreview, setFillPreview] = useState(null);
  const [resizePreview, setResizePreview] = useState(null);
  const [dialog, setDialog] = useState(null);       // { kind, ... }
  const [popup, setPopup] = useState(null);         // bağlam menüsü, süzgeç, liste
  const [findState, setFindState] = useState(null); // { mode, status }
  const [painter, setPainter] = useState(null);     // { block, sticky }
  const [showFormulas, setShowFormulas] = useState(false);
  const [, setViewTick] = useState(0);
  const [lastColors, setLastColors] = useState({ fill: "#ffff00", text: "#c00000", border: "bottom" });
  const [, forceHistory] = useState(0);

  const history = useRef({ undo: [], redo: [] });
  const base = useRef(null);
  const version = useRef(null);
  const saveTimer = useRef(null);
  const clipRef = useRef(null);
  const pointRef = useRef(null);
  const painterClick = useRef(0);

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

  const sheet = book?.sheets[si] || book?.sheets[0] || null;
  const evaluator = useMemo(() => (book ? createEvaluator(book) : null), [book]);
  const valueAt = useCallback((r, c) => evaluator.value(si, addr(c, r)), [evaluator, si]);
  const filtered = useMemo(() => (sheet && evaluator ? filteredRows(sheet, valueAt) : EMPTY), [sheet, evaluator, valueAt]);
  const viewSheet = useMemo(() => {
    if (!sheet || !resizePreview) return sheet;
    if (resizePreview.axis === "col") return { ...sheet, colW: { ...(sheet.colW || {}), [colName(resizePreview.index)]: resizePreview.size } };
    return { ...sheet, rowH: { ...(sheet.rowH || {}), [resizePreview.index + 1]: resizePreview.size } };
  }, [sheet, resizePreview]);
  const layout = useMemo(() => (viewSheet ? sheetLayout(viewSheet, filtered) : null), [viewSheet, filtered]);
  const cfEval = useMemo(() => (sheet && evaluator ? createCfEvaluator(sheet, valueAt) : null), [sheet, evaluator, valueAt]);
  const merges = sheet ? mergeIndex(sheet) : null;
  const main = sheet ? expandToMerges(sheet, normRange(sel.a, sel.b)) : { r1: 0, c1: 0, r2: 0, c2: 0 };
  const range = main;
  const ranges = [...(sel.extra || []), main];
  const active = sel.a;
  const rangesKey = ranges.map(rangeText).join(",");
  // Durum çubuğu: seçimdeki görünür hücrelerin özeti (büyük seçimde yalnız dolu hücreler gezilir).
  const stats = useMemo(() => {
    if (!sheet || !evaluator) return selectionStats([]);
    const vals = [];
    const area = ranges.reduce((n, r) => n + (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1), 0);
    const visible = (r, c) => layout.rows.size(r) && layout.cols.size(c);
    if (area > 20000) {
      for (const key of Object.keys(sheet.cells)) {
        const m = /^([A-Z]+)(\d+)$/.exec(key);
        if (!m) continue;
        const r = Number(m[2]) - 1;
        const c = colIndexOf(m[1]);
        if (ranges.some((x) => inRect(x, r, c)) && visible(r, c)) vals.push(evaluator.value(si, key));
      }
    } else {
      for (const x of ranges) for (let r = x.r1; r <= x.r2; r += 1) for (let c = x.c1; c <= x.c2; c += 1) if (sheet.cells[addr(c, r)] && visible(r, c)) vals.push(valueAt(r, c));
    }
    return selectionStats(vals);
  }, [sheet, evaluator, rangesKey, layout, si]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const bookRef = useRef(book);
  bookRef.current = book;
  const commit = useCallback((next, { record = true } = {}) => {
    if (readOnly || !next) return;
    const prev = bookRef.current;
    if (next === prev) return;
    if (record && prev) {
      history.current.undo.push(prev);
      const cells = prev.sheets.reduce((n, s) => n + Object.keys(s.cells).length, 0);
      const limit = cells > 50000 ? 40 : cells > 10000 ? 100 : 300;
      while (history.current.undo.length > limit) history.current.undo.shift();
      history.current.redo = [];
    }
    bookRef.current = next;
    setBook(next);
    forceHistory((n) => n + 1);
    setSaveState("dirty");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 1200);
  }, [readOnly, save]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (bookRef.current && base.current && workbooksDiffer(bookRef.current, base.current)) save(bookRef.current);
  }, [save]);

  // Canlı: 15 sn'de bir sürüm kontrolü; değişiklik yoksa sessizce yenilenir.
  useEffect(() => {
    const t = setInterval(async () => {
      if (saveState !== "saved" || editRef.current) return;
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

  // Sayfa sayısı küçülünce dizin taşmasın.
  useEffect(() => { if (book && si >= book.sheets.length) setSi(book.sheets.length - 1); }, [book, si]);

  /* ------------------------------ yakınlaştırma ------------------------------ */
  const zoomRef = useRef(zoom);
  const setZoom = useCallback((z) => {
    const next = clampN(Math.round(z * 100) / 100, 0.25, 4);
    const el = gridRef.current?.element();
    const ratio = next / zoomRef.current;
    zoomRef.current = next;
    setZoomState(next);
    try { localStorage.setItem(`sheets.zoom.${id}`, String(next)); } catch { /* yoksay */ }
    if (el) requestAnimationFrame(() => { el.scrollTop *= ratio; el.scrollLeft *= ratio; });
  }, [id]);
  const zoomStep = (dir) => {
    const cur = zoomRef.current;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) ?? 4 : [...ZOOMS].reverse().find((z) => z < cur - 0.001) ?? 0.25;
    setZoom(next);
  };
  const wheelAcc = useRef(0);
  const onZoomWheel = (dy) => {
    wheelAcc.current += dy;
    if (Math.abs(wheelAcc.current) < 40) return;
    const dir = wheelAcc.current < 0 ? 1 : -1;
    wheelAcc.current = 0;
    const cur = zoomRef.current;
    setZoom(clampN(Math.round((cur + dir * 0.1) * 10) / 10, 0.25, 4));
  };

  /* ------------------------------ hücre bilgisi ------------------------------ */
  const infoCache = useMemo(() => new Map(), [sheet, evaluator, showFormulas, cfEval]); // eslint-disable-line react-hooks/exhaustive-deps
  const cellInfo = (r, c) => {
    const k = r * 1024 + c;
    if (infoCache.has(k)) return infoCache.get(k);
    if (infoCache.size > 30000) infoCache.clear();
    const key = addr(c, r);
    const cell = sheet.cells[key];
    const s0 = styleAt(sheet, r, c);
    const cf = cfEval && !cfEval.empty ? cfEval.at(r, c) : null;
    const hasStyle = s0 && Object.keys(s0).length > 0;
    if (!cell && !hasStyle && !cf) { infoCache.set(k, null); return null; }
    const raw = cell?.v ?? "";
    const value = raw !== "" ? evaluator.value(si, key) : null;
    const s = cf?.style ? { ...s0, ...cf.style } : s0;
    const formulaShown = showFormulas && isFormulaText(raw);
    const text = formulaShown ? raw : value == null ? "" : formatValue(value, s);
    const numeric = !formulaShown && isNumeric(value) && s.f !== "text";
    const error = isError(value);
    const align = s.al || (formulaShown ? "left" : numeric ? "right" : typeof value === "boolean" || error ? "center" : "left");
    const info = { text, s, bg: s.bg, color: s.c, align, numeric, error, bar: cf?.bar, border: Boolean(s.bd) };
    infoCache.set(k, info);
    return info;
  };
  const borderAt = (r, c) => cellInfo(r, c)?.s?.bd || null;
  const hasValue = (r, c) => (sheet.cells[addr(c, r)]?.v ?? "") !== "";
  const raw = (row, col) => sheet?.cells[addr(col, row)]?.v ?? "";
  const displayOf = (row, col, sh = sheet, idx = si) => {
    const key = addr(col, row);
    const cell = sh.cells[key];
    if (!cell || cell.v === "") return "";
    return formatValue(evaluator.value(idx, key), styleAt(sh, row, col));
  };

  /* ------------------------------ düzenleme ------------------------------ */
  const anchorOf = (r, c) => { const m = merges?.at(r, c); return m ? { row: m.r1, col: m.c1 } : { row: r, col: c }; };
  const activeInput = () => (editRef.current?.fromBar ? barInputRef.current : cellInputRef.current);
  const caretNow = () => {
    const ed = editRef.current;
    const input = activeInput();
    if (input && document.activeElement === input && input.selectionStart != null) return input.selectionStart;
    return ed?.caret ?? ed?.value?.length ?? 0;
  };
  const updateEdit = (patch, caret = null) => {
    if (!editRef.current) return;
    const next = { ...editRef.current, ...patch };
    if (caret != null) { next.caret = caret; caretRef.current = caret; }
    setEdit(next);
  };
  useLayoutEffect(() => {
    if (caretRef.current == null || !edit) return;
    const input = edit.fromBar ? barInputRef.current : cellInputRef.current;
    if (!input) return;
    const pos = Math.min(caretRef.current, input.value.length);
    caretRef.current = null;
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    input.setSelectionRange(pos, pos);
  });

  const startEdit = (value, fromBar = false, { caret = null, point = null } = {}) => {
    if (readOnly) return;
    const at = anchorOf(active.row, active.col);
    const pos = caret ?? value.length;
    caretRef.current = pos;
    setEdit({ row: at.row, col: at.col, si, value, caret: pos, fromBar, point: point ? { ...point, si } : null, typed: !fromBar && caret == null && value.length === 1 });
  };

  const autoStyle = (value, current) => {
    // Excel gibi: "%15" → yüzde, "1.250 ₺" → para biçimi (biçim yoksa).
    if (current?.f || isFormulaText(value)) return null;
    const t = String(value).trim();
    if (/^%|%$/.test(t) && typeof parseLiteral(t) === "number") return { f: "percent" };
    if (/₺|\bTL$/i.test(t) && typeof parseLiteral(t) === "number") return { f: "money" };
    if (/^\d{1,2}:\d{2}$/.test(t)) return { f: "time" };
    return null;
  };

  const finishEdit = (move = null, { fillAll = false } = {}) => {
    const ed = editRef.current;
    if (!ed) return true;
    const target = ed.si ?? si;
    const current = bookRef.current;
    const sh = current.sheets[target];
    const key = addr(ed.col, ed.row);
    let value = isFormulaText(ed.value) ? closeParens(ed.value) : ed.value;
    if (/^\d{1,2}:\d{2}$/.test(value.trim())) {
      // Saat girişi: seri gün kesri olarak saklanır.
      const [h, m] = value.trim().split(":").map(Number);
      value = String(Math.round(((h * 60 + m) / 1440) * 1e10) / 1e10).replace(".", ",");
      if (!sh.cells[key]?.s?.f) {
        commit(writeCells(current, target, { [key]: { v: value, s: { ...(sh.cells[key]?.s || {}), f: "time" } } }));
        setEdit(null);
        if (move) moveBy(move.dr, move.dc, false);
        gridRef.current?.focus();
        return true;
      }
    }
    const rule = validationAt(sh, ed.row, ed.col);
    if (rule && !isValidEntry(rule, sh, (r, c) => evaluator.value(target, addr(c, r)), value)) {
      toast("Bu değer veri doğrulama listesinde yok. Listeden bir değer seçin.", { tone: "error" });
      return false;
    }
    setEdit(null);
    const auto = autoStyle(ed.value, sh.cells[key]?.s);
    const wrapNeeded = value.includes("\n") && !styleAt(sh, ed.row, ed.col).wr;
    let next = current;
    if (fillAll) {
      const updates = {};
      for (const r of ranges) {
        for (let rr = r.r1; rr <= r.r2; rr += 1) for (let cc = r.c1; cc <= r.c2; cc += 1) {
          updates[addr(cc, rr)] = { v: isFormulaText(value) ? shiftFormulaSafe(value, rr - ed.row, cc - ed.col) : value };
        }
      }
      next = writeCells(next, target, updates);
    } else if ((sh.cells[key]?.v ?? "") !== value) next = writeCells(next, target, { [key]: { v: value } });
    if (auto || wrapNeeded) next = writeCells(next, target, { [key]: { s: { ...(next.sheets[target].cells[key]?.s || {}), ...(auto || {}), ...(wrapNeeded ? { wr: true } : {}) } } });
    if (wrapNeeded) next = autofitRowsIn(next, target, [ed.row]);
    if (next !== current) commit(next);
    if (target !== si) setSi(target);
    if (move) moveBy(move.dr, move.dc, false);
    gridRef.current?.focus();
    return true;
  };
  const cancelEdit = () => {
    const ed = editRef.current;
    setEdit(null);
    if (ed && ed.si != null && ed.si !== si) setSi(ed.si);
    gridRef.current?.focus();
  };
  const onEditBlur = () => setTimeout(() => {
    if (editRef.current && document.activeElement !== cellInputRef.current && document.activeElement !== barInputRef.current && !pointRef.current) finishEdit();
  }, 120);

  const pointingNow = () => {
    const ed = editRef.current;
    return Boolean(ed && isFormulaText(ed.value) && canPoint(ed.value, caretNow(), ed.point));
  };

  /** Fareyle işaretleme: tıklanan başvuru formüle eklenir (⇧: aralık, ⌘/Ctrl: yeni başvuru). */
  const startPoint = (pos, kind, { add = false, extend = false } = {}) => {
    const ed = editRef.current;
    if (!ed || !isFormulaText(ed.value)) return false;
    const caret = caretNow();
    const sheetName = si !== ed.si ? sheet.name : null;
    let res = null;
    let anchor = pos;
    if (extend) {
      const b = pointBase(ed.value, caret, ed.point);
      if (b && b.kind === kind && sameSheetName(b.sheet, sheetName)) {
        anchor = b.anchor;
        res = pointInsert(ed.value, caret, b, { anchor, focus: pos, kind, sheet: sheetName });
      }
    }
    if (!res && (add || canPoint(ed.value, caret, ed.point))) {
      res = pointInsert(ed.value, caret, add ? null : ed.point, { anchor: pos, focus: pos, kind, sheet: sheetName, add });
    }
    if (!res) return false;
    updateEdit({ value: res.text, point: { ...res.point, si } }, res.caret);
    pointRef.current = { kind, anchor };
    return true;
  };
  const pointMove = (at) => {
    const pr = pointRef.current;
    const cur = editRef.current;
    if (!pr || !cur?.point) return;
    const focus = pr.kind === "col" ? { row: 0, col: at.col } : pr.kind === "row" ? { row: at.row, col: 0 } : at;
    if (cur.point.focus.row === focus.row && cur.point.focus.col === focus.col) return;
    const step = pointInsert(cur.value, cur.point.span.end, cur.point, { anchor: pr.anchor, focus, kind: pr.kind, sheet: cur.point.sheet });
    updateEdit({ value: step.text, point: { ...step.point, si: cur.point.si } }, step.caret);
  };
  const pointEnd = () => {
    pointRef.current = null;
    const input = activeInput();
    if (input && document.activeElement !== input) { input.focus({ preventScroll: true }); const c = editRef.current?.caret; if (c != null) input.setSelectionRange(c, c); }
  };

  const reveal = (row, col) => gridRef.current?.reveal(row, col);

  const onEditKey = (e) => {
    e.stopPropagation();
    const ed = editRef.current;
    if (!ed) return;
    if (fnSuggestions.length && (e.key === "Tab" || e.key === "Enter") && !e.altKey) {
      e.preventDefault();
      acceptFn(fnSuggestions[fnPick] || fnSuggestions[0]);
      return;
    }
    if (fnSuggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setFnPick((p) => clampN(p + (e.key === "ArrowDown" ? 1 : -1), 0, fnSuggestions.length - 1));
      return;
    }
    if (fnSuggestions.length && e.key === "Escape") { e.preventDefault(); setSuggestOff(ed.value); return; }
    const caret = caretNow();
    if (e.key === "F4" && isFormulaText(ed.value)) {
      e.preventDefault();
      const res = cycleAbsolute(ed.value, caret);
      if (!res) return;
      const live = pointLive(ed.value, caret, ed.point) && ed.point.span.start === res.start;
      updateEdit({ value: res.text, point: live ? { ...ed.point, span: { start: res.start, end: res.end }, text: res.text } : null }, res.caret);
      return;
    }
    if (e.key === "Enter" && e.altKey) {
      // Alt+Enter: hücre içinde yeni satır.
      e.preventDefault();
      const input = activeInput();
      const start = input?.selectionStart ?? caret;
      const end = input?.selectionEnd ?? caret;
      updateEdit({ value: `${ed.value.slice(0, start)}\n${ed.value.slice(end)}`, point: null }, start + 1);
      return;
    }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key] && isFormulaText(ed.value) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const [dr, dc] = arrows[e.key];
      const otherSheet = si !== ed.si;
      const res = pointArrow(ed.value, caret, ed.point && ed.point.si === si ? ed.point : null, {
        origin: otherSheet ? { row: 0, col: 0 } : { row: ed.row, col: ed.col },
        dr: otherSheet && !ed.point ? 0 : dr,
        dc: otherSheet && !ed.point ? 0 : dc,
        extend: e.shiftKey,
        bounds: { rows: sheet.rows, cols: sheet.cols },
        sheet: otherSheet ? sheet.name : null,
      });
      if (res) {
        e.preventDefault();
        updateEdit({ value: res.text, point: { ...res.point, si } }, res.caret);
        reveal(res.point.focus.row, res.point.focus.col);
        return;
      }
    }
    // Hücreye doğrudan yazmaya başlandıysa oklar düzenlemeyi bitirip hareket eder (Excel "Gir" kipi).
    if (arrows[e.key] && ed.typed && !ed.fromBar && !isFormulaText(ed.value) && !e.shiftKey) {
      e.preventDefault();
      finishEdit({ dr: arrows[e.key][0], dc: arrows[e.key][1] });
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); finishEdit({ dr: e.shiftKey ? -1 : 1, dc: 0 }, { fillAll: e.ctrlKey || e.metaKey }); }
    else if (e.key === "Tab") { e.preventDefault(); finishEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  };
  const onEditChange = (e, fromBar) => {
    const b = editRef.current || { row: anchorOf(active.row, active.col).row, col: anchorOf(active.row, active.col).col, si, point: null };
    setEdit({ ...b, fromBar, value: e.target.value, caret: e.target.selectionStart ?? e.target.value.length });
  };
  const onEditSelect = (e) => {
    const ed = editRef.current;
    const pos = e.target.selectionStart;
    if (ed && pos != null && pos !== ed.caret && e.target === activeInput()) setEdit({ ...ed, caret: pos });
  };

  const editCaret = edit ? Math.min(edit.caret ?? edit.value.length, edit.value.length) : 0;
  const fnWord = (edit && isFormulaText(edit.value) && suggestOff !== edit.value ? wordAt(edit.value, editCaret)?.word : "") || "";
  const fnSuggestions = useMemo(() => functionMatches(fnWord, 8), [fnWord]);
  useEffect(() => { setFnPick(0); }, [fnWord]);
  const acceptFn = (fn) => {
    const ed = editRef.current;
    const info = ed && wordAt(ed.value, caretNow());
    if (!fn || !info) return;
    const res = acceptFunction(ed.value, caretNow(), info.start, fn.insert || fn.tr);
    updateEdit({ value: res.text, point: null }, res.caret);
  };
  const fnContext = edit && isFormulaText(edit.value) ? functionContext(edit.value, editCaret) : null;
  const editRefs = useMemo(() => (edit && isFormulaText(edit.value) ? scanRefs(edit.value) : []), [edit]);
  const editSegments = editRefs.length ? colorSegments(edit.value, editRefs) : null;
  const syncMirror = (e) => {
    const mirror = e.target === barInputRef.current ? barMirrorRef.current : cellMirrorRef.current;
    if (mirror) { mirror.scrollLeft = e.target.scrollLeft; mirror.scrollTop = e.target.scrollTop; }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const input = edit ? activeInput() : null;
    if (!input) { if (popPos) setPopPos(null); return; }
    const r = input.getBoundingClientRect();
    const up = r.bottom + 240 > window.innerHeight && r.top > 240;
    const next = { left: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 480))), top: Math.round(up ? r.top - 4 : r.bottom + 4), up };
    if (!popPos || popPos.left !== next.left || popPos.top !== next.top || popPos.up !== next.up) setPopPos(next);
  });

  /* ------------------------------- işlemler ------------------------------- */
  const apply = (fn) => { if (!readOnly && book) commit(fn(bookRef.current)); };
  const eachRange = (fn) => apply((b) => ranges.reduce((acc, r) => fn(acc, r), b));
  const activeStyle = sheet ? styleAt(sheet, anchorOf(active.row, active.col).row, anchorOf(active.row, active.col).col) : {};
  const setStyle = (patch) => eachRange((b, r) => styleRange(b, si, r, patch));
  const toggleStyle = (k) => {
    const on = !activeStyle[k];
    eachRange((b, r) => styleRange(b, si, r, { [k]: on }));
    if (k === "wr" && on) apply((b) => autofitRowsIn(b, si, rowsOf(ranges)));
  };
  const rowsOf = (list) => { const out = []; for (const r of list) for (let i = r.r1; i <= Math.min(r.r2, r.r1 + 500); i += 1) out.push(i); return out; };

  /** Otomatik toplam: seçimin altına ya da üstteki/soldaki sayılara işlev. */
  const autoSum = (fn = "TOPLA") => {
    if (readOnly || !sheet) return;
    if (range.r2 > range.r1 || range.c2 > range.c1) {
      const vertical = range.r2 > range.r1;
      const updates = {};
      if (vertical) {
        const row = range.r2 + 1;
        if (row >= sheet.rows) return;
        for (let c = range.c1; c <= range.c2; c += 1) updates[addr(c, row)] = { v: `=${fn}(${addr(c, range.r1)}:${addr(c, range.r2)})` };
        commit(writeCells(book, si, updates));
        setSel({ a: { row, col: range.c1 }, b: { row, col: range.c2 } });
      } else {
        const col = range.c2 + 1;
        if (col >= sheet.cols) return;
        updates[addr(col, range.r1)] = { v: `=${fn}(${addr(range.c1, range.r1)}:${addr(range.c2, range.r1)})` };
        commit(writeCells(book, si, updates));
        setSel({ a: { row: range.r1, col }, b: { row: range.r1, col } });
      }
      return;
    }
    const isNum = (r, c) => Boolean(sheet.cells[addr(c, r)]) && isNumeric(evaluator.value(si, addr(c, r)));
    const res = autoSumFormula(guessSumRange(isNum, active.row, active.col));
    const text = fn === "TOPLA" ? res.text : res.text.replace(/^=TOPLA\(/, `=${fn}(`);
    const shift = fn.length - 5;
    startEdit(text, false, { caret: res.caret + shift, point: res.point ? { ...res.point, span: { start: res.point.span.start + shift, end: res.point.span.end + shift }, text } : null });
  };

  /** Hareket: gizli satır/sütunları ve birleştirmeleri atlar. */
  const stepFrom = (pos, dr, dc) => {
    let { row, col } = pos;
    const m = merges.at(row, col);
    if (m) { if (dr > 0) row = m.r2; if (dc > 0) col = m.c2; if (dr < 0) row = m.r1; if (dc < 0) col = m.c1; }
    let nr = row + dr;
    let nc = col + dc;
    while (nr >= 0 && nr < sheet.rows && dr && !layout.rows.size(nr)) nr += dr;
    while (nc >= 0 && nc < sheet.cols && dc && !layout.cols.size(nc)) nc += dc;
    if (nr < 0 || nr >= sheet.rows) nr = row;
    if (nc < 0 || nc >= sheet.cols) nc = col;
    const mm = merges.at(nr, nc);
    return mm && !(dr === 0 && dc === 0) ? { row: dr > 0 || dc !== 0 ? (dr > 0 ? mm.r1 : mm.r1) : mm.r1, col: mm.c1 } : { row: nr, col: nc };
  };
  const moveBy = (dr, dc, extend) => {
    setSel((s) => {
      if (extend) {
        const nb = { row: clampN(s.b.row + dr, 0, sheet.rows - 1), col: clampN(s.b.col + dc, 0, sheet.cols - 1) };
        let { row, col } = nb;
        while (dr && row > 0 && row < sheet.rows - 1 && !layout.rows.size(row)) row += dr;
        while (dc && col > 0 && col < sheet.cols - 1 && !layout.cols.size(col)) col += dc;
        return { a: s.a, b: { row, col }, extra: [] };
      }
      const nb = stepFrom(s.a, dr, dc);
      return { a: nb, b: nb, extra: [] };
    });
  };
  const moveTo = (pos, extend = false) => setSel((s) => (extend ? { a: s.a, b: pos, extra: [] } : { a: pos, b: pos, extra: [] }));
  // Seçim değişince görünür kalsın.
  useEffect(() => { if (sheet && !editRef.current) reveal(sel.b.row, sel.b.col); }, [sel.b.row, sel.b.col, si]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ pano ------------------------------ */
  const blockText = (block) => blockToText({ rows: block.rows.map((row, i) => row.map((c, j) => ({ v: displayOf(range.r1 + i, range.c1 + j) }))) });
  const writeClipboard = (e, cut) => {
    const block = copyBlock(sheet, range, valueAt);
    const text = range.r1 === range.r2 && range.c1 === range.c2 ? String(displayOf(range.r1, range.c1)) : blockText(block);
    const widths = Array.from({ length: range.c2 - range.c1 + 1 }, (_, j) => layout.cols.size(range.c1 + j));
    const html = blockToHtml(block, (i, j) => displayOf(range.r1 + i, range.c1 + j), { widths });
    if (e?.clipboardData) {
      e.clipboardData.setData("text/plain", text);
      e.clipboardData.setData("text/html", html);
    } else {
      try {
        navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]).catch(() => navigator.clipboard.writeText(text));
      } catch { navigator.clipboard?.writeText(text); }
    }
    clipRef.current = { block, text, si, rect: range, cut };
    setClip({ si, rect: range, cut });
  };
  const onCopy = (e, cut = false) => {
    if (editRef.current || !sheet) return;
    e.preventDefault();
    if (cut && readOnly) return;
    writeClipboard(e, cut);
  };
  const pasteModeRef = useRef(null);
  const pasteData = ({ text = "", html = "" }, mode = "all") => {
    if (readOnly || !sheet) return;
    const internal = clipRef.current && (clipRef.current.text === text || (!text && !html));
    let block = internal ? clipRef.current.block : (blockFromHtml(html) || blockFromText(text));
    if (!block || !block.rows.length) return;
    if (!internal) {
      // Dışarıdan gelen "=" ile başlayan metin formül sayılır (Excel gibi); diğer her şey olduğu gibi.
      block = { ...block, rows: block.rows.map((row) => row.map((c) => ({ ...c }))) };
    }
    const transpose = mode === "transpose";
    const h = transpose ? block.rows[0].length : block.rows.length;
    const w = transpose ? block.rows.length : block.rows[0].length;
    const single = range.r1 === range.r2 && range.c1 === range.c2;
    const target = single ? { r1: range.r1, c1: range.c1, r2: Math.min(sheet.rows - 1, range.r1 + h - 1), c2: Math.min(sheet.cols - 1, range.c1 + w - 1) } : range;
    let next = pasteBlock(bookRef.current, si, target, block, { mode: transpose ? "all" : mode, transpose });
    // Kesilen kaynak taşınır: hedefle çakışmayan kaynak hücreleri temizlenir.
    const cut = internal && clipRef.current.cut;
    if (cut) {
      const src = clipRef.current.rect;
      const srcSi = clipRef.current.si;
      const updates = {};
      for (let r = src.r1; r <= src.r2; r += 1) for (let c = src.c1; c <= src.c2; c += 1) {
        if (srcSi === si && inRect(target, r, c)) continue;
        updates[addr(c, r)] = { v: "", s: null };
      }
      next = writeCells(next, srcSi, updates);
      if (srcSi === si) next = unmergeCells(next, si, src);
      clipRef.current = null;
      setClip(null);
    }
    commit(next);
    if (single) setSel({ a: { row: target.r1, col: target.c1 }, b: { row: target.r2, col: target.c2 } });
  };
  const onPaste = (e) => {
    if (editRef.current || readOnly || !sheet) return;
    e.preventDefault();
    const mode = pasteModeRef.current || "all";
    pasteModeRef.current = null;
    pasteData({ text: e.clipboardData.getData("text/plain"), html: e.clipboardData.getData("text/html") }, mode);
  };
  /** Şerit / bağlam menüsünden yapıştırma: pano doğrudan okunur. */
  const pasteFromClipboard = async (mode = "all") => {
    try {
      let text = "";
      let html = "";
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
          if (item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
        }
      } else text = await navigator.clipboard.readText();
      pasteData({ text, html }, mode);
    } catch {
      if (clipRef.current) pasteData({ text: clipRef.current.text }, mode);
      else toast(keyLabel("Pano okunamadı; ⌘V ile yapıştırın."), { tone: "warn" });
    }
    gridRef.current?.focus();
  };
  const copyNow = (cut = false) => { if (sheet) { writeClipboard(null, cut); gridRef.current?.focus(); } };

  /* ---------------------------- satır / sütun ---------------------------- */
  const insert = (axis, after) => apply((b) => shiftAxis(b, si, axis, (axis === "row" ? (after ? range.r2 + 1 : range.r1) : (after ? range.c2 + 1 : range.c1)), axis === "row" ? range.r2 - range.r1 + 1 : range.c2 - range.c1 + 1));
  const remove = (axis) => {
    apply((b) => shiftAxis(b, si, axis, axis === "row" ? range.r1 : range.c1, -(axis === "row" ? range.r2 - range.r1 + 1 : range.c2 - range.c1 + 1)));
    setSel({ a: { row: range.r1, col: range.c1 }, b: { row: range.r1, col: range.c1 } });
  };
  const insertSmart = () => {
    if (fullRows(sheet, range)) insert("row", false);
    else if (fullCols(sheet, range)) insert("col", false);
    else openMenuAtActive([{ label: "Üste satır ekle", icon: "insertRow", onClick: () => insert("row", false) }, { label: "Sola sütun ekle", icon: "insertCol", onClick: () => insert("col", false) }]);
  };
  const removeSmart = () => {
    if (fullRows(sheet, range)) remove("row");
    else if (fullCols(sheet, range)) remove("col");
    else openMenuAtActive([{ label: "Satırları sil", icon: "deleteRow", onClick: () => remove("row") }, { label: "Sütunları sil", icon: "deleteCol", onClick: () => remove("col") }]);
  };
  const openMenuAtActive = (items) => {
    const r = gridRef.current?.clientRectOf(main);
    if (r) setPopup({ kind: "menu", anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, items });
  };

  const guessHeader = (rect) => {
    if (rect.r2 <= rect.r1) return false;
    let textTop = 0;
    let boldTop = 0;
    let numBelow = 0;
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const top = valueAt(rect.r1, c);
      if (typeof top === "string" && top !== "") textTop += 1;
      if (styleAt(sheet, rect.r1, c).b) boldTop += 1;
      if (isNumeric(valueAt(rect.r1 + 1, c)) && typeof top === "string") numBelow += 1;
    }
    const width = rect.c2 - rect.c1 + 1;
    return boldTop >= Math.ceil(width / 2) || numBelow > 0 || (textTop === width && width > 1 && boldTop > 0);
  };
  const sortTarget = () => {
    const fr = sheet.filter ? parseRange(sheet.filter.ref) : null;
    if (fr && inRect(fr, active.row, active.col)) return { rect: fr, header: true };
    if (range.r1 === range.r2 && range.c1 === range.c2) {
      const reg = currentRegion(sheet, active.row, active.col);
      return { rect: reg, header: guessHeader(reg) };
    }
    return { rect: range, header: false };
  };
  const sort = (asc, col = active.col, target = null) => {
    const t = target || sortTarget();
    if (mergeIndex(sheet).list.some((m) => contains(t.rect, m) && (m.r2 > m.r1))) { toast("Birleştirilmiş hücre içeren aralık sıralanamaz.", { tone: "error" }); return; }
    apply((b) => sortRange(b, si, t.rect, col, asc, (key) => evaluator.value(si, key), { header: t.header }));
  };
  const sortCustom = (keys, header) => {
    const t = sortTarget();
    apply((b) => sortRange(b, si, t.rect, keys[0].col, keys[0].asc, (key) => evaluator.value(si, key), { header, keys }));
  };
  const toggleFilter = () => {
    if (sheet.filter) { apply((b) => setFilter(b, si, null)); return; }
    let rect = range.r1 === range.r2 && range.c1 === range.c2 ? currentRegion(sheet, active.row, active.col) : range;
    if (fullCols(sheet, rect)) rect = { ...rect, r2: Math.max(rect.r1 + 1, usedBounds(sheet).rows - 1) };
    if (rect.r2 === rect.r1) rect = { ...rect, r2: Math.min(sheet.rows - 1, rect.r1 + 1) };
    apply((b) => setFilter(b, si, rect));
  };
  const filterActive = Boolean(sheet?.filter && Object.keys(sheet.filter.crit || {}).length);
  const clearFilter = () => apply((b) => setSheetProps(b, si, { filter: { ...b.sheets[si].filter, crit: {} } }));

  const autofitCol = (b, sIdx, cols) => {
    const sh = b.sheets[sIdx];
    const ctx = measure();
    const base = getComputedStyle(document.documentElement).getPropertyValue("--font") || "system-ui";
    const widths = new Map();
    for (const [key, cell] of Object.entries(sh.cells)) {
      if ((cell.v ?? "") === "") continue;
      const m = /^([A-Z]+)(\d+)$/.exec(key);
      const c = colIndexOf(m[1]);
      if (!cols.includes(c)) continue;
      const r = Number(m[2]) - 1;
      if (mergeIndex(sh).at(r, c)) continue;
      const s = styleAt(sh, r, c);
      if (s.wr) continue;
      ctx.font = fontOf(s, 1, base).css;
      const text = sIdx === si ? displayOf(r, c, sh, sIdx) : String(cell.v);
      const w = Math.max(...String(text).split("\n").map((t) => ctx.measureText(t).width)) + 12 + (s.ind ? s.ind * 9 : 0) + (sh.filter && parseRange(sh.filter.ref)?.r1 === r ? 18 : 0);
      widths.set(c, Math.max(widths.get(c) || 0, w));
    }
    let next = b;
    for (const c of cols) next = setColWidths(next, sIdx, [c], widths.has(c) ? Math.max(24, Math.ceil(widths.get(c))) : null);
    return next;
  };
  function autofitRowsIn(b, sIdx, rows) {
    const sh = b.sheets[sIdx];
    const ctx = measure();
    const base = getComputedStyle(document.documentElement).getPropertyValue("--font") || "system-ui";
    const lay = sheetLayout(sh);
    const heights = new Map();
    const set = new Set(rows);
    for (const [key, cell] of Object.entries(sh.cells)) {
      const m = /^([A-Z]+)(\d+)$/.exec(key);
      const r = Number(m[2]) - 1;
      if (!set.has(r)) continue;
      const c = colIndexOf(m[1]);
      const s = styleAt(sh, r, c);
      const font = fontOf(s, 1, base);
      let h = font.px * 1.22 + 7;
      if ((cell.v ?? "") !== "" && (s.wr || String(cell.v).includes("\n"))) {
        ctx.font = font.css;
        const mg = mergeIndex(sh).at(r, c);
        const width = mg ? lay.cols.end(mg.c2) - lay.cols.start(mg.c1) : lay.cols.size(c);
        const text = sIdx === si ? displayOf(r, c, sh, sIdx) : String(cell.v);
        h = wrapLines(ctx, text, Math.max(8, width - 8)).length * font.px * 1.22 + 7;
      }
      heights.set(r, Math.max(heights.get(r) || 0, h));
    }
    let next = b;
    for (const r of rows) {
      const h = heights.get(r);
      next = setRowHeights(next, sIdx, [r], h && Math.ceil(h) > DEF_H ? Math.ceil(h) : null);
    }
    return next;
  }
  const selectedIndices = (axis, index) => {
    // Seçili tüm satır/sütunlar (başlıktan seçildiyse) — yoksa yalnız verilen.
    const list = [];
    for (const r of ranges) {
      const full = axis === "col" ? fullCols(sheet, r) : fullRows(sheet, r);
      if (!full) continue;
      const lo = axis === "col" ? r.c1 : r.r1;
      const hi = axis === "col" ? r.c2 : r.r2;
      if (index != null && (index < lo || index > hi)) continue;
      for (let i = lo; i <= hi; i += 1) list.push(i);
    }
    return list.length ? list : index != null ? [index] : Array.from({ length: (axis === "col" ? range.c2 - range.c1 : range.r2 - range.r1) + 1 }, (_, i) => (axis === "col" ? range.c1 : range.r1) + i);
  };
  const autofit = (axis, index = null) => {
    const list = selectedIndices(axis, index);
    if (axis === "col") apply((b) => autofitCol(b, si, list));
    else apply((b) => autofitRowsIn(b, si, list));
  };
  const resize = (axis, index, size) => {
    const list = selectedIndices(axis, index);
    apply((b) => (axis === "col" ? setColWidths(b, si, list, size) : setRowHeights(b, si, list, size)));
  };
  const hide = (axis, hidden) => {
    if (hidden) {
      const list = selectedIndices(axis, null);
      apply((b) => setHidden(b, si, axis, list, true));
    } else {
      // Göster: seçimin kapsadığı (ve hemen komşu) gizlileri açar.
      const lo = axis === "col" ? Math.max(0, range.c1 - 1) : Math.max(0, range.r1 - 1);
      const hi = axis === "col" ? range.c2 + 1 : range.r2 + 1;
      const list = [];
      for (let i = lo; i <= hi; i += 1) list.push(i);
      if (axis === "col" && range.c1 === 0 && range.c2 >= sheet.cols - 1) apply((b) => setSheetProps(b, si, { hiddenCols: null }));
      else if (axis === "row" && range.r1 === 0 && range.r2 >= sheet.rows - 1) apply((b) => setSheetProps(b, si, { hiddenRows: null }));
      else apply((b) => setHidden(b, si, axis, list, false));
    }
  };
  const freeze = (r, c) => apply((b) => setFrozen(b, si, r, c));
  const freezeAtCell = () => {
    if (active.row === 0 && active.col === 0) { freeze(1, 0); return; }
    freeze(active.row, active.col);
  };

  const decimals = (delta) => eachRange((b, r) => mapStyles(b, si, r, (eff, own) => {
    const f = eff.f || "general";
    const cur = eff.d ?? (f === "money" || f === "number" || f === "sci" ? 2 : f === "percent" ? 0 : null);
    let d = cur;
    if (d == null) {
      // Genel biçimde mevcut ondalık sayısından başla.
      const v = valueAt(r.r1, r.c1);
      const t = typeof v === "number" ? String(v) : "";
      d = t.includes(".") ? t.split(".")[1].length : 0;
    }
    const next = clampN(d + delta, 0, 10);
    return { ...own, d: next };
  }));
  const thousands = () => {
    const on = !((activeStyle.f === "number" || activeStyle.f === "money") && !activeStyle.ng);
    setStyle(on ? { f: activeStyle.f === "money" ? "money" : "number", ng: null, ...(activeStyle.d == null ? { d: 0 } : {}) } : { ng: true });
  };
  const growFont = (dir) => {
    const sizes = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
    const cur = activeStyle.fs || DEF_FONT_PT;
    const next = dir > 0 ? sizes.find((x) => x > cur) ?? cur : [...sizes].reverse().find((x) => x < cur) ?? cur;
    setStyle({ fs: next === DEF_FONT_PT ? null : next });
  };
  const indent = (dir) => eachRange((b, r) => mapStyles(b, si, r, (eff, own) => {
    const ind = clampN((eff.ind || 0) + dir, 0, 15);
    const out = { ...own, ...(ind ? { ind } : {}) };
    if (!ind) delete out.ind;
    if (ind && !eff.al) out.al = "left";
    return out;
  }));
  const merge = (mode) => {
    const big = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (big < 2) return;
    let filledCount = 0;
    for (let r = range.r1; r <= range.r2 && filledCount < 2; r += 1) for (let c = range.c1; c <= range.c2; c += 1) if (hasValue(r, c)) filledCount += 1;
    const go = () => { apply((b) => mergeCells(b, si, range, mode)); setSel({ a: { row: range.r1, col: range.c1 }, b: { row: range.r2, col: range.c2 } }); };
    if (filledCount > 1 && mode !== "across") {
      confirm({ title: "Hücreleri birleştir", message: "Birleştirme yalnız sol üstteki değeri tutar; diğer değerler silinir.", confirmLabel: "Birleştir" }).then((ok) => { if (ok) go(); });
    } else go();
  };
  const unmerge = () => apply((b) => unmergeCells(b, si, range));
  const merged = Boolean(merges?.list.some((m) => m.r2 >= range.r1 && m.r1 <= range.r2 && m.c2 >= range.c1 && m.c1 <= range.c2));

  const borders = (mode, spec) => { setLastColors((l) => ({ ...l, border: mode })); eachRange((b, r) => applyBorders(b, si, r, mode, spec)); };
  const fillColor = (c) => { if (c) setLastColors((l) => ({ ...l, fill: c })); setStyle({ bg: c }); };
  const textColor = (c) => { if (c) setLastColors((l) => ({ ...l, text: c })); setStyle({ c }); };
  const clearCmd = (what) => eachRange((b, r) => clearRange(b, si, r, { values: what !== "formats", styles: what !== "contents" }));
  const applyCellStyle = (style) => eachRange((b, r) => styleRange(b, si, r, Object.fromEntries([["b", null], ["i", null], ["c", null], ["bg", null], ["bd", null], ["fs", null], ...Object.entries(style)])));
  const fillCmd = (dir) => {
    if (dir === "down") apply((b) => fill(b, si, range, "down"));
    else if (dir === "right") apply((b) => fill(b, si, range, "right"));
    else if (dir === "series") {
      const vertical = range.r2 > range.r1;
      const src = vertical ? { ...range, r2: range.r1 } : { ...range, c2: range.c1 };
      apply((b) => fillSeries(b, si, src, range, { mode: "series" }));
    }
  };
  const removeDuplicates = () => {
    const t = sortTarget();
    const res = removeDuplicateRows(bookRef.current, si, t.rect, (key) => evaluator.value(si, key), { header: t.header });
    if (!res.removed) { toast("Yinelenen satır bulunamadı.", { tone: "info" }); return; }
    commit(res.book);
    toast(`${res.removed} yinelenen satır kaldırıldı; ${res.kept} benzersiz satır kaldı.`, { tone: "success" });
  };
  const insertFunction = (name) => {
    if (editRef.current && isFormulaText(editRef.current.value)) {
      const ed = editRef.current;
      const caret = caretNow();
      updateEdit({ value: `${ed.value.slice(0, caret)}${name}(${ed.value.slice(caret)}`, point: null }, caret + name.length + 1);
    } else startEdit(`=${name}(`, false);
  };

  /* ---------------------------- biçim boyacısı ---------------------------- */
  // Tek tık: bir kez uygula; hızlı ikinci tık: kilitli (Esc ile biter).
  const startPainter = () => {
    const now = Date.now();
    const quick = now - painterClick.current < 450;
    painterClick.current = now;
    if (painter && quick) { setPainter({ ...painter, sticky: true }); return; }
    if (painter) { setPainter(null); return; }
    setPainter({ block: copyBlock(sheet, range), sticky: false });
  };
  const applyPainter = (target) => {
    if (!painter) return;
    apply((b) => pasteBlock(b, si, target, painter.block, { mode: "formats" }));
    if (!painter.sticky) setPainter(null);
  };

  /* ---------------------------- bul / değiştir ---------------------------- */
  const findIndex = useRef(-1);
  const doFind = (q, opts, dir = 1) => {
    const list = findCells(sheet, q, { ...opts, displayOf: (r, c) => displayOf(r, c) });
    if (!list.length) { setFindState((f) => ({ ...f, status: "Eşleşme bulunamadı." })); return null; }
    let i = list.findIndex((p) => p.row > active.row || (p.row === active.row && p.col > active.col));
    if (dir < 0) { i = -1; for (let j = list.length - 1; j >= 0; j -= 1) { const p = list[j]; if (p.row < active.row || (p.row === active.row && p.col < active.col)) { i = j; break; } } if (i < 0) i = list.length - 1; }
    if (i < 0) i = 0;
    findIndex.current = i;
    const p = list[i];
    setSel({ a: p, b: p });
    reveal(p.row, p.col);
    setFindState((f) => ({ ...f, status: `${list.length} eşleşme · ${i + 1}.` }));
    return p;
  };
  const doReplace = (q, r, opts) => {
    const cur = sheet.cells[addr(active.col, active.row)];
    const match = cur && findCells({ cells: { [addr(active.col, active.row)]: cur } }, q, { ...opts, formulas: true }).length;
    if (match) apply((b) => replaceCells(b, si, [active], q, r, opts).book);
    doFind(q, opts, 1);
  };
  const doReplaceAll = (q, r, opts) => {
    const list = findCells(sheet, q, { ...opts, formulas: true });
    const res = replaceCells(bookRef.current, si, list, q, r, opts);
    if (res.count) commit(res.book);
    setFindState((f) => ({ ...f, status: `${res.count} hücre değiştirildi.` }));
  };

  /* ----------------------------- sayfa sekmeleri ----------------------------- */
  const addSheet = () => {
    if (book.sheets.length >= 20) { toast("Bir dosyada en fazla 20 sayfa olabilir.", { tone: "error" }); return; }
    apply((b) => ({ ...b, sheets: [...b.sheets, blankSheet(uniqueSheetName(b))] }));
    setSi(book.sheets.length);
    setSel({ a: { row: 0, col: 0 }, b: { row: 0, col: 0 } });
  };
  const deleteSheet = async (index = si) => {
    if (book.sheets.length < 2) return;
    if (!(await confirm({ title: "Sayfayı sil", message: `“${book.sheets[index].name}” sayfası silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    apply((b) => ({ ...b, sheets: b.sheets.filter((_, i) => i !== index) }));
    setSi(Math.max(0, index - 1));
  };
  const [renaming, setRenaming] = useState(null);
  const switchSheet = (i) => {
    const ed = editRef.current;
    if (ed && isFormulaText(ed.value) && (i === ed.si || pointingNow())) {
      if (i !== si) { updateEdit({ fromBar: true }, caretNow()); setSi(i); }
      return;
    }
    if (ed) finishEdit();
    setSi(i);
    setSel({ a: { row: 0, col: 0 }, b: { row: 0, col: 0 } });
    requestAnimationFrame(() => gridRef.current?.focus());
  };
  const tabMenu = (i, anchor) => setPopup({ kind: "menu", anchor, items: [
    { label: "Yeni sayfa", icon: "plus", onClick: addSheet, disabled: readOnly },
    { label: "Yeniden adlandır", icon: "pencil", onClick: () => setRenaming(i), disabled: readOnly },
    { label: "Çoğalt", icon: "duplicate", onClick: () => { apply((b) => duplicateSheet(b, i)); setSi(i + 1); }, disabled: readOnly || book.sheets.length >= 20 },
    { label: "Sola taşı", icon: "arrowLeft", onClick: () => { apply((b) => moveSheet(b, i, i - 1)); setSi(i - 1); }, disabled: readOnly || i === 0 },
    { label: "Sağa taşı", icon: "arrowRight", onClick: () => { apply((b) => moveSheet(b, i, i + 1)); setSi(i + 1); }, disabled: readOnly || i === book.sheets.length - 1 },
    { label: "Sekme rengi…", icon: "tag", onClick: () => setPopup({ kind: "tabColor", anchor, index: i }), disabled: readOnly },
    "-",
    { label: "Sil", icon: "trash", danger: true, onClick: () => deleteSheet(i), disabled: readOnly || book.sheets.length < 2 },
  ] });

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
    const html = sheetHtml(sheet, title, displayOf, layout);
    if (pdf) window.elitlig.pdf(html, title, { landscape: usedBounds(sheet).cols > 7 });
    else window.elitlig.print(html, title);
  };

  const paneGate = useCommandGate();
  useEffect(() => window.elitlig.onCommand((cmd) => {
    if (!paneGate()) return;
    if (cmd === "export") exportXlsx();
    if (cmd === "print") { markPrintHandled(); printSheet(false); }
    if (cmd === "find") setFindState({ mode: "find", status: "" });
  }));

  /* --------------------------------- klavye --------------------------------- */
  const selectAllSmart = () => {
    const reg = currentRegion(sheet, active.row, active.col);
    const isRegion = reg.r1 === range.r1 && reg.r2 === range.r2 && reg.c1 === range.c1 && reg.c2 === range.c2;
    const hasData = hasValue(active.row, active.col) || reg.r2 > reg.r1 || reg.c2 > reg.c1;
    if (hasData && !isRegion) setSel({ a: { row: reg.r1, col: reg.c1 }, b: { row: reg.r2, col: reg.c2 } });
    else setSel({ a: { row: 0, col: 0 }, b: { row: sheet.rows - 1, col: sheet.cols - 1 } });
  };
  const hiddenAt = (r, c) => !layout.rows.size(r) || !layout.cols.size(c);
  const onKeyDown = (e) => {
    if (!sheet || editRef.current) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    const lower = k.length === 1 ? k.toLocaleLowerCase("tr-TR") : k;
    const code = e.code;
    if (k === "Escape") { if (clip) { setClip(null); clipRef.current = null; } if (painter) setPainter(null); return; }
    if (mod && !e.shiftKey && !e.altKey) {
      if (lower === "b") { e.preventDefault(); toggleStyle("b"); return; }
      if (lower === "i" || lower === "ı") { e.preventDefault(); toggleStyle("i"); return; }
      if (lower === "u" || lower === "ü") { e.preventDefault(); toggleStyle("u"); return; }
      if (code === "Digit5") { e.preventDefault(); toggleStyle("st"); return; }
      if (code === "Digit1") { e.preventDefault(); setDialog({ kind: "format" }); return; }
      if (code === "Digit9") { e.preventDefault(); hide("row", true); return; }
      if (code === "Digit0") { e.preventDefault(); hide("col", true); return; }
      if (lower === "y") { e.preventDefault(); redo(); return; }
      if (lower === "d") { e.preventDefault(); fillCmd("down"); return; }
      if (lower === "h") { e.preventDefault(); if (!readOnly) setFindState({ mode: "replace", status: "" }); return; }
      if (lower === "f") { e.preventDefault(); setFindState({ mode: "find", status: "" }); return; }
      if (lower === "g") { e.preventDefault(); setDialog({ kind: "goto" }); return; }
      if (lower === "a") { e.preventDefault(); selectAllSmart(); return; }
      if (code === "Backquote") { e.preventDefault(); setShowFormulas((v) => !v); return; }
      if (code === "Semicolon" || k === ";" || k === ",") {
        if (k === ";" || code === "Semicolon") { e.preventDefault(); const d = new Date(); apply((b) => writeCells(b, si, { [addr(active.col, active.row)]: { v: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` } })); return; }
      }
      if (k === "-" || code === "Minus" || code === "NumpadSubtract") { e.preventDefault(); if (!readOnly) removeSmart(); return; }
      if (k === "+" || code === "NumpadAdd") { e.preventDefault(); if (!readOnly) insertSmart(); return; }
      if (k === " " || code === "Space") { e.preventDefault(); setSel((s) => ({ a: { row: 0, col: s.a.col }, b: { row: sheet.rows - 1, col: s.b.col } })); return; }
      if (k === "Enter") { e.preventDefault(); return; }
    }
    if (mod && e.shiftKey) {
      if (lower === "v") { e.preventDefault(); pasteFromClipboard("values"); return; }
      if (lower === "l") { e.preventDefault(); if (!readOnly) toggleFilter(); return; }
      if (lower === "t") { e.preventDefault(); autoSum(); return; }
      if (code === "Digit9") { e.preventDefault(); hide("row", false); return; }
      if (code === "Digit0") { e.preventDefault(); hide("col", false); return; }
      if (code === "Digit1") { e.preventDefault(); setStyle({ f: "number", d: 2 }); return; }
      if (code === "Digit3") { e.preventDefault(); setStyle({ f: "date" }); return; }
      if (code === "Digit4") { e.preventDefault(); setStyle({ f: "money" }); return; }
      if (code === "Digit5") { e.preventDefault(); setStyle({ f: "percent" }); return; }
      if (code === "Equal" || k === "+" || k === "=") { e.preventDefault(); if (!readOnly) insertSmart(); return; }
      if (code === "Semicolon" || k === ":" || k === ".") { e.preventDefault(); const d = new Date(); apply((b) => writeCells(b, si, { [addr(active.col, active.row)]: { v: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` } })); return; }
    }
    if (e.altKey && !mod && (code === "Equal" || k === "=")) { e.preventDefault(); autoSum(); return; }
    if (k === "F5") { e.preventDefault(); setDialog({ kind: "goto" }); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc] = arrows[k];
      if (mod) {
        const from = e.shiftKey ? sel.b : sel.a;
        const to = jumpEdge(sheet, from.row, from.col, dr, dc, hiddenAt);
        moveTo(to, e.shiftKey);
        return;
      }
      moveBy(dr, dc, e.shiftKey);
      return;
    }
    if (k === "PageDown" || k === "PageUp") {
      e.preventDefault();
      const n = gridRef.current?.pageRows() || 20;
      if (e.altKey) { moveBy(0, (k === "PageDown" ? 1 : -1) * 8, e.shiftKey); return; }
      moveBy((k === "PageDown" ? 1 : -1) * n, 0, e.shiftKey);
      return;
    }
    if (k === "Home") { e.preventDefault(); moveTo(mod ? { row: getFrozen(sheet).r, col: getFrozen(sheet).c } : { row: (e.shiftKey ? sel.b : sel.a).row, col: 0 }, e.shiftKey); return; }
    if (k === "End" && mod) { e.preventDefault(); const u = usedBounds(sheet); moveTo({ row: Math.max(0, u.rows - 1), col: Math.max(0, u.cols - 1) }, e.shiftKey); return; }
    if (k === "Tab") { e.preventDefault(); moveBy(0, e.shiftKey ? -1 : 1, false); return; }
    if (k === "Enter") { e.preventDefault(); moveBy(e.shiftKey ? -1 : 1, 0, false); return; }
    if (k === " " && e.shiftKey && !mod) { e.preventDefault(); setSel((s) => ({ a: { row: s.a.row, col: 0 }, b: { row: s.b.row, col: sheet.cols - 1 } })); return; }
    if (k === "F2") { e.preventDefault(); const at = anchorOf(active.row, active.col); startEdit(String(raw(at.row, at.col))); return; }
    if (k === "Delete") { e.preventDefault(); clearCmd("contents"); return; }
    if (k === "Backspace") { e.preventDefault(); if (!readOnly) { const at = anchorOf(active.row, active.col); apply((b) => writeCells(b, si, { [addr(at.col, at.row)]: { v: "" } })); startEdit(""); } return; }
    if (k.length === 1 && !mod && !e.altKey) {
      e.preventDefault();
      if (clip) { setClip(null); clipRef.current = clipRef.current?.cut ? null : clipRef.current; }
      startEdit(k);
    }
  };

  /* --------------------------------- fare --------------------------------- */
  const onGridDown = (hit, e) => {
    setPopup(null);
    const mod = e.ctrlKey || e.metaKey;
    if (hit.kind === "corner") {
      if (editRef.current) finishEdit();
      setSel({ a: { row: 0, col: 0 }, b: { row: sheet.rows - 1, col: sheet.cols - 1 } });
      return true;
    }
    if (hit.kind === "colhead") {
      if (editRef.current && startPoint({ row: 0, col: hit.col }, "col", { add: mod, extend: e.shiftKey })) return true;
      if (editRef.current && !finishEdit()) return false;
      if (e.shiftKey) setSel((s) => ({ ...s, a: { row: 0, col: s.a.col }, b: { row: sheet.rows - 1, col: hit.col } }));
      else if (mod) setSel((s) => ({ a: { row: 0, col: hit.col }, b: { row: sheet.rows - 1, col: hit.col }, extra: [...(s.extra || []), expandToMerges(sheet, normRange(s.a, s.b))] }));
      else setSel({ a: { row: 0, col: hit.col }, b: { row: sheet.rows - 1, col: hit.col } });
      return true;
    }
    if (hit.kind === "rowhead") {
      if (editRef.current && startPoint({ row: hit.row, col: 0 }, "row", { add: mod, extend: e.shiftKey })) return true;
      if (editRef.current && !finishEdit()) return false;
      if (e.shiftKey) setSel((s) => ({ ...s, a: { row: s.a.row, col: 0 }, b: { row: hit.row, col: sheet.cols - 1 } }));
      else if (mod) setSel((s) => ({ a: { row: hit.row, col: 0 }, b: { row: hit.row, col: sheet.cols - 1 }, extra: [...(s.extra || []), expandToMerges(sheet, normRange(s.a, s.b))] }));
      else setSel({ a: { row: hit.row, col: 0 }, b: { row: hit.row, col: sheet.cols - 1 } });
      return true;
    }
    if (hit.kind === "fill") return true;
    if (hit.kind === "cell") {
      const p = { row: hit.row, col: hit.col };
      if (editRef.current && startPoint(anchorOf(p.row, p.col), "cell", { add: mod, extend: e.shiftKey })) return true;
      if (editRef.current && !finishEdit()) return false;
      if (e.shiftKey) setSel((s) => ({ ...s, b: p }));
      else if (mod) setSel((s) => ({ a: p, b: p, extra: [...(s.extra || []), expandToMerges(sheet, normRange(s.a, s.b))] }));
      else setSel({ a: p, b: p });
      return true;
    }
    return true;
  };
  const onGridDrag = (kind, pos, d) => {
    if (pointRef.current) { pointMove(pointRef.current.kind === "cell" ? pos : pos); return; }
    if (d.start.kind === "fill" || kind === "fill") {
      const m = main;
      const below = pos.row - m.r2;
      const above = m.r1 - pos.row;
      const right = pos.col - m.c2;
      const left = m.c1 - pos.col;
      const best = Math.max(below, above, right, left);
      let dest = null;
      if (best > 0) {
        if (best === below) dest = { ...m, r2: pos.row };
        else if (best === above) dest = { ...m, r1: pos.row };
        else if (best === right) dest = { ...m, c2: pos.col };
        else dest = { ...m, c1: pos.col };
      }
      setFillPreview(dest);
      return;
    }
    if (kind === "colhead") { setSel((s) => ({ ...s, b: { row: sheet.rows - 1, col: pos.col } })); return; }
    if (kind === "rowhead") { setSel((s) => ({ ...s, b: { row: pos.row, col: sheet.cols - 1 } })); return; }
    setSel((s) => (s.b.row === pos.row && s.b.col === pos.col ? s : { ...s, b: pos }));
  };
  const onGridUp = (kind, d) => {
    if (pointRef.current) { pointEnd(); return; }
    if (d.start?.kind === "fill") {
      const dest = fillPreview;
      setFillPreview(null);
      if (dest && !readOnly) {
        const src = main;
        const mode = d.ctrlNow || d.ctrl ? "series" : "auto";
        apply((b) => fillSeries(b, si, src, dest, { mode }));
        setSel({ a: { row: dest.r1, col: dest.c1 }, b: { row: dest.r2, col: dest.c2 } });
      }
      return;
    }
    if (painter && (kind === "cell" || kind === "colhead" || kind === "rowhead")) applyPainter(expandToMerges(sheet, normRange(selRef.current.a, selRef.current.b)));
  };
  const onGridDouble = (hit) => {
    if (hit.kind === "resize-col") { autofit("col", hit.col); return; }
    if (hit.kind === "resize-row") { autofit("row", hit.row); return; }
    if (hit.kind === "fill") {
      // Tutamaca çift tık: soldaki (yoksa sağdaki) sütunun verisi bittiği yere kadar aşağı doldur.
      const m = main;
      const probe = m.c1 > 0 && hasValue(m.r2 + 1, m.c1 - 1) ? m.c1 - 1 : m.c2 + 1 < sheet.cols && hasValue(m.r2 + 1, m.c2 + 1) ? m.c2 + 1 : null;
      if (probe == null) return;
      let end = m.r2 + 1;
      while (end + 1 < sheet.rows && hasValue(end + 1, probe)) end += 1;
      apply((b) => fillSeries(b, si, m, { ...m, r2: end }, { mode: "auto" }));
      setSel({ a: { row: m.r1, col: m.c1 }, b: { row: end, col: m.c2 } });
      return;
    }
    if (hit.kind === "cell" && !editRef.current) {
      const at = anchorOf(hit.row, hit.col);
      setSel({ a: at, b: at });
      if (!readOnly) setTimeout(() => startEdit(String(raw(at.row, at.col))), 0);
    }
  };
  const onGridContext = (hit, pt) => {
    if (editRef.current) finishEdit();
    const anchor = { left: pt.x, top: pt.y, right: pt.x, bottom: pt.y };
    const inside = ranges.some((r) => (hit.kind === "colhead" ? hit.col >= r.c1 && hit.col <= r.c2 && fullCols(sheet, r) : hit.kind === "rowhead" ? hit.row >= r.r1 && hit.row <= r.r2 && fullRows(sheet, r) : hit.kind === "cell" && inRect(r, hit.row, hit.col)));
    if (!inside) {
      if (hit.kind === "colhead") setSel({ a: { row: 0, col: hit.col }, b: { row: sheet.rows - 1, col: hit.col } });
      else if (hit.kind === "rowhead") setSel({ a: { row: hit.row, col: 0 }, b: { row: hit.row, col: sheet.cols - 1 } });
      else if (hit.kind === "cell") setSel({ a: { row: hit.row, col: hit.col }, b: { row: hit.row, col: hit.col } });
    }
    const clipItems = [
      { label: "Kes", icon: "cut", hint: keyLabel("⌘X"), onClick: () => copyNow(true), disabled: readOnly },
      { label: "Kopyala", icon: "copy", hint: keyLabel("⌘C"), onClick: () => copyNow(false) },
      { label: "Yapıştır", icon: "paste", hint: keyLabel("⌘V"), onClick: () => pasteFromClipboard("all"), disabled: readOnly },
      { label: "Değerleri yapıştır", hint: keyLabel("⇧⌘V"), onClick: () => pasteFromClipboard("values"), disabled: readOnly },
      { label: "Biçimleri yapıştır", onClick: () => pasteFromClipboard("formats"), disabled: readOnly },
      "-",
    ];
    let items;
    if (hit.kind === "colhead") {
      items = [...clipItems,
        { label: "Sola sütun ekle", icon: "insertCol", onClick: () => insert("col", false), disabled: readOnly },
        { label: "Sağa sütun ekle", onClick: () => insert("col", true), disabled: readOnly },
        { label: "Sütunları sil", icon: "deleteCol", danger: true, onClick: () => remove("col"), disabled: readOnly },
        { label: "İçeriği temizle", onClick: () => clearCmd("contents"), disabled: readOnly },
        "-",
        { label: "Sütun genişliği…", icon: "colWidth", onClick: () => setDialog({ kind: "size", axis: "col" }), disabled: readOnly },
        { label: "Otomatik sığdır", onClick: () => autofit("col"), disabled: readOnly },
        { label: "Gizle", icon: "eyeOff", onClick: () => hide("col", true), disabled: readOnly },
        { label: "Göster", icon: "eye", onClick: () => hide("col", false), disabled: readOnly },
        "-",
        { label: "A'dan Z'ye sırala", icon: "sortAsc", onClick: () => sort(true, hit.col), disabled: readOnly },
        { label: "Z'den A'ya sırala", icon: "sortDesc", onClick: () => sort(false, hit.col), disabled: readOnly },
        { label: "Bu sütuna kadar dondur", icon: "freeze", onClick: () => freeze(getFrozen(sheet).r, hit.col + 1), disabled: readOnly },
      ];
    } else if (hit.kind === "rowhead") {
      items = [...clipItems,
        { label: "Üste satır ekle", icon: "insertRow", onClick: () => insert("row", false), disabled: readOnly },
        { label: "Alta satır ekle", onClick: () => insert("row", true), disabled: readOnly },
        { label: "Satırları sil", icon: "deleteRow", danger: true, onClick: () => remove("row"), disabled: readOnly },
        { label: "İçeriği temizle", onClick: () => clearCmd("contents"), disabled: readOnly },
        "-",
        { label: "Satır yüksekliği…", icon: "rowHeight", onClick: () => setDialog({ kind: "size", axis: "row" }), disabled: readOnly },
        { label: "Otomatik sığdır", onClick: () => autofit("row"), disabled: readOnly },
        { label: "Gizle", icon: "eyeOff", onClick: () => hide("row", true), disabled: readOnly },
        { label: "Göster", icon: "eye", onClick: () => hide("row", false), disabled: readOnly },
        "-",
        { label: "Bu satıra kadar dondur", icon: "freeze", onClick: () => freeze(hit.row + 1, getFrozen(sheet).c), disabled: readOnly },
      ];
    } else if (hit.kind === "cell") {
      items = [...clipItems,
        { label: "Üste satır ekle", icon: "insertRow", onClick: () => insert("row", false), disabled: readOnly },
        { label: "Sola sütun ekle", icon: "insertCol", onClick: () => insert("col", false), disabled: readOnly },
        { label: "Satırları sil", icon: "deleteRow", onClick: () => remove("row"), disabled: readOnly },
        { label: "Sütunları sil", icon: "deleteCol", onClick: () => remove("col"), disabled: readOnly },
        { label: "İçeriği temizle", icon: "eraser", hint: "Del", onClick: () => clearCmd("contents"), disabled: readOnly },
        "-",
        { label: "A'dan Z'ye sırala", icon: "sortAsc", onClick: () => sort(true, hit.col), disabled: readOnly },
        { label: "Z'den A'ya sırala", icon: "sortDesc", onClick: () => sort(false, hit.col), disabled: readOnly },
        { label: sheet.filter ? "Filtreyi kaldır" : "Filtre uygula", icon: "filter", onClick: toggleFilter, disabled: readOnly },
        "-",
        merged ? { label: "Hücreleri ayır", icon: "merge", onClick: unmerge, disabled: readOnly } : { label: "Birleştir ve ortala", icon: "merge", onClick: () => merge("center"), disabled: readOnly || (range.r1 === range.r2 && range.c1 === range.c2) },
        { label: "Koşullu biçimlendirme…", icon: "cond", onClick: () => setDialog({ kind: "cf", type: "gt" }), disabled: readOnly },
        { label: "Açılır liste…", icon: "validate", onClick: () => setDialog({ kind: "dv" }), disabled: readOnly },
        { label: "Hücreleri biçimlendir…", hint: keyLabel("⌘1"), onClick: () => setDialog({ kind: "format" }), disabled: readOnly },
      ];
    } else return;
    setPopup({ kind: "menu", anchor, items });
  };
  const onFilterButton = (col, rect) => setPopup({ kind: "filter", col, anchor: rect });
  const onDvButton = (row, col, rect) => setPopup({ kind: "list", row, col, anchor: rect });
  const onView = () => { if (editRef.current || popup) setViewTick((n) => n + 1); };

  /* ------------------------------ ad kutusu ------------------------------ */
  const [nameBox, setNameBox] = useState(null);
  const goTo = (text) => {
    const t = String(text || "").trim().toUpperCase().replace(/^=/, "");
    const rect = parseRange(t);
    if (!rect || rect.r2 >= sheet.rows || rect.c2 >= sheet.cols) { toast("Geçersiz başvuru.", { tone: "error" }); return false; }
    setSel({ a: { row: rect.r1, col: rect.c1 }, b: { row: rect.r2, col: rect.c2 } });
    reveal(rect.r1, rect.c1);
    gridRef.current?.focus();
    return true;
  };

  /* -------------------------------- görünüm -------------------------------- */
  if (loadError) return <div className="view"><button type="button" className="link-btn" onClick={onClose}>← Tablolar</button><p className="error-note">{loadError.message}</p></div>;
  if (!book || !sheet || !layout) return <Spinner label="Tablo açılıyor…" />;

  const frozen = getFrozen(sheet);
  const filterRect = sheet.filter ? parseRange(sheet.filter.ref) : null;
  const filterActiveCols = new Set(Object.keys(sheet.filter?.crit || {}).map(Number));
  const activeDv = !readOnly ? validationAt(sheet, active.row, active.col) : null;

  // Formül başvuruları
  const refBoxes = [];
  if (edit && editRefs.length) {
    const live = pointLive(edit.value, editCaret, edit.point) && edit.point.si === si;
    editRefs.forEach((ref, i) => {
      const here = ref.sheet ? sameSheetName(ref.sheet, sheet.name) : si === edit.si;
      if (!here || ref.r1 >= sheet.rows || ref.c1 >= sheet.cols) return;
      refBoxes.push({ key: `${i}-${ref.start}`, color: ref.color, rgb: hexRgb(ref.color), rect: { r1: ref.r1, c1: ref.c1, r2: Math.min(ref.r2, sheet.rows - 1), c2: Math.min(ref.c2, sheet.cols - 1) }, pointing: live && ref.start === edit.point.span.start });
    });
  }

  const saveLabel = { saved: "Kaydedildi", dirty: "Kaydedilecek…", saving: "Kaydediliyor…", error: "Kaydedilemedi", offline: "Çevrimdışı — bağlantı gelince kaydedin" }[saveState];
  const editRect = edit && !edit.fromBar && edit.si === si ? (merges.at(edit.row, edit.col) || { r1: edit.row, c1: edit.col, r2: edit.row, c2: edit.col }) : null;
  const editBox = editRect ? gridRef.current?.rectOf(editRect) : null;
  const editStyle = editRect ? styleAt(sheet, edit.row, edit.col) : null;

  const ribbonApi = {
    style: activeStyle, readOnly, canUndo: history.current.undo.length > 0, canRedo: history.current.redo.length > 0,
    undo, redo, paste: (m) => pasteFromClipboard(m), cut: () => copyNow(true), copy: () => copyNow(false), painter: startPainter, painterOn: Boolean(painter),
    setStyle, toggle: toggleStyle, growFont, borders, lastBorder: lastColors.border, fillColor, textColor, lastFill: lastColors.fill, lastText: lastColors.text,
    indent, merge, unmerge, merged, thousands, decimals,
    openCf: (type) => setDialog({ kind: "cf", type }), addCf: (rule) => apply((b) => ranges.reduce((acc, r) => addCfRule(acc, si, { ...rule, ref: rangeText(r) }), b)),
    clearCf: (scope) => apply((b) => (scope === "sheet" ? setSheetProps(b, si, { cf: null }) : ranges.reduce((acc, r) => removeCfRules(acc, si, { range: r }), b))),
    applyCellStyle, insert, remove, addSheet, deleteSheet: () => deleteSheet(si), canDeleteSheet: book.sheets.length > 1,
    sizeDialog: (axis) => setDialog({ kind: "size", axis }), autofit: (axis) => autofit(axis), hide,
    renameSheet: () => setRenaming(si), duplicateSheet: () => { apply((b) => duplicateSheet(b, si)); setSi(si + 1); },
    formatDialog: () => setDialog({ kind: "format" }), autoSum, openFunctions: () => setFnOpen(true), fill: fillCmd, clear: clearCmd,
    sort, openSort: () => setDialog({ kind: "sort" }), toggleFilter, clearFilter, filterOn: Boolean(sheet.filter), filterActive,
    find: (mode) => setFindState({ mode, status: "" }), goTo: () => setDialog({ kind: "goto" }), insertFunction, showFormulas, toggleFormulas: () => setShowFormulas((v) => !v),
    openValidation: () => setDialog({ kind: "dv" }), removeDuplicates, importSheets: importIntoBook,
    freeze, freezeAtCell, frozen, noGrid: Boolean(sheet.noGrid), toggleGrid: () => apply((b) => setSheetProps(b, si, { noGrid: sheet.noGrid ? null : true })),
    zoom, setZoom, zoomStep, zoomToSelection: () => {
      const vp = gridRef.current?.viewport();
      if (!vp) return;
      const w = layout.cols.end(range.c2) - layout.cols.start(range.c1);
      const h = layout.rows.end(range.r2) - layout.rows.start(range.r1);
      setZoom(clampN(Math.min((vp.w - 60) / w, (vp.h - 40) / h), 0.25, 4));
      setTimeout(() => reveal(range.r1, range.c1), 30);
    },
    focusGrid: () => gridRef.current?.focus(),
  };

  return (
    <div className="sheet-editor sx">
      <header className="sheet-top">
        <button type="button" className="icon-btn" onClick={onClose} title="Tablolar"><Icon name="chevronLeft" /></button>
        <span className="file-icon"><Icon name="grid" /></span>
        <input className="sheet-title" value={title} readOnly={meta.access !== "owner"} onChange={(e) => setTitle(e.target.value)}
          onBlur={async () => { if (title.trim() && title !== meta.title) { const res = await request({ method: "PATCH", path: `/api/tools/sheets/${id}`, body: { title: title.trim() }, queue: false }); if (result(res)) setMeta((m) => ({ ...m, title: title.trim() })); } }} />
        <span className={`save-state save-state--${saveState}`}>{saveLabel}</span>
        {readOnly && <span className="pill">Yalnız görüntüleme</span>}
        <span className="spacer" />
        {meta.updated_by_name && <span className="muted small">Son: {meta.updated_by_name} · {relativeTime(meta.updatedAt)}</span>}
        <ExportButton id="sheet" title={title} formats={["pdf", "docx", "md", "json"]} print={false}
          scopes={[{ value: "view", label: `Bu sayfa (${sheet.name})` }, ...(book.sheets.length > 1 ? [{ value: "all", label: `Tüm sayfalar (${book.sheets.length})` }] : [])]}
          report={({ scope: sc }) => sheetReport(title, (sc === "all" ? book.sheets.map((sh, i) => [sh, i]) : [[sheet, si]]).map(([sh, i]) => {
            const u = usedBounds(sh);
            const rows = Array.from({ length: u.rows }, (_, r) => Array.from({ length: u.cols }, (_, c) => { const key = addr(c, r); const cell = sh.cells[key]; return !cell || cell.v === "" ? "" : String(formatValue(evaluator.value(i, key), styleAt(sh, r, c))); }));
            return { name: sh.name, rows };
          }))}
          extraItems={[
            { label: "Excel (.xlsx) — formüller ve biçimlerle", icon: "grid", onClick: exportXlsx },
            { label: "CSV (bu sayfa)", icon: "download", onClick: exportCsv },
            { label: "PDF — tablo görünümü", icon: "printer", onClick: () => printSheet(true) },
            { label: "Yazdır", icon: "printer", onClick: () => printSheet(false) },
          ]} />
        {meta.access === "owner" && <button type="button" className="btn btn--sm" onClick={() => setShareOpen(true)}><Icon name="share" /> Paylaş{meta.shares?.length ? ` (${meta.shares.length})` : ""}</button>}
      </header>

      <SheetRibbon api={ribbonApi} />

      <div className="formula-bar sx-fbar">
        <input className="formula-bar__ref sx-namebox" value={nameBox ?? (range.r1 === range.r2 && range.c1 === range.c2 ? addr(active.col, active.row) : rangeLabel(range))}
          onFocus={(e) => { setNameBox(e.target.value); requestAnimationFrame(() => e.target.select()); }} onChange={(e) => setNameBox(e.target.value)}
          onBlur={() => setNameBox(null)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (goTo(nameBox)) setNameBox(null); } if (e.key === "Escape") { setNameBox(null); gridRef.current?.focus(); } }} aria-label="Ad kutusu" spellCheck={false} />
        <button type="button" className="formula-bar__fx sx-fx" title="İşlev ekle" onClick={() => setFnOpen(true)} disabled={readOnly}>ƒx</button>
        <div className="formula-bar__input">
          <input ref={barInputRef} value={edit ? edit.value.replace(/\n/g, " ⏎ ") : String(raw(anchorOf(active.row, active.col).row, anchorOf(active.row, active.col).col)).replace(/\n/g, " ⏎ ")} readOnly={readOnly}
            className={edit && editSegments && edit.fromBar ? "is-colored" : undefined}
            onFocus={() => {
              if (readOnly) return;
              if (!editRef.current) { const at = anchorOf(active.row, active.col); const v = String(raw(at.row, at.col)); setEdit({ row: at.row, col: at.col, si, value: v, caret: v.length, fromBar: true, point: null }); }
              else if (!editRef.current.fromBar) setEdit({ ...editRef.current, fromBar: true });
            }}
            onChange={(e) => onEditChange({ target: { value: e.target.value.replace(/ ⏎ /g, "\n"), selectionStart: e.target.selectionStart } }, true)} onSelect={onEditSelect} onScroll={syncMirror} onKeyDown={onEditKey}
            onBlur={onEditBlur} spellCheck={false} placeholder="Değer ya da =formül (örn. =TOPLA(B2:B10))" aria-label="Formül çubuğu" />
          {edit && editSegments && edit.fromBar && <FormulaMirror className="fx-mirror--bar" segments={editSegments} inputRef={barInputRef} mirrorRef={barMirrorRef} />}
        </div>
      </div>

      <div className="sx-body">
        <SheetGrid ref={gridRef} sheet={viewSheet} si={si} layout={layout} zoom={zoom} readOnly={readOnly}
          selection={{ main, ranges, active }} editing={editRect ? { row: edit.row, col: edit.col } : null}
          cellInfo={cellInfo} borderAt={borderAt} hasValue={hasValue}
          refBoxes={refBoxes} clip={clip} fillPreview={fillPreview} filterRect={filterRect} filterActive={filterActiveCols} filteredRows={filtered}
          dvButton={activeDv && !edit ? { row: anchorOf(active.row, active.col).row, col: anchorOf(active.row, active.col).col } : null}
          onDown={onGridDown} onDrag={onGridDrag} onUp={onGridUp} onDoubleClick={onGridDouble} onContextMenu={onGridContext}
          onResize={resize} onResizePreview={(axis, index, size) => setResizePreview(axis ? { axis, index, size } : null)}
          onFilterButton={onFilterButton} onDvButton={onDvButton} onZoomWheel={onZoomWheel} onView={onView}
          onKeyDown={onKeyDown} onCopy={onCopy} onCut={(e) => onCopy(e, true)} onPaste={onPaste}>
          {editBox && (
            <CellEditor box={editBox} style={editStyle} zoom={zoom} value={edit.value} segments={editSegments} inputRef={cellInputRef} mirrorRef={cellMirrorRef}
              onChange={(e) => onEditChange(e, false)} onSelect={onEditSelect} onKeyDown={onEditKey} onBlur={onEditBlur} onScroll={syncMirror} />
          )}
          {painter && <div className="sx-painter-note"><SIcon name="painter" size={14} /> Biçim boyacısı: biçimi uygulamak için hücre seçin{painter.sticky ? " (kilitli — Esc ile bitir)" : ""}</div>}
        </SheetGrid>
        {findState && (
          <FindPanel mode={findState.mode} status={findState.status} readOnly={readOnly} onFind={doFind} onReplace={doReplace} onReplaceAll={doReplaceAll}
            onClose={() => { setFindState(null); gridRef.current?.focus(); }} />
        )}
      </div>

      <footer className="sheet-bottom sx-bottom">
        <div className="sheet-tabs">
          {book.sheets.map((s, i) => (
            <SheetTab key={s.id || i} name={s.name} color={s.tab} active={i === si} readOnly={readOnly} renaming={renaming === i}
              onMouseDown={(e) => { if (editRef.current && isFormulaText(editRef.current.value)) e.preventDefault(); }}
              onClick={() => switchSheet(i)} onStartRename={() => setRenaming(i)} onEndRename={() => setRenaming(null)}
              onRename={(name) => { if (book.sheets.some((x, j) => j !== i && sameSheetName(x.name, name))) { toast("Bu adda bir sayfa zaten var.", { tone: "error" }); return; } apply((b) => renameSheet(b, i, name)); }}
              onContext={(anchor) => tabMenu(i, anchor)}
              onDrop={(from) => { if (from !== i) { apply((b) => moveSheet(b, from, i)); setSi(i); } }} index={i} />
          ))}
          {!readOnly && book.sheets.length < 20 && <button type="button" className="icon-btn sx-addsheet" title="Sayfa ekle" onClick={addSheet}><Icon name="plus" /></button>}
        </div>
        <div className="sheet-stats">
          {stats.count > 0 && (stats.numbers > 0 ? <>
            <span>Ortalama: <b>{formatValue(stats.avg, { f: "number" })}</b></span>
            <span>Sayım: <b>{stats.count}</b></span>
            {stats.numbers > 1 && <><span>Min: <b>{formatValue(stats.min, {})}</b></span><span>Maks: <b>{formatValue(stats.max, {})}</b></span></>}
            <span>Toplam: <b>{formatValue(stats.sum, { f: "number" })}</b></span>
          </> : stats.count > 1 ? <span>Sayım: <b>{stats.count}</b></span> : null)}
        </div>
        <div className="sx-zoom" aria-label="Yakınlaştırma">
          <button type="button" className="sx-btn" title="Uzaklaştır" onClick={() => zoomStep(-1)}><SIcon name="minus" size={12} /></button>
          <input type="range" min={25} max={400} step={5} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} aria-label="Yakınlaştırma oranı" />
          <button type="button" className="sx-btn" title="Yakınlaştır" onClick={() => zoomStep(1)}><SIcon name="plus" size={12} /></button>
          <button type="button" className="sx-zoom__pct" title="%100'e dön" onClick={() => setZoom(1)}>%{Math.round(zoom * 100)}</button>
        </div>
      </footer>

      {edit && popPos && (fnSuggestions.length > 0 || fnContext) && (
        <div className="fx-suggest" style={{ left: popPos.left, top: popPos.top, transform: popPos.up ? "translateY(-100%)" : undefined }} role={fnSuggestions.length ? "listbox" : "tooltip"} onMouseDown={(e) => e.preventDefault()}>
          {fnSuggestions.length > 0 ? fnSuggestions.map((fn, i) => (
            <button key={fn.en} type="button" role="option" aria-selected={i === fnPick} className={`fx-suggest__item${i === fnPick ? " is-active" : ""}`} onMouseDown={(e) => { e.preventDefault(); acceptFn(fn); }}>
              <b>{fn.insert}</b><small>{fn.insert === fn.tr ? fn.en : fn.tr}</small><span>{fn.desc}</span>
            </button>
          )) : (
            <div className="fx-suggest__hint">
              {signatureParts(fnContext.fn, fnContext.argIndex).map((part, i) => (part.active ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>))}
              <small>{fnContext.fn.desc}</small>
            </div>
          )}
          {fnSuggestions.length > 0 && <div className="fx-suggest__foot">Tab / Enter ile ekle · ↑↓ seç · Esc kapat</div>}
        </div>
      )}

      {popup?.kind === "menu" && <Popover anchor={popup.anchor} onClose={() => setPopup(null)} className="sx-ctx"><MenuList items={popup.items} onClose={() => { setPopup(null); }} /></Popover>}
      {popup?.kind === "tabColor" && <Popover anchor={popup.anchor} onClose={() => setPopup(null)}><ColorGrid value={book.sheets[popup.index]?.tab} noneLabel="Renk yok" onPick={(c) => apply((b) => setSheetProps(b, popup.index, { tab: c }))} onClose={() => setPopup(null)} /></Popover>}
      {popup?.kind === "filter" && filterRect && (
        <FilterMenu anchor={popup.anchor} title={`${String(displayOf(filterRect.r1, popup.col)) || colName(popup.col)} süzgeci`}
          values={filterValues(sheet, popup.col, valueAt)} crit={sheet.filter.crit?.[popup.col]}
          onApply={(crit) => apply((b) => setFilterCrit(b, si, popup.col, crit))}
          onSort={(asc) => sort(asc, popup.col, { rect: filterRect, header: true })} onClose={() => { setPopup(null); gridRef.current?.focus(); }} />
      )}
      {popup?.kind === "list" && (
        <ListPicker anchor={popup.anchor} items={validationItems(validationAt(sheet, popup.row, popup.col), sheet, valueAt)} value={String(displayOf(popup.row, popup.col))}
          onPick={(v) => apply((b) => writeCells(b, si, { [addr(popup.col, popup.row)]: { v } }))} onClose={() => { setPopup(null); gridRef.current?.focus(); }} />
      )}

      {dialog?.kind === "format" && <FormatCellsDialog style={activeStyle} onApply={(patch) => setStyle(patch)} onClose={() => { setDialog(null); gridRef.current?.focus(); }} />}
      {dialog?.kind === "cf" && (
        <CfDialog type={dialog.type} rangeLabel={ranges.map(rangeText).join(", ")} rules={sheet.cf || []}
          onAdd={(rule) => apply((b) => ranges.reduce((acc, r) => addCfRule(acc, si, { ...rule, ref: rangeText(r) }), b))}
          onRemove={(rid) => apply((b) => removeCfRules(b, si, { id: rid }))} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "dv" && (
        <ValidationDialog rule={validationAt(sheet, active.row, active.col)} rangeLabel={rangeText(range)}
          onSave={(rule) => apply((b) => setValidation(b, si, range, rule))} onRemove={() => apply((b) => setValidation(b, si, range, null))} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "size" && (
        <SizeDialog axis={dialog.axis} value={dialog.axis === "col" ? layout.cols.size(range.c1) || 100 : layout.rows.size(range.r1) || DEF_H}
          onSave={(px) => { const list = selectedIndices(dialog.axis, null); apply((b) => (dialog.axis === "col" ? setColWidths(b, si, list, px) : setRowHeights(b, si, list, px))); }} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "sort" && (() => {
        const t = sortTarget();
        const labels = {};
        for (let c = t.rect.c1; c <= t.rect.c2; c += 1) labels[c] = String(displayOf(t.rect.r1, c));
        return <SortDialog range={t.rect} headerGuess={t.header} headerLabels={labels} onSort={sortCustom} onClose={() => setDialog(null)} />;
      })()}
      {dialog?.kind === "goto" && <GoToDialog onGo={goTo} onClose={() => setDialog(null)} />}
      {shareOpen && <ShareDialog sheetId={id} shares={meta.shares || []} onClose={() => setShareOpen(false)} onSaved={(shares) => { setMeta((m) => ({ ...m, shares })); setShareOpen(false); }} />}
      {fnOpen && <FunctionHelp onClose={() => setFnOpen(false)} onPick={(fn) => { setFnOpen(false); insertFunction(fn); }} />}
    </div>
  );
}

const colIndexOf = (name) => { let n = 0; for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const hexRgb = (hex) => { const n = parseInt(String(hex).slice(1), 16); return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`; };
// Ctrl+Enter ile çoklu hücreye yazılan formül her hücreye göre kaydırılır.
const shiftFormulaSafe = (v, dr, dc) => shiftFormula(v, dr, dc);

/** Hücre içi düzenleyici: hücrenin üstünde, yazdıkça sağa/aşağı büyüyen metin alanı. */
function CellEditor({ box, style, zoom, value, segments, inputRef, mirrorRef, onChange, onSelect, onKeyDown, onBlur, onScroll }) {
  const sizer = useRef(null);
  const [size, setSize] = useState({ w: box.w, h: box.h });
  const base = typeof window !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font") : "system-ui";
  const font = fontOf(style || {}, zoom, base || "system-ui");
  useLayoutEffect(() => {
    const el = sizer.current;
    if (!el) return;
    const w = Math.max(box.w + 1, Math.min(900, el.scrollWidth + 14));
    const h = Math.max(box.h + 1, Math.min(400, el.scrollHeight + 4));
    if (Math.abs(w - size.w) > 0.5 || Math.abs(h - size.h) > 0.5) setSize({ w, h });
  });
  const common = {
    font: font.css,
    lineHeight: `${font.px * 1.22}px`,
    padding: `${Math.max(1, (box.h - font.px * 1.22) / 2 - 1)}px ${4 * zoom}px`,
    textAlign: style?.al === "right" || style?.al === "center" ? style.al : "left",
    whiteSpace: style?.wr ? "pre-wrap" : "pre",
  };
  return (
    <div className="sx-editor" style={{ left: box.x - 1, top: box.y - 1, width: size.w, height: size.h }}>
      <div ref={sizer} className="sx-editor__sizer" style={{ ...common, width: style?.wr ? box.w : undefined }} aria-hidden="true">{value || " "}{"​"}</div>
      <textarea ref={inputRef} autoFocus className={`sx-editor__input${segments ? " is-colored" : ""}`} value={value} spellCheck={false} style={{ ...common, color: segments ? "transparent" : style?.c, background: style?.bg }}
        onChange={onChange} onSelect={onSelect} onKeyDown={onKeyDown} onBlur={onBlur} onScroll={onScroll} rows={1} aria-label="Hücre düzenleyici" />
      {segments && (
        <div ref={mirrorRef} className="sx-editor__mirror" style={common} aria-hidden="true">
          {segments.map((sg, i) => <span key={i} style={sg.color ? { color: sg.color } : undefined}>{sg.text}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * Formül yazılırken başvuruları renkli gösteren katman: girdinin metni saydam
 * olur, aynı yazı bu katmanda renkli çizilir (imleç ve seçim girdide kalır).
 */
function FormulaMirror({ className, segments, inputRef, mirrorRef }) {
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    const cs = window.getComputedStyle(input);
    Object.assign(mirror.style, {
      left: `${input.offsetLeft}px`,
      top: `${input.offsetTop}px`,
      width: `${input.offsetWidth}px`,
      height: `${input.offsetHeight}px`,
      lineHeight: `${input.clientHeight}px`,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      borderLeftWidth: cs.borderLeftWidth,
      borderRightWidth: cs.borderRightWidth,
      borderTopWidth: cs.borderTopWidth,
      borderBottomWidth: cs.borderBottomWidth,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
    });
    mirror.scrollLeft = input.scrollLeft;
  });
  return (
    <div ref={mirrorRef} className={`fx-mirror ${className}`} aria-hidden="true">
      {segments.map((sg, i) => <span key={i} style={sg.color ? { color: sg.color } : undefined}>{sg.text}</span>)}
      {"   "}
    </div>
  );
}

function SheetTab({ name, color, active, readOnly, renaming, index, onClick, onMouseDown, onRename, onStartRename, onEndRename, onContext, onDrop }) {
  const [value, setValue] = useState(name);
  const [over, setOver] = useState(false);
  useEffect(() => setValue(name), [name, renaming]);
  if (renaming) {
    return <input className="sheet-tab sheet-tab--edit" autoFocus value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()}
      onBlur={() => { onEndRename(); if (value.trim() && value.trim() !== name) onRename(value.trim().replace(/[[\]:*?/\\!']/g, "")); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setValue(name); onEndRename(); } }} />;
  }
  return (
    <span className={`sheet-tab ${active ? "is-active" : ""} ${over ? "is-over" : ""}`} style={color ? { "--tab": color } : undefined}
      draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("text/x-sheet-tab", String(index)); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-sheet-tab")) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const from = Number(e.dataTransfer.getData("text/x-sheet-tab")); if (Number.isInteger(from)) onDrop(from); }}
      onContextMenu={(e) => { e.preventDefault(); onContext({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY }); }}>
      <button type="button" onMouseDown={onMouseDown} onClick={onClick} onDoubleClick={() => !readOnly && onStartRename()} title="Çift tık: yeniden adlandır · Sağ tık: diğer işlemler">{name}</button>
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İşlev ara (TOPLA, EĞER, ÇAPRAZARA…)" autoFocus />
      <p className="muted small">Bağımsız değişkenler noktalı virgülle ayrılır: =EĞER(A1&gt;10; "Çok"; "Az"). İngilizce adlar da çalışır (SUM, IF, XLOOKUP…). Formül yazarken hücreye tıklayın ya da sürükleyin (⇧: aralık, ⌘/Ctrl: yeni başvuru), ok tuşlarıyla da seçebilirsiniz; F4 $ ekler, ⌥= otomatik toplam.</p>
      <ul className="fn-list">{list.map((f) => <li key={f.en}><button type="button" onClick={() => onPick(f.tr)}><strong>{f.tr}</strong><small>{f.en}</small><span>{f.hint}</span></button></li>)}</ul>
    </Modal>
  );
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Yazdırma / PDF: birleştirmeler, sütun genişlikleri, kenarlıklar ve biçimlerle. */
function sheetHtml(sheet, title, displayOf, layout) {
  const u = usedBounds(sheet);
  const idx = mergeIndex(sheet);
  const rows = [];
  const widths = Array.from({ length: u.cols }, (_, c) => layout.cols.size(c));
  for (let r = 0; r < u.rows; r += 1) {
    if (!layout.rows.size(r)) continue;
    const tds = [];
    for (let c = 0; c < u.cols; c += 1) {
      if (!layout.cols.size(c)) continue;
      const m = idx.at(r, c);
      if (m && (m.r1 !== r || m.c1 !== c)) continue;
      const s = styleAt(sheet, r, c);
      const span = m ? `${m.r2 > m.r1 ? ` rowspan="${m.r2 - m.r1 + 1}"` : ""}${m.c2 > m.c1 ? ` colspan="${m.c2 - m.c1 + 1}"` : ""}` : "";
      const text = String(displayOf(r, c));
      const numeric = s.al ? "" : /^[-%]?[\d.,]+\s?(₺|%)?$/.test(text) ? ";text-align:right" : "";
      tds.push(`<td${span} style="${styleCss(s)}${numeric}">${esc(text).replace(/\n/g, "<br>")}</td>`);
    }
    rows.push(`<tr style="height:${layout.rows.size(r)}px">${tds.join("")}</tr>`);
  }
  const cols = widths.map((w) => (w ? `<col style="width:${w}px">` : "")).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:10px -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;margin:18px}h1{font-size:15px;margin:0 0 8px}
    table{border-collapse:collapse;table-layout:fixed}td{${sheet.noGrid ? "" : "outline:1px solid #e4e4e7;outline-offset:-1px;"}padding:2px 5px;overflow:hidden}
  </style></head><body><h1>${esc(title)} — ${esc(sheet.name)}</h1><table><colgroup>${cols}</colgroup>${rows.join("")}</table></body></html>`;
}
