// Panorama kartları için ana süreç yardımcıları: hava durumu (Open-Meteo), bağlantı önizlemesi
// (Open Graph), yerel ağ engeli, sistem yazı tipleri.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPanoramaNet, parseMeta, privateHost } = require("../studio/panoramaNet");

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

test("hava durumu: şehir adı → konum → anlık + 5 gün", async () => {
  const seen = [];
  const net = createPanoramaNet({ fetchImpl: async (url) => {
    seen.push(url);
    if (url.includes("geocoding")) return json({ results: [{ name: "Ankara", latitude: 39.92, longitude: 32.85 }] });
    return json({ current: { temperature_2m: 12.5, apparent_temperature: 10, relative_humidity_2m: 60, wind_speed_10m: 8, weather_code: 3 }, daily: { time: ["2026-11-10", "2026-11-11"], weather_code: [3, 61], temperature_2m_max: [14, 11], temperature_2m_min: [4, 5] } });
  } });
  const r = await net.weather({ city: "Ankara" });
  assert.equal(r.ok, true);
  assert.equal(r.weather.place, "Ankara");
  assert.equal(r.weather.temp, 12.5);
  assert.equal(r.weather.days.length, 2);
  assert.match(seen[0], /name=Ankara/);
  assert.match(seen[1], /latitude=39.92&longitude=32.85/);
  const nf = createPanoramaNet({ fetchImpl: async () => json({ results: [] }) });
  assert.match((await nf.weather({ city: "Yokşehir" })).error, /bulunamadı/);
  assert.match((await nf.weather({})).error, /Şehir/);
});

test("bağlantı önizlemesi: Open Graph etiketleri, göreli görsel, yerel ağ engeli", async () => {
  const html = `<html><head><title>Yedek başlık</title><meta property="og:title" content="Final &amp; kupa gecesi"><meta name="description" content="Açıklama"><meta property="og:image" content="/img/kapak.jpg"><meta property="og:site_name" content="Elitlig"></head><body>…</body></html>`;
  const m = parseMeta(html, "https://elitlig.com/haber/1");
  assert.deepEqual(m, { title: "Final & kupa gecesi", text: "Açıklama", image: "https://elitlig.com/img/kapak.jpg", site: "Elitlig", author: "" });
  const net = createPanoramaNet({ fetchImpl: async (url) => ({ ok: true, url, text: async () => html }) });
  const r = await net.linkMeta("https://elitlig.com/haber/1");
  assert.equal(r.ok, true);
  assert.equal(r.title, "Final & kupa gecesi");
  assert.equal((await net.linkMeta("http://192.168.1.5/admin")).ok, false);
  assert.equal((await net.linkMeta("file:///etc/passwd")).ok, false);
  assert.equal((await net.linkMeta("http://localhost:3000")).ok, false);
  assert.equal(privateHost("10.2.3.4"), true);
  assert.equal(privateHost("elitlig.com"), false);
});

test("sistem yazı tipleri (Linux fc-list)", async () => {
  const net = createPanoramaNet({ platform: "linux", run: (_cmd, _args, _opts, cb) => cb(null, "DejaVu Sans,DejaVu Sans Condensed\nLiberation Sans\n") });
  const r = await net.fonts();
  assert.deepEqual(r.fonts, ["DejaVu Sans", "DejaVu Sans Condensed", "Liberation Sans"]);
});
