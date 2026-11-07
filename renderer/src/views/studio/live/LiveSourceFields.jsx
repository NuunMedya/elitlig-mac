// Yayın Stüdyosu — yeni kaynak türlerinin pencere alanları ve bağlantı paneli.
//
//   LiveFields      telefon · RTMP / SRT girişi · IP kamera / ağ akışı · web sayfası ·
//                   kayan yazı · oynatma listesi · ekran bölgesi
//   LiveConnect     kaynak eklendikten sonra: QR kod + adresler, bağlantı durumu, bit hızı,
//                   telefon bilgisi (pil, çözünürlük), uzaktan kamera değiştirme, liste denetimi
//   ConnectGuide    "Hangi cihaz nasıl bağlanır" kartları (NDI dahil)
//   SyncFields      görüntü gecikmesi (0–500 ms) ve "ses her zaman yayında"
//   HotkeyField     kısayol yakalama (F1–F12 ya da değiştiricili tuş)
//   QrCode          SVG QR (lib/studio/qr.js)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Field, Icon } from "../../../components/ui";
import { qrEncode, qrPath } from "../../../lib/studio/qr";
import { CONNECT_GUIDE, PHONE_RESOLUTIONS, normalizeRegion, phoneMediaText, streamUrlKind } from "../../../lib/studio/liveSources";
import { FONTS } from "../../../lib/studio/scenes";
import { comboLabel, comboOf, normalizeCombo } from "../../../lib/studio/hotkeys";
import "./live.css";

export function QrCode({ text, size = 180, label = "" }) {
  const qr = useMemo(() => { try { return text ? qrEncode(text, { ecl: "M" }) : null; } catch { return null; } }, [text]);
  if (!qr) return null;
  const n = qr.size + 8;
  return (
    <svg className="lv-qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label || `QR kod: ${text}`} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(qr, 4)} fill="#000" />
    </svg>
  );
}

function Copy({ text, label = "Kopyala" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn--xs" onClick={() => { try { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* yoksay */ } }} title={text}>
      <Icon name={done ? "check" : "copy"} size={11} /> {done ? "Kopyalandı" : label}
    </button>
  );
}

const fmtKbps = (k) => (k == null ? "—" : k >= 1000 ? `${(k / 1000).toFixed(1)} Mbps` : `${k} kbps`);

/** Çalışma kaydını yarım saniyede bir okur (pencere açıkken). */
function useRuntime(runtimeRef, id) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!id || !runtimeRef) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 600);
    return () => clearInterval(t);
  }, [id, runtimeRef]);
  return id && runtimeRef ? runtimeRef.current.get(id) || null : null;
}

const STATE_TEXT = { live: "Bağlı · görüntü geliyor", standby: "Bekleniyor", waiting: "Açılıyor…", error: "Hata", missing: "Ayar eksik", ended: "Durdu", file: "Dosya seçilmeli" };

/* ------------------------------ bağlantı paneli ------------------------------ */

export function LiveConnect({ source, runtimeRef, onPatch }) {
  const rt = useRuntime(runtimeRef, source?.id);
  if (!source?.id) return <p className="st-hint lv-after"><Icon name="info" size={12} /> Ekledikten sonra burada bağlantı bilgileri (QR kod, adres, anahtar) görünür.</p>;
  const st = rt?.status || "waiting";
  const badge = <span className={`lv-state is-${st}`}><i /> {STATE_TEXT[st] || st}</span>;
  if (source.kind === "phone") {
    const url = rt?.pairing?.url;
    const info = rt?.phoneInfo;
    const pres = rt?.presence;
    return (
      <div className="lv-connect">
        <div className="lv-connect__qr">
          {url ? <QrCode text={url} size={168} label="Telefonla okut" /> : <div className="lv-qr is-empty">QR hazırlanıyor…</div>}
        </div>
        <div className="lv-connect__body">
          {badge}
          <ol className="lv-steps">
            <li>Telefon bu bilgisayarla <b>aynı Wi-Fi</b>'da olsun.</li>
            <li>Telefonun kamerasıyla QR kodu okut (ya da adresi tarayıcıya yaz).</li>
            <li>“Bağlantı gizli değil” uyarısında <b>Ayrıntılar › Bu web sitesini ziyaret et</b> (Safari) / <b>Gelişmiş › Devam et</b> (Chrome): yerel sertifika, bir kez sorulur.</li>
            <li>“Kamerayı aç”a dokun; telefonu yatay tut.</li>
          </ol>
          {url && <div className="lv-url"><code>{url}</code><Copy text={url} /></div>}
          {rt?.pairing?.urls?.length > 1 && <small className="muted">Diğer ağ adresleri: {rt.pairing.urls.slice(1).join(" · ")}</small>}
          {pres?.connected && <p className="lv-meta"><Icon name="phone" size={12} /> {pres.device || "Telefon"} ({pres.remote}){info?.media ? ` · ${phoneMediaText(info.media)}` : ""}{info?.battery ? ` · pil %${info.battery.level}${info.battery.charging ? " (şarjda)" : ""}` : ""}</p>}
          {rt?.message && st !== "live" && <small className="st-src__msg">{rt.message}</small>}
          {st === "live" && rt?.peer && (
            <div className="lv-remote">
              <span>Uzaktan:</span>
              <button type="button" className="btn btn--xs" onClick={() => { const f = info?.media?.facing === "user" ? "environment" : "user"; rt.peer.config({ facing: f }); onPatch?.({ facing: f }); }}><Icon name="refresh" size={11} /> Kamerayı çevir</button>
              {PHONE_RESOLUTIONS.map((r) => <button key={r.key} type="button" className={`btn btn--xs ${source.res === r.key ? "is-on" : ""}`} onClick={() => { rt.peer.config({ res: r.key }); onPatch?.({ res: r.key }); }}>{r.key === 2160 ? "4K" : `${r.key}p`}</button>)}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (source.kind === "ingest") {
    const urls = rt?.urls || [];
    const first = urls[0];
    const f = rt?.feed;
    const srt = source.protocol === "srt";
    return (
      <div className="lv-connect">
        <div className="lv-connect__qr">{first ? <QrCode text={first.url} size={150} label="Adres QR (DJI / GoPro uygulamasında okut)" /> : <div className="lv-qr is-empty">Adres hazırlanıyor…</div>}</div>
        <div className="lv-connect__body">
          {badge}
          {first && (
            <dl className="lv-dl">
              <dt>{srt ? "SRT adresi" : "Tam adres (DJI / GoPro)"}</dt><dd><code>{first.url}</code><Copy text={first.url} /></dd>
              {!srt && <><dt>Sunucu (OBS)</dt><dd><code>{first.server}</code><Copy text={first.server} /></dd><dt>Yayın anahtarı</dt><dd><code>{first.key}</code><Copy text={first.key} /></dd></>}
              {srt && source.key && <><dt>Şifre (passphrase)</dt><dd><code>{source.key}</code><Copy text={source.key} /></dd></>}
            </dl>
          )}
          {urls.length > 1 && <small className="muted">Başka ağ arayüzünden: {urls.slice(1).map((u) => u.host).join(" · ")}</small>}
          {f && <p className="lv-meta">{f.video ? `${f.video.codec?.toUpperCase()} ${f.video.width || "?"}×${f.video.height || "?"}${f.video.fps ? ` · ${f.video.fps} fps` : ""}` : "görüntü yok"} · {fmtKbps(f.kbps)}{f.audio ? ` · ses ${f.audio.codec}` : " · ses yok"}{f.transcode ? " · H.264'e çevriliyor" : " · kopya (yeniden kodlama yok)"}</p>}
          {rt?.message && <small className={st === "error" ? "st-src__msg" : "muted"}>{rt.message}</small>}
          <p className="st-hint">Gecikme: RTMP ≈ 1–2 sn, SRT ≈ 0,5–1 sn. Bilgisayarın güvenlik duvarı ilk seferde izin isteyebilir: “İzin ver” deyin.</p>
        </div>
      </div>
    );
  }
  if (source.kind === "stream") {
    const f = rt?.feed;
    return (
      <div className="lv-connect is-row">
        {badge}
        {f && <span className="lv-meta">{f.video ? `${f.video.codec?.toUpperCase()} ${f.video.width || "?"}×${f.video.height || "?"}` : ""} · {fmtKbps(f.kbps)}{f.transcode ? " · H.264'e çevriliyor" : ""}</span>}
        {rt?.message && <small className={st === "error" ? "st-src__msg" : "muted"}>{rt.message}</small>}
      </div>
    );
  }
  if (source.kind === "web") {
    return (
      <div className="lv-connect is-row">
        {badge}
        {rt?.pageTitle && <span className="lv-meta">{rt.pageTitle}</span>}
        <button type="button" className="btn btn--xs" onClick={() => window.elitlig?.studio?.live?.web?.reload?.(source.id)}><Icon name="refresh" size={11} /> Sayfayı yenile</button>
        {rt?.message && <small className={st === "error" ? "st-src__msg" : "muted"}>{rt.message}</small>}
      </div>
    );
  }
  if (source.kind === "playlist") {
    const pl = rt?.playlist;
    return (
      <div className="lv-connect is-row">
        {badge}
        {pl && <span className="lv-meta">{pl.pos + 1} / {pl.count} · {pl.name}{pl.ended ? " · liste bitti" : ""}</span>}
        {pl?.api && <>
          <button type="button" className="btn btn--xs" onClick={pl.api.prev} title="Önceki"><Icon name="chevronLeft" size={11} /></button>
          <button type="button" className="btn btn--xs" onClick={pl.api.next} title="Sonraki"><Icon name="skip" size={11} /> Sonraki</button>
          <button type="button" className="btn btn--xs" onClick={pl.api.restart} title="Baştan"><Icon name="undo" size={11} /></button>
        </>}
      </div>
    );
  }
  return null;
}

/* ------------------------------ ayar alanları ------------------------------ */

function RegionPicker({ value, onChange, thumb }) {
  const r = normalizeRegion(value);
  const ref = useRef(null);
  const drag = useRef(null);
  const pos = (e) => { const b = ref.current.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
  return (
    <div className="lv-region" ref={ref}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = pos(e); }}
      onPointerMove={(e) => { if (!drag.current) return; const p = pos(e); const a = drag.current; onChange(normalizeRegion({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.max(0.02, Math.abs(p.x - a.x)), h: Math.max(0.02, Math.abs(p.y - a.y)) })); }}
      onPointerUp={() => { drag.current = null; }}>
      {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="lv-region__blank">Ekran</span>}
      <span className="lv-region__box" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
    </div>
  );
}

/**
 * Tür alanları. pickPlaylist(files) dosya seçimini kalıcı adrese çevirir (SourcesPanel).
 * screens: ekran listesi (bölge için).
 */
export function LiveFields({ kind, draft, set, keepName, pickPlaylist, busy, screens, liveInfo }) {
  if (kind === "phone") {
    return (
      <>
        <div className="st-note"><Icon name="info" size={14} /><span>Kablosuz: telefonun tarayıcısı kamerayı yerel ağ üzerinden yollar (uygulama gerekmez; iPhone Safari, Android Chrome). <b>Kablolu</b> ya da <b>iPhone Süreklilik Kamerası</b> için “Kamera” türünü seçin: telefon kamera listesinde görünür.</span></div>
        <div className="st-row">
          <Field label="Kamera"><select value={draft.facing || "environment"} onChange={(e) => set({ facing: e.target.value })}><option value="environment">Arka kamera</option><option value="user">Ön kamera</option></select></Field>
          <Field label="Çözünürlük"><select value={draft.res || 720} onChange={(e) => set({ res: Number(e.target.value) })}>{PHONE_RESOLUTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
          <Field label="Kare hızı"><select value={draft.fps || 30} onChange={(e) => set({ fps: Number(e.target.value) })}>{[24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></Field>
        </div>
        <p className="st-hint">Bu ayarlar telefonun ilk açılışta seçtiği değerlerdir; telefondaki sayfadan ya da buradan (bağlıyken) değiştirilebilir. Birden çok telefon için her biri ayrı kaynak.</p>
      </>
    );
  }
  if (kind === "ingest") {
    const srt = draft.protocol === "srt";
    const noSrt = liveInfo?.protocols && liveInfo.protocols.srt === false;
    return (
      <>
        <Field label="Protokol">
          <div className="st-seg">
            <button type="button" className={!srt ? "is-on" : ""} onClick={() => set({ protocol: "rtmp", port: draft.port === 9000 ? 1935 : draft.port, key: draft.key && /^[A-Za-z0-9_-]+$/.test(draft.key) ? draft.key : "elitlig" })}>RTMP (DJI, GoPro, OBS)</button>
            <button type="button" className={srt ? "is-on" : ""} disabled={noSrt} title={noSrt ? "Bu ffmpeg SRT desteklemiyor" : "Daha düşük gecikme, kayıplı ağa dayanıklı"} onClick={() => set({ protocol: "srt", port: draft.port === 1935 ? 9000 : draft.port, key: String(draft.key || "").length >= 10 ? draft.key : "" })}>SRT (düşük gecikme)</button>
          </div>
        </Field>
        <div className="st-row">
          <Field label="Port"><input type="number" min={1024} max={65535} value={draft.port || (srt ? 9000 : 1935)} onChange={(e) => set({ port: Number(e.target.value) })} /></Field>
          <Field label={srt ? "Şifre (isteğe bağlı, 10+ karakter)" : "Yayın anahtarı"} hint={srt ? "Boş: şifresiz" : "Yanlış anahtarla gelen yayın alınmaz"}>
            <input value={draft.key || ""} onChange={(e) => set({ key: e.target.value.trim() })} maxLength={srt ? 79 : 64} spellCheck={false} />
          </Field>
          {srt && <Field label={`Gecikme · ${draft.latencyMs || 200} ms`}><input type="range" min={40} max={2000} step={20} value={draft.latencyMs || 200} onChange={(e) => set({ latencyMs: Number(e.target.value) })} /></Field>}
        </div>
        <label className="toggle" title="Görüntü H.264 değilse (HEVC drone) kendiliğinden yapılır"><input type="checkbox" checked={Boolean(draft.transcode)} onChange={(e) => set({ transcode: e.target.checked })} /> Her zaman H.264'e yeniden kodla (yüksek işlemci; yalnız sorun olursa)</label>
      </>
    );
  }
  if (kind === "stream") {
    const type = streamUrlKind(draft.url);
    return (
      <>
        <Field label="Akış adresi" hint="rtsp://kullanıcı:şifre@192.168.1.64:554/Streaming/Channels/101 · https://…/canli.m3u8 · rtmp://… · srt://…:9000 · http://…/canli.flv">
          <input value={draft.url || ""} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="rtsp://…" spellCheck={false} autoComplete="off" />
        </Field>
        {draft.url && <p className={`st-hint ${type ? "" : "text-red"}`}>{type ? `Tür: ${type}` : "Adres tanınmadı (rtsp / rtmp / srt / udp / http(s) olmalı)."}</p>}
        <div className="st-row">
          {type === "RTSP" && <Field label="RTSP taşıma"><select value={draft.rtspTransport || "tcp"} onChange={(e) => set({ rtspTransport: e.target.value })}><option value="tcp">TCP (önerilen, kayıpsız)</option><option value="udp">UDP (düşük gecikme)</option></select></Field>}
          {type === "SRT" && <Field label={`Gecikme · ${draft.latencyMs || 200} ms`}><input type="range" min={40} max={2000} step={20} value={draft.latencyMs || 200} onChange={(e) => set({ latencyMs: Number(e.target.value) })} /></Field>}
        </div>
        <label className="toggle"><input type="checkbox" checked={Boolean(draft.transcode)} onChange={(e) => set({ transcode: e.target.checked })} /> Her zaman H.264'e yeniden kodla (MJPEG / HEVC kameralarda kendiliğinden)</label>
        <p className="st-hint">YouTube / Twitch gibi sitelerin izleme sayfaları desteklenmez (kullanım koşulları); doğrudan akış adresi (.m3u8 / rtsp) kullanın.</p>
      </>
    );
  }
  if (kind === "web") {
    return (
      <>
        <Field label="Sayfa adresi" hint="Skor / istatistik sayfası, sosyal medya duvarı, hava durumu, sponsor döngüsü…">
          <input value={draft.url || ""} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://" spellCheck={false} />
        </Field>
        <div className="st-row">
          <Field label="Genişlik"><input type="number" min={160} max={3840} value={draft.width || 1920} onChange={(e) => set({ width: Number(e.target.value) })} /></Field>
          <Field label="Yükseklik"><input type="number" min={90} max={2160} value={draft.height || 1080} onChange={(e) => set({ height: Number(e.target.value) })} /></Field>
          <Field label="Kare hızı"><select value={draft.fps || 30} onChange={(e) => set({ fps: Number(e.target.value) })}>{[10, 15, 24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></Field>
          <Field label={`Yakınlaştırma · %${Math.round((draft.zoom || 1) * 100)}`}><input type="range" min={0.25} max={2.5} step={0.05} value={draft.zoom || 1} onChange={(e) => set({ zoom: Number(e.target.value) })} /></Field>
        </div>
        <div className="st-row st-row--wrap">
          <button type="button" className="btn btn--xs" onClick={() => set({ width: 1920, height: 1080 })}>1920×1080</button>
          <button type="button" className="btn btn--xs" onClick={() => set({ width: 1280, height: 720 })}>1280×720</button>
          <button type="button" className="btn btn--xs" onClick={() => set({ width: 1920, height: 200 })}>Alt bant 1920×200</button>
          <label className="toggle"><input type="checkbox" checked={draft.transparent !== false} onChange={(e) => set({ transparent: e.target.checked })} /> Saydam zemin</label>
        </div>
        <Field label="Özel CSS (isteğe bağlı)" hint="Örn. body { background: transparent } .reklam { display: none }">
          <textarea rows={3} value={draft.css || ""} onChange={(e) => set({ css: e.target.value })} spellCheck={false} className="lv-code" />
        </Field>
        <p className="st-hint">Sayfa görünmez bir pencerede açılır; çerez / girişler uygulamanınkinden ayrıdır, sayfanın sesi yayına gitmez, kamera / mikrofon izni verilmez.</p>
      </>
    );
  }
  if (kind === "ticker") {
    return (
      <>
        <Field label="Yazı"><textarea rows={2} value={draft.text || ""} onChange={(e) => set({ text: e.target.value })} placeholder="Haber, sponsor, sonuçlar…" /></Field>
        <div className="st-row">
          <Field label={`Hız · ${draft.speed || 120} px/sn`}><input type="range" min={20} max={600} step={10} value={draft.speed || 120} onChange={(e) => set({ speed: Number(e.target.value) })} /></Field>
          <Field label="Yön"><select value={draft.direction || "left"} onChange={(e) => set({ direction: e.target.value })}><option value="left">Sağdan sola</option><option value="right">Soldan sağa</option></select></Field>
          <Field label="Ayraç"><input value={draft.separator ?? "  •  "} onChange={(e) => set({ separator: e.target.value })} maxLength={12} /></Field>
        </div>
        <div className="st-row st-row--wrap">
          <Field label="Yazı tipi"><select value={draft.font || "Archivo"} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
          <Field label={`Boyut · ${draft.size || 44}`}><input type="range" min={16} max={160} step={2} value={draft.size || 44} onChange={(e) => set({ size: Number(e.target.value) })} /></Field>
          <Field label="Renk"><input type="color" value={draft.color || "#ffffff"} onChange={(e) => set({ color: e.target.value })} /></Field>
          <label className="toggle st-toggle-field"><input type="checkbox" checked={draft.background !== false} onChange={(e) => set({ background: e.target.checked })} /> Zemin</label>
          {draft.background !== false && <Field label="Zemin"><input type="color" value={draft.bgColor || "#54009c"} onChange={(e) => set({ bgColor: e.target.value })} /></Field>}
        </div>
        <p className="st-hint">Sahneye ekleyince kutuyu alt banda yerleştir (ör. tam genişlik, %8 yükseklik).</p>
      </>
    );
  }
  if (kind === "playlist") {
    const items = draft.items || [];
    return (
      <>
        <Field label="Videolar" hint="Birden çok dosya seç (en çok 100); sırayı oklarla değiştir. Dosyaların yeri hatırlanır.">
          <input type="file" accept="video/*,audio/*" multiple onChange={(e) => pickPlaylist(e.target.files)} disabled={busy} />
        </Field>
        {draft.missingItems > 0 && <div className="st-note is-warn"><Icon name="alert" size={14} /><span>{draft.missingItems} dosya bulunamadı; yeniden ekleyin.</span></div>}
        {items.length > 0 && (
          <ol className="lv-plist">
            {items.map((it, i) => (
              <li key={`${i}_${it.url.slice(-16)}`}>
                <span className="lv-plist__n">{i + 1}</span><span className="lv-plist__name" title={it.filePath || it.name}>{it.name}</span>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === 0} title="Yukarı" onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ items: n }); }}><Icon name="chevronUp" size={11} /></button>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === items.length - 1} title="Aşağı" onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set({ items: n }); }}><Icon name="chevronDown" size={11} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Çıkar" onClick={() => set({ items: items.filter((_, j) => j !== i) })}><Icon name="x" size={11} /></button>
              </li>
            ))}
          </ol>
        )}
        <div className="st-row st-row--wrap">
          <label className="toggle"><input type="checkbox" checked={draft.loop !== false} onChange={(e) => set({ loop: e.target.checked })} /> Döngü (son videodan sonra başa)</label>
          <label className="toggle"><input type="checkbox" checked={Boolean(draft.shuffle)} onChange={(e) => set({ shuffle: e.target.checked })} /> Karışık sıra</label>
          <label className="toggle" title="Sahne yayına alındığında liste baştan"><input type="checkbox" checked={Boolean(draft.restartOnShow)} onChange={(e) => set({ restartOnShow: e.target.checked })} /> Yayına gelince baştan</label>
        </div>
        <p className="st-hint">Listenin sesi kendi şeridiyle Ses sekmesinde (filtreler, gecikme); kaynak programdayken yayına gider.</p>
      </>
    );
  }
  if (kind === "region") {
    const list = (screens || []).filter((sc) => sc.kind !== "window" && !String(sc.id).startsWith("window:"));
    const cur = list.find((sc) => sc.id === draft.screenId);
    return (
      <>
        {screens == null ? <p className="st-hint">Ekranlar listeleniyor…</p> : !list.length ? <p className="st-hint">Paylaşılabilir ekran bulunamadı.</p> : (
          <div className="st-screens">
            {list.map((sc) => (
              <button key={sc.id} type="button" className={`st-screen ${draft.screenId === sc.id ? "is-on" : ""}`} onClick={() => set({ screenId: sc.id, screenName: sc.name, name: keepName(`${sc.name} · bölge`) })}>
                {sc.thumbnail ? <img src={sc.thumbnail} alt="" /> : <span className="st-screen__blank" />}
                <small><Icon name="overview" size={11} /> {sc.name}</small>
              </button>
            ))}
          </div>
        )}
        {draft.screenId && (
          <Field label="Bölge" hint="Ekran görüntüsünde fareyle dikdörtgen çiz (yalnız bu bölüm yayına gider).">
            <RegionPicker value={draft.region} onChange={(region) => set({ region })} thumb={cur?.thumbnail} />
          </Field>
        )}
        {draft.screenId && (
          <div className="st-row st-row--wrap">
            {[["Sol yarı", { x: 0, y: 0, w: 0.5, h: 1 }], ["Sağ yarı", { x: 0.5, y: 0, w: 0.5, h: 1 }], ["Orta", { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }], ["Tamamı", { x: 0, y: 0, w: 1, h: 1 }]].map(([l, r]) => <button key={l} type="button" className="btn btn--xs" onClick={() => set({ region: r })}>{l}</button>)}
            <small className="muted">x %{Math.round(normalizeRegion(draft.region).x * 100)} · y %{Math.round(normalizeRegion(draft.region).y * 100)} · %{Math.round(normalizeRegion(draft.region).w * 100)} × %{Math.round(normalizeRegion(draft.region).h * 100)}</small>
          </div>
        )}
      </>
    );
  }
  return null;
}

/* ------------------------------ eşleme / kısayol ------------------------------ */

export function SyncFields({ draft, set, video = true, audio = false }) {
  return (
    <div className="lv-sync">
      {video && (
        <Field label={`Görüntü gecikmesi · ${draft.videoDelayMs || 0} ms`} hint="Ses görüntüden geç geliyorsa (ör. ayrı mikrofon) görüntüyü geciktir; tersi için Ses sekmesinde şeridin gecikmesi.">
          <input type="range" min={0} max={500} step={10} value={draft.videoDelayMs || 0} onChange={(e) => set({ videoDelayMs: Number(e.target.value) })} />
        </Field>
      )}
      {audio && <label className="toggle" title="Kapalı: ses yalnız kaynak programdaki sahnedeyken yayına gider (OBS gibi)"><input type="checkbox" checked={Boolean(draft.audioAlways)} onChange={(e) => set({ audioAlways: e.target.checked })} /> Sesi her zaman yayında (sahneden bağımsız)</label>}
    </div>
  );
}

export function HotkeyField({ value, onChange, label = "Kısayol", hint, conflict = null, platform = window.elitlig?.platform || "darwin" }) {
  const [rec, setRec] = useState(false);
  return (
    <Field label={label} hint={conflict ? `Bu tuş “${conflict}” için de atanmış.` : hint}>
      <div className="lv-hotkey">
        <button type="button" className={`btn btn--sm ${rec ? "is-rec" : ""}`}
          onClick={() => setRec(true)}
          onBlur={() => setRec(false)}
          onKeyDown={(e) => {
            if (!rec) return;
            if (e.key === "Escape") { setRec(false); e.preventDefault(); return; }
            if (e.key === "Backspace" || e.key === "Delete") { onChange(""); setRec(false); e.preventDefault(); return; }
            const c = comboOf(e);
            if (c) { e.preventDefault(); e.stopPropagation(); onChange(normalizeCombo(c)); setRec(false); }
          }}>
          {rec ? "Tuşa bas… (Esc: vazgeç, ⌫: sil)" : value ? comboLabel(value, platform) : "Atanmadı · tıkla ve tuşa bas"}
        </button>
        {value && !rec && <button type="button" className="icon-btn icon-btn--xs" title="Kısayolu kaldır" onClick={() => onChange("")}><Icon name="x" size={11} /></button>}
      </div>
    </Field>
  );
}

/* ------------------------------ nasıl bağlanır ------------------------------ */

export function ConnectGuide({ onPick }) {
  return (
    <details className="lv-guide">
      <summary><Icon name="help" size={13} /> Hangi cihaz nasıl bağlanır? (telefon, drone, GoPro, OBS, IP kamera, NDI)</summary>
      <ul>
        {CONNECT_GUIDE.map((g) => (
          <li key={g.key} className={g.key === "ndi" ? "is-off" : ""}>
            <Icon name={g.icon} size={14} />
            <span><strong>{g.title}</strong><small>{g.text}</small></span>
            {onPick && g.key !== "ndi" && <button type="button" className="btn btn--xs" onClick={() => onPick(g.key)}>Seç</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export const GUIDE_KIND = { iphone: "camera", android: "camera", dji: "ingest", gopro: "ingest", obs: "ingest", ip: "stream" };
