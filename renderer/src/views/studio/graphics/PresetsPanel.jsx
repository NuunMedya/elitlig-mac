// Yayın grafikleri · ÖN AYARLAR — markanın tamamını (logo, tema, yazı tipi,
// ölçüler, masaüstü ekleri) adıyla saklar: "CCL CUP" uygulanınca her şey değişir.
// Sunucuda saklanır (GET/POST/PUT/DELETE /api/overlay-branding/presets);
// uç yoksa bu bilgisayarda. Uygulama maçın markasını yazar → web kaplamaları da değişir.
import React, { useState } from "react";
import { Icon, useConfirm } from "../../../components/ui";
import { DEFAULT_BRANDING, SAMPLE_CCL_CUP, mergePreset, themeSwatches } from "../../../lib/studio/graphics/branding";

const TEMPLATES = [
  { key: "elitlig", name: "ElitLig (varsayılan)", branding: DEFAULT_BRANDING },
  { key: "ccl", name: "Örnek: CCL CUP (lacivert / altın)", branding: SAMPLE_CCL_CUP },
];

const Swatch = ({ branding }) => {
  const sw = themeSwatches(branding.scoreboard);
  return <span className="gx-swatches" aria-hidden="true">{[sw.deep, sw.base, sw.accent, sw.light].map((c, i) => <i key={i} style={{ background: c }} />)}</span>;
};

export default function PresetsPanel({ g }) {
  const confirm = useConfirm();
  const b = g.brand;
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);
  const wrap = (fn) => async (...args) => { setBusy(true); try { return await fn(...args); } finally { setBusy(false); } };

  const saveNew = wrap(async (e) => {
    e?.preventDefault?.();
    const row = await b.savePreset(name);
    if (row) setName("");
  });
  const remove = wrap(async (p) => {
    if (await confirm({ title: "Ön ayar silinsin mi?", message: `“${p.name}” kalıcı olarak silinir. Bu ön ayarı kullanan maçların görünümü değişmez.`, danger: true, confirmLabel: "Sil" })) await b.deletePreset(p.id);
  });
  const apply = wrap(async (p) => {
    if (b.dirty && !(await confirm({ title: "Ön ayar uygulansın mı?", message: "Kaydedilmemiş marka değişiklikleri kaybolur.", confirmLabel: "Uygula" }))) return;
    await b.applyPreset(p.id);
  });

  return (
    <div className="mg-grid2">
      <fieldset className="mg-box">
        <legend>Kayıtlı ön ayarlar {!b.presetsRemote && <span className="pill pill--xs pill--amber" title="Sunucuda ön ayar ucu bulunamadı">Bu bilgisayarda</span>}</legend>
        {b.presetsLoading ? <p className="mg-muted">Yükleniyor…</p> : b.presets.length ? (
          <ul className="mg-rows">
            {b.presets.map((p) => (
              <li key={p.id} className="mg-row gx-preset">
                <Swatch branding={p.branding} />
                <span className="mg-row__main">
                  {renaming?.id === p.id ? (
                    <form className="mg-inline" onSubmit={async (e) => { e.preventDefault(); if (await b.renamePreset(p.id, renaming.name)) setRenaming(null); }}>
                      <input autoFocus value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} />
                      <button type="submit" className="btn btn--xs">Kaydet</button>
                      <button type="button" className="btn btn--xs btn--ghost" onClick={() => setRenaming(null)}>Vazgeç</button>
                    </form>
                  ) : (
                    <>
                      <strong>{p.name} {p.isDefault && <span className="pill pill--xs pill--green">Varsayılan</span>}</strong>
                      <small>{p.branding.brandName || "ELİT LİG"} · {p.branding.scoreboard.theme} · {p.branding.scoreboard.font}{p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleDateString("tr-TR")}` : ""}</small>
                    </>
                  )}
                </span>
                <button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={() => apply(p)}>Uygula</button>
                <button type="button" className="icon-btn icon-btn--xs" title={p.isDefault ? "Varsayılanı kaldır" : "Varsayılan yap (özelleştirilmemiş maçlar bununla açılır)"} disabled={busy} onClick={wrap(() => b.setDefaultPreset(p.id, !p.isDefault))}><Icon name="star" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Şimdiki görünümle güncelle" disabled={busy} onClick={wrap(() => b.overwritePreset(p.id))}><Icon name="refresh" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Yeniden adlandır" onClick={() => setRenaming({ id: p.id, name: p.name })}><Icon name="pencil" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Sil" disabled={busy} onClick={() => remove(p)}><Icon name="trash" size={12} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="mg-muted">Henüz ön ayar yok. Görünümü “Marka & tema”dan ayarla, sonra buradan adıyla kaydet.</p>}
      </fieldset>

      <fieldset className="mg-box">
        <legend>Yeni ön ayar</legend>
        <form className="mg-inline" onSubmit={saveNew}>
          <input className="mg-grow" value={name} maxLength={60} placeholder="Ör. CCL CUP" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn--sm btn--primary" disabled={!name.trim() || busy}><Icon name="plus" size={13} /> Şimdiki görünümü kaydet</button>
        </form>
        <p className="mg-muted mg-small">Logo, marka yazısı, tema renkleri, yazı tipi, logo / yazı boyutu ve şerit renkleri birlikte saklanır.</p>
        <h6 className="mg-sidehead">Hazır şablonlar</h6>
        <ul className="mg-rows">
          {TEMPLATES.map((t) => (
            <li key={t.key} className="mg-row gx-preset">
              <Swatch branding={mergePreset(DEFAULT_BRANDING, t.branding)} />
              <span className="mg-row__main"><strong>{t.name}</strong><small>Taslağa yükler; Kaydet ile yayına alınır</small></span>
              <button type="button" className="btn btn--xs" onClick={() => b.setBranding(mergePreset(b.branding, { ...t.branding, logoUrl: t.branding.logoUrl ?? b.branding.logoUrl }))}>Taslağa yükle</button>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
