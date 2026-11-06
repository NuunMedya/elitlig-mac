// Yayın Stüdyosu · LED EKRAN sekmesi: ekran seçimi, ne gösterileceği
// (stüdyo görüntüsü — Yayın / Önizleme / belirli sahne / kapalı — ya da sitenin
// LED sayfası), ikinci monitörde tam ekran aç / kapat, durum ve LED grafikleri
// (grafik modülünün LedGraphicsPanel'i varsa).
import React, { memo } from "react";
import { Field, Icon } from "../../../components/ui";
import { LedGraphicsPanel } from "../scenes/graphicsBridge";

const dispText = (d) => `${d.label || `Ekran ${d.id}`}${d.primary ? " (ana ekran)" : ""} · ${d.bounds?.width || "?"}×${d.bounds?.height || "?"}${d.scaleFactor > 1 ? ` @${d.scaleFactor}x` : ""}`;

const ROUTES = [
  { key: "program", title: "Yayın (Program)", text: "Yayındaki sahneyi izler; program değişince LED de değişir (önerilen)" },
  { key: "preview", title: "Önizleme", text: "Önizlemedeki sahne (seyirciye yayından önce göstermek için)" },
  { key: "scene", title: "Belirli sahne", text: "Seçtiğin sahne sabit kalır (ör. sponsor, skor ekranı)" },
  { key: "off", title: "Kapalı", text: "LED siyah (pencere açık kalır)" },
];

function LedPanel({ led, scenes, matchId, ledMode, g, live }) {
  const p = led.prefs;
  const st = led.status || {};
  const openDisplay = led.displays.find((d) => String(d.id) === String(st.displayId));
  const sceneName = (id) => scenes.find((s) => s.id === id)?.name;
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
            : <button type="button" className="btn btn--primary btn--block" disabled={!led.available || p.displayId == null} onClick={() => led.open()}><Icon name="play" size={13} /> LED çıkışını aç</button>}
        </div>
        {st.open && <p className="st-hint">Açık: {openDisplay ? dispText(openDisplay) : `ekran ${st.displayId ?? "?"}`} · {st.mode === "web" ? "web LED sayfası" : `stüdyo · ${led.targetId ? sceneName(led.targetId) || "sahne" : "siyah"}`}</p>}
        {led.error && <p className="st-hint text-red">{led.error}</p>}
        <div className="st-seg">
          <button type="button" className={!p.web ? "is-on" : ""} onClick={() => led.setPref({ web: false })}><Icon name="layers" size={12} /> Stüdyo görüntüsü</button>
          <button type="button" className={p.web ? "is-on" : ""} onClick={() => led.setPref({ web: true })}><Icon name="globe" size={12} /> Sitenin LED sayfası</button>
        </div>
        {p.web && <p className="st-hint">{matchId ? `elitlig.com/led/${matchId}` : "Maç seçilmedi"} · içerik: {ledMode ? String(ledMode) : "varsayılan"} (üst çubuktaki LED seçicisi)</p>}
        {st.open && st.mode && ((st.mode === "web") !== Boolean(p.web)) && <p className="st-hint is-armed">Kaynak değişti: uygulamak için LED çıkışını kapatıp yeniden aç.</p>}
      </section>

      <section className={`st-card ${p.web ? "is-dim" : ""}`}>
        <header className="st-card__head"><Icon name="arrows" size={15} /><strong>LED'e ver</strong><small className="muted">sahne kutularındaki “LED” düğmesiyle de</small></header>
        <div className="st-var__modes">
          {ROUTES.map((r) => (
            <button key={r.key} type="button" disabled={p.web} className={`st-var__mode ${!p.web && p.route === r.key ? "is-on" : ""}`}
              onClick={() => led.setRoute({ route: r.key, sceneId: r.key === "scene" ? p.sceneId || scenes[0]?.id || null : p.sceneId })}>
              <span><strong>{r.title}</strong><small>{r.text}</small></span>
            </button>
          ))}
        </div>
        {!p.web && p.route === "scene" && (
          <Field label="Sahne">
            <select value={p.sceneId || ""} onChange={(e) => led.setRoute({ route: "scene", sceneId: e.target.value })}>
              {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
      </section>

      {LedGraphicsPanel && g && (
        <section className="st-card st-led__gfx">
          <LedGraphicsPanel g={g} live={live} matchId={matchId} embedded scenes={scenes.map((s) => ({ id: s.id, name: s.name }))} />
        </section>
      )}
    </div>
  );
}

export default memo(LedPanel);
