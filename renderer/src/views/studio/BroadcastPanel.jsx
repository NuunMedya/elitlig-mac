// Yayın Stüdyosu · Yayın sekmesi: YouTube (sunucu üzerinden, maç adıyla
// kendiliğinden), elle RTMP, prova (yayınsız kayıt) ve KODLAMA: çözünürlük,
// kare hızı ve bit hızı ayrı ayrı (bit hızı elle kbps ya da hazır seçenek).
// YouTube kanalı bu ekrandan bağlanır (sunucu OAuth); elle RTMP'de izleme linki
// maç sayfasına yazılır; maçın tamamı bilgisayara da kaydedilebilir.
// "YouTube'da canlı yayını başlat" önce YouTube ayarları penceresini açar (youtube/);
// açık yayında "YouTube ayarlarını düzenle" (başlık, açıklama, gizlilik, etiketler).
// YouTube bölümleri yayındayken açıklamaya kendiliğinden yazılır.
import React, { memo, useEffect, useState } from "react";
import { Field, Icon } from "../../components/ui";
import * as api from "./studioApi";
import YoutubeStartDialog from "./youtube/YoutubeStartDialog";
import { parseStamp } from "./youtube/chapters";
import "./youtube/youtube.css";
import { Part } from "./dock/parts";
import {
  BITRATE_MAX_KBPS, BITRATE_MIN_KBPS, BITRATE_PRESETS, FPS_CHOICES, PRIVACY_LABELS, RESOLUTION_CHOICES,
  bitrateAdvice, isRtmpUrl, joinRtmp, recommendedBitrate, streamStatusLabel, uploadNeedMbps, validateBitrate,
} from "../../lib/studio/broadcast";

function EncodingCard({ encoding, onEncoding, locked }) {
  const [text, setText] = useState(String(encoding.bitrateKbps));
  useEffect(() => setText(String(encoding.bitrateKbps)), [encoding.bitrateKbps]);
  const check = validateBitrate(text);
  const commit = () => {
    const v = validateBitrate(text);
    const value = v.value ?? encoding.bitrateKbps;
    setText(String(value));
    if (value !== encoding.bitrateKbps) onEncoding({ ...encoding, bitrateKbps: value });
  };
  const rec = recommendedBitrate(encoding.resolution, encoding.fps);
  const advice = bitrateAdvice(encoding);
  return (
    <section className="st-card">
      <header className="st-card__head"><Icon name="sliders" size={15} /><strong>Görüntü kalitesi</strong></header>
      <div className="st-row">
        <Field label="Çözünürlük">
          <div className="st-seg">
            {RESOLUTION_CHOICES.map((r) => <button key={r.key} type="button" className={encoding.resolution === r.key ? "is-on" : ""} disabled={locked} onClick={() => onEncoding({ ...encoding, resolution: r.key })}>{r.label}</button>)}
          </div>
        </Field>
        <Field label="Kare hızı">
          <div className="st-seg">
            {FPS_CHOICES.map((f) => <button key={f} type="button" className={encoding.fps === f ? "is-on" : ""} disabled={locked} onClick={() => onEncoding({ ...encoding, fps: f })}>{f} fps</button>)}
          </div>
        </Field>
      </div>
      <Field label="Bit hızı (kbps)" hint={`${BITRATE_MIN_KBPS}–${BITRATE_MAX_KBPS} kbps · bu ayar için önerilen ≈ ${rec} · gereken yükleme ≈ ${uploadNeedMbps(check.ok ? check.value : encoding.bitrateKbps)} Mbps`}>
        <div className="st-row">
          <input type="number" inputMode="numeric" min={BITRATE_MIN_KBPS} max={BITRATE_MAX_KBPS} step={100} value={text} disabled={locked}
            onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} aria-invalid={!check.ok} />
          <button type="button" className="btn btn--xs" disabled={locked || encoding.bitrateKbps === rec} onClick={() => onEncoding({ ...encoding, bitrateKbps: rec })}>Önerilen</button>
        </div>
      </Field>
      {!check.ok && <p className="st-hint text-red">{check.message}</p>}
      <div className="st-chips">
        {BITRATE_PRESETS.map((p) => (
          <button key={p.kbps} type="button" className={`st-chip ${encoding.bitrateKbps === p.kbps ? "is-on" : ""}`} disabled={locked} onClick={() => onEncoding({ ...encoding, bitrateKbps: p.kbps })} title={p.hint}>{p.label}</button>
        ))}
      </div>
      {advice && <p className="st-hint is-armed">{advice}</p>}
      {locked && <p className="st-hint">Kalite yayın sürerken değişmez; değiştirmek için görüntüyü durdurup yeniden başlat.</p>}
    </section>
  );
}

const fmtBytes = (n) => (!Number.isFinite(Number(n)) || !n ? "" : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`);

/** YouTube kanal bağlantısı (sunucu OAuth). */
function YoutubeConnect({ yt, busy, toast, ask }) {
  const c = yt.config;
  const [working, setWorking] = useState(false);
  const connect = async () => {
    setWorking(true);
    try { await yt.connect(); toast("Tarayıcıda Google hesabınla giriş yap ve kanala izin ver; bağlantı burada kendiliğinden görünür.", { tone: "info", timeout: 7000 }); } catch (e) { toast(e?.message || "YouTube bağlantısı başlatılamadı.", { tone: "error", timeout: 6000 }); } finally { setWorking(false); }
  };
  const disconnect = async () => {
    if (!(await ask({ title: "YouTube bağlantısını kes", message: "Kanal bağlantısı sunucudan kaldırılır; yeni maçlarda yayın otomatik açılmaz.", confirmLabel: "Bağlantıyı kes", danger: true }))) return;
    setWorking(true);
    try { await yt.disconnect(); toast("YouTube bağlantısı kesildi.", { tone: "success" }); } catch (e) { toast(e?.message || "Bağlantı kesilemedi.", { tone: "error" }); } finally { setWorking(false); }
  };
  if (c.configured && c.connected !== false) {
    return (
      <div className="st-yt-chan">
        {c.channel?.thumbnail ? <img src={c.channel.thumbnail} alt="" /> : <span className="st-yt-chan__ph"><Icon name="video" size={16} /></span>}
        <span><small>Bağlı kanal</small><strong>{c.channel?.title || "YouTube kanalı"}</strong></span>
        <button type="button" className="btn btn--xs btn--ghost" disabled={busy || working} onClick={disconnect} title="Kanal bağlantısını kes">Bağlantıyı kes</button>
      </div>
    );
  }
  if (c.oauthKnown && !c.oauthReady) {
    return (
      <div className="st-note is-warn st-note--block">
        <Icon name="info" size={14} />
        <span>
          <strong>YouTube bağlantısı için sunucuda bir kez kurulum gerekiyor.</strong><br />
          Google Cloud'da bir OAuth istemcisi (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET) ve yönlendirme adresi tanımlanmalı; sonra bu ekrandan “YouTube kanalını bağla” ile giriş yapılır.{" "}
          <button type="button" className="st-link" onClick={() => window.elitlig?.app?.openExternal?.("https://developers.google.com/youtube/v3/live/registering-an-application")}>Kurulum belgesi</button>
          <br />Şimdilik <strong>Elle RTMP</strong> ile YouTube Studio'daki yayın anahtarını kullanabilirsin.
        </span>
      </div>
    );
  }
  return (
    <div className="st-yt-connect">
      <p className="st-hint">Kanalını bir kez bağla: her maç için yayın <strong>maç adıyla kendiliğinden açılır</strong>, yayın anahtarı gerekmez ve canlı link maç sayfasına eklenir.{c.error ? ` (${c.error})` : ""}</p>
      {yt.connecting
        ? <div className="st-note"><span className="st-spin" /> Tarayıcıda Google girişi bekleniyor… (2 dakika) <button type="button" className="btn btn--xs" onClick={() => yt.reloadConfig()}>Denetle</button></div>
        : <button type="button" className="btn btn--red btn--block" disabled={busy || working} onClick={connect}><Icon name="video" size={13} /> YouTube kanalını bağla</button>}
    </div>
  );
}

/** Elle RTMP'de izleme linki → maç sayfası (match_video). */
function WatchLink({ matchId, match, toast }) {
  // Sunucu boş bağlantıyı "none" olarak tutar: yalnız http(s) adres gerçek bir linktir.
  const serverLink = watchLinkOf(match);
  const [url, setUrl] = useState(serverLink);
  const [saved, setSaved] = useState(serverLink);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSaved(serverLink); if (serverLink) setUrl(serverLink); }, [serverLink]);
  const valid = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i.test(url.trim());
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.setMatchVideo(matchId, url.trim());
      if (!r?.ok) throw new Error(r?.error?.message || "Kaydedilemedi.");
      setSaved(url.trim());
      toast("Maç sayfasına canlı yayın linki eklendi.", { tone: "success" });
    } catch (e) { toast(e?.message || "Link kaydedilemedi.", { tone: "error" }); } finally { setSaving(false); }
  };
  return (
    <div className="st-stack-sm">
      <Field label="İzleme linki (YouTube)" hint="Maç sayfasında canlı yayın olarak görünür.">
        <div className="st-row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" spellCheck={false} />
          <button type="button" className="btn btn--xs btn--primary" disabled={!matchId || !valid || saving || url.trim() === saved} onClick={save}>Kaydet</button>
        </div>
      </Field>
      {saved && <span className="st-okchip"><Icon name="check" size={12} /> Maç sayfasına canlı yayın linki eklendi</span>}
    </div>
  );
}

/** Tam maç yerel kaydı (yayınla birlikte). */
function LocalRecordCard({ value, onChange, engine, recordInfo, onOpenSettings }) {
  const studio = window.elitlig?.studio;
  const supported = Boolean(studio?.chooseRecordDir);
  const rec = engine.localRecord;
  const choose = async () => {
    try { const r = await studio.chooseRecordDir(); if (r?.path) onChange({ ...value, dir: r.path }); } catch { /* yoksay */ }
  };
  return (
    <section className="st-card">
      <header className="st-card__head"><Icon name="download" size={15} /><strong>Maçı bilgisayara da kaydet</strong>
        {engine.active && rec?.path && <span className="pill pill--xs pill--red">KAYITTA</span>}
      </header>
      <label className="toggle"><input type="checkbox" checked={Boolean(value.enabled)} disabled={engine.active || !supported} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} /> Yayınla birlikte tam maçı bu bilgisayara kaydet</label>
      <div className="st-row">
        <input readOnly value={value.dir || "Varsayılan klasör (Filmler / ElitLig)"} title={value.dir || ""} />
        <button type="button" className="btn btn--xs" disabled={engine.active || !supported} onClick={choose}><Icon name="folder" size={12} /> Klasör</button>
      </div>
      {recordInfo && (
        <button type="button" className="st-recq" onClick={onOpenSettings} title="Kayıt kalitesini Ayarlar › Kayıt'tan değiştir">
          <span>Kayıt kalitesi: <b>{recordInfo.label}</b></span><em>{recordInfo.estimate}</em><Icon name="sliders" size={12} />
        </button>
      )}
      {!supported && <p className="st-hint">Yerel kayıt bu uygulama sürümünde yok.</p>}
      {engine.active && rec?.path && (
        <p className="st-hint st-mono" title={rec.path}>{rec.path}{rec.sizeBytes ? ` · ${fmtBytes(rec.sizeBytes)}` : ""}</p>
      )}
      {engine.active && value.enabled && !rec?.path && <p className="st-hint">Kayıt dosyası bilgisi bekleniyor…</p>}
      {engine.active && <p className="st-hint">Ayar yayın sürerken değişmez.</p>}
    </section>
  );
}

const SYNC_TEXT = { sending: "Gönderiliyor…", sent: "YouTube'da güncel", pending: "Gönderilecek (3 dk içinde)", local: "Gönderilmedi", error: "Gönderilemedi", empty: "Henüz bölüm yok" };
const SYNC_TONE = { sending: "is-busy", sent: "is-ok", pending: "is-wait", local: "", error: "is-err", empty: "" };
const agoText = (ms) => {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.floor(s / 60)} dk önce` : new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

/** Tek bölüm satırı: zaman (düzenlenebilir, ±5 sn), ad (yeniden adlandır), sil. */
function ChapterRow({ c, ch, merged }) {
  const [stamp, setStamp] = useState(c.stamp);
  const [label, setLabel] = useState(c.label);
  useEffect(() => setStamp(c.stamp), [c.stamp]);
  useEffect(() => setLabel(c.label), [c.label]);
  const commitStamp = () => { const ms = parseStamp(stamp); if (ms == null) setStamp(c.stamp); else if (ms !== c.atMs) ch.setTime?.(c.id, ms); };
  const commitLabel = () => { const v = label.trim(); if (!v) setLabel(c.label); else if (v !== c.label) ch.rename?.(c.id, v); };
  return (
    <li className={`yt-ch__item ${merged ? "is-merged" : ""}`} title={merged ? "10 sn'den yakın: öncekiyle birleşir" : undefined}>
      <button type="button" className="icon-btn icon-btn--xs" onClick={() => ch.nudge?.(c.id, -5000)} title="5 sn geri"><Icon name="chevronLeft" size={11} /></button>
      <input className="yt-ch__stamp" value={stamp} onChange={(e) => setStamp(e.target.value)} onBlur={commitStamp} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Zaman" />
      <button type="button" className="icon-btn icon-btn--xs" onClick={() => ch.nudge?.(c.id, 5000)} title="5 sn ileri"><Icon name="chevronRight" size={11} /></button>
      <input className="yt-ch__label" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commitLabel} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} maxLength={80} aria-label="Bölüm adı" />
      <span className={`yt-ch__kind ${c.kind === "goal" ? "" : "is-mark"}`}>{c.kind === "goal" ? "GOL" : "İŞARET"}</span>
      <button type="button" className="icon-btn icon-btn--xs" onClick={() => ch.onRemove?.(c.id)} title="Sil"><Icon name="x" size={11} /></button>
    </li>
  );
}

/**
 * YouTube BÖLÜMLERİ: goller ve "Bölüm" (C) işaretleri, YouTube kaydının 0:00'ından.
 * Yayındayken her değişiklikten sonra YouTube açıklamasına kendiliğinden yazılır
 * (POST /matches/:id/chapters); elle "YouTube'a gönder" ve "Kopyala" da var.
 */
function ChaptersCard({ chapters: ch, onAir, toast, hasBroadcast }) {
  const list = ch.chapters || [];
  const sync = ch.sync || null;
  const text = ch.text || "";
  const rules = ch.rules || { ok: true, problems: [] };
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Bölüm listesi kopyalandı: YouTube video açıklamasına yapıştır.", { tone: "success" }); } catch { toast("Kopyalanamadı.", { tone: "error" }); }
  };
  const sendNow = async () => {
    const r = await sync.send();
    if (r?.ok) toast("Bölümler YouTube açıklamasına yazıldı.", { tone: "success" });
    else if (r?.error) toast(r.error, { tone: "error", timeout: 6000 });
  };
  // Birleşen (10 sn'den yakın) işaretler.
  const mergedIds = new Set();
  for (let i = 1; i < list.length; i += 1) if (list[i].atMs - list[i - 1].atMs < 10_000) mergedIds.add(list[i].id);
  if (list[0] && list[0].atMs < 10_000) mergedIds.add(list[0].id);
  const status = sync?.status || "local";
  return (
    <section className="st-card">
      <header className="st-card__head"><Icon name="flag" size={15} /><strong>YouTube bölümleri</strong><span className="st-col__count">{ch.normalized ? ch.normalized.length : list.length}</span></header>
      <p className="st-hint">Her gol <b>45 sn</b>'lik bölüm olur: GOL'e basılan andan <b>15 sn önce</b> başlar, 30 sn sonra maç devam eder (“Ev 1 - 0 Deplasman | Gol: Golcü”). <b>Bölüm</b> (C) işaret koyar. Zamanlar YouTube kaydının başından (ilk yayın başlangıcı; kopup yeniden bağlanınca sıfırlanmaz).</p>
      {sync && (
        <div className="yt-ch__state">
          <span className={`yt-ch__pill ${SYNC_TONE[status] || ""}`}>{SYNC_TEXT[status] || status}</span>
          {sync.lastAt && <span className="muted">son gönderim {agoText(sync.lastAt)}</span>}
          {sync.auto ? <span className="muted">· yayındayken 3 dk'da bir ve yayın bitince kendiliğinden</span> : <span className="muted">· {hasBroadcast ? "" : "YouTube yayını açılınca kendiliğinden"}</span>}
        </div>
      )}
      {sync?.error && status === "error" && <p className="st-hint text-red">{sync.error}</p>}
      <div className="st-row st-row--wrap">
        <button type="button" className="btn btn--sm" disabled={!onAir} onClick={() => ch.onAdd?.()}><Icon name="flag" size={12} /> Bölüm işareti</button>
        {sync && <button type="button" className="btn btn--sm btn--primary" disabled={!list.length || status === "sending"} onClick={sendNow} title="Bölümleri şimdi YouTube video açıklamasına yaz"><Icon name="upload" size={12} /> YouTube'a gönder</button>}
        <button type="button" className="btn btn--sm" disabled={!list.length} onClick={copy}><Icon name="copy" size={12} /> Kopyala</button>
        {list.length > 0 && <button type="button" className="btn btn--sm btn--ghost" onClick={ch.onClear}>Temizle</button>}
      </div>
      <p className={`yt-ch__rules ${rules.ok ? "is-ok" : ""}`}>
        YouTube kuralı: ilk bölüm <b>0:00</b>, en az <b>3</b> bölüm, her biri en az <b>10 sn</b>.{" "}
        {rules.ok ? "Liste uygun." : rules.problems.join(" ")}
      </p>
      {list.length > 0 && (
        <ul className="yt-ch__list">
          <li className="yt-ch__item is-first"><span className="yt-ch__stamp st-mono">00:00</span><span className="yt-ch__label">{ch.normalized?.[0]?.label || "Başlangıç"}</span></li>
          {list.map((c) => <ChapterRow key={c.id} c={c} ch={ch} merged={mergedIds.has(c.id)} />)}
        </ul>
      )}
      {list.length > 0 && <details><summary className="st-hint">Açıklamaya yazılacak metin</summary><pre className="st-chapters">{text}</pre></details>}
    </section>
  );
}

function BroadcastPanel({ yt, engine, busy, matchId, matchName, match, startedVia, encoding, onEncoding, onStartYoutube, onStartManual, onRehearsal, onStop, onEndYoutube, toast, ask, localRec, onLocalRec, recordInfo, onOpenSettings, chapters }) {
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [rtmpKey, setRtmpKey] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => { if (!yt.config.loading && !yt.config.configured) setManualOpen(true); }, [yt.config.loading, yt.config.configured]);
  const encodingNow = engine.active;
  const s = yt.stream;
  const watch = s?.watch_url;
  const ff = engine.info?.ffmpeg;
  const manualUrl = joinRtmp(rtmpUrl, rtmpKey);
  const openStream = s?.broadcast_id && s.active !== false;
  const connected = yt.config.configured && yt.config.connected !== false;
  const [editOpen, setEditOpen] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(watch); toast("İzleme bağlantısı kopyalandı.", { tone: "success" }); } catch { toast("Kopyalanamadı.", { tone: "error" }); }
  };

  return (
    <div className="st-bcast">
      <div className="st-stack">
        {!engine.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> Yayın motoru bu uygulama sürümünde yok. Reji kontrolleri yine çalışır.</div>}
        {engine.available && ff && !ff.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> ffmpeg bulunamadı: yayın ve tekrar için gerekli.</div>}
        <Part id="youtube" label="YouTube kartı">
        <section className="st-card">
          <header className="st-card__head"><Icon name="video" size={15} /><strong>YouTube</strong>
            {s && <span className={`pill pill--xs ${String(s.status).toLowerCase() === "live" ? "pill--red" : ""}`}>{streamStatusLabel(s.status)}</span>}
          </header>
          {yt.config.loading ? <p className="st-hint">Kanal bağlantısı denetleniyor…</p> : <YoutubeConnect yt={yt} busy={busy || encodingNow} toast={toast} ask={ask} />}
          {connected && (
            <>
              <p className="st-hint">
                <strong>“YouTube'da canlı yayını başlat”</strong> kanalda yayını <strong>maç adıyla kendiliğinden açar</strong>{matchName ? <> (“{matchName}”)</> : null} ve görüntüyü gönderir.
              </p>
              {!openStream && <p className="st-hint">Başlatınca önce <b>YouTube ayarları</b> penceresi açılır (başlık, açıklama, gizlilik, etiketler, ön ayarlar); <b>Hemen başlat</b> ya da Enter ile varsayılanlarla geç.</p>}
              {openStream && (
                <div className="st-row">
                  <span className="st-hint">Gizlilik: <b>{PRIVACY_LABELS[s.privacy || yt.privacy] || yt.privacy}</b>{s.title ? <> · “{s.title}”</> : null}</span>
                  <span className="st-top__spacer" />
                  <button type="button" className="btn btn--xs" disabled={busy || !yt.updateSettings} onClick={() => setEditOpen(true)} title="Yayın sürerken başlık, açıklama, gizlilik ve etiketleri değiştir"><Icon name="pencil" size={11} /> YouTube ayarlarını düzenle</button>
                </div>
              )}
              {!encodingNow
                ? <button type="button" className="btn btn--red btn--block" disabled={busy || !matchId || !engine.available} onClick={onStartYoutube}><Icon name="play" size={13} /> {openStream ? "Yayına devam et" : "YouTube'da canlı yayını başlat"}</button>
                : <button type="button" className="btn btn--block" disabled={busy} onClick={onStop}><Icon name="pause" size={13} /> Görüntüyü durdur</button>}
              {openStream && <button type="button" className="btn btn--danger-ghost btn--block" disabled={busy} onClick={onEndYoutube}><Icon name="stop" size={13} /> YouTube yayınını bitir</button>}
              {watch && (
                <div className="st-row">
                  <input readOnly value={watch} onFocus={(e) => e.target.select()} />
                  <button type="button" className="icon-btn" title="Kopyala" onClick={copy}><Icon name="copy" size={14} /></button>
                  <button type="button" className="icon-btn" title="Tarayıcıda aç" onClick={() => window.elitlig?.app?.openExternal?.(watch)}><Icon name="external" size={14} /></button>
                </div>
              )}
              {openStream && watchLinkOf(match) && <span className="st-okchip"><Icon name="check" size={12} /> Maç sayfasına canlı yayın linki eklendi</span>}
              {s?.sync_error?.message && <p className="st-hint text-red">{s.sync_error.message}</p>}
              {!matchId && <p className="st-hint">Önce Maç yönetimi sekmesinden maç aç.</p>}
            </>
          )}
        </section>
        </Part>
      </div>

      <div className="st-stack">
        <Part id="rtmp" label="Elle RTMP">
        <section className="st-card">
          <button type="button" className="st-card__head st-card__toggle" onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>
            <Icon name="link" size={15} /><strong>Elle RTMP (yayın anahtarıyla)</strong><Icon name={manualOpen ? "chevronUp" : "chevronDown"} size={14} />
          </button>
          {manualOpen && (
            <>
              <Field label="Sunucu adresi"><input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} placeholder="rtmp://a.rtmp.youtube.com/live2" spellCheck={false} /></Field>
              <Field label="Yayın anahtarı"><input type="password" value={rtmpKey} onChange={(e) => setRtmpKey(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" spellCheck={false} /></Field>
              <button type="button" className="btn btn--block" disabled={busy || encodingNow || !isRtmpUrl(manualUrl) || !engine.available} onClick={() => onStartManual(manualUrl)}><Icon name="play" size={13} /> Bu anahtarla yayına başla</button>
            </>
          )}
          {(startedVia === "manual" || (manualOpen && watchLinkOf(match))) && matchId && <WatchLink matchId={matchId} match={match} toast={toast} />}
        </section>
        </Part>
        <Part id="rehearsal" label="Prova">
        <section className="st-card">
          <header className="st-card__head"><Icon name="target" size={15} /><strong>Prova (yayınsız kayıt)</strong></header>
          <p className="st-hint">Görüntü hiçbir yere gönderilmez; yalnız bu bilgisayarda kaydedilir. Tekrar ve özet denemek için.</p>
          {engine.mode === "rehearsal"
            ? <button type="button" className="btn btn--block" disabled={busy} onClick={onStop}><Icon name="stop" size={13} /> Provayı bitir</button>
            : <button type="button" className="btn btn--block" disabled={busy || encodingNow || !engine.available} onClick={onRehearsal}><Icon name="play" size={13} /> Provayı başlat</button>}
        </section>
        </Part>
      </div>

      <div className="st-stack">
        <Part id="localrec" label="Maçı bilgisayara kaydet"><LocalRecordCard value={localRec} onChange={onLocalRec} engine={engine} recordInfo={recordInfo} onOpenSettings={onOpenSettings} /></Part>
        {chapters && <Part id="chapters" label="YouTube bölümleri"><ChaptersCard chapters={chapters} onAir={engine.active} toast={toast} hasBroadcast={Boolean(openStream)} /></Part>}
        <Part id="encoding" label="Görüntü kalitesi"><EncodingCard encoding={encoding} onEncoding={onEncoding} locked={encodingNow} /></Part>
        <Part id="encoder" label="Kodlayıcı bilgisi">
        <p className="st-hint">
          Kodlayıcı: {ff ? (ff.available ? `ffmpeg ${ff.version || ""} · ${encoderText(ff)}` : "ffmpeg yok") : "bilgi yok"}
        </p>
        </Part>
      </div>
      {editOpen && (
        <YoutubeStartDialog mode="edit" yt={yt} match={match} homeName={match?.first_team_name} awayName={match?.second_team_name} toast={toast} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}

export default memo(BroadcastPanel);

/** Etkin kodlayıcının adı (Mac: VideoToolbox; Windows: NVIDIA / Intel / AMD / Media Foundation; yoksa x264). */
function encoderText(ff) {
  const names = { h264_videotoolbox: "VideoToolbox (donanım)", h264_nvenc: "NVIDIA NVENC (donanım)", h264_qsv: "Intel Quick Sync (donanım)", h264_amf: "AMD AMF (donanım)", h264_mf: "Media Foundation (donanım)", libx264: "x264 (yazılım)" };
  if (ff?.encoder && names[ff.encoder]) return names[ff.encoder];
  const e = ff?.encoders || {};
  if (e.videotoolbox) return names.h264_videotoolbox;
  if (e.nvenc) return names.h264_nvenc;
  if (e.qsv) return names.h264_qsv;
  if (e.amf) return names.h264_amf;
  if (e.mf) return names.h264_mf;
  return e.libx264 ? names.libx264 : "kodlayıcı yok";
}

/** Maçın gerçek izleme linki ("none" / boş → ""). */
function watchLinkOf(match) {
  const v = String(match?.match_video || "").trim();
  return /^https?:\/\//i.test(v) ? v : "";
}
