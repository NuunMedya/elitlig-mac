// Widget galerisi ("Widget ekle"): katalogdan masaüstüne widget ekle; açık widget'ların boyutu,
// saydamlığı, katmanı (normal / üstte / masaüstüne gömülü), kilidi; tema ve göster / gizle.
// Ana süreç: app/widgets. Widget penceresinin kendi ⋯ menüsü de aynı ayarları sunar.
import React, { useEffect, useState } from "react";
import { Icon, isMac, useToast } from "../../components/ui";
import { acceleratorLabel } from "./shortcutUtils";

const LEVEL_LABEL = { normal: "Normal", top: "Üstte sabit", desktop: "Masaüstüne gömülü" };

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
  const add = async (c) => {
    const r = await api.add(c.type);
    if (r?.ok) toast(`${c.label} masaüstüne eklendi${st.visible ? "" : " (widget'lar yeniden gösterildi)"}. Sürükleyerek taşıyın; sağ tık: ayarlar.`, { tone: "success", timeout: 4500 });
    else toast(r?.error || "Eklenemedi.", { tone: "error" });
  };
  const upd = (id, patch) => api.update(id, patch);
  const count = (type) => st.items.filter((i) => i.type === type).length;
  const labelOf = (type) => st.catalog.find((c) => c.type === type)?.label || type;

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
        <span className="tk-note">{st.items.length ? `${st.items.length} widget masaüstünde` : "Henüz widget yok — aşağıdan ekleyin."}</span>
      </div>

      <h4 className="wg-gallery__h">Widget ekle</h4>
      <div className="wg-catalog">
        {st.catalog.map((c) => (
          <button key={c.type} type="button" className="wg-card" onClick={() => add(c)} data-widget={c.type}>
            <span className="wg-card__icon"><Icon name={c.icon} size={18} /></span>
            <span className="wg-card__text"><strong>{c.label}</strong><small>{c.hint}</small>
              <span className="wg-card__tags">
                {c.session && <em>oturum</em>}{c.net && <em>internet</em>}{count(c.type) > 0 && <em className="is-on">{count(c.type)} açık</em>}
              </span>
            </span>
            <span className="wg-card__add"><Icon name="plus" size={14} /></span>
          </button>
        ))}
      </div>

      {st.items.length > 0 && (
        <>
          <h4 className="wg-gallery__h">Masaüstündeki widget'lar</h4>
          <div className="wgg-list" role="table" aria-label="Açık widget'lar">
            {st.items.map((it) => (
              <div key={it.id} className="wgg-row" role="row">
                <span className="wgg-row__name" role="cell"><Icon name={st.catalog.find((c) => c.type === it.type)?.icon || "grid"} size={14} /> {labelOf(it.type)}</span>
                <select role="cell" value={it.size} onChange={(e) => upd(it.id, { size: e.target.value })} aria-label="Boyut"><option value="small">Küçük</option><option value="medium">Orta</option></select>
                <label role="cell" className="wgg-row__op" title="Arka plan saydamlığı">
                  <input type="range" min={30} max={100} step={5} value={it.opacity} onChange={(e) => upd(it.id, { opacity: Number(e.target.value) })} aria-label="Saydamlık" /> %{it.opacity}
                </label>
                <select role="cell" value={it.level} onChange={(e) => upd(it.id, { level: e.target.value })} aria-label="Katman">
                  <option value="normal">{LEVEL_LABEL.normal}</option>
                  <option value="top">{LEVEL_LABEL.top}</option>
                  {st.canDesktop && <option value="desktop" disabled={st.catalog.find((c) => c.type === it.type)?.interactive && it.level !== "desktop"}>{LEVEL_LABEL.desktop}</option>}
                </select>
                <label role="cell" className="tk-check"><input type="checkbox" checked={it.locked} onChange={(e) => upd(it.id, { locked: e.target.checked })} /> Kilitli</label>
                <button role="cell" type="button" className="icon-btn" onClick={() => api.remove(it.id)} aria-label={`${labelOf(it.type)} kaldır`} title="Kaldır"><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="tk-note"><Icon name="info" size={12} /> Widget'lar çerçevesiz, küçük pencerelerdir: başlığından sürükleyin, konum hatırlanır ve uygulama açılınca geri gelir. {mac ? "Tüm masaüstlerinde (Spaces) görünür, Dock'ta görünmez. “Masaüstüne gömülü” katmanı pencerelerin altında, simgelerin hizasında durur ama tıklanmaz (saat, sistem, hava, döviz için)." : "Görev çubuğunda görünmez. “Üstte sabit” her pencerenin üstünde kalır."} Ayarlar için widget'a sağ tıklayın ya da ⋯ düğmesini kullanın.</p>
    </div>
  );
}
