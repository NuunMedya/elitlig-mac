// Yayın Stüdyosu · LED EKRAN sekmesi: ekran seçimi, içerik (sitenin LED
// sayfası — içerik türü üst çubuktaki LED seçiciden — ya da bir stüdyo sahnesi /
// program), ikinci monitörde tam ekran aç / kapat, durum.
import React, { memo } from "react";
import { Field, Icon } from "../../../components/ui";

const dispText = (d) => `${d.label || `Ekran ${d.id}`}${d.primary ? " (ana ekran)" : ""} · ${d.bounds?.width || "?"}×${d.bounds?.height || "?"}${d.scaleFactor > 1 ? ` @${d.scaleFactor}x` : ""}`;

function LedPanel({ led, scenes, matchId, ledMode }) {
  const p = led.prefs;
  const st = led.status || {};
  const openDisplay = led.displays.find((d) => String(d.id) === String(st.displayId));
  return (
    <div className="st-led">
      <section className="st-card">
        <header className="st-card__head"><Icon name="overview" size={15} /><strong>LED ekran çıkışı</strong>
          <span className={`pill pill--xs ${st.open ? "pill--red" : ""}`}>{st.open ? "AÇIK" : "KAPALI"}</span>
        </header>
        {!led.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> LED çıkışı bu uygulama sürümünde yok (güncelleme gerekir).</div>}
        <Field label="Ekran" hint="LED ekranı / projektörü ikinci monitör olarak bağla; pencere o ekranda tam ekran açılır.">
          <div className="st-row">
            <select value={p.displayId ?? ""} onChange={(e) => led.setPref({ displayId: e.target.value === "" ? null : (Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) })}>
              {!led.displays.length && <option value="">Ekran bulunamadı</option>}
              {led.displays.map((d) => <option key={d.id} value={d.id}>{dispText(d)}</option>)}
            </select>
            <button type="button" className="icon-btn" onClick={led.refreshDisplays} title="Ekranları yenile"><Icon name="refresh" size={14} /></button>
          </div>
        </Field>
        {led.displays.length === 1 && <p className="st-hint is-armed">Yalnız bir ekran var: LED çıkışı bu ekranı kaplar (Esc ile kapanır).</p>}
        <div className="st-row">
          {st.open
            ? <button type="button" className="btn btn--block" onClick={led.close}><Icon name="stop" size={13} /> LED çıkışını kapat</button>
            : <button type="button" className="btn btn--primary btn--block" disabled={!led.available || p.displayId == null} onClick={led.open}><Icon name="play" size={13} /> LED çıkışını aç</button>}
        </div>
        {st.open && <p className="st-hint">Açık: {openDisplay ? dispText(openDisplay) : `ekran ${st.displayId ?? "?"}`} · {st.mode === "web" ? "web LED sayfası" : "stüdyo sahnesi"}</p>}
        {led.error && <p className="st-hint text-red">{led.error}</p>}
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="layers" size={15} /><strong>LED'de ne görünsün?</strong></header>
        <div className="st-var__modes">
          <button type="button" className={`st-var__mode ${p.content === "web" ? "is-on" : ""}`} onClick={() => led.setPref({ content: "web" })}>
            <span><strong>Sitenin LED sayfası</strong><small>{matchId ? `elitlig.com/led/${matchId}` : "maç seçilmedi"} · içerik: {ledMode ? String(ledMode) : "varsayılan"} (üst çubuktaki LED seçicisinden)</small></span>
          </button>
          <button type="button" className={`st-var__mode ${p.content === "scene" ? "is-on" : ""}`} onClick={() => led.setPref({ content: "scene", sceneId: p.sceneId || scenes[0]?.id || null })}>
            <span><strong>Stüdyo sahnesi</strong><small>Seçilen sahne ve yayın grafikleri (kameralar LED penceresinde ayrıca açılır)</small></span>
          </button>
          <button type="button" className={`st-var__mode ${p.content === "program" ? "is-on" : ""}`} onClick={() => led.setPref({ content: "program" })}>
            <span><strong>Program sahnesi</strong><small>Yayındaki sahneyi izler (tekrar / VAR hariç)</small></span>
          </button>
        </div>
        {p.content === "scene" && (
          <Field label="Sahne">
            <select value={p.sceneId || ""} onChange={(e) => led.setPref({ sceneId: e.target.value })}>
              {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        {st.open && st.mode && ((st.mode === "web") !== (p.content === "web")) && <p className="st-hint is-armed">İçerik türü değişti: uygulamak için LED çıkışını kapatıp yeniden aç.</p>}
      </section>
    </div>
  );
}

export default memo(LedPanel);
