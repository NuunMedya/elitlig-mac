// Yayın Stüdyosu · KUTU EKLE kataloğu: paneller, bileşenler ve düğmeler (parçacıklar).
//
//   Kaldırılanlar  en üstte: ekrandan kaldırdığın her şey (en yeni başta) — tek tıkla geri.
//   Paneller       monitörler, geçiş, sahne şeridi, işletim panelleri, panolar (ekranda
//                  olanlar "ekranda" işaretli; tıklayınca öne gelir).
//   Bileşenler     ses kanal şeritleri, tümünü kapat, tekrar listesi / hız / ses, reji
//                  sütunları, yayın kartları… seçilen panoya eklenir (ya da sürükle-bırak).
//   Düğmeler       eski kısayol şeridindeki tüm parçacıklar, canlı önizlemeli.
// Arama tüm listeyi süzer; hedef seçicisi panelin nereye, bileşenin hangi panoya
// ekleneceğini belirler.
import React, { useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { RAIL_SIZES, boardWidgetSize, sizesOf } from "../shortcuts/railModel";
import { WIDGET_IMPL } from "../shortcuts/widgets";
import { WStyleEditor } from "../shortcuts/wOptions";
import { resolveWStyle, wStyleAttrs } from "../shortcuts/wStyle";
import {
  COMPONENT_GROUPS, LAYOUT_COMPONENTS, addItem, setGroupWStyle, LAYOUT_PANELS, PANEL_GROUPS, boardPanelId, componentOf, dockPanelIds, panelMeta, parseId, widgetSize,
} from "./layoutModel";
import { dynamicEntries } from "./components";
import { endDrag, startDrag } from "./Board";
import TemplateCards from "./TemplateCards";
import { templateOf } from "./boardTemplates";

const BOARD_TITLE = (k) => templateOf(k)?.label;

const norm = (s) => String(s || "").toLocaleLowerCase("tr-TR");
const matches = (q, ...xs) => !q || xs.some((x) => norm(x).includes(q));

function WidgetThumb({ comp, ctx }) {
  const impl = WIDGET_IMPL[comp.widget];
  const [w, h] = comp.size;
  const sk = boardWidgetSize(comp.widget, w, h);
  const sz = RAIL_SIZES[sk];
  let body = null;
  if (impl && !impl.noPreview && ctx?.railCtx) {
    try { body = impl.render({ ctx: ctx.railCtx, item: { id: `pv_${comp.widget}`, type: comp.widget, w: sz.w, h: sz.h, opts: {} }, big: sk === "2x2", w: sz.w, h: sz.h, togglePop: () => {}, popOpen: false, preview: true }); } catch { body = null; }
  }
  if (!body) body = <div className="st-w is-plain"><span className="st-w__icon"><Icon name={comp.icon || "zap"} size={18} /></span><span className="st-w__label">{comp.label}</span></div>;
  // Gerçek hücre boyunda çizilir, karta sığacak kadar küçültülür (canlı önizleme).
  const W = 84 * sz.w + 6 * (sz.w - 1), H = 86 * sz.h + 6 * (sz.h - 1);
  const pv = Math.min(1, 124 / W, 84 / H);
  // Grubun rengi (Kutu ekle › grup başlığındaki "Grup rengi") önizlemede de görünür.
  const ws = wStyleAttrs(resolveWStyle(null, ctx?.layout?.wstyle?.[comp.group.replace(/^w-/, "")]));
  return (
    <div className={`lw-thumb is-w is-s${sk}`} aria-hidden="true" inert="">
      <div className={`st-ri lw-ri is-s${sk} is-preview ${ws.className}`} style={{ "--w": sz.w, "--h": sz.h, width: W, height: H, transform: `translate(-50%, -50%) scale(${pv})`, ...ws.style }}>{body}</div>
    </div>
  );
}

function Card({ icon, title, hint, state, onAdd, addLabel = "Ekle", drag, thumb, extra, tone }) {
  return (
    <div className={`lw-card ${state === "on" ? "is-on" : ""} ${tone ? `is-${tone}` : ""}`} draggable={Boolean(drag)} onDragStart={drag ? (e) => startDrag(e, drag) : undefined} onDragEnd={drag ? endDrag : undefined}>
      {thumb || <span className="lw-card__ic"><Icon name={icon || "grid"} size={18} /></span>}
      <span className="lw-card__t"><strong>{title}</strong>{hint && <small>{hint}</small>}</span>
      {extra}
      {state === "on" && <em className="lw-card__on"><Icon name="check" size={11} /> ekranda</em>}
      <button type="button" className={`btn btn--xs ${state === "on" ? "" : "btn--primary"}`} onClick={onAdd}>{state === "on" ? "Göster" : addLabel}</button>
    </div>
  );
}

/** Düğme grubunun varsayılan rengi / biçimi (grubun tüm düğmeleri; öğe kendi rengini seçebilir). */
function GroupColor({ ctx, group, label }) {
  const [open, setOpen] = useState(false);
  const v = ctx.layout.wstyle?.[group] || {};
  const ws = wStyleAttrs(resolveWStyle(null, v));
  return (
    <>
      <button type="button" className={`lw-gcol ${open ? "is-open" : ""}`} style={ws.style} onClick={() => setOpen((x) => !x)} aria-expanded={open} title={`${label} düğmelerinin rengi ve biçimi`}>
        <i /> Grup rengi{v.c || v.s ? "" : ": yok"}
      </button>
      {open && (
        <div className="lw-gcol__pop" onClick={(e) => e.stopPropagation()}>
          <WStyleEditor value={v} noneLabel="Düğmenin kendi rengi" onChange={(p) => ctx.setLayout((l) => setGroupWStyle(l, group, p))}
            hint="Bu gruptaki tüm düğmeler (panodakiler dahil) bu renkle çizilir; tek düğmeyi sağ tık › Renk ve biçim ile ayrıca boyayabilirsin." />
        </div>
      )}
    </>
  );
}

export default function Catalog({ ctx, target = {}, onClose }) {
  const { layout, ctrl } = ctx;
  const c = ctrl();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(target.board ? "bilesen" : "hepsi");
  const onScreen = useMemo(() => new Set(dockPanelIds(layout.dock)), [layout.dock]);
  const boards = Object.entries(layout.boards || {}).map(([id, b]) => ({ id, title: b.title, shown: onScreen.has(boardPanelId(id)) }));
  const groupBoard = target.group ? c.api()?.getGroup(target.group)?.activePanel?.params?.opts?.board : null;
  const [boardT, setBoardT] = useState(target.board || groupBoard || boards.find((b) => b.shown && b.id !== "rail")?.id || "__new");
  const [where, setWhere] = useState(target.group ? "tab" : "right");
  const nq = norm(q.trim());

  const placeTarget = () => {
    if (target.group && where === "tab") return { group: target.group, direction: "within" };
    if (target.group) return { group: target.group, direction: where === "below" ? "below" : "right" };
    const active = c.api()?.activeGroup;
    if (where === "float") return { float: true };
    if (where === "tab" && active) return { group: active.id, direction: "within" };
    return active ? { group: active.id, direction: where === "below" ? "below" : "right" } : {};
  };
  const addPanel = (id) => { c.add(id, placeTarget()); onClose(); };
  const addComp = (t, o = null, size = null, removedId = null) => {
    let bid = boardT;
    if (bid === "__new" || !layout.boards[bid]) {
      const m = componentOf(t);
      c.newBoard(placeTarget(), { title: "Yeni sekme", items: [{ t, o, w: size?.[0] ?? m?.size[0], h: size?.[1] ?? m?.size[1], x: 0, y: 0 }] });
    } else {
      ctx.setLayout((l) => (l.boards[bid] ? { ...l, boards: { ...l.boards, [bid]: addItem(l.boards[bid], t, { o, ...(size ? { w: size[0], h: size[1] } : {}) }) } } : l));
      if (!onScreen.has(boardPanelId(bid))) c.add(boardPanelId(bid), placeTarget()); else c.activate(boardPanelId(bid));
    }
    if (removedId) ctx.setLayout((l) => ({ ...l, removed: l.removed.filter((x) => !(x.kind === "item" && x.id === removedId)) }));
  };

  /* kaldırılanlar: kaydı tutulanlar + ekranda olmayan paneller */
  const removed = layout.removed.filter((r) => (r.kind === "panel" ? !onScreen.has(r.id) && (parseId(r.id).kind !== "board" || layout.boards[parseId(r.id).suffix]) : componentOf(r.t)))
    .filter((r) => matches(nq, r.label, r.title));
  const panels = LAYOUT_PANELS.filter((p) => p.key !== "board" && matches(nq, p.label, p.hint));
  const comps = LAYOUT_COMPONENTS.filter((m) => !m.widget && m.key !== "ses.strip" && matches(nq, m.label, m.hint));
  const dyn = dynamicEntries(ctx).filter((d) => matches(nq, d.label, d.hint));
  const widgets = LAYOUT_COMPONENTS.filter((m) => m.widget && m.widget !== "scene" && matches(nq, m.label, m.hint));
  const show = (k) => tab === "hepsi" || tab === k;
  const sceneCount = Math.max(4, ctx.railCtx?.scenes?.length || 0);
  const nextSaat = () => { let n = 1; while (onScreen.has(`saat~${n}`)) n += 1; return `saat~${n}`; };

  const targetBar = (
    <div className="lw-cat__target">
      <label>Panel nereye:
        <select value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="right">{target.group ? "Bu bölmenin sağına" : "Etkin bölmenin sağına"}</option>
          <option value="below">{target.group ? "Bu bölmenin altına" : "Etkin bölmenin altına"}</option>
          <option value="tab">{target.group ? "Bu bölmeye sekme olarak" : "Etkin bölmeye sekme olarak"}</option>
          {!target.group && <option value="float">Yüzen pencere</option>}
        </select>
      </label>
      <label>Bileşen hangi panoya:
        <select value={boardT} onChange={(e) => setBoardT(e.target.value)}>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.title}{b.shown ? "" : " (ekranda değil)"}</option>)}
          <option value="__new">+ Yeni sekme (pano)</option>
        </select>
      </label>
      <button type="button" className="btn btn--sm" onClick={() => { c.newBoard(placeTarget()); onClose(); }}><Icon name="plus" size={13} /> Yeni sekme (boş pano)</button>
    </div>
  );

  return (
    <aside className="lw-drawer" role="dialog" aria-label="Kutu ekle" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <header className="lw-drawer__head">
        <Icon name="plus" size={15} /><strong>Kutu ekle</strong>
        <span className="st-hint">kartları panolara sürükleyebilirsin</span>
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--sm btn--primary" onClick={onClose}>Bitti</button>
      </header>
      <div className="lw-cat">
        <div className="lw-cat__head">
          <span className="lw-cat__search"><Icon name="search" size={14} /><input autoFocus placeholder="Ara: ses, tekrar, gol, saat…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
          <div className="st-seg">
            {[["hepsi", "Tümü"], ["kaldirilan", `Kaldırılanlar (${removed.length})`], ["hazir", "Hazır panel"], ["panel", "Paneller"], ["bilesen", "Bileşenler"], ["dugme", "Düğmeler"]].map(([k, l]) => (
              <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>
        {targetBar}

        {show("kaldirilan") && (
          <section className="lw-cat__sec is-removed">
            <h6><Icon name="undo" size={12} /> Kaldırılanlar <small>ekrandan kaldırdıkların, en yeni başta</small></h6>
            {removed.length ? (
              <div className="lw-cat__grid">
                {removed.map((r) => {
                  if (r.kind === "panel") {
                    const m = panelMeta(parseId(r.id).kind);
                    return <Card key={`p${r.id}`} tone="removed" icon={m?.icon} title={r.title || r.label} hint={`Panel · ${m?.label || ""}`} addLabel="Geri ekle" onAdd={() => addPanel(r.id)} />;
                  }
                  const m = componentOf(r.t);
                  return <Card key={`i${r.id}`} tone="removed" icon={m?.icon} title={r.label} hint={`Bileşen · ${layout.boards[r.board]?.title || "pano"}`} addLabel="Geri ekle"
                    drag={{ t: r.t, o: r.o, w: r.w, h: r.h, removedId: r.id }}
                    onAdd={() => {
                      if (layout.boards[r.board]) {
                        ctx.setLayout((l) => {
                          const b = l.boards[r.board];
                          const bottom = b.items.reduce((mx, it) => Math.max(mx, it.y + it.h), 0);
                          return { ...l, removed: l.removed.filter((x) => x !== r && !(x.kind === "item" && x.id === r.id)), boards: { ...l.boards, [r.board]: { ...b, items: [...b.items, { i: r.id, t: r.t, x: 0, y: bottom, w: Math.min(b.cols, r.w || m.size[0]), h: r.h || m.size[1], ...(r.o ? { o: r.o } : {}) }] } } };
                        });
                        if (!onScreen.has(boardPanelId(r.board))) c.add(boardPanelId(r.board), placeTarget()); else c.activate(boardPanelId(r.board));
                      } else addComp(r.t, r.o, [r.w, r.h], r.id);
                    }} />;
                })}
              </div>
            ) : <p className="st-hint">Kaldırılan bir şey yok. Düzenle kipinde sekmedeki × ya da bileşendeki × ile kaldırdıkların burada görünür.</p>}
          </section>
        )}

        {show("hazir") && <TemplateCards filter={nq} has={(k) => Object.values(layout.boards || {}).some((b) => b.title === BOARD_TITLE(k))} onAdd={(t) => { c.newBoard(placeTarget(), { title: t.label, items: t.items, cols: t.cols, rowH: t.rowH }); onClose(); }} />}

        {show("panel") && PANEL_GROUPS.map((g) => {
          const list = g.key === "pano" ? boards.filter((b) => matches(nq, b.title, "pano sekme")) : panels.filter((p) => p.group === g.key);
          if (!list.length && g.key !== "pano") return null;
          return (
            <section key={g.key} className="lw-cat__sec">
              <h6>{g.label}</h6>
              <div className="lw-cat__grid">
                {g.key === "pano"
                  ? (
                    <>
                      {list.map((b) => <Card key={b.id} icon="grid" title={b.title} hint={`Pano · ${layout.boards[b.id].items.length} bileşen`} state={b.shown ? "on" : null} onAdd={() => addPanel(boardPanelId(b.id))} />)}
                      <Card icon="plus" title="Yeni sekme (boş pano)" hint="Kendi sekmeni oluştur, istediğin bileşenlerle doldur" addLabel="Oluştur" onAdd={() => { c.newBoard(placeTarget()); onClose(); }} />
                    </>
                  )
                  : list.map((p) => {
                    if (p.key === "sceneCell") {
                      return (
                        <Card key={p.key} icon={p.icon} title={p.label} hint={p.hint}
                          extra={<span className="lw-card__chips">{Array.from({ length: sceneCount }, (_, i) => <button key={i} type="button" className={`st-chip ${onScreen.has(`sceneCell~${i}`) ? "is-on" : ""}`} onClick={() => addPanel(`sceneCell~${i}`)}>{i + 1}</button>)}</span>}
                          addLabel="1. sahne" onAdd={() => addPanel("sceneCell~0")} />
                      );
                    }
                    if (p.key === "saat") return <Card key={p.key} icon={p.icon} title={p.label} hint={p.hint} state={onScreen.has("saat") ? "on" : null} onAdd={() => addPanel(onScreen.has("saat") ? nextSaat() : "saat")} />;
                    return <Card key={p.key} icon={p.icon} title={p.label} hint={p.hint} state={onScreen.has(p.key) ? "on" : null} onAdd={() => addPanel(p.key)} />;
                  })}
              </div>
            </section>
          );
        })}

        {show("bilesen") && COMPONENT_GROUPS.filter((g) => !g.key.startsWith("w-")).map((g) => {
          const list = [...dyn.filter((d) => d.group === g.key && d.t === "ses.strip"), ...comps.filter((m) => m.group === g.key)];
          if (!list.length) return null;
          return (
            <section key={g.key} className="lw-cat__sec">
              <h6>Bileşenler · {g.label}</h6>
              <div className="lw-cat__grid">
                {list.map((m) => {
                  const t = m.t || m.key;
                  const meta = componentOf(t);
                  return <Card key={`${t}${m.o?.strip || ""}`} icon={m.icon || meta?.icon} title={m.label} hint={m.hint || `${meta.size[0]}×${meta.size[1]} birim`} drag={{ t, o: m.o || null }} onAdd={() => addComp(t, m.o || null)} />;
                })}
              </div>
            </section>
          );
        })}

        {show("dugme") && COMPONENT_GROUPS.filter((g) => g.key.startsWith("w-")).map((g) => {
          const list = widgets.filter((m) => m.group === g.key);
          const scenes = g.key === "w-sahne" ? dyn.filter((d) => d.t === "w:scene") : [];
          if (!list.length && !scenes.length) return null;
          return (
            <section key={g.key} className="lw-cat__sec">
              <h6 className="lw-cat__gh">{g.label}<GroupColor ctx={ctx} group={g.key.slice(2)} label={g.label} /></h6>
              <div className="lw-cat__grid is-widgets">
                {list.map((m) => (
                  <Card key={m.key} thumb={<WidgetThumb comp={m} ctx={ctx} />} title={m.label} hint={m.hint} drag={{ t: m.key }}
                    extra={<span className="lw-card__chips">{sizesOf(m.widget).map((k) => [RAIL_SIZES[k].label, widgetSize(k)]).map(([l, sz]) => <button key={l} type="button" className="st-chip" onClick={() => addComp(m.key, null, sz)} title={`${l} olarak ekle`}>{l}</button>)}</span>}
                    onAdd={() => addComp(m.key)} />
                ))}
                {scenes.map((d) => <Card key={d.o.sceneId} icon="layers" title={d.label} hint={d.hint} drag={{ t: d.t, o: d.o }} onAdd={() => addComp(d.t, d.o)} />)}
              </div>
            </section>
          );
        })}
      </div>
      <footer className="lw-drawer__foot st-hint">Düzenle kipinde sekmeleri sürükleyerek böl / birleştir · × ile kaldırdıkların “Kaldırılanlar”da en üstte.</footer>
    </aside>
  );
}
