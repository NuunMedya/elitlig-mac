// Dosya Araçları: dönüştür, düzenle, sıkıştır — dosyalar bilgisayardan çıkmaz.
//
//   Ana sayfa   sürükle-bırak / seç / ⌘V ile dosya ekle; seçim için çark (⌘↩ ya da
//               Ctrl+Boşluk) ya da kutucuk menüsü: Dönüştür · Araçlar · Dosya işlemleri.
//               Bırakırken Shift: Dönüştür çarkı, ⌘/Ctrl: Araçlar, ⌥/Alt: Dosya işlemleri.
//   İşler       gerçek ilerleme (ffmpeg -progress), iptal, Klasörde göster, tekrar kullan.
//   Kütüphane   son 50 iş (girdi / çıktı, durum, eksik dosya), arama.
//   Ayarlar     çıktı klasörü (ya da kaynağın yanı), araç durumları.
// Orijinal dosyalar asla değiştirilmez ya da silinmez; çıktılar çakışmasız adla yazılır.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Field, Kbd, Modal, Segmented, ViewHeader, isMac, useConfirm, useToast } from "../../components/ui";
import { useCommand } from "../../api";
import { FIcon } from "./icons";
import Wheel from "./Wheel";
import ToolDialog from "./ToolDialog";
import ImageEditor from "./ImageEditor";
import MediaEditor from "./MediaEditor";
import PdfPages from "./PdfPages";
import DownloadDialog from "./DownloadDialog";
import YtdlpSettings from "./YtdlpSettings";
import ScreenRecorder from "./ScreenRecorder";
import { GROUPS, JOB_STATUS, KIND_ICONS, KIND_LABELS, formatBytes, kindsOf, toolsFor } from "../../lib/files/catalog";
import { hasNativeQr, readQrCodes, runClientOp } from "../../lib/files/runClient";
import { outputFormat } from "../../lib/files/imageOps";
import "./files.css";

const ft = () => window.elitlig.fileTools;
const TAB_KEY = "files:tab";
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || "home"; } catch { return "home"; } };
const ACTIVE = new Set(["queued", "running"]);
const when = (t) => (t ? new Date(t).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function FileTools({ arg, argSeq }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState(readTab);
  const [files, setFiles] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [caps, setCaps] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [wheel, setWheel] = useState(null); // grup anahtarı
  const [tileGroup, setTileGroup] = useState("convert");
  const [dialog, setDialog] = useState(null); // { tool }
  const [editor, setEditor] = useState(null); // { kind: image|media|pdf, file, mode }
  const [qr, setQr] = useState(null);
  const [download, setDownload] = useState(false);
  const [recorder, setRecorder] = useState(false);
  const [dropMods, setDropMods] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const lastClick = useRef(null);

  const chooseTab = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* yoksay */ } };

  useEffect(() => {
    ft().capabilities().then((c) => c.ok && setCaps({ ...c, qrNative: hasNativeQr() }));
    const load = () => ft().jobs().then((r) => r.ok && setJobs(r.items));
    load();
    const offJob = ft().onJob((job) => setJobs((list) => {
      const i = list.findIndex((j) => j.id === job.id);
      if (i < 0) return [job, ...list].slice(0, 60);
      const next = [...list];
      next[i] = { ...next[i], ...job };
      return next;
    }));
    const offLib = ft().onLibrary(load);
    return () => { offJob(); offLib(); };
  }, []);

  // Bitince bildirim (yalnız bu oturumda başlayanlar).
  const notified = useRef(new Set());
  useEffect(() => {
    for (const j of jobs) {
      if (notified.current.has(j.id) || ACTIVE.has(j.status) || !j.startedAt || Date.now() - (j.finishedAt || 0) > 4000) continue;
      notified.current.add(j.id);
      if (j.status === "done") toast(`${j.label}: ${j.outputs.length} dosya hazır.${j.note ? ` ${j.note}` : ""}`, { tone: "success", timeout: 6000, action: j.outputs[0] ? { label: "Klasörde göster", run: () => ft().reveal(j.outputs[0].path) } : undefined });
      else if (j.status === "error") toast(`${j.label}: ${j.error || "başarısız"}`, { tone: "error", timeout: 8000 });
    }
  }, [jobs, toast]);

  /* ------------------------------ dosya ekleme ------------------------------ */

  const addEntries = useCallback((entries, { replace = false } = {}) => {
    if (!entries?.length) return [];
    setFiles((list) => {
      const base = replace ? [] : list;
      const seen = new Set(base.map((f) => f.id));
      const fresh = [];
      for (const e of entries) if (!seen.has(e.id)) { seen.add(e.id); fresh.push(e); }
      return [...base, ...fresh].slice(0, 500);
    });
    return entries;
  }, []);
  const pick = async (directory = false) => {
    const res = await ft().pick({ directory });
    if (res.ok) addEntries(res.files);
  };
  const paste = useCallback(async () => {
    const res = await ft().paste();
    if (!res.ok) { toast(res.error?.message || "Panoda dosya yok.", { tone: "warn" }); return; }
    if (res.kind === "link") { setDownload(res.url); return; }
    addEntries(res.files);
    if (res.kind === "image") toast("Panodaki görsel eklendi.", { tone: "success" });
    if (res.kind === "text") toast("Panodaki metin dosya olarak eklendi.", { tone: "success" });
  }, [addEntries, toast]);

  // Float rafından "Dosya Araçları'nda aç" ya da route argümanı.
  useEffect(() => {
    const off = ft().onSelect?.(async (ids) => {
      if (!ids?.length) return;
      const list = await window.elitlig.float.list();
      addEntries((list.items || []).filter((i) => ids.includes(i.id)));
    });
    return () => off?.();
  }, [addEntries]);
  useEffect(() => { if (arg === "paste") paste(); }, [arg, paste]);
  // Araç Takımı kısayolları: files:download (Bağlantıdan indir) · files:record (Ekran kaydı).
  useEffect(() => {
    if (arg === "download") setDownload(true);
    if (arg === "record") setRecorder(true);
  }, [arg, argSeq]);

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const mods = { shift: e.shiftKey, mod: isMac() ? e.metaKey : e.ctrlKey, alt: isMac() ? e.ctrlKey || e.altKey : e.altKey };
    // FileList contextBridge'den geçerken File kimliğini yitirir (yol okunamaz): dizi olarak verilir.
    const res = await ft().addFiles(Array.from(e.dataTransfer.files || []));
    if (!res.ok || !res.files.length) { toast(res.error?.message || "Dosya eklenemedi.", { tone: "error" }); return; }
    addEntries(res.files);
    // Bırakırken basılı tuş: ilgili çark doğrudan açılır (yalnız bırakılan dosyalar seçili).
    const group = mods.shift ? "convert" : mods.mod ? "tools" : mods.alt ? "actions" : null;
    if (group) { setSel(new Set(res.files.map((f) => f.id))); setWheel(group); }
  };

  /* -------------------------------- seçim -------------------------------- */

  const active = useMemo(() => (sel.size ? files.filter((f) => sel.has(f.id)) : files), [files, sel]);
  const tools = useMemo(() => toolsFor(active, caps), [active, caps]);
  // Seçili grupta işlem kalmadıysa ilk uygun gruba geçilir (ör. karışık türler: Dosya işlemleri).
  useEffect(() => {
    if (tools[tileGroup].length) return;
    const g = GROUPS.find((x) => tools[x.key].length);
    if (g) setTileGroup(g.key);
  }, [tools]); // eslint-disable-line react-hooks/exhaustive-deps
  const clickFile = (f, e) => {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    setSel((s) => {
      if (e.shiftKey && lastClick.current) {
        const a = files.findIndex((x) => x.id === lastClick.current);
        const b = files.findIndex((x) => x.id === f.id);
        const next = new Set(s);
        files.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x.id));
        return next;
      }
      const next = new Set(mod ? s : []);
      if (mod && s.has(f.id)) next.delete(f.id); else next.add(f.id);
      if (!mod && s.size === 1 && s.has(f.id)) return new Set();
      return next;
    });
    lastClick.current = f.id;
  };
  const removeFiles = (ids) => {
    const set = new Set(ids);
    setFiles((l) => l.filter((f) => !set.has(f.id)));
    setSel((s) => new Set([...s].filter((id) => !set.has(id))));
  };

  /* -------------------------------- çalıştırma -------------------------------- */

  const runMain = async (spec, list = active) => {
    const res = await ft().run({ op: spec.op, ids: spec.ids || list.map((f) => f.id), options: spec.options || {} });
    if (!res.ok) toast(res.error?.message || "İşlem başlatılamadı.", { tone: "error", timeout: 7000 });
    return res;
  };
  const runClient = async (op, options, list = active) => {
    try {
      const { errors } = await runClientOp({ op, files: list, options });
      if (errors.length) toast(errors.slice(0, 2).join(" · "), { tone: "error", timeout: 7000 });
      return { ok: !errors.length };
    } catch (e) {
      toast(e.message, { tone: "error" });
      return { ok: false };
    }
  };

  const pickTool = async (tool) => {
    setWheel(null);
    if (tool.disabled) { toast(tool.reason, { tone: "warn" }); return; }
    const list = active;
    switch (tool.run) {
      case "client":
        if (tool.id === "qrRead") {
          const results = [];
          for (const f of list) {
            try { results.push({ file: f, codes: await readQrCodes(f) }); } catch (e) { results.push({ file: f, error: e.message }); }
          }
          setQr(results);
          return;
        }
        if (tool.op === "canvasConvert") { await runClient("canvasConvert", { format: tool.target, quality: 0.92 }, list); return; }
        await runClient(tool.id, {}, list);
        return;
      case "main":
        await runMain({ op: tool.op, options: tool.target ? { format: tool.target } : {} }, list);
        return;
      case "dialog":
        setDialog({ tool, files: list });
        return;
      case "editor":
        setEditor({ kind: "image", file: list[0], mode: tool.mode });
        return;
      case "media":
        setEditor({ kind: "media", file: list[0], mode: tool.mode });
        return;
      case "pdf":
        setEditor({ kind: "pdf", file: list[0] });
        return;
      case "action":
        if (tool.id === "float") {
          const res = await window.elitlig.float.add(list.map((f) => f.path));
          await window.elitlig.float.show();
          toast(res.added ? `${res.added} dosya Float rafına eklendi.` : "Dosyalar zaten rafta.", { tone: "success" });
        } else if (tool.id === "reveal") ft().reveal(list[0].path);
        else if (tool.id === "copyPath") { await ft().copyPaths(list.map((f) => f.path)); toast("Yol kopyalandı.", { tone: "success" }); }
        else if (tool.id === "preview") ft().preview(list[0].path);
        else if (tool.id === "remove") removeFiles(list.map((f) => f.id));
        return;
      default:
    }
  };

  const startDialog = async (spec) => {
    const list = dialog.files;
    if (spec.client) return runClient(spec.client, spec.options, list);
    return runMain(spec, list);
  };

  /* -------------------------------- klavye -------------------------------- */

  useCommand("find", () => { if (tab === "library") document.getElementById("ft-lib-search")?.focus(); });
  useEffect(() => {
    const onKey = (e) => {
      if (wheel || dialog || editor || qr || download || recorder || tab !== "home") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
      if (document.querySelector(".modal-backdrop, .palette-backdrop")) return;
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); return; }
      if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pick(false); return; }
      if (!files.length) return;
      const onButton = tag === "BUTTON" || tag === "A";
      if ((mod && e.key === "Enter") || (e.ctrlKey && e.key === " ") || (e.key === "Enter" && !mod && !onButton)) { e.preventDefault(); setWheel(tileGroup); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(new Set(files.map((f) => f.id))); return; }
      if (e.key === "Escape" && sel.size) { e.preventDefault(); setSel(new Set()); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && sel.size) { e.preventDefault(); removeFiles([...sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* --------------------------------- görünüm --------------------------------- */

  const running = jobs.filter((j) => ACTIVE.has(j.status));
  const recent = jobs.filter((j) => !ACTIVE.has(j.status)).slice(0, 5);
  const reuse = async (job, which = "outputs") => {
    const res = await ft().outputs(job.id);
    if (!res.ok) { toast(res.error?.message, { tone: "error" }); return; }
    const list = which === "inputs" ? res.inputs : res.files;
    if (!list.length) { toast("Dosyalar artık yerinde değil.", { tone: "warn" }); return; }
    addEntries(list, { replace: true });
    setSel(new Set());
    chooseTab("home");
  };

  return (
    <div className="view ft" onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); setDropMods(e.shiftKey ? "convert" : (isMac() ? e.metaKey : e.ctrlKey) ? "tools" : (isMac() ? e.ctrlKey || e.altKey : e.altKey) ? "actions" : null); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={onDrop}>
      <ViewHeader title="Dosya Araçları" icon="folder" subtitle="Dönüştür, düzenle, sıkıştır, birleştir — tüm işlemler bu bilgisayarda yapılır, dosyalarınız hiçbir yere gönderilmez.">
        <button type="button" className="btn" onClick={() => window.elitlig.float.show()} title="Float rafı: dosyaları başka uygulamalara sürükleyin"><FIcon name="paperclip" size={15} /> Float</button>
        <button type="button" className="btn" onClick={() => setRecorder(true)} title="Ekranın ya da bir pencerenin videosunu kaydet"><FIcon name="video" size={15} /> Ekran kaydı</button>
        <button type="button" className="btn" onClick={() => setDownload(true)}><FIcon name="download" size={15} /> Bağlantıdan indir</button>
        <button type="button" className="btn btn--primary" onClick={() => pick(false)}><FIcon name="plus" size={15} /> Dosya seç</button>
      </ViewHeader>
      <Segmented value={tab} onChange={chooseTab} ariaLabel="Bölüm" options={[
        { value: "home", label: "Ana sayfa", icon: "folder", count: files.length || undefined },
        { value: "library", label: "Kütüphane", icon: "clock", count: jobs.length || undefined },
        { value: "settings", label: "Ayarlar", icon: "sliders" },
      ]} />

      {tab === "home" && (<>
        {!files.length ? (
          <div className={`ft-drop ${dragOver ? "is-over" : ""}`} onClick={() => pick(false)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(false); } }} aria-label="Dosya ekle">
            <span className="ft-drop__art" aria-hidden="true"><FIcon name="upload" size={30} /></span>
            <strong>Dosyaları buraya sürükleyin</strong>
            <p>ya da tıklayıp seçin · <Kbd>⌘O</Kbd> · panodan yapıştırın <Kbd>⌘V</Kbd></p>
            <div className="ft-drop__chips" aria-hidden="true">
              <span><Kbd>⇧</Kbd> ile bırak: Dönüştür</span>
              <span><Kbd>⌘</Kbd> ile bırak: Araçlar</span>
              <span><Kbd>{isMac() ? "⌃" : "Alt"}</Kbd> ile bırak: Dosya işlemleri</span>
            </div>
            <div className="ft-drop__formats">Görsel (JPG, PNG, WEBP, HEIC, GIF, TIFF) · Video (MP4, MOV, WEBM, MKV) · Ses (MP3, M4A, WAV, FLAC) · PDF · ZIP · SRT/VTT · Metin</div>
            <div className="ft-drop__btns" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn btn--sm" onClick={() => pick(true)}><FIcon name="folder" size={14} /> Klasör seç</button>
              <button type="button" className="btn btn--sm" onClick={paste}><FIcon name="clipboard" size={14} /> Panodan yapıştır</button>
            </div>
          </div>
        ) : (
          <section className={`ft-selection card ${dragOver ? "is-over" : ""}`} aria-label="Seçili dosyalar">
            <div className="ft-selection__head">
              <strong>{sel.size ? `${sel.size} / ${files.length} dosya seçili` : `${files.length} dosya`}</strong>
              <span className="muted">{formatBytes(active.reduce((s, f) => s + (f.size || 0), 0))}</span>
              <span className="spacer" />
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => pick(false)}><FIcon name="plus" size={14} /> Ekle</button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={paste}><FIcon name="clipboard" size={14} /> Yapıştır</button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setFiles([]); setSel(new Set()); }}>Temizle</button>
              <button type="button" className="btn btn--sm btn--soft" onClick={() => setWheel(tileGroup)} title="Çark (⌘↩)"><FIcon name="wheel" size={14} /> Çark</button>
            </div>
            <ul className="ft-chips" role="listbox" aria-multiselectable="true" aria-label="Dosyalar">
              {files.map((f) => (
                <li key={f.id} role="option" aria-selected={sel.has(f.id)} className={`ft-chip ${sel.has(f.id) ? "is-selected" : ""}`} tabIndex={0}
                  onClick={(e) => clickFile(f, e)} onDoubleClick={() => ft().preview(f.path)}
                  onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); clickFile(f, { metaKey: true, ctrlKey: true }); } }}
                  onContextMenu={(e) => { e.preventDefault(); if (!sel.has(f.id)) setSel(new Set([f.id])); setWheel("tools"); }}
                  draggable onDragStart={(e) => { e.preventDefault(); ft().startDrag(sel.has(f.id) ? active.map((x) => x.path) : [f.path]); }}>
                  <span className="ft-chip__thumb">
                    {f.kind === "image" && ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"].includes(f.ext) ? <img src={f.url} alt="" loading="lazy" /> : <img src={f.icon} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                    <span className="ft-chip__kind"><FIcon name={KIND_ICONS[f.kind] || "file"} size={12} /></span>
                  </span>
                  <span className="ft-chip__text">
                    <strong title={f.path}>{f.name}</strong>
                    <small>{KIND_LABELS[f.kind] || "Dosya"}{f.ext ? ` · ${f.ext.toUpperCase()}` : ""}{f.size != null ? ` · ${formatBytes(f.size)}` : ""}</small>
                  </span>
                  <button type="button" className="icon-btn icon-btn--xs ft-chip__x" onClick={(e) => { e.stopPropagation(); removeFiles([f.id]); }} aria-label={`${f.name} listeden kaldır`}><FIcon name="x" size={12} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {files.length > 0 && (
          <section className="ft-actions" aria-label="İşlemler">
            <div className="ft-tiles3">
              {GROUPS.map((g) => (
                <button key={g.key} type="button" className={`ft-tile3 ${tileGroup === g.key ? "is-active" : ""}`} onClick={() => setTileGroup(g.key)} onDoubleClick={() => setWheel(g.key)} disabled={!tools[g.key].length} aria-pressed={tileGroup === g.key}>
                  <span className="ft-tile3__icon"><FIcon name={g.icon} size={20} /></span>
                  <strong>{g.label}</strong>
                  <small>{tools[g.key].length ? `${tools[g.key].length} seçenek` : "Uygun işlem yok"}</small>
                </button>
              ))}
            </div>
            <div className="ft-grid" role="menu" aria-label={GROUPS.find((g) => g.key === tileGroup)?.label}>
              {tools[tileGroup].map((t) => (
                <button key={t.id} type="button" role="menuitem" className={`ft-tool ${tileGroup === "convert" ? "ft-tool--fmt" : ""}`} disabled={t.disabled} title={t.reason || t.label} onClick={() => pickTool(t)}>
                  <FIcon name={t.icon} size={tileGroup === "convert" ? 14 : 18} />
                  <span>{t.label}</span>
                  {t.disabled && <small>{t.reason}</small>}
                </button>
              ))}
              {!tools[tileGroup].length && <p className="muted ft-grid__empty">Seçili dosyalar için bu grupta işlem yok.</p>}
              {kindsOf(active).length > 1 && <p className="muted ft-grid__empty">Farklı türde dosyalar seçili; dönüştürme ve araçlar için aynı türden dosyaları seçin (tıklayın, ⌘ ile çoklu seçin).</p>}
            </div>
          </section>
        )}

        {(running.length > 0 || recent.length > 0) && (
          <section className="ft-jobs card" aria-label="İşler">
            <div className="ft-selection__head"><strong>İşler</strong>{running.length > 0 && <span className="pill pill--blue">{running.length} etkin</span>}<span className="spacer" /><button type="button" className="btn btn--sm btn--ghost" onClick={() => chooseTab("library")}>Kütüphane</button></div>
            <ul className="ft-joblist">{[...running, ...recent].map((j) => <JobRow key={j.id} job={j} onReuse={reuse} />)}</ul>
          </section>
        )}
        {!files.length && !running.length && !recent.length && (
          <div className="ft-feature-grid" aria-label="Neler yapılabilir">
            {[
              ["image", "Görseller", "Dönüştür, boyutlandır, kırp, işaretle, sansürle, kolaj, PDF"],
              ["video", "Video", "Kırp, sıkıştır, hız, sesi ayıkla, birleştir, GIF, kare yakala"],
              ["music", "Ses", "MP3 / M4A / WAV / FLAC, kırp, normalize, birleştir"],
              ["file", "PDF", "Birleştir, böl, sayfaları sırala / döndür, sıkıştır"],
              ["archive", "Arşiv ve metin", "ZIP oluştur / aç, SRT ↔ VTT, metin kodlaması"],
              ["paperclip", "Float rafı", "Dosyaları yüzen raftan başka uygulamalara sürükleyin"],
            ].map(([icon, t, d]) => <div key={t} className="ft-feature"><FIcon name={icon} size={18} /><strong>{t}</strong><small>{d}</small></div>)}
          </div>
        )}
      </>)}

      {tab === "library" && <Library jobs={jobs} onReuse={reuse} onReload={() => ft().jobs().then((r) => r.ok && setJobs(r.items))} confirm={confirm} />}
      {tab === "settings" && <Settings caps={caps} />}

      {dragOver && dropMods && <div className="ft-dropmode" aria-hidden="true">{GROUPS.find((g) => g.key === dropMods)?.label} çarkı açılacak</div>}
      {wheel && <Wheel tools={tools} group={wheel} onGroup={setWheel} onPick={pickTool} onClose={() => setWheel(null)} count={active.length} />}
      {dialog && <ToolDialog tool={dialog.tool} files={dialog.files} onClose={() => setDialog(null)} onStart={startDialog} />}
      {editor?.kind === "image" && (
        <div className="ie-backdrop">
          <ImageEditor source={editor.file} initialMode={editor.mode} title={editor.file.name} defaultFormat={outputFormat(editor.file.ext)}
            onClose={() => setEditor(null)}
            onSave={async (bytes, fmt) => {
              const res = await runClient("imgEdit", { bytes, format: fmt }, [editor.file]);
              if (res.ok) setEditor(null);
            }} />
        </div>
      )}
      {editor?.kind === "media" && <div className="ie-backdrop"><MediaEditor file={editor.file} mode={editor.mode} onClose={() => setEditor(null)} onRun={(spec) => runMain(spec, [editor.file])} /></div>}
      {editor?.kind === "pdf" && <div className="ie-backdrop"><PdfPages file={editor.file} onClose={() => setEditor(null)} onRun={(spec) => runMain(spec, [editor.file])} /></div>}
      {qr && <QrResults results={qr} onClose={() => setQr(null)} />}
      {recorder && <ScreenRecorder onClose={() => setRecorder(false)} onRunMain={(spec) => runMain(spec, [])} />}
      {download && <DownloadDialog initialUrl={typeof download === "string" ? download : ""} onClose={() => setDownload(false)} onStart={(spec) => runMain(spec, [])} />}
    </div>
  );
}

/* ------------------------------- iş satırı ------------------------------- */

function JobRow({ job, onReuse, onRemove }) {
  const active = ACTIVE.has(job.status);
  const pct = Math.round((job.progress || 0) * 100);
  const out = job.outputs || [];
  return (
    <li className={`ft-job ft-job--${job.status}`}>
      <span className="ft-job__icon"><FIcon name={job.status === "done" ? "check" : job.status === "error" ? "alert" : job.status === "canceled" ? "x" : KIND_ICONS[job.kind] || "file"} size={15} /></span>
      <div className="ft-job__main">
        <div className="ft-job__line">
          <strong>{job.label}</strong>
          <span className="muted ft-job__files" title={(job.inputs || []).map((i) => i.path).join("\n")}>{(job.inputs || []).length ? `${job.inputs[0].name}${job.inputs.length > 1 ? ` +${job.inputs.length - 1}` : ""}` : job.options?.url || ""}</span>
          <span className="spacer" />
          <span className={`pill ${job.status === "done" ? "pill--green" : job.status === "error" ? "pill--red" : active ? "pill--blue" : ""}`}>{JOB_STATUS[job.status]}{job.status === "running" && !job.indeterminate ? ` %${pct}` : ""}</span>
        </div>
        {active && <div className={`ft-progress ${job.indeterminate || job.status === "queued" ? "is-indeterminate" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.indeterminate ? undefined : pct} aria-label={`${job.label} ilerlemesi`}><span style={{ width: `${job.indeterminate ? 100 : pct}%` }} /></div>}
        {job.status === "error" && <p className="ft-job__err">{job.error}</p>}
        {job.note && job.status === "done" && <p className="muted ft-job__note">{job.note}</p>}
        {job.status === "done" && out.length > 0 && (
          <ul className="ft-job__outs">{out.slice(0, 4).map((o) => (
            <li key={o.path} className={o.missing ? "is-missing" : ""}>
              <button type="button" className="linklike" onClick={() => window.elitlig.fileTools.reveal(o.path)} disabled={o.missing} title={o.path}
                draggable={!o.missing} onDragStart={(e) => { e.preventDefault(); window.elitlig.fileTools.startDrag([o.path]); }}>
                <FIcon name="file" size={12} /> {o.name}
              </button>
              {o.size != null && <small className="muted">{formatBytes(o.size)}</small>}
              {o.missing && <small className="muted">· taşınmış / silinmiş</small>}
            </li>
          ))}{out.length > 4 && <li className="muted">… {out.length - 4} dosya daha</li>}</ul>
        )}
      </div>
      <div className="ft-job__tools">
        {active && <button type="button" className="btn btn--xs" onClick={() => window.elitlig.fileTools.cancel(job.id)}>İptal</button>}
        {job.status === "done" && out[0] && !out[0].missing && <>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => window.elitlig.fileTools.reveal(out[0].path)} aria-label="Klasörde göster" title="Klasörde göster"><FIcon name="folder" size={13} /></button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => window.elitlig.fileTools.preview(out[0].path)} aria-label="Önizle" title="Önizle"><FIcon name="eye" size={13} /></button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => onReuse(job)} aria-label="Çıktıları yeniden kullan" title="Çıktıları yeniden kullan"><FIcon name="repeat" size={13} /></button>
        </>}
        {!active && (job.inputs || []).length > 0 && job.status !== "done" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => onReuse(job, "inputs")} aria-label="Girdileri yeniden seç" title="Girdileri yeniden seç"><FIcon name="refresh" size={13} /></button>}
        {onRemove && !active && <button type="button" className="icon-btn icon-btn--xs" onClick={() => onRemove(job)} aria-label="Kütüphaneden kaldır" title="Kütüphaneden kaldır (dosyalar silinmez)"><FIcon name="x" size={13} /></button>}
      </div>
    </li>
  );
}

/* -------------------------------- kütüphane -------------------------------- */

function Library({ jobs, onReuse, onReload, confirm }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr-TR");
    return jobs.filter((j) => (status === "all" || j.status === status)
      && (!s || [j.label, ...(j.inputs || []).map((i) => i.name), ...(j.outputs || []).map((o) => o.name)].join(" ").toLocaleLowerCase("tr-TR").includes(s)));
  }, [jobs, q, status]);
  const clear = async () => {
    if (!(await confirm({ title: "Kütüphaneyi temizle", message: "İş geçmişi silinir. Dosyalarınız (girdi ve çıktılar) yerinde kalır.", confirmLabel: "Temizle", danger: true }))) return;
    await window.elitlig.fileTools.clearLibrary();
    onReload();
  };
  return (
    <section className="ft-library" aria-label="Kütüphane">
      <div className="filters">
        <input id="ft-lib-search" type="search" placeholder="Dosya ya da işlem ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kütüphanede ara" />
        <Segmented value={status} onChange={setStatus} size="sm" ariaLabel="Durum" options={[{ value: "all", label: "Tümü" }, { value: "done", label: "Bitenler" }, { value: "error", label: "Hatalar" }, { value: "running", label: "Etkin" }]} />
        <span className="spacer" />
        <span className="muted">Son 50 iş</span>
        <button type="button" className="btn btn--sm" onClick={clear} disabled={!jobs.length}>Geçmişi temizle</button>
      </div>
      {!list.length ? <Empty icon="clock" title={jobs.length ? "Eşleşen iş yok" : "Henüz iş yok"} text="Dönüştürdüğünüz ve düzenlediğiniz dosyalar burada listelenir; çıktıları yeniden kullanabilir ya da klasörde gösterebilirsiniz." /> : (
        <ul className="ft-joblist card">{list.map((j) => (
          <React.Fragment key={j.id}>
            <li className="ft-job__date muted">{when(j.finishedAt || j.createdAt)}</li>
            <JobRow job={j} onReuse={onReuse} onRemove={async (job) => { await window.elitlig.fileTools.removeJob(job.id); onReload(); }} />
          </React.Fragment>
        ))}</ul>
      )}
    </section>
  );
}

/* --------------------------------- ayarlar --------------------------------- */

function Settings({ caps }) {
  const [s, setS] = useState(null);
  useEffect(() => { window.elitlig.fileTools.settings().then((r) => r.ok && setS(r.settings)); }, []);
  const patch = async (p) => { const r = await window.elitlig.fileTools.setSettings(p); if (r.ok) setS(r.settings); };
  const choose = async () => { const r = await window.elitlig.fileTools.chooseOutDir(); if (r.ok) setS(r.settings); };
  const row = (ok, label, detail) => (
    <li className={`ft-cap ${ok ? "is-ok" : "is-off"}`}><FIcon name={ok ? "check" : "x"} size={14} /><strong>{label}</strong><span className="muted">{detail}</span></li>
  );
  const mac = caps?.platform === "darwin";
  return (
    <section className="ft-settings" aria-label="Ayarlar">
      <div className="card">
        <h3>Çıktılar</h3>
        {s && (<>
          <Field label="Çıktı klasörü" hint="Çakışmada ad otomatik numaralanır: “foto (2).jpg”. Orijinal dosyalar asla değişmez.">
            <div className="ft-path"><code className="selectable">{s.outDir}</code><button type="button" className="btn btn--sm" onClick={choose} disabled={s.nextToSource}>Değiştir…</button>{s.outDir !== s.defaultOutDir && <button type="button" className="btn btn--sm btn--ghost" onClick={() => patch({ outDir: null })}>Varsayılan</button>}</div>
          </Field>
          <label className="ft-check"><input type="checkbox" checked={s.nextToSource} onChange={(e) => patch({ nextToSource: e.target.checked })} /> Çıktıyı kaynak dosyanın yanına kaydet</label>
          <label className="ft-check"><input type="checkbox" checked={s.revealWhenDone} onChange={(e) => patch({ revealWhenDone: e.target.checked })} /> Bitince klasörde göster</label>
        </>)}
      </div>
      <div className="card">
        <h3>Araçlar</h3>
        {!caps ? <p className="muted">Denetleniyor…</p> : (
          <ul className="ft-caps">
            {row(caps.ffmpeg, "ffmpeg", caps.ffmpeg ? `Ses ve video işlemleri hazır (${caps.ffmpegSource === "bundled" ? "uygulamayla gelen" : caps.ffmpegSource === "system" ? "sistemdeki" : "geliştirme"} sürüm).` : "Bulunamadı: ses / video araçları kapalı.")}
            {row(true, "Görsel motoru", "JPG, PNG, WEBP, GIF, BMP, AVIF canvas ile işlenir; meta veri yeniden kodlamada atılır.")}
            {row(caps.heic, "HEIC / TIFF", mac ? "macOS sips ile." : caps.ffmpeg ? "ffmpeg ile (HEIC desteği ffmpeg sürümüne bağlı)." : "ffmpeg gerekli.")}
            {row(mac, "HEIC'e kaydetme", mac ? "macOS sips ile." : "Yalnız Mac'te.")}
            {row(caps.pdfLib, "PDF düzenleme", caps.pdfLib ? "Birleştir, böl, sayfa sırala / döndür / sil." : "Bu özellik için uygulama güncellemesi gerekiyor.")}
            {row(true, "Görsel / HTML / metin → PDF", "Yerleşik yazdırma motoruyla (uzak kaynaklar engellenir).")}
            {row(caps.gs, "PDF sıkıştırma (Ghostscript)", caps.gs ? "Görseller küçültülerek sıkıştırılır." : "Ghostscript yok: yalnız PDF yapısı yeniden yazılır. Mac: brew install ghostscript")}
            {row(caps.qrNative || caps.jsqr, "QR okuma", caps.qrNative ? "Sistemin barkod algılayıcısıyla." : caps.jsqr ? "Yerleşik QR çözücüyle." : "Bu özellik için uygulama güncellemesi gerekiyor.")}
            {row(caps.zip && caps.unzip, "ZIP", mac ? "macOS ditto ile." : caps.platform === "win32" ? "Windows PowerShell ile." : "zip / unzip ile.")}
          </ul>
        )}
      </div>
      <YtdlpSettings />
      <div className="card card--flat ft-privacy">
        <FIcon name="shield" size={18} />
        <p><strong>Gizlilik.</strong> Dönüştürme ve düzenleme bu bilgisayarda yapılır; dosyalarınız Elitlig sunucusuna ya da başka bir hizmete gönderilmez. Yalnız "Bağlantıdan indir" seçtiğiniz siteye bağlanır.</p>
      </div>
    </section>
  );
}

/* ----------------------------- QR sonuçları ----------------------------- */

function QrResults({ results, onClose }) {
  const toast = useToast();
  return (
    <Modal title="QR kodları" onClose={onClose} width={520} footer={<button type="button" className="btn btn--primary" onClick={onClose}>Tamam</button>}>
      <ul className="ft-qr">
        {results.map((r) => (
          <li key={r.file.id}>
            <strong>{r.file.name}</strong>
            {r.error ? <p className="ft-job__err">{r.error}</p> : !r.codes.length ? <p className="muted">QR kodu bulunamadı.</p> : r.codes.map((c, i) => (
              <div key={i} className="ft-qr__code">
                <code className="selectable">{c.text}</code>
                <button type="button" className="btn btn--xs" onClick={() => { navigator.clipboard?.writeText(c.text).then(() => toast("Kopyalandı.", { tone: "success" })); }}>Kopyala</button>
                {/^https?:\/\//i.test(c.text) && <button type="button" className="btn btn--xs" onClick={() => window.elitlig.app.openExternal(c.text)}>Aç</button>}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
