// Ayarlar › YERLEŞİM: ekranın tamamı burada da yönetilir (stüdyodaki Düzenle kipiyle aynı).
//
//   Hazır düzenler   küçük çizimli kartlar; "Uygula" tek tıkla ekranı yeniden döşer
//                    (paneller ve pano içerikleri korunur, monitörler çizmeye devam eder).
//   Yerleşim ağacı   bölmeler (yan yana / alt alta) → sekme grupları → sekmeler:
//                    yeniden adlandır, sırala (▲▼), başka gruba taşı, sağa / alta ayır,
//                    göster (etkin yap), kaldır; grup: büyüt, küçült, yüzen, boyut (px).
//                    Panolar açılınca bileşenleri: en × boy, başka panoya taşı, kaldır.
//   Ekranda olmayanlar  kaldırılan / eklenebilen paneller ve panolar: tek tıkla geri.
//   Seçenekler       tek panelli ekran bölmelerinin başlığını gizle; varsayılana dön.
// Ayar şablonları (Ayarlar › Ayar şablonları) yerleşimi de dışa / içe aktarır.
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import {
  LAYOUT_PRESETS, boardPanelId, componentOf, dockTree, missingPanels, panelMeta, parseId, removeItem, resizeItem, addItem, setBoardCols,
} from "./layoutModel";
import { itemLabel } from "./components";

/** Hazır düzenin küçük çizimi (bölme ağacı → iç içe kutular). */
function SpecPreview({ spec }) {
  const node = (s, k) => {
    if (typeof s === "string" || Array.isArray(s?.tabs)) {
      const tabs = typeof s === "string" ? [s] : s.tabs;
      const m = panelMeta(parseId(tabs[0]).kind);
      const label = parseId(tabs[0]).kind === "board" ? "Kısayol" : m?.label || tabs[0];
      return <div key={k} className={`lw-sp__leaf ${m?.monitor ? "is-mon" : ""}`} style={{ flex: s.size || 1 }}><span>{label}{tabs.length > 1 ? ` +${tabs.length - 1}` : ""}</span></div>;
    }
    const dir = s.row ? "row" : "col";
    return <div key={k} className={`lw-sp__${dir}`} style={{ flex: s.size || 1 }}>{(s.row || s.col).map((c, i) => node(c, i))}</div>;
  };
  return <div className="lw-sp" aria-hidden="true">{node(spec, 0)}</div>;
}

function GroupNode({ g, groups, layout, setLayout, c, ctxLabel, openBoard, setOpenBoard }) {
  const size = c?.groupSize(g.id);
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const min = layout.mins?.[g.id];
  const others = groups.filter((x) => x.id !== g.id);
  return (
    <div className={`lw-tg ${g.floating ? "is-float" : ""}`}>
      <header className="lw-tg__head">
        <Icon name={g.floating ? "external" : "board"} size={13} />
        <strong>{g.floating ? "Yüzen pencere" : "Sekme grubu"}</strong>
        <small>{g.views.length} sekme{size ? ` · ${size.width}×${size.height} px` : ""}{min ? " · küçültülmüş" : ""}</small>
        <span className="st-top__spacer" />
        {!g.floating && (
          <span className="lw-tg__size">
            <input type="number" min={60} placeholder="en" value={w} onChange={(e) => setW(e.target.value)} aria-label="Genişlik (px)" />
            ×
            <input type="number" min={30} placeholder="boy" value={h} onChange={(e) => setH(e.target.value)} aria-label="Yükseklik (px)" />
            <button type="button" className="btn btn--xs" disabled={!w && !h} onClick={() => { c.setGroupSize(g.id, { ...(w ? { width: Number(w) } : {}), ...(h ? { height: Number(h) } : {}) }); setW(""); setH(""); }}>Boyutla</button>
          </span>
        )}
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => c.maximize(g.id)} title="Büyüt / eski boyut"><Icon name="overview" size={12} /></button>
        {!g.floating && <button type="button" className={`icon-btn icon-btn--xs ${min ? "is-on" : ""}`} onClick={() => c.minimize(g.id)} title={min ? "Geri aç" : "Küçült"}><Icon name={min ? "chevronDown" : "chevronUp"} size={12} /></button>}
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => (g.floating ? c.dockFloating(g.id) : c.float(g.id))} title={g.floating ? "Izgaraya yerleştir" : "Yüzen pencereye al"}><Icon name={g.floating ? "board" : "external"} size={12} /></button>
        <button type="button" className="btn btn--xs" onClick={() => c.openCatalog?.({ group: g.id })}><Icon name="plus" size={11} /> Sekme</button>
      </header>
      <ol className="lw-tg__tabs">
        {g.views.map((v, i) => {
          const isBoard = v.kind === "board";
          const bid = isBoard ? parseId(v.id).suffix : null;
          const board = bid ? layout.boards[bid] : null;
          const m = panelMeta(v.kind);
          return (
            <li key={v.id} className={g.active === v.id ? "is-active" : ""}>
              <div className="lw-tg__row">
                <Icon name={m?.icon || "grid"} size={13} />
                <input className="lw-tg__name" defaultValue={v.title} key={v.title} onBlur={(e) => { if (e.target.value !== v.title) c.rename(v.id, e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Sekme adı" />
                <small className="lw-tg__kind">{isBoard ? `pano · ${board?.items.length ?? 0} bileşen` : m?.label}</small>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === 0} onClick={() => c.move(v.id, { group: g.id, index: i - 1 })} title="Sekmeyi sola / yukarı"><Icon name="chevronUp" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === g.views.length - 1} onClick={() => c.move(v.id, { group: g.id, index: i + 1 })} title="Sekmeyi sağa / aşağı"><Icon name="chevronDown" size={12} /></button>
                <select className="select-xs" value="" onChange={(e) => {
                  const val = e.target.value;
                  if (val === "right" || val === "below") c.split(v.id, val);
                  else if (val) c.move(v.id, { group: val });
                  e.target.value = "";
                }} aria-label="Taşı">
                  <option value="">Taşı…</option>
                  {g.views.length > 1 && <option value="right">Ayrı bölme (sağa)</option>}
                  {g.views.length > 1 && <option value="below">Ayrı bölme (alta)</option>}
                  {others.map((o, n) => <option key={o.id} value={o.id}>Gruba: {o.views.map((x) => x.title).join(", ").slice(0, 40) || `Grup ${n + 1}`}</option>)}
                </select>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => c.activate(v.id)} title="Bu sekmeyi göster"><Icon name="eye" size={12} /></button>
                {isBoard && <button type="button" className={`icon-btn icon-btn--xs ${openBoard === bid ? "is-on" : ""}`} onClick={() => setOpenBoard(openBoard === bid ? null : bid)} title="Bileşenler"><Icon name="list" size={12} /></button>}
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => c.remove(v.id)} title="Ekrandan kaldır (geri eklenebilir)"><Icon name="x" size={12} /></button>
              </div>
              {isBoard && openBoard === bid && board && <BoardEditor id={bid} board={board} layout={layout} setLayout={setLayout} c={c} ctxLabel={ctxLabel} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Pano bileşenleri: en × boy, sıra, başka panoya taşı, kaldır; sütun sayısı. */
export function BoardEditor({ id, board, layout, setLayout, c, ctxLabel }) {
  const setBoard = (fn) => setLayout((l) => (l.boards[id] ? { ...l, boards: { ...l.boards, [id]: fn(l.boards[id]) } } : l));
  const boards = Object.entries(layout.boards).filter(([bid]) => bid !== id);
  const items = [...board.items].sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <div className="lw-be">
      <div className="lw-be__head">
        <span className="st-dset__mini">Sütun</span>
        <div className="st-seg">{[1, 2, 3, 4, 6, 8, 12, 16, 24].map((n) => <button key={n} type="button" className={board.cols === n ? "is-on" : ""} onClick={() => setBoard((b) => setBoardCols(b, n))}>{n}</button>)}</div>
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--xs" onClick={() => c.openCatalog?.({ board: id })}><Icon name="plus" size={11} /> Bileşen ekle</button>
      </div>
      <ol className="lw-be__list">
        {items.map((it) => {
          const m = componentOf(it.t);
          return (
            <li key={it.i}>
              <Icon name={m?.icon || "zap"} size={13} />
              <span className="lw-be__name">{itemLabel(it, ctxLabel)}</span>
              <label className="lw-be__num">en <input type="number" min={1} max={board.cols} value={it.w} onChange={(e) => setBoard((b) => resizeItem(b, it.i, Number(e.target.value), it.h))} /></label>
              <label className="lw-be__num">boy <input type="number" min={1} max={60} value={it.h} onChange={(e) => setBoard((b) => resizeItem(b, it.i, it.w, Number(e.target.value)))} /></label>
              <button type="button" className="icon-btn icon-btn--xs" title="Yukarı" onClick={() => setBoard((b) => ({ ...b, items: b.items.map((x) => (x.i === it.i ? { ...x, y: Math.max(0, x.y - 1) } : x)) }))}><Icon name="chevronUp" size={12} /></button>
              <select className="select-xs" value="" onChange={(e) => {
                const to = e.target.value;
                if (!to) return;
                setLayout((l) => ({ ...l, boards: { ...l.boards, [id]: removeItem(l.boards[id], it.i), [to]: addItem(l.boards[to], it.t, { o: it.o, w: Math.min(it.w, l.boards[to].cols), h: it.h, i: it.i }) } }));
              }} aria-label="Başka panoya taşı">
                <option value="">Taşı…</option>
                {boards.map(([bid, b]) => <option key={bid} value={bid}>→ {b.title}</option>)}
              </select>
              <button type="button" className="icon-btn icon-btn--xs" title="Kaldır" onClick={() => setBoard((b) => removeItem(b, it.i))}><Icon name="x" size={12} /></button>
            </li>
          );
        })}
        {!items.length && <li className="st-hint">Pano boş.</li>}
      </ol>
    </div>
  );
}

export default function LayoutSettings({ Section, layout, setLayout, ctrl, ctxLabel = null, onAsk = null }) {
  const c = ctrl?.() || null;
  const [openBoard, setOpenBoard] = useState(null);
  const tree = dockTree(layout.dock);
  const groups = [];
  const collect = (n) => { if (!n) return; if (n.type === "group") groups.push(n); else n.children.forEach(collect); };
  collect(tree.root);
  tree.floating.forEach((f) => groups.push(f));
  const missing = missingPanels(layout);
  const applyPreset = async (p) => {
    if (onAsk && !(await onAsk({ title: "Hazır düzen", message: `“${p.label}” uygulansın mı? Bölmeler yeniden döşenir; paneller ve pano içerikleri korunur.`, confirmLabel: "Uygula" }))) return;
    c?.applyPreset(p.key);
  };
  const renderNode = (n, depth = 0) => {
    if (!n) return null;
    if (n.type === "group") return <GroupNode key={n.id} g={n} groups={groups} layout={layout} setLayout={setLayout} c={c} ctxLabel={ctxLabel} openBoard={openBoard} setOpenBoard={setOpenBoard} />;
    return (
      <div key={`s${depth}${n.children.map((x) => x.id || "").join("")}`} className={`lw-tsplit is-${n.dir}`}>
        <span className="lw-tsplit__label"><Icon name={n.dir === "row" ? "chevronRight" : "chevronDown"} size={11} /> {n.dir === "row" ? "Yan yana" : "Alt alta"} · {n.children.length} bölme</span>
        <div className="lw-tsplit__kids">{n.children.map((x) => renderNode(x, depth + 1))}</div>
      </div>
    );
  };
  if (!c) return <p className="st-hint">Yerleşim yüklenemedi.</p>;
  return (
    <>
      <Section title="Hazır düzenler" sub="Tek tıkla ekranın tamamını yeniden döşer. Sonra stüdyoda üstteki “Düzenle” ile ya da aşağıdaki ağaçla dilediğin gibi değiştir.">
        <div className="lw-presets">
          {LAYOUT_PRESETS.map((p) => (
            <button key={p.key} type="button" className={`lw-preset ${layout.preset === p.key ? "is-on" : ""}`} onClick={() => applyPreset(p)}>
              <SpecPreview spec={p.spec} />
              <strong>{p.label}</strong>
              <small>{p.hint}</small>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Yerleşim ağacı" sub="Bölmeler → sekme grupları → sekmeler. Adını değiştir, sırala, başka gruba taşı, ayrı bölmeye ayır, boyutla, kaldır. Panoların bileşenlerini ≡ ile aç.">
        <div className="lw-tree">{renderNode(tree.root)}</div>
        {tree.floating.length > 0 && (
          <div className="lw-tree is-float">
            <span className="lw-tsplit__label"><Icon name="external" size={11} /> Yüzen pencereler</span>
            {tree.floating.map((g) => <GroupNode key={g.id} g={g} groups={groups} layout={layout} setLayout={setLayout} c={c} ctxLabel={ctxLabel} openBoard={openBoard} setOpenBoard={setOpenBoard} />)}
          </div>
        )}
      </Section>
      <Section title="Ekranda olmayanlar" sub="Kaldırdığın ya da hiç eklemediğin paneller ve panolar. “Ekle” etkin bölmenin sağına koyar; stüdyoda Düzenle › Kutu ekle'den de gelir.">
        <ul className="lw-missing">
          {missing.map((m) => {
            const meta = panelMeta(m.kind);
            return (
              <li key={m.id}>
                <Icon name={meta?.icon || "grid"} size={13} />
                <span>{m.title}</span>
                <small>{m.kind === "board" ? `pano · ${layout.boards[parseId(m.id).suffix]?.items.length || 0} bileşen` : meta?.hint}</small>
                <button type="button" className="btn btn--xs" onClick={() => c.add(m.id)}><Icon name="plus" size={11} /> Ekle</button>
                {m.kind === "board" && parseId(m.id).suffix !== "rail" && <button type="button" className="icon-btn icon-btn--xs" title="Panoyu sil" onClick={() => c.deleteBoard(parseId(m.id).suffix)}><Icon name="trash" size={12} /></button>}
              </li>
            );
          })}
          {!missing.length && <li className="st-hint">Tüm paneller ekranda.</li>}
        </ul>
        <div className="st-row">
          <button type="button" className="btn btn--sm" onClick={() => c.newBoard({})}><Icon name="plus" size={13} /> Yeni sekme (boş pano)</button>
        </div>
      </Section>
      <Section title="Seçenekler">
        <label className="st-switchrow">
          <span><strong>Tek panelli ekran bölmelerinde başlığı gizle</strong><small>Monitörler, geçiş, sahne şeridi… kendi başlıklarıyla; Düzenle kipinde başlıklar her zaman görünür.</small></span>
          <input type="checkbox" className="st-switch" checked={layout.autoHide !== false} onChange={(e) => setLayout((l) => ({ ...l, autoHide: e.target.checked }))} />
        </label>
        <div className="st-row">
          <button type="button" className="btn btn--sm" onClick={async () => { if (!onAsk || await onAsk({ title: "Varsayılana dön", message: "Ekran Klasik yayın düzenine, Kısayollar panosu varsayılan düğmelere döner. Özel sekmeler (panolar) silinmez.", confirmLabel: "Varsayılana dön" })) c.resetDefault(); }}><Icon name="undo" size={13} /> Varsayılana dön (Klasik yayın)</button>
          <span className="st-hint">Yerleşim, Ayar şablonları'nda “Ekran yerleşimi” grubuyla dışa / içe aktarılır.</span>
        </div>
      </Section>
    </>
  );
}
export { boardPanelId };
