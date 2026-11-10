// Panorama · HAZIR AYARLAR, ŞABLONLAR ve WEB PANORAMA'DAN İÇE AKTARMA.
//
// Hazır ayar = marka + düzen (açılar) + kart listesi + kaynak ayarları + kapsam. Kaydet / üzerine
// kaydet / yeniden adlandır / sil / dışa aktar (markalarıyla, logolar gömülü). Web yönetimindeki
// kayıtlı Panorama yayınları (yönetim yetkisiyle liste; yoksa yayın numarasıyla herkese açık uçtan)
// marka profili + hazır ayar olarak içe aktarılır.
import React, { useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import { request } from "../../../api";
import { BUILTIN_TEMPLATES } from "../../../lib/studio/panorama/model";
import { brandFromWebBroadcast, exportBrands } from "../../../lib/studio/panorama/brands";
import { presetFromWebBroadcast } from "../../../lib/studio/panorama/presets";
import { fetchWebBroadcast, fetchWebBroadcasts } from "../../../lib/studio/panorama/webScenes";
import { imageToData } from "./BrandPanel";

function WebImport({ sources, onImport }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [state, setState] = useState("");
  const [id, setId] = useState("");
  const load = async () => {
    setState("Yükleniyor…");
    const r = await fetchWebBroadcasts(request);
    setList(r.items);
    setState(r.denied ? "Web Panorama yönetim yetkin yok: yayın numarasıyla içe aktarabilirsin." : r.error && !r.items.length ? r.error : r.items.length ? "" : "Kayıtlı web Panorama yayını yok.");
  };
  const take = async (bc0) => {
    let bc = bc0;
    if (!bc.scene || !bc.brandStyle) { const r = await fetchWebBroadcast(request, bc.id); if (r.broadcast) bc = r.broadcast; }
    const brand = brandFromWebBroadcast(bc);
    // Web logosu profile gömülür (dışa aktarılan dosya başka bilgisayarda ağsız da çalışsın).
    if (brand.logo?.url && !brand.logo.data) { try { brand.logo = { ...brand.logo, data: (await imageToData(brand.logo.url)).data }; } catch { /* adres kalır */ } }
    const { preset, sources: renamed } = presetFromWebBroadcast(bc, { brandId: brand.id, sources });
    onImport({ brand, preset, sources: renamed });
    toast(`“${bc.name}” içe aktarıldı: marka profili + hazır ayar.`, { tone: "success", timeout: 3500 });
  };
  const byId = async () => {
    const r = await fetchWebBroadcast(request, id);
    if (!r.broadcast) { toast(r.error || "Yayın bulunamadı.", { tone: "error" }); return; }
    take(r.broadcast);
  };
  return (
    <div className="pn-webimport">
      <h4>Web Panorama'dan içe aktar</h4>
      <p className="st-hint">Web yönetimindeki (Yönetim › Panorama) kayıtlı yayınlar: program kimliği (logo, renk, yazı tipi), konuklar, alt bant ve yayındaki sahne.</p>
      <div className="pn-row2">
        <button type="button" className="btn btn--sm" onClick={load} data-act="web-list"><Icon name="refresh" size={12} /> Web yayınlarını listele</button>
        <input className="input pn-sec" placeholder="Yayın no" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} data-field="web-id" />
        <button type="button" className="btn btn--sm" disabled={!id} onClick={byId} data-act="web-import-id">Numarayla al</button>
      </div>
      {state && <p className="st-hint">{state}</p>}
      {list?.length > 0 && (
        <ul className="pn-tpllist">{list.map((b) => (
          <li key={b.id}>
            <div><b>{b.name}</b><small>#{b.id} · {b.layout} · tema {b.theme}{b.scene?.type ? ` · sahne ${b.scene.type}` : ""}</small></div>
            <button type="button" className="btn btn--sm" onClick={() => take(b)}>İçe aktar</button>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

export default function PresetsPanel({ presets, activeId, dirty, onApply, onSave, onSaveAs, onRename, onDelete, brands, templates, onApplyTemplate, onSaveTemplate, onDeleteTemplate, templateKey, sources, onWebImport }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [tname, setTname] = useState("");
  const [editing, setEditing] = useState(null);
  const active = presets.find((p) => p.id === activeId) || null;
  const exportPresets = async () => {
    if (!presets.length) return;
    const used = new Set(presets.map((p) => p.brandId));
    const file = exportBrands(brands.filter((b) => used.has(b.id)), { presets });
    const r = await window.elitlig?.files?.save?.("elitlig-panorama-hazir-ayarlar.json", JSON.stringify(file, null, 1), [{ name: "Elitlig marka dosyası", extensions: ["json"] }]);
    if (r?.ok) toast(`Dışa aktarıldı: ${r.path}`, { tone: "success", timeout: 4000 });
  };
  return (
    <div className="pn-tpls">
      <h4>Yayın hazır ayarları</h4>
      <p className="st-hint">Marka + düzen + kartlar + kaynak ayarları + kapsam. Açılışta son kullanılan otomatik yüklenir; üst çubuktan tek tıkla geçilir.</p>
      {presets.length ? (
        <ul>{presets.map((p) => (
          <li key={p.id} className={p.id === activeId ? "is-on" : ""} data-preset={p.id}>
            {editing === p.id
              ? <input className="input" autoFocus defaultValue={p.name} maxLength={60} onBlur={(e) => { onRename(p, e.target.value); setEditing(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }} />
              : <div><b>{p.name}{p.id === activeId && dirty ? " •" : ""}</b><small>{p.angles.length} açı · {p.playlist.items.length} kart · {new Date(p.savedAt).toLocaleString("tr-TR")}</small></div>}
            <button type="button" className="btn btn--sm" onClick={() => onApply(p)} data-act="preset-apply">Yükle</button>
            <button type="button" className="icon-btn" onClick={() => setEditing(p.id)} title="Yeniden adlandır"><Icon name="pencil" size={12} /></button>
            <button type="button" className="icon-btn" onClick={() => onDelete(p)} title="Sil"><Icon name="trash" size={12} /></button>
          </li>
        ))}</ul>
      ) : <p className="st-hint">Henüz hazır ayar yok.</p>}
      <div className="pn-row2">
        <input className="input" placeholder="Hazır ayar adı" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-field="preset-name" />
        <button type="button" className="btn btn--sm btn--primary" onClick={() => { onSaveAs(name || `Hazır ayar ${presets.length + 1}`); setName(""); }} data-act="preset-save-as"><Icon name="plus" size={12} /> Yeni kaydet</button>
      </div>
      <div className="pn-row2">
        <button type="button" className="btn btn--sm" disabled={!active} onClick={onSave} data-act="preset-save"><Icon name="check" size={12} /> {active ? `“${active.name}” üzerine kaydet` : "Üzerine kaydet"}</button>
        <button type="button" className="btn btn--sm" disabled={!presets.length} onClick={exportPresets} data-act="preset-export"><Icon name="download" size={12} /> Dışa aktar</button>
      </div>
      <p className="st-hint">İçe aktarma: Marka sekmesindeki “İçe aktar” (marka + hazır ayarlar birlikte).</p>

      <WebImport sources={sources} onImport={onWebImport} />

      <h4>Şablonlar</h4>
      <p className="st-hint">Şablon: kamera açıları + kart sırası + alt bant + tema (kaynak ve marka içermez).</p>
      <ul>{[...BUILTIN_TEMPLATES, ...templates].map((t) => (
        <li key={t.key} className={templateKey === t.key ? "is-on" : ""}>
          <div><b>{t.name}</b><small>{t.hint || `${t.angles.length} açı · ${t.cards.length} kart${t.savedAt ? ` · ${new Date(t.savedAt).toLocaleDateString("tr-TR")}` : ""}`}</small></div>
          <button type="button" className="btn btn--sm" onClick={() => onApplyTemplate(t)}>Uygula</button>
          {!t.builtin && <button type="button" className="icon-btn" onClick={() => onDeleteTemplate(t)} title="Sil"><Icon name="trash" size={13} /></button>}
        </li>
      ))}</ul>
      <div className="pn-row2">
        <input className="input" placeholder="Şablon adı" value={tname} maxLength={60} onChange={(e) => setTname(e.target.value)} />
        <button type="button" className="btn btn--sm" onClick={() => { onSaveTemplate(tname); setTname(""); }}><Icon name="plus" size={12} /> Şimdiki düzeni şablon yap</button>
      </div>
    </div>
  );
}
