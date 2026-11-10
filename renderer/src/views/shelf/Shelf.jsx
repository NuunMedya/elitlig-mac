// Ekran Görüntüleri ve Pano — kütüphane (ana pencere).
//
// Ekran görüntüleri, kopyalanan görseller, metinler ve bağlantılar tek yerde:
// ızgara / liste, sanal klasörler, etiketler, adlandırma, sabitleme, arama,
// saklama süresi, çöp kutusu, dışa aktarma, başka uygulamaya sürükleme,
// yakınlaştırmalı önizleme, işaretleme ve kırpma (Dosya Araçları düzenleyicisi).
// Raflar her yerden ⌃⌥T ile açılır. Hiçbir şey sunucuya gönderilmez.
//
//   ← → ↑ ↓ gez · Boşluk önizle · ↩ / ⌘C kopyala · P sabitle · M işaretle · C kırp
//   ⌫ çöpe · ⌘A tümü · ⌘F ara · ⇧⌘E dışa aktar · Esc seçimi bırak
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Field, Kbd, Modal, Segmented, Spinner, ViewHeader, isMac, keyLabel, useConfirm, useToast } from "../../components/ui";
import { useCommand } from "../../api";
import { FIcon } from "../files/icons";
import Preview from "./Preview";
import ImageEditor from "../files/ImageEditor";
import ShelfOnboarding from "./ShelfOnboarding";
import { RETENTION_OPTIONS, SHELVES, SOURCE_LABELS, accelLabel, acceleratorFromEvent, folderTree, gridMove, itemTitle, relativeTime } from "../../lib/shelf/shelfUtils";
import { formatBytes } from "../../lib/files/catalog";
import "../files/files.css";
import "./shelf.css";

const sh = () => window.elitlig.shelf;
const PAGE = 120;
const VIEW_KEY = "shelf:view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; } };

export default function Shelf({ arg }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState("library");
  const [scope, setScope] = useState({ key: "all" }); // all | image | text | link | pinned | trash | folder:<id> | tag:<t> | unfiled
  const [query, setQuery] = useState("");
  const [view, setView] = useState(readView);
  const [data, setData] = useState({ items: [], total: 0, counts: null, folders: [] });
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState([]);
  const [focus, setFocus] = useState(0);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(null); // { item, mode }
  const [note, setNote] = useState(false);
  const [folderDialog, setFolderDialog] = useState(null);
  const [tagDialog, setTagDialog] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const gridRef = useRef(null);
  const searchRef = useRef(null);

  const filter = useMemo(() => {
    const k = scope.key;
    if (k === "trash") return { scope: "trash", query };
    if (["image", "text", "link"].includes(k)) return { scope: "library", kind: k, query };
    if (k === "pinned") return { scope: "library", pinned: true, query };
    if (k === "unfiled") return { scope: "library", folderId: "none", query };
    if (k.startsWith("folder:")) return { scope: "library", folderId: k.slice(7), query };
    if (k.startsWith("tag:")) return { scope: "library", tag: k.slice(4), query };
    return { scope: "library", query };
  }, [scope, query]);

  const load = useCallback(async () => {
    const res = await sh().list(filter, { limit });
    if (res.ok) setData(res);
    setLoading(false);
    return res;
  }, [filter, limit]);
  useEffect(() => { const t = setTimeout(load, query ? 140 : 0); return () => clearTimeout(t); }, [load, query]);
  useEffect(() => sh().onChange(() => load()), [load]);
  useEffect(() => sh().onNotice((err) => toast(err?.message || "İşlem yapılamadı.", { tone: "error", timeout: 8000 })), [toast]);
  useEffect(() => { setSel([]); setFocus(0); setLimit(PAGE); }, [scope]);

  // Raflardan / yakalamadan gelen istek: crop-<id>, markup-<id>, item-<id>, settings.
  useEffect(() => {
    if (!arg) return;
    if (arg === "settings") { setTab("settings"); return; }
    const m = String(arg).match(/^(crop|markup|item)-(.+)$/);
    if (!m) return;
    setTab("library");
    sh().get(m[2]).then((r) => {
      if (!r.ok || !r.item) return;
      setSel([r.item.id]);
      if (m[1] !== "item" && r.item.kind === "image") setEditing({ item: r.item, mode: m[1] });
    });
  }, [arg]);

  const items = data.items;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const selected = sel.map((id) => byId.get(id)).filter(Boolean);
  const current = selected.length === 1 ? selected[0] : null;
  const focusItem = items[focus] || null;
  const trash = scope.key === "trash";

  const chooseView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* yoksay */ } };
  const clickItem = (it, i, e) => {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    setFocus(i);
    if (e.shiftKey && sel.length) {
      const anchor = items.findIndex((x) => x.id === sel[sel.length - 1]);
      const range = items.slice(Math.min(anchor, i), Math.max(anchor, i) + 1).map((x) => x.id);
      setSel([...new Set([...sel, ...range])]);
    } else if (mod) setSel((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]));
    else setSel([it.id]);
  };

  /* ---------------------------------- eylemler ---------------------------------- */

  const targets = () => (selected.length ? selected : focusItem ? [focusItem] : []);
  const copy = async (list = targets()) => {
    if (!list.length) return;
    const res = await sh().copy(list.map((i) => i.id));
    if (res.ok) toast(res.note || (list.length > 1 ? `${list.length} öğe kopyalandı.` : "Kopyalandı."), { tone: "success", timeout: 1800 });
    else toast(res.error?.message || "Kopyalanamadı.", { tone: "error" });
  };
  const togglePin = async (list = targets()) => {
    if (!list.length) return;
    const pin = !list.every((i) => i.pinned);
    await sh().updateMany(list.map((i) => i.id), { pinned: pin });
  };
  const toTrash = async (list = targets()) => {
    if (!list.length) return;
    if (trash) {
      if (!(await confirm({ title: "Kalıcı olarak sil", message: `${list.length} öğe kalıcı olarak silinsin mi? Ekran görüntüsünün özgün dosyası klasöründe kalır.`, confirmLabel: "Sil", danger: true }))) return;
      await sh().purge(list.map((i) => i.id));
    } else {
      if (!(await confirm({ title: "Çöp kutusuna taşı", message: `${list.length} öğe çöp kutusuna taşınsın mı? 30 gün içinde geri alınabilir.`, confirmLabel: "Çöpe taşı", danger: true }))) return;
      await sh().trash(list.map((i) => i.id));
    }
    setSel([]);
  };
  const restore = async (list = targets()) => { await sh().restore(list.map((i) => i.id)); setSel([]); toast("Geri yüklendi.", { tone: "success" }); };
  const exportItems = async (list = targets()) => { if (list.length) { const r = await sh().export(list.map((i) => i.id)); if (r.ok) toast(`${r.count} öğe dışa aktarıldı.`, { tone: "success" }); } };
  const capture = async () => {
    const r = await sh().capture();
    if (!r.ok) toast(r.error?.message || "Ekran yakalanamadı.", { tone: "error", timeout: 9000 });
  };
  const emptyTrash = async () => {
    if (!(await confirm({ title: "Çöp kutusunu boşalt", message: "Çöpteki tüm öğeler kalıcı olarak silinir.", confirmLabel: "Boşalt", danger: true }))) return;
    await sh().emptyTrash();
  };

  /* ---------------------------------- klavye ---------------------------------- */

  useCommand("find", () => searchRef.current?.focus());
  useCommand("export", () => exportItems());
  useCommand("new", () => setNote(true));
  const cols = () => {
    const el = gridRef.current;
    if (!el || view === "list") return 1;
    return Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").length);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (tab !== "library" || preview || editing || note || folderDialog || tagDialog) return;
      if (document.querySelector(".modal-backdrop, .palette-backdrop")) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) {
        if (e.key === "ArrowDown" && document.activeElement === searchRef.current) { e.preventDefault(); gridRef.current?.focus(); }
        return;
      }
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const next = gridMove(focus, items.length, cols(), e.key);
        if (next >= 0) {
          setFocus(next);
          setSel((s) => (e.shiftKey ? [...new Set([...s, items[next].id])] : [items[next].id]));
          document.getElementById(`li-${items[next].id}`)?.scrollIntoView({ block: "nearest" });
        }
        return;
      }
      if (e.key === " ") { e.preventDefault(); if (focusItem) { if (!sel.length) setSel([focusItem.id]); setPreview(true); } return; }
      if (e.key === "Enter" || (mod && e.key.toLowerCase() === "c" && !e.shiftKey)) { e.preventDefault(); copy(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(items.map((i) => i.id)); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); exportItems(); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); toTrash(); return; }
      if (e.key === "Escape") { setSel([]); return; }
      if (mod || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "p" && !e.shiftKey) { e.preventDefault(); togglePin(); }
      else if (k === "p" && e.shiftKey) { e.preventDefault(); setFolderDialog({ ids: targets().map((i) => i.id) }); }
      else if ((k === "m" || k === "c") && (current || focusItem)?.kind === "image") { e.preventDefault(); setEditing({ item: current || focusItem, mode: k === "m" ? "markup" : "crop" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      const r = await sh().importFiles(e.dataTransfer.files);
      if (r.ok && r.count) toast(`${r.count} görsel kütüphaneye eklendi.`, { tone: "success" });
      else toast("Yalnız görsel dosyaları eklenebilir.", { tone: "warn" });
    } else {
      const text = e.dataTransfer.getData("text/plain");
      if (text?.trim()) await sh().addNote({ text });
    }
  };

  const counts = data.counts;
  const tree = useMemo(() => folderTree(data.folders), [data.folders]);
  const tags = useMemo(() => Object.entries(counts?.tags || {}).sort((a, b) => a[0].localeCompare(b[0], "tr")), [counts]);
  const previewItem = current || focusItem;
  const pIndex = previewItem ? items.findIndex((i) => i.id === previewItem.id) : -1;
  const stepPreview = (dir) => {
    const n = pIndex + dir;
    if (n < 0 || n >= items.length) return;
    setFocus(n);
    setSel([items[n].id]);
  };
  const scopeLabel = () => {
    const k = scope.key;
    if (k.startsWith("folder:")) return data.folders.find((f) => f.id === k.slice(7))?.name || "Klasör";
    if (k.startsWith("tag:")) return `#${k.slice(4)}`;
    return { all: "Tümü", image: "Görseller", text: "Metinler", link: "Bağlantılar", pinned: "Sabitlenenler", trash: "Çöp Kutusu", unfiled: "Klasörsüz" }[k];
  };

  return (
    <div className="view shl" onDragOver={(e) => { if (tab === "library") { e.preventDefault(); setDragOver(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={onDrop}>
      <ViewHeader title="Ekran Görüntüleri ve Pano" icon="image" subtitle={`Ekran görüntüleri, kopyalanan görseller, metinler ve bağlantılar — ${keyLabel("⌃⌥T")} ile her yerden raflar açılır.`}>
        <button type="button" className="btn" onClick={() => sh().show()}><FIcon name="shelf" size={15} /> Raflar <Kbd>⌃⌥T</Kbd></button>
        <button type="button" className="btn" onClick={capture}><FIcon name="screenshot" size={15} /> Ekranı yakala</button>
        <button type="button" className="btn btn--primary" onClick={() => setNote(true)}><FIcon name="plus" size={15} /> Not</button>
      </ViewHeader>
      <Segmented value={tab} onChange={setTab} ariaLabel="Bölüm" options={[{ value: "library", label: "Kütüphane", icon: "grid", count: counts?.all || undefined }, { value: "settings", label: "Ayarlar", icon: "sliders" }]} />

      {tab === "settings" ? <ShelfSettings /> : (
        <div className="shl__body">
          <nav className="shl__side" aria-label="Kütüphane bölümleri">
            {[
              ["all", "Tümü", "layers", counts?.all],
              ["image", "Görseller", "image", counts?.image],
              ["text", "Metinler", "note", counts?.text],
              ["link", "Bağlantılar", "link", counts?.link],
              ["pinned", "Sabitlenenler", "pin", counts?.pinned],
            ].map(([key, label, icon, n]) => (
              <button key={key} type="button" className={`shl__nav ${scope.key === key ? "is-active" : ""}`} onClick={() => setScope({ key })} aria-current={scope.key === key ? "page" : undefined}>
                <FIcon name={icon} size={14} /><span>{label}</span>{n ? <small>{n}</small> : null}
              </button>
            ))}
            <div className="shl__group"><span>Klasörler</span><button type="button" className="icon-btn icon-btn--xs" onClick={() => setFolderDialog({ create: true })} aria-label="Yeni klasör"><FIcon name="plus" size={12} /></button></div>
            {tree.map((f) => (
              <div key={f.id} className={`shl__nav shl__nav--folder ${scope.key === `folder:${f.id}` ? "is-active" : ""}`} style={{ paddingLeft: 10 + f.depth * 14 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => { e.preventDefault(); e.stopPropagation(); const ids = e.dataTransfer.getData("application/x-elitlig-shelf"); if (ids) { await sh().updateMany(ids.split(","), { folderId: f.id }); toast(`“${f.name}” klasörüne taşındı.`, { tone: "success" }); } }}>
                <button type="button" className="shl__navbtn" onClick={() => setScope({ key: `folder:${f.id}` })}><FIcon name="folder" size={14} /><span>{f.name}</span>{counts?.folders?.[f.id] ? <small>{counts.folders[f.id]}</small> : null}</button>
                <FolderMenu folder={f} onRename={() => setFolderDialog({ folder: f })} onSub={() => setFolderDialog({ create: true, parentId: f.id })}
                  onDelete={async () => { if (await confirm({ title: "Klasörü sil", message: `“${f.name}” silinsin mi? İçindeki öğeler silinmez, klasörsüz kalır.`, confirmLabel: "Sil", danger: true })) { await sh().folderDelete(f.id); if (scope.key === `folder:${f.id}`) setScope({ key: "all" }); } }} />
              </div>
            ))}
            {!tree.length && <p className="shl__hint">Klasörler sanaldır: öğeleri düzenler, dosyaları taşımaz.</p>}
            {tags.length > 0 && <div className="shl__group"><span>Etiketler</span></div>}
            {tags.map(([t, n]) => (
              <button key={t} type="button" className={`shl__nav ${scope.key === `tag:${t}` ? "is-active" : ""}`} onClick={() => setScope({ key: `tag:${t}` })}>
                <FIcon name="hash" size={14} /><span>{t}</span><small>{n}</small>
              </button>
            ))}
            <div className="shl__group" />
            <button type="button" className={`shl__nav ${trash ? "is-active" : ""}`} onClick={() => setScope({ key: "trash" })}><FIcon name="trash" size={14} /><span>Çöp Kutusu</span>{counts?.trash ? <small>{counts.trash}</small> : null}</button>
          </nav>

          <section className={`shl__main ${dragOver ? "is-over" : ""}`} aria-label={scopeLabel()}>
            <ShelfOnboarding />
            <div className="filters">
              <div className="shl__search"><FIcon name="search" size={14} /><input ref={searchRef} type="search" placeholder="Ara: metin, başlık, not, #etiket, alan adı…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Kütüphanede ara" /></div>
              <span className="muted">{data.total} öğe</span>
              <span className="spacer" />
              {selected.length > 1 && <span className="pill pill--tool">{selected.length} seçili</span>}
              {trash && <button type="button" className="btn btn--sm btn--danger-ghost" onClick={emptyTrash} disabled={!data.total}>Çöpü boşalt</button>}
              <Segmented value={view} onChange={chooseView} size="sm" ariaLabel="Görünüm" options={[{ value: "grid", label: "", icon: "grid", title: "Izgara" }, { value: "list", label: "", icon: "list", title: "Liste" }]} />
            </div>
            {loading ? <Spinner /> : !items.length ? (
              <Empty icon={trash ? "trash" : "image"} title={query ? `“${query}” için sonuç yok` : trash ? "Çöp kutusu boş" : "Henüz öğe yok"}
                text={trash ? "Süresi dolan ve silinen öğeler 30 gün burada kalır." : `Ekran görüntüsü aldığınızda (Mac: ⇧⌘3 / ⇧⌘4 · Windows: Win+PrtSc) kendiliğinden buraya gelir. Uygulama içinden yakalamak için ${keyLabel("⌃⌥A")}. Bağlantı kopyaladığınızda Bağlantılar rafına eklenir.`}
                action={!trash && !query ? <div className="row-gap"><button type="button" className="btn" onClick={capture}><FIcon name="screenshot" size={14} /> Ekranı yakala</button> <button type="button" className="btn" onClick={() => setTab("settings")}>Kaynakları ayarla</button></div> : null} />
            ) : (
              <ul ref={gridRef} className={`shl__items shl__items--${view}`} role="listbox" aria-multiselectable="true" aria-label="Öğeler" tabIndex={0}>
                {items.map((it, i) => (
                  <li key={it.id} id={`li-${it.id}`} role="option" aria-selected={sel.includes(it.id)} className={`shi shi--${it.kind} ${sel.includes(it.id) ? "is-selected" : ""} ${focus === i ? "is-focus" : ""}`}
                    onClick={(e) => clickItem(it, i, e)} onDoubleClick={() => { setSel([it.id]); setFocus(i); setPreview(true); }}
                    draggable onDragStart={(e) => {
                      const ids = sel.includes(it.id) ? sel : [it.id];
                      // Klasöre bırakma (uygulama içi) için kimlikler; dışarıya dosya olarak sürüklenir.
                      if (e.altKey) { e.dataTransfer.setData("application/x-elitlig-shelf", ids.join(",")); return; }
                      e.preventDefault();
                      sh().startDrag(ids);
                    }}>
                    <div className="shi__thumb">
                      {it.kind === "image" && <img src={it.thumbUrl} alt="" loading="lazy" draggable={false} />}
                      {it.kind === "text" && <p>{String(it.text || "").slice(0, 300)}</p>}
                      {it.kind === "link" && (it.linkImageUrl ? <img src={it.linkImageUrl} alt="" loading="lazy" draggable={false} /> : <span className="shi__globe"><FIcon name="globe" size={24} /><small>{it.domain}</small></span>)}
                      {it.pinned && <span className="shi__pin" title="Sabitlendi"><FIcon name="pin" size={11} /></span>}
                      {it.edited && <span className="shi__badge">Düzenlendi</span>}
                    </div>
                    <div className="shi__text">
                      <strong>{itemTitle(it)}</strong>
                      <small>{SHELVES.find((s) => s.key === it.kind)?.label.slice(0, -3)} · {relativeTime(it.copiedAt || it.createdAt)}{it.kind === "image" && it.width ? ` · ${it.width}×${it.height}` : ""}</small>
                      {view === "list" && (it.tags || []).length > 0 && <span className="shi__tags">{it.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.total > items.length && <button type="button" className="btn btn--block" onClick={() => setLimit((l) => l + PAGE)}>Daha fazla göster ({data.total - items.length})</button>}
          </section>

          <aside className="shl__inspector" aria-label="Ayrıntılar">
            {current ? <Inspector key={current.id} item={current} folders={data.folders} trash={trash} onCopy={() => copy([current])} onEdit={(mode) => setEditing({ item: current, mode })}
              onPreview={() => setPreview(true)} onTrash={() => toTrash([current])} onRestore={() => restore([current])} onExport={() => exportItems([current])} onTag={() => setTagDialog({ ids: [current.id] })} />
              : selected.length > 1 ? (
                <div className="shl__batch">
                  <strong>{selected.length} öğe seçili</strong>
                  {trash ? (<>
                    <button type="button" className="btn btn--block" onClick={() => restore()}><FIcon name="undo" size={14} /> Geri yükle</button>
                    <button type="button" className="btn btn--block btn--danger-ghost" onClick={() => toTrash()}><FIcon name="trash" size={14} /> Kalıcı sil</button>
                  </>) : (<>
                    <button type="button" className="btn btn--block" onClick={() => copy()}><FIcon name="copy" size={14} /> Kopyala</button>
                    <button type="button" className="btn btn--block" onClick={() => togglePin()}><FIcon name="pin" size={14} /> Sabitle / kaldır</button>
                    <button type="button" className="btn btn--block" onClick={() => setFolderDialog({ ids: sel })}><FIcon name="folder" size={14} /> Klasöre koy</button>
                    <button type="button" className="btn btn--block" onClick={() => setTagDialog({ ids: sel })}><FIcon name="hash" size={14} /> Etiket ekle</button>
                    <button type="button" className="btn btn--block" onClick={() => exportItems()}><FIcon name="download" size={14} /> Dışa aktar</button>
                    <button type="button" className="btn btn--block btn--danger-ghost" onClick={() => toTrash()}><FIcon name="trash" size={14} /> Çöpe taşı</button>
                  </>)}
                </div>
              ) : (
                <div className="shl__tips">
                  <strong>İpuçları</strong>
                  <ul>
                    <li><Kbd>⌃⌥T</Kbd> raflar · <Kbd>⌃⌥S</Kbd> rafta ara · <Kbd>⌃⌥A</Kbd> ekranı yakala</li>
                    <li><Kbd>Boşluk</Kbd> önizle · <Kbd>↩</Kbd> kopyala · <Kbd>P</Kbd> sabitle</li>
                    <li><Kbd>M</Kbd> işaretle · <Kbd>C</Kbd> kırp · <Kbd>⇧P</Kbd> klasöre koy</li>
                    <li>Öğeyi başka bir uygulamaya sürükleyip bırakın; <Kbd>⌥</Kbd> ile sürükleyip soldaki bir klasöre bırakın.</li>
                    <li>Sabitlenen, klasöre konan ya da etiketlenen öğeler saklama süresi dolunca da kalır.</li>
                  </ul>
                </div>
              )}
          </aside>
        </div>
      )}

      {preview && previewItem && (
        <Preview item={previewItem} onClose={() => setPreview(false)} onCopy={() => copy([previewItem])}
          onPrev={pIndex > 0 ? () => stepPreview(-1) : null} onNext={pIndex < items.length - 1 ? () => stepPreview(1) : null}
          onPin={() => togglePin([previewItem])} onEdit={(mode) => { setPreview(false); setEditing({ item: previewItem, mode }); }}
          onSaveText={(text) => sh().update(previewItem.id, { text })} position={`${pIndex + 1} / ${data.total}`} />
      )}
      {editing && (
        <div className="ie-backdrop">
          <ImageEditor source={{ url: editing.item.imageUrl, name: itemTitle(editing.item), ext: "png" }} initialMode={editing.mode} title={itemTitle(editing.item)} formatChoice={false}
            saveLabel="Kaydet" onClose={() => setEditing(null)}
            onSave={async (bytes) => {
              const r = await sh().saveEdit(editing.item.id, bytes);
              if (r.ok) { toast("Kaydedildi. Özgün görsel korunuyor.", { tone: "success" }); setEditing(null); } else toast(r.error?.message || "Kaydedilemedi.", { tone: "error" });
            }} />
        </div>
      )}
      {note && <NoteDialog onClose={() => setNote(false)} />}
      {folderDialog && <FolderDialog spec={folderDialog} folders={tree} onClose={() => setFolderDialog(null)} />}
      {tagDialog && <TagDialog ids={tagDialog.ids} known={tags.map(([t]) => t)} onClose={() => setTagDialog(null)} />}
    </div>
  );
}

/* ------------------------------- ayrıntılar ------------------------------- */

function Inspector({ item, folders, trash, onCopy, onEdit, onPreview, onTrash, onRestore, onExport, onTag }) {
  const [title, setTitle] = useState(item.title || "");
  const [noteText, setNoteText] = useState(item.note || "");
  const save = (patch) => sh().update(item.id, patch);
  return (
    <div className="shl__insp">
      <div className="shl__insp-thumb" onDoubleClick={onPreview}>
        {item.kind === "image" ? <img src={item.thumbUrl} alt="" /> : item.kind === "link" && item.linkImageUrl ? <img src={item.linkImageUrl} alt="" /> : <span className="muted"><FIcon name={item.kind === "link" ? "globe" : "note"} size={28} /></span>}
      </div>
      <div className="shl__insp-acts">
        <button type="button" className="btn btn--sm btn--primary" onClick={onCopy}><FIcon name="copy" size={13} /> Kopyala</button>
        <button type="button" className="btn btn--sm" onClick={onPreview}><FIcon name="eye" size={13} /> Önizle</button>
        {item.kind === "image" && <button type="button" className="btn btn--sm" onClick={() => onEdit("markup")}><FIcon name="pencil" size={13} /> İşaretle</button>}
        {item.kind === "image" && <button type="button" className="btn btn--sm" onClick={() => onEdit("crop")}><FIcon name="crop" size={13} /> Kırp</button>}
        {item.kind === "link" && <button type="button" className="btn btn--sm" onClick={() => sh().openLink(item.id)}><FIcon name="external" size={13} /> Aç</button>}
      </div>
      <Field label="Ad"><input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== (item.title || "") && save({ title })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder={itemTitle(item)} /></Field>
      <Field label="Not"><textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} onBlur={() => noteText !== (item.note || "") && save({ note: noteText })} placeholder="Bu öğe hakkında not…" /></Field>
      <div className="shl__insp-row">
        <label className="ft-check"><input type="checkbox" checked={Boolean(item.pinned)} onChange={(e) => save({ pinned: e.target.checked })} /> Sabitle</label>
        <select value={item.folderId || ""} onChange={(e) => save({ folderId: e.target.value || null })} aria-label="Klasör">
          <option value="">Klasör yok</option>
          {folderTree(folders).map((f) => <option key={f.id} value={f.id}>{"  ".repeat(f.depth)}{f.name}</option>)}
        </select>
      </div>
      <div className="shl__insp-tags">
        {(item.tags || []).map((t) => <span key={t} className="chip">#{t}<button type="button" onClick={() => save({ tags: item.tags.filter((x) => x !== t) })} aria-label={`${t} etiketini kaldır`}>×</button></span>)}
        <button type="button" className="btn btn--xs" onClick={onTag}><FIcon name="plus" size={11} /> Etiket</button>
      </div>
      {item.kind === "image" && item.edited && <button type="button" className="btn btn--sm btn--ghost" onClick={() => sh().revertEdit(item.id)}>Özgün görsele dön</button>}
      <dl className="shl__insp-meta">
        <dt>Kaynak</dt><dd>{SOURCE_LABELS[item.source] || "—"}</dd>
        <dt>Eklendi</dt><dd>{new Date(item.createdAt).toLocaleString("tr-TR")}</dd>
        {item.kind === "image" && <><dt>Boyut</dt><dd>{item.width ? `${item.width} × ${item.height} px` : "—"}{item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}</dd></>}
        {item.kind === "link" && <><dt>Adres</dt><dd className="selectable shl__url">{item.url}</dd></>}
        {item.origPath && <><dt>Özgün dosya</dt><dd className="selectable shl__url">{item.origExists ? item.origPath : "Taşınmış ya da silinmiş (kütüphanedeki kopya duruyor)"}</dd></>}
        {item.kind === "text" && <><dt>Uzunluk</dt><dd>{String(item.text || "").length.toLocaleString("tr-TR")} karakter</dd></>}
      </dl>
      <div className="shl__insp-acts">
        {(item.kind === "image") && <button type="button" className="btn btn--sm btn--ghost" onClick={() => sh().reveal(item.id)}><FIcon name="folder" size={13} /> Klasörde göster</button>}
        {item.kind === "link" && !item.linkTitle && <button type="button" className="btn btn--sm btn--ghost" onClick={() => sh().enrich(item.id)} title="Sayfanın başlığı ve küçük resmi alınır (siteye bağlanılır).">Başlığı getir</button>}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onExport}><FIcon name="download" size={13} /> Dışa aktar</button>
        {trash ? <button type="button" className="btn btn--sm" onClick={onRestore}><FIcon name="undo" size={13} /> Geri yükle</button> : null}
        <button type="button" className="btn btn--sm btn--danger-ghost" onClick={onTrash}><FIcon name="trash" size={13} /> {trash ? "Kalıcı sil" : "Çöpe taşı"}</button>
      </div>
    </div>
  );
}

function FolderMenu({ onRename, onSub, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="shl__fmenu">
      <button type="button" className="icon-btn icon-btn--xs" onClick={() => setOpen((v) => !v)} aria-label="Klasör seçenekleri" aria-expanded={open}><FIcon name="more" size={12} /></button>
      {open && (
        <span className="shl__fmenu-list" role="menu" onMouseLeave={() => setOpen(false)}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onRename(); }}>Yeniden adlandır</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSub(); }}>Alt klasör</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); onDelete(); }}>Sil</button>
        </span>
      )}
    </span>
  );
}

/* ------------------------------- pencereler ------------------------------- */

function NoteDialog({ onClose }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const save = async () => { if (!text.trim()) return; const r = await sh().addNote({ text, title }); if (r.ok) onClose(); };
  return (
    <Modal title="Yeni not" onClose={onClose} width={520} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={save} disabled={!text.trim()}>Kaydet</button></>}>
      <div className="ft-form">
        <Field label="Başlık"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="İsteğe bağlı" /></Field>
        <Field label="Metin"><textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} autoFocus onKeyDown={(e) => { if ((isMac() ? e.metaKey : e.ctrlKey) && e.key === "Enter") save(); }} /></Field>
      </div>
    </Modal>
  );
}

function FolderDialog({ spec, folders, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(spec.folder?.name || "");
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  if (spec.create || spec.folder) {
    const save = async () => {
      const r = spec.folder ? await sh().folderRename(spec.folder.id, name) : await sh().folderCreate(name, spec.parentId || null);
      if (r.ok) onClose(); else toast(r.error?.message, { tone: "error" });
    };
    return (
      <Modal title={spec.folder ? "Klasörü yeniden adlandır" : "Yeni klasör"} onClose={onClose} width={400} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={save} disabled={!name.trim()}>Kaydet</button></>}>
        <Field label="Ad"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></Field>
      </Modal>
    );
  }
  // ⇧P: klasöre koy (ve sabitle) — yaz, ↑ ↓ seç, ↩ onayla; ⌘N yeni klasör.
  const list = folders.filter((f) => f.name.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
  const apply = async (folderId) => { await sh().updateMany(spec.ids, { folderId, pinned: true }); toast("Klasöre konuldu.", { tone: "success" }); onClose(); };
  const create = async () => { const r = await sh().folderCreate(q || "Yeni klasör"); if (r.ok) apply(r.folder.id); };
  return (
    <Modal title="Klasöre koy" onClose={onClose} width={420}>
      <div className="ft-form">
        <input value={q} onChange={(e) => { setQ(e.target.value); setIndex(0); }} placeholder="Klasör ara ya da yeni ad yazın…" autoFocus aria-label="Klasör ara"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(list.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
            else if ((isMac() ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "n") { e.preventDefault(); create(); }
            else if (e.key === "Enter") { e.preventDefault(); if (list[index]) apply(list[index].id); else if (q.trim()) create(); }
          }} />
        <ul className="shl__pick" role="listbox" aria-label="Klasörler">
          {list.map((f, i) => <li key={f.id} role="option" aria-selected={i === index} className={i === index ? "is-active" : ""} style={{ paddingLeft: 10 + f.depth * 14 }} onMouseEnter={() => setIndex(i)} onClick={() => apply(f.id)}><FIcon name="folder" size={13} /> {f.name}</li>)}
          {q.trim() && !list.some((f) => f.name === q.trim()) && <li role="option" aria-selected={!list.length} className={!list.length ? "is-active" : ""} onClick={create}><FIcon name="plus" size={13} /> “{q.trim()}” klasörünü oluştur <Kbd>⌘N</Kbd></li>}
        </ul>
      </div>
    </Modal>
  );
}

function TagDialog({ ids, known, onClose }) {
  const [value, setValue] = useState("");
  const add = async (t) => { const tag = String(t || value).trim(); if (!tag) return; await sh().updateMany(ids, { addTags: [tag] }); onClose(); };
  const suggestions = known.filter((t) => t.toLocaleLowerCase("tr-TR").includes(value.toLocaleLowerCase("tr-TR").replace(/^#/, ""))).slice(0, 12);
  return (
    <Modal title="Etiket ekle" onClose={onClose} width={420} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={() => add()} disabled={!value.trim()}>Ekle</button></>}>
      <div className="ft-form">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="#etiket" autoFocus onKeyDown={(e) => { if (e.key === "Enter") add(); }} aria-label="Etiket" />
        {suggestions.length > 0 && <div className="ft-tokens">{suggestions.map((t) => <button key={t} type="button" className="chip" onClick={() => add(t)}>#{t}</button>)}</div>}
      </div>
    </Modal>
  );
}

/* --------------------------------- ayarlar --------------------------------- */

function ShelfSettings() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [st, setSt] = useState(null);
  const [recording, setRecording] = useState(null);
  const mac = isMac();
  useEffect(() => { sh().settings().then((r) => { if (r.ok) { setS(r.settings); setSt(r.status); } }); }, []);
  const patch = async (p) => { const r = await sh().setSettings(p); if (r.ok) { setS(r.settings); setSt(r.status); } return r; };
  useEffect(() => {
    if (!recording) return undefined;
    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecording(null); return; }
      if (e.key === "Backspace" || e.key === "Delete") { await patch({ shortcuts: { [recording]: "" } }); setRecording(null); return; }
      const accel = acceleratorFromEvent(e);
      if (!accel) return;
      const r = await patch({ shortcuts: { [recording]: accel } });
      setRecording(null);
      if (r.ok && r.status?.shortcuts?.[recording]?.conflict) toast(`${accelLabel(accel, mac)} başka bir uygulamada kullanılıyor.`, { tone: "warn", timeout: 6000 });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!s) return <Spinner />;
  const src = s.sources;
  const SHORTCUTS = [["toggle", "Rafları göster / gizle"], ["search", "Raflarda ara"], ["capture", "Ekranı yakala (işaretçinin altındaki ekran)"]];
  return (
    <section className="ft-settings shl-settings" aria-label="Ayarlar">
      <div className="card">
        <h3>Kaynaklar</h3>
        <label className="ft-check"><input type="checkbox" checked={src.screenshots} onChange={(e) => patch({ sources: { screenshots: e.target.checked } })} /> Ekran görüntüleri</label>
        <p className="muted ft-note">Klasör: <code className="selectable">{st?.screenshotDir || "—"}</code>{mac ? " (Ekran Görüntüsü uygulamasının kayıt yeri)" : " (Win+PrtSc)"}</p>
        <label className="ft-check"><input type="checkbox" checked={src.link} onChange={(e) => patch({ sources: { link: e.target.checked } })} /> Kopyalanan bağlantılar</label>
        <label className="ft-check"><input type="checkbox" checked={src.text} onChange={(e) => patch({ sources: { text: e.target.checked } })} /> Kopyalanan metinler</label>
        <label className="ft-check"><input type="checkbox" checked={src.image} onChange={(e) => patch({ sources: { image: e.target.checked } })} /> Kopyalanan görseller</label>
        <p className="muted ft-note">Parola yöneticilerinin gizli işaretlediği içerikler hiçbir zaman alınmaz. Pano yalnız uygulama açıkken izlenir.</p>
        <h4>Ek klasörler <small className="muted">(en çok 3)</small></h4>
        <ul className="shl-dirs">
          {s.extraDirs.map((d) => <li key={d}><code className="selectable">{d}</code><button type="button" className="icon-btn icon-btn--xs" onClick={() => patch({ extraDirs: s.extraDirs.filter((x) => x !== d) })} aria-label="İzlemeyi bırak"><FIcon name="x" size={12} /></button></li>)}
        </ul>
        <div className="row-gap">
          <button type="button" className="btn btn--sm" disabled={s.extraDirs.length >= 3} onClick={async () => { const r = await sh().addDir(); if (r.ok) { setS(r.settings); setSt(r.status); } else if (!r.canceled) toast(r.error?.message, { tone: "error" }); }}><FIcon name="plus" size={13} /> Klasör ekle</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={async () => { const r = await sh().importRecent(7); toast(r.ok ? `${r.count} ekran görüntüsü içe aktarıldı.` : r.error?.message, { tone: r.ok ? "success" : "error" }); }}>Son 7 günü içe aktar</button>
        </div>
      </div>
      <div className="card">
        <h3>Saklama</h3>
        {SHELVES.map((x) => (
          <Field key={x.key} label={x.label}>
            <select value={s.retention[x.key]} onChange={(e) => patch({ retention: { [x.key]: Number(e.target.value) } })}>
              {RETENTION_OPTIONS.map((d) => <option key={d} value={d}>{d} gün</option>)}
            </select>
          </Field>
        ))}
        <p className="muted ft-note">Süresi dolan öğeler Çöp Kutusu'na gider (30 gün sonra silinir). Sabitlenen, klasöre konan ya da etiketlenen öğeler kalır.</p>
      </div>
      <div className="card">
        <h3>Kısayollar</h3>
        <ul className="shl-keys">
          {SHORTCUTS.map(([key, label]) => {
            const state = st?.shortcuts?.[key];
            return (
              <li key={key}>
                <span>{label}</span>
                <button type="button" className={`btn btn--sm ${recording === key ? "btn--soft" : ""}`} onClick={() => setRecording(recording === key ? null : key)} aria-label={`${label} kısayolunu değiştir`}>
                  {recording === key ? "Tuşlara basın… (⌫ kapat)" : accelLabel(s.shortcuts[key], mac)}
                </button>
                {state?.conflict && <span className="pill pill--amber" title="Başka bir uygulama bu kısayolu kullanıyor">Kullanımda</span>}
              </li>
            );
          })}
        </ul>
        <p className="muted ft-note">Raflarda: ← → ↑ ↓ gez, Boşluk önizle, ↩ kopyala ve kapat, P sabitle, S raftan kaldır, ⌫ geri al, 1–9 numaralı kart, ⇧I / ⇧T / ⇧L raf gizle.</p>
      </div>
      <div className="card">
        <h3>Diğer</h3>
        <label className="ft-check"><input type="checkbox" checked={s.editAfterCapture} onChange={(e) => patch({ editAfterCapture: e.target.checked })} /> Ekran yakalayınca kırpma düzenleyicisini aç</label>
        <label className="ft-check"><input type="checkbox" checked={s.enrichLinks} onChange={(e) => patch({ enrichLinks: e.target.checked })} /> Bağlantı kartlarına başlık ve küçük resim getir</label>
        <p className="muted ft-note">Açıkken kopyalanan bağlantının sayfasına (ya da YouTube'a) bağlanılır; başka hiçbir veri gönderilmez.</p>
        {mac && st?.screenAccess && st.screenAccess !== "granted" && <div className="error-note"><span>Ekran yakalama için Sistem Ayarları → Gizlilik ve Güvenlik → Ekran ve Sistem Sesi Kaydı'ndan izin verin.</span></div>}
        <p className="muted ft-note">Görseldeki metni tanıma (OCR) bu sürümde yok; arama metin, başlık, not, etiket ve bağlantı bilgisinde yapılır.</p>
      </div>
    </section>
  );
}
