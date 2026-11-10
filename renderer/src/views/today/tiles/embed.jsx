// Masaüstü widget gövdelerini (widgets/Widget.jsx BODIES) pano bileşeni olarak çizer. Gövdeler
// değişmeden kullanılır (masaüstü widget pencereleriyle ortak); kademe → widget boyutu
// (registry.widgetSizeFor), ayarlar öğenin "o" alanında saklanır. xs kademesi gövde değil, 1×1 düğmedir.
import React, { Suspense, lazy } from "react";
import { widgetSizeFor } from "../registry";
import { Loading, XsButton } from "../parts";
import { useBridge } from "../data";

const EmbedBody = lazy(() => import("./embedBody"));

/** xs düğmesi: gövdeye göre kısa değer (saat, sıcaklık, kur, çalan parça…). */
function XsFor({ meta, go, o }) {
  const type = meta.embed;
  const [music] = useBridge(() => (type === "music" ? window.elitlig.music?.state() : null), (cb) => (type === "music" ? window.elitlig.music?.onState(cb) : null), [type]);
  const [weather] = useBridge(() => (type === "weather" ? window.elitlig.widgets.weather(o.city || "") : null), null, [type, o.city]);
  const [studio] = useBridge(() => (type === "studio" ? window.elitlig.widgets.studio() : null), (cb) => (type === "studio" ? window.elitlig.studio?.onStatus?.(() => window.elitlig.widgets.studio().then(cb)) : null), [type]);
  const [rates] = useBridge(() => (type === "rates" ? window.elitlig.widgets.rates(false) : null), null, [type]);
  const open = () => (meta.route ? go(meta.route) : null);
  if (type === "clock") {
    const now = new Date();
    return <XsButton icon="clock" value={now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} label={now.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric" })} onClick={open} />;
  }
  if (type === "weather") return <XsButton icon="sun" value={weather?.ok ? `${weather.temp}°` : "–"} label={weather?.ok ? weather.place : "Hava"} onClick={open} />;
  if (type === "music") {
    const playing = ["playing", "buffering"].includes(music?.status);
    return <XsButton icon={playing ? "pause" : "music"} label={music?.title ? String(music.title).slice(0, 18) : "Müzik"} tone={playing ? "red" : ""} title={playing ? "Duraklat" : "Çal"} onClick={() => window.elitlig.music?.command(music?.trackCount ? "toggle" : "show")} />;
  }
  if (type === "studio") return <XsButton icon="broadcast" label={studio?.active ? "YAYINDA" : "Stüdyo"} tone={studio?.active ? "red" : ""} onClick={() => go("studio")} />;
  if (type === "rates") {
    const r = rates?.ok ? rates.rates : null;
    const usd = r?.TRY && r?.USD ? (r.TRY / r.USD).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "–";
    return <XsButton icon="swap" value={usd} label="USD ₺" onClick={open} />;
  }
  return <XsButton icon={meta.icon} label={meta.label} onClick={open} />;
}

export function EmbedTile({ tier, meta, item, o, set, go, settings, closeSettings }) {
  if (tier === "xs" && !settings) return <XsFor meta={meta} go={go} o={o} />;
  return (
    <Suspense fallback={<Loading />}>
      <EmbedBody type={meta.embed} size={widgetSizeFor(meta, tier === "xs" ? "s" : tier)} item={item} o={o} set={set} settings={settings} closeSettings={closeSettings} />
    </Suspense>
  );
}
