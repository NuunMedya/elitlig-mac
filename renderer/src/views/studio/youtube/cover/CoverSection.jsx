// Yayın Stüdyosu · Ayarlar › YouTube kapağı: altı şablon (canlı önizlemeler),
// renk / alan / zemin fotoğrafı seçenekleri ve "Yayın başlarken kapağı otomatik
// ayarla". Önizlemeler son açılan maçın verisiyle (yoksa örnek maçla) çizilir.
// Kendi içinde bağımsız: Ayarlar sayfasına yalnız bölüm anahtarı + bu bileşen eklenir.
import React from "react";
import { templateOf } from "../../../../lib/studio/cover/model";
import CoverPreview from "./CoverPreview";
import { CoverOptions, TemplatePicker } from "./CoverOptions";
import { useCoverSettings, useLastCoverData } from "./coverStore";
import "./cover.css";

export const COVER_SECTION = { key: "kapak", label: "YouTube kapağı", icon: "image" };

function Switch({ checked, onChange, title, text }) {
  return (
    <label className="st-switchrow">
      <span><strong>{title}</strong>{text && <small>{text}</small>}</span>
      <input type="checkbox" className="st-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function CoverSection({ toast }) {
  const [settings, set] = useCoverSettings();
  const data = useLastCoverData();
  const t = templateOf(settings.template);
  return (
    <>
      <section className="st-set__card">
        <header><h3>Kapak şablonu</h3><p>Maç canlı yayınının YouTube kapağı (küçük resim): takım armaları ve adları, lig, sezon, tarih / saat, saha. Bir şablon seçin.</p></header>
        <div className="st-set__card-body">
          <TemplatePicker data={data} settings={settings} onPick={(template) => set({ template })} thumbWidth={240} />
        </div>
      </section>
      <section className="st-set__card">
        <header><h3>Seçili şablon · {t.label}</h3><p>{t.hint}. Önizleme {data.matchId ? "son açılan maçın" : "örnek bir maçın"} verisiyle.</p></header>
        <div className="st-set__card-body yc-set">
          <CoverPreview data={data} settings={settings} width={560} title={`${t.label} önizlemesi`} />
          <CoverOptions settings={settings} set={set} toast={toast} />
        </div>
      </section>
      <section className="st-set__card">
        <header><h3>Otomatik</h3><p>YouTube yayını açılınca kapak üretilip yayının küçük resmi yapılır; sonuç bildirimle gösterilir (hata olursa “Tekrar dene”).</p></header>
        <div className="st-set__card-body">
          <Switch checked={settings.auto} onChange={(v) => set({ auto: v })} title="Yayın başlarken kapağı otomatik ayarla" text="Yayın panelindeki “Kapağı oluştur ve YouTube'a yükle” ile elle de yüklenebilir." />
          <Switch checked={settings.siteCover} onChange={(v) => set({ siteCover: v })} title="Maçın sitedeki kapağı boşsa bu görseli kullan" text="Editörün yüklediği maç fotoğrafı hiçbir zaman değiştirilmez." />
          <p className="st-hint">YouTube, özel küçük resmi yalnız <b>telefonla doğrulanmış</b> kanallarda kabul eder (youtube.com/verify). Doğrulanmamış kanalda yükleme bunu söyleyen bir hatayla durur; yayın etkilenmez.</p>
        </div>
      </section>
    </>
  );
}
