// Widget galerisi ("Widget ekle"): katalogdan masaüstüne widget ekle — kategoriler, arama ve canlı
// önizleme (widget'ın gerçek gövdesi, gerçek veriyle); açık widget'ların boyutu, saydamlığı, katmanı
// (masaüstü / normal / üstte / gömülü), sabitleme; tema, ızgara, soluk görünüm, malzeme, girişte başlat;
// "Widget'ları düzenle" kipi (macOS'taki gibi). Her türün tüm boyutları yan yana önizlenir.
// Ana süreç: app/widgets. Widget penceresinin kendi ⋯ menüsü de aynı ayarları sunar.
// Dışa aktarılan ad ve yer sabit (Araç Takımı birleşik menüsü bu bileşeni gösterir).
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Icon, isMac, useToast } from "../../components/ui";
import { includesTr } from "../../lib/helpers";
import { acceleratorLabel } from "./shortcutUtils";
import "./widgetGallery.css";

// Önizleme widget gövdelerini yükler (renderer/src/widgets) — galeri açılınca ayrı parça olarak gelir.
const WidgetPreview = lazy(() => import("../../widgets/Widget").then((m) => ({ default: m.WidgetPreview })));

const LEVEL_LABEL = { desktop: "Masaüstü (pencerelerin altında)", normal: "Normal pencere", top: "Üstte sabit", embed: "Masaüstüne göm (etkileşimsiz)" };
const SIZE_LABEL = { small: "Küçük", medium: "Orta", large: "Büyük", xlarge: "Ekstra büyük" };

export default function WidgetGallery() {
  const toast = useToast();
  const api = window.elitlig?.widgets;
  const [st, setSt] = useState(null);
  const mac = isMac();
  useEffect(() => {
    if (!api) return undefined;
    api.state().then(setSt).catch(() => {});
    return api.onChange(setSt);
  }, [api]);
  if (!api) return <p className="muted">Widget'lar masaüstü uygulamasında çalışır.</p>;
  if (!st) return <p className="muted">Yükleniyor…</p>;
  const add = async (c, size) => {
    const r = await api.add(c.type, {}, size);
    if (r?.ok) toast(`${c.label} masaüstüne eklendi${st.visible ? "" : " (widget'lar yeniden gösterildi)"}. Sürükleyerek taşıyın; sağ tık: ayarlar.`, { tone: "success", timeout: 4500 });
    else toast(r?.error || "Eklenemedi.", { tone: "error" });
  };
  const upd = (id, patch) => api.update(id, patch);
  const count = (type) => st.items.filter((i) => i.type === type).length;
  const labelOf = (type) => st.catalog.find((c) => c.type === type)?.label || type;
  const cats = st.categories || [];

  return (
    <div className="wg-gallery">
      <div className="wg-gallery__bar">
        <button type="button" className={`btn btn--sm${st.visible ? "" : " btn--primary"}`} onClick={() => api.setVisible(!st.visible)} disabled={!st.items.length}>
          <Icon name={st.visible ? "eye" : "eye"} size={13} /> {st.visible ? "Widget'ları gizle" : "Widget'ları göster"}
          {st.shortcut && <kbd className="kbd">{acceleratorLabel(st.shortcut, mac)}</kbd>}
        </button>
        <label className="wg-gallery__theme">Tema
          <select value={st.theme} onChange={(e) => api.setTheme(e.target.value)} aria-label="Widget teması">
            <option value="auto">Sisteme uy</option><option value="light">Açık</option><option value="dark">Koyu</option>
          </select>
        </label>
        <button type="button" className={`btn btn--sm${st.editing ? " btn--primary" : ""}`} onClick={() => api.edit(!st.editing)} disabled={!st.items.length} data-act="edit">
          <Icon name={st.editing ? "check" : "pencil"} size={13} /> {st.editing ? "Düzenlemeyi bitir" : "Widget'ları düzenle"}
        </button>
        <span className="tk-note">{st.items.length ? `${st.items.length} widget masaüstünde` : "Henüz widget yok — aşağıdan ekleyin."}</span>
      </div>
      <div className="wg-gallery__opts">
        <label className="tk-check" title="Widget'lar bırakılınca standart ızgaraya ve birbirine hizalanır, üst üste binmez"><input type="checkbox" checked={st.grid} onChange={(e) => api.settings({ grid: e.target.checked })} /> Izgaraya hizala</label>
        <label className="tk-check" title="Üzerine gelinmeyen widget'lar soluk görünür (macOS'taki masaüstü görünümü gibi)"><input type="checkbox" checked={st.dim} onChange={(e) => api.settings({ dim: e.target.checked })} /> Soluk masaüstü görünümü</label>
        <label className="wg-gallery__theme">Malzeme
          <select value={st.material} onChange={(e) => api.settings({ material: e.target.value })} aria-label="Widget malzemesi">
            <option value="auto">{mac ? "Cam (sistem bulanıklığı)" : "Otomatik (Windows 11: akrilik)"}</option><option value="soft">Yarı saydam</option>
          </select>
        </label>
        <label className="tk-check" title={st.loginSupported ? "Bilgisayar açılınca uygulama gizli başlar, widget'lar masaüstüne gelir" : "Yalnız kurulu (paketli) uygulamada sisteme yazılır"}><input type="checkbox" checked={st.atLogin} onChange={(e) => api.settings({ atLogin: e.target.checked })} /> Girişte başlat (widget'lar için)</label>
      </div>

      <Catalog st={st} cats={cats} count={count} onAdd={add} />

      {st.items.length > 0 && (
        <>
          <h4 className="wg-gallery__h">Masaüstündeki widget'lar</h4>
          <div className="wgg-list" role="table" aria-label="Açık widget'lar">
            {st.items.map((it) => (
              <div key={it.id} className="wgg-row" role="row">
                <span className="wgg-row__name" role="cell"><Icon name={st.catalog.find((c) => c.type === it.type)?.icon || "grid"} size={14} /> {labelOf(it.type)}</span>
                <select role="cell" value={it.size} onChange={(e) => upd(it.id, { size: e.target.value })} aria-label="Boyut">{(st.catalog.find((c) => c.type === it.type)?.sizeKeys || [it.size]).map((k) => <option key={k} value={k}>{SIZE_LABEL[k] || k}</option>)}</select>
                <label role="cell" className="wgg-row__op" title="Arka plan saydamlığı">
                  <input type="range" min={30} max={100} step={5} value={it.opacity} onChange={(e) => upd(it.id, { opacity: Number(e.target.value) })} aria-label="Saydamlık" /> %{it.opacity}
                </label>
                <select role="cell" value={it.level} onChange={(e) => upd(it.id, { level: e.target.value })} aria-label="Katman">
                  <option value="desktop">{LEVEL_LABEL.desktop}</option>
                  <option value="normal">{LEVEL_LABEL.normal}</option>
                  <option value="top">{LEVEL_LABEL.top}</option>
                  {st.canEmbed && <option value="embed" disabled={st.catalog.find((c) => c.type === it.type)?.interactive && it.level !== "embed"}>{LEVEL_LABEL.embed}</option>}
                </select>
                <label role="cell" className="tk-check"><input type="checkbox" checked={it.locked} onChange={(e) => upd(it.id, { locked: e.target.checked })} /> Sabit</label>
                <button role="cell" type="button" className="icon-btn" onClick={() => api.remove(it.id)} aria-label={`${labelOf(it.type)} kaldır`} title="Kaldır"><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="tk-note"><Icon name="info" size={12} /> Widget'lar macOS masaüstü widget'ları gibi çalışır: varsayılan <b>masaüstü katmanında</b> diğer pencerelerin altında durur, tıklayınca odak çalmaz ve öne çıkmaz, {mac ? "Dock'ta ve ⌘Tab'da görünmez, tüm masaüstlerinde (Spaces) bulunur" : "görev çubuğunda ve Alt+Tab'da görünmez"}. Boş yerinden sürükleyin; bırakınca ızgaraya hizalanır. <b>Masaüstüne sabitle</b> konumu kilitler. Sağ tık / ⋯: boyut, katman, sabitle, düzenle.</p>
    </div>
  );
}

/** Katalog: arama + kategori sekmeleri + kartlar; seçili kartın canlı önizlemesi. */
function Catalog({ st, cats, count, onAdd }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState(null);
  const [size, setSize] = useState(null);
  const list = useMemo(() => st.catalog.filter((c) => (cat === "all" || c.category === cat) && (!q.trim() || includesTr(`${c.label} ${c.hint} ${cats.find((x) => x.key === c.category)?.label || ""}`, q))), [st.catalog, cat, q, cats]);
  const groups = cat === "all" && !q.trim() && cats.length ? cats.map((g) => ({ ...g, items: list.filter((c) => c.category === g.key) })).filter((g) => g.items.length) : [{ key: "list", label: null, items: list }];
  const selected = st.catalog.find((c) => c.type === sel) || null;
  const keys = selected ? selected.sizeKeys || Object.keys(selected.sizes) : [];
  const chosen = selected ? (keys.includes(size) ? size : selected.defaultSize || keys[0]) : null;
  return (
    <div className="wg-gallery__main">
      <div className="wg-gallery__cat">
        <h4 className="wg-gallery__h">Widget ekle <small>{st.catalog.length} widget · karta tıkla: önizle, + : ekle</small></h4>
        <div className="wg-gallery__tools">
          <label className="wg-gallery__search"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Widget ara: mesaj, proje, puan…" aria-label="Widget ara" /></label>
          <div className="wg-gallery__tabs" role="tablist" aria-label="Kategoriler">
            {[{ key: "all", label: "Tümü" }, ...cats].map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} className={cat === c.key ? "is-on" : ""} onClick={() => setCat(c.key)} data-cat={c.key}>{c.label}</button>
            ))}
          </div>
        </div>
        {selected && (
          <aside className="wg-gallery__preview" aria-label="Önizleme">
            <div className="wg-gallery__phead">
              <strong>{selected.label}</strong>
              <span className="tk-note">{selected.hint}</span>
              <span className="wg__grow" />
              <button type="button" className="icon-btn" onClick={() => setSel(null)} aria-label="Önizlemeyi kapat"><Icon name="x" size={14} /></button>
            </div>
            <div className="wg-gallery__stage" role="radiogroup" aria-label="Boyut seçin">
              <Suspense fallback={<p className="muted">Önizleme yükleniyor…</p>}>
                {keys.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={chosen === k} className={`wg-gallery__size${chosen === k ? " is-on" : ""}`} onClick={() => setSize(k)} data-size={k}>
                    <WidgetPreview type={selected.type} size={k} width={selected.sizes[k][0]} height={selected.sizes[k][1]} />
                    <span>{selected.bar ? (k === "small" ? "Kısa" : "Uzun") : SIZE_LABEL[k]} · {selected.sizes[k].join("×")}</span>
                  </button>
                ))}
              </Suspense>
            </div>
            <div className="wg-gallery__pinfo">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => onAdd(selected, chosen)} data-act="add-selected"><Icon name="plus" size={13} /> Masaüstüne ekle ({selected.bar ? (chosen === "small" ? "kısa" : "uzun") : SIZE_LABEL[chosen].toLocaleLowerCase("tr-TR")})</button>
              <span className="tk-note">Önizlemeler gerçek veriyle çalışır; içindeki ayar denemeleri masaüstüne geçmez.</span>
            </div>
          </aside>
        )}
        {groups.map((g) => (
          <section key={g.key}>
            {g.label && <h5 className="wg-gallery__sub">{g.label}</h5>}
            <div className="wg-catalog">
              {g.items.map((c) => (
                <div key={c.type} className={`wg-card${sel === c.type ? " is-sel" : ""}`} data-widget={c.type}>
                  <button type="button" className="wg-card__body" onClick={() => setSel(sel === c.type ? null : c.type)} aria-pressed={sel === c.type} title="Önizle">
                    <span className="wg-card__icon"><Icon name={c.icon} size={18} /></span>
                    <span className="wg-card__text"><strong>{c.label}</strong><small>{c.hint}</small>
                      <span className="wg-card__tags">
                        {c.session && <em>oturum</em>}{c.net && <em>internet</em>}{count(c.type) > 0 && <em className="is-on">{count(c.type)} açık</em>}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="wg-card__add" onClick={() => onAdd(c)} aria-label={`${c.label} ekle`} title="Masaüstüne ekle"><Icon name="plus" size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        ))}
        {!list.length && <p className="muted">“{q}” ile eşleşen widget yok.</p>}
      </div>
    </div>
  );
}
