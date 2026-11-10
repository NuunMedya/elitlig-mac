// Sponsorluk paketi formu: ad, seviye / renk, fiyat (KDV hariç ya da dahil),
// kontenjan, süre, haklar (katalogdan, isteğe bağlı değer), görünürlük ölçümleri.
import React, { useState } from "react";
import { Field, Icon, Modal } from "../../../components/ui";
import { TIERS, VAT_RATES, money, packagePrices, parseAmount } from "../../../lib/salesUtils";

export default function PackageForm({ pkg = null, features = [], onSave, onClose }) {
  const [f, setF] = useState(() => ({
    name: pkg?.name || "", tier: pkg?.tier || "", color: pkg?.color || "#4f46e5", tagline: pkg?.tagline || "", description: pkg?.description || "",
    price: pkg?.price == null ? "" : String(pkg.price).replace(".", ","), price_includes_vat: Boolean(pkg?.price_includes_vat), vat_rate: pkg?.vat_rate ?? 20,
    quota: pkg?.quota ?? "", duration: pkg?.duration || "", highlight: Boolean(pkg?.highlight), active: pkg ? pkg.active : true,
    features: { ...(pkg?.features || {}) }, metrics: (pkg?.metrics || []).map((m) => ({ ...m })),
  }));
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const prices = packagePrices({ price: parseAmount(f.price), vat_rate: f.vat_rate, price_includes_vat: f.price_includes_vat });
  const groups = [...new Set(features.map((x) => x.group_name || ""))];
  const toggle = (id) => setF((x) => { const m = { ...x.features }; if (m[id]) delete m[id]; else m[id] = true; return { ...x, features: m }; });
  const submit = async () => {
    if (!f.name.trim()) return;
    setBusy(true);
    const ok = await onSave({
      name: f.name.trim(), tier: f.tier || null, color: f.color, tagline: f.tagline, description: f.description, price: f.price === "" ? null : f.price, price_includes_vat: f.price_includes_vat,
      vat_rate: Number(f.vat_rate), quota: f.quota === "" ? null : Number(f.quota), duration: f.duration, highlight: f.highlight, active: f.active, features: f.features, metrics: f.metrics.filter((m) => m.label?.trim()),
    });
    if (!ok) setBusy(false);
  };
  return (
    <Modal title={pkg ? `Paketi düzenle · ${pkg.name}` : "Yeni sponsorluk paketi"} onClose={onClose} width={980} className="modal--tool" footer={<>
      <span className="muted small spacer">{prices.net != null ? `KDV hariç ${money(prices.net)} · KDV dahil ${money(prices.gross)}` : "Fiyat girilmedi (sunumda “Fiyat için görüşelim”)"}</span>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" disabled={busy || !f.name.trim()} onClick={submit}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </>}>
      <div className="sl-pkgform">
        <div className="sl-pkgform__main">
          <div className="sl-pkgprev" style={{ "--pk": f.color }}><small>{TIERS.find((t) => t.key === f.tier)?.label || "Sponsorluk paketi"}</small><strong>{f.name || "Paket adı"}</strong>{f.tagline && <span>{f.tagline}</span>}</div>
          <div className="form-grid">
            <Field label="Paket adı"><input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="Ör. Altın Sponsor" /></Field>
            <Field label="Seviye">
              <select value={f.tier} onChange={(e) => { const t = TIERS.find((x) => x.key === e.target.value); set({ tier: e.target.value, ...(t ? { color: t.color } : {}) }); }}>
                <option value="">Seviye yok</option>{TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Renk"><div className="sl-colors">{TIERS.map((t) => <button key={t.key} type="button" className={f.color === t.color ? "is-on" : ""} style={{ background: t.color }} onClick={() => set({ color: t.color })} aria-label={`${t.label} rengi`} />)}<input type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} aria-label="Özel renk" /></div></Field>
            <Field label="Kısa tanım"><input value={f.tagline} maxLength={200} onChange={(e) => set({ tagline: e.target.value })} placeholder="Ör. Sahada ve yayında güçlü görünürlük" /></Field>
            <Field label="Fiyat (₺)">
              <div className="sl-pricerow">
                <input value={f.price} inputMode="decimal" placeholder="0" onChange={(e) => set({ price: e.target.value })} aria-label="Fiyat" />
                <div className="seg seg--sm" role="radiogroup" aria-label="Fiyat KDV">{[[false, "KDV hariç"], [true, "KDV dahil"]].map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={f.price_includes_vat === v} className={f.price_includes_vat === v ? "is-active" : ""} onClick={() => set({ price_includes_vat: v })}>{l}</button>)}</div>
              </div>
            </Field>
            <Field label="KDV oranı"><select value={f.vat_rate} onChange={(e) => set({ vat_rate: Number(e.target.value) })}>{[...new Set([...VAT_RATES, Number(f.vat_rate)])].map((r) => <option key={r} value={r}>%{r}</option>)}</select></Field>
            <Field label={`Kontenjan${pkg?.sold ? ` · ${pkg.sold} satıldı` : " · boş: sınırsız"}`}><input type="number" min={pkg?.sold || 0} value={f.quota} onChange={(e) => set({ quota: e.target.value })} placeholder="Sınırsız" /></Field>
            <Field label="Süre"><input value={f.duration} maxLength={80} onChange={(e) => set({ duration: e.target.value })} placeholder="Ör. 1 sezon / 12 ay" /></Field>
          </div>
          <Field label="Açıklama"><textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <div className="row-gap">
            <label className="sl-toggle"><input type="checkbox" checked={f.highlight} onChange={(e) => set({ highlight: e.target.checked })} /> Önerilen paket</label>
            <label className="sl-toggle"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Satışta (sunumlarda görünür)</label>
          </div>
          <section className="sl-box">
            <h4><Icon name="eye" size={13} /> Görünürlük ölçümleri</h4>
            {f.metrics.map((m, i) => (
              <div key={i} className="sl-pair">
                <input value={m.label} placeholder="Ölçüm (ör. Yayında görünme)" aria-label={`Ölçüm ${i + 1}`} onChange={(e) => set({ metrics: f.metrics.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input value={m.value} placeholder="Değer (ör. 900 sn)" aria-label={`Ölçüm ${i + 1} değeri`} onChange={(e) => set({ metrics: f.metrics.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" className="icon-btn" onClick={() => set({ metrics: f.metrics.filter((_, j) => j !== i) })} aria-label={`Ölçüm ${i + 1} sil`}><Icon name="x" size={12} /></button>
              </div>
            ))}
            <div className="row-gap">
              {f.metrics.length < 12 && <button type="button" className="btn btn--xs btn--soft" onClick={() => set({ metrics: [...f.metrics, { label: "", value: "" }] })}><Icon name="plus" size={11} /> Ölçüm ekle</button>}
              {["Yayında görünme", "Sosyal medya gönderisi", "Logo konumu", "Tahmini erişim"].filter((l) => !f.metrics.some((m) => m.label === l)).map((l) => <button key={l} type="button" className="btn btn--xs" onClick={() => set({ metrics: [...f.metrics, { label: l, value: "" }] })}>+ {l}</button>)}
            </div>
          </section>
        </div>
        <aside className="sl-pkgform__features">
          <h4><Icon name="checkSquare" size={13} /> Haklar <span className="muted small">{Object.keys(f.features).length}/{features.length}</span></h4>
          {!features.length && <p className="muted small">Hak kataloğu boş. Sponsorluk sekmesindeki karşılaştırma matrisinden hak ekleyin.</p>}
          {groups.map((g) => (
            <div key={g || "-"} className="sl-featgroup">
              {g && <small>{g}</small>}
              {features.filter((x) => (x.group_name || "") === g).map((x) => {
                const v = f.features[String(x.id)];
                return (
                  <div key={x.id} className={`sl-feat ${v ? "is-on" : ""}`}>
                    <label><input type="checkbox" checked={Boolean(v)} onChange={() => toggle(String(x.id))} /> <span>{x.name}</span></label>
                    {v && <input value={v === true ? "" : v} placeholder="✓ (değer isteğe bağlı)" maxLength={60} aria-label={`${x.name} değeri`} onChange={(e) => setF((y) => ({ ...y, features: { ...y.features, [String(x.id)]: e.target.value.trim() ? e.target.value : true } }))} />}
                  </div>
                );
              })}
            </div>
          ))}
        </aside>
      </div>
    </Modal>
  );
}
