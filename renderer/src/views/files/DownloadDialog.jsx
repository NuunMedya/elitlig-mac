// "Bağlantıdan indir": YouTube (oynatma listesi dahil), Instagram (gönderi, reel,
// çoklu görsel), X / Twitter, TikTok, Facebook ve yt-dlp'nin desteklediği diğer
// siteler. İndirme ana süreçte yt-dlp ile yapılır (uygulamayla gelir); ilerleme,
// iptal ve çıktılar Dosya Araçları'nın iş listesinde / Kütüphane'de görünür.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Modal, Segmented, useToast } from "../../components/ui";
import { FIcon } from "./icons";

const ft = () => window.elitlig.fileTools;
const COOKIE_KEY = "files:dl:cookies";
const PREF_KEY = "files:dl:prefs";
const readPref = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writePref = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ } };

const SITE_RULES = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube", "YouTube"],
  [/(^|\.)instagram\.com$/, "instagram", "Instagram"],
  [/(^|\.)(x\.com|twitter\.com)$/, "x", "X (Twitter)"],
  [/(^|\.)tiktok\.com$/, "tiktok", "TikTok"],
  [/(^|\.)(facebook\.com|fb\.watch)$/, "facebook", "Facebook"],
];
export function siteOfUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  const hit = SITE_RULES.find(([re]) => re.test(host));
  return {
    key: hit ? hit[1] : "other",
    label: hit ? hit[2] : host.replace(/^www\./, ""),
    playlist: Boolean(hit && hit[1] === "youtube" && (u.searchParams.has("list") || /\/playlist$/.test(u.pathname))),
  };
}

export const isMacPlatform = () => /Mac/i.test(navigator.platform || navigator.userAgent || "");
export function cookieBrowsers(mac = isMacPlatform()) {
  return [["", "Kullanma"], ["chrome", "Chrome"], ...(mac ? [["safari", "Safari"]] : []), ["firefox", "Firefox"], ["edge", "Edge"], ["brave", "Brave"]];
}

export default function DownloadDialog({ initialUrl = "", onClose, onStart }) {
  const toast = useToast();
  const prefs = readPref(PREF_KEY, {});
  const [url, setUrl] = useState(initialUrl || "");
  const [mode, setMode] = useState(prefs.mode || "video");
  const [quality, setQuality] = useState(prefs.quality || "best");
  const [audioFormat, setAudioFormat] = useState(prefs.audioFormat || "mp3");
  const [playlist, setPlaylist] = useState(false);
  const [withImages, setWithImages] = useState(false);
  const [cookies, setCookies] = useState(() => readPref(COOKIE_KEY, ""));
  const [clip, setClip] = useState(null);
  const [tool, setTool] = useState(null); // yt-dlp durumu
  const [installing, setInstalling] = useState(null);
  const [outDir, setOutDir] = useState("");
  const [busy, setBusy] = useState(false);
  const site = useMemo(() => siteOfUrl(url), [url]);
  const valid = Boolean(site) && !/\s/.test(url.trim());

  useEffect(() => {
    ft().ytdlp.status().then((r) => r.ok && setTool(r));
    ft().settings().then((r) => r.ok && setOutDir(r.settings.outDir));
    // Panodaki bağlantı: alan boşsa doldurulur, değilse öneri olarak gösterilir.
    ft().clipboardLink().then((r) => {
      if (!r.ok || !r.url) return;
      setClip(r.url);
      setUrl((u) => (u.trim() ? u : r.url));
    });
    return ft().ytdlp.onProgress((p) => setInstalling(p.phase === "done" ? null : p));
  }, []);
  useEffect(() => { if (site?.key === "instagram" && mode === "video") setWithImages(true); }, [site?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    setInstalling({ phase: "check" });
    const r = await ft().ytdlp.update();
    setInstalling(null);
    if (r.ok) { setTool(r.status); toast(`yt-dlp ${r.version} hazır.`, { tone: "success" }); } else toast(r.error?.message || "yt-dlp indirilemedi.", { tone: "error", timeout: 8000 });
  };
  const chooseDir = async () => { const r = await ft().chooseOutDir(); if (r.ok) setOutDir(r.settings.outDir); };

  const start = async () => {
    if (!valid || busy) return;
    setBusy(true);
    writePref(COOKIE_KEY, cookies);
    writePref(PREF_KEY, { mode, quality, audioFormat });
    const res = await onStart({ op: "webDownload", options: { url: url.trim(), mode, quality, audioFormat, playlist: playlist && site?.playlist, withImages: mode === "video" && withImages, cookiesBrowser: cookies || null } });
    setBusy(false);
    if (res?.ok) onClose();
  };

  const ready = tool?.available;
  const needsLogin = site?.key === "instagram" || site?.key === "facebook";
  return (
    <Modal title="Bağlantıdan indir" onClose={onClose} width={560}
      footer={<>
        <span className="muted ft-dialog__count">{outDir ? <>Kayıt: <button type="button" className="linklike" onClick={chooseDir} title="Çıktı klasörünü değiştir">{outDir}</button></> : null}</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={start} disabled={!ready || !valid || busy}><FIcon name="download" size={14} /> {busy ? "Başlatılıyor…" : "İndir"}</button>
      </>}>
      <div className="ft-form ft-dl">
        {tool && !ready && (
          <div className="error-note ft-dl__install">
            <span>İndirme aracı (yt-dlp) bu bilgisayarda yok. Bir kez indirilir (~35 MB), sağlaması doğrulanır ve uygulamanın klasörüne kaydedilir.</span>
            <button type="button" className="btn btn--sm btn--primary" onClick={install} disabled={Boolean(installing)}>{installing ? (installing.phase === "download" && installing.fraction != null ? `İndiriliyor %${Math.round(installing.fraction * 100)}` : "Hazırlanıyor…") : "yt-dlp'yi indir"}</button>
          </div>
        )}
        <Field label="Bağlantı" hint="YouTube, Instagram (gönderi, reel, çoklu görsel), X, TikTok, Facebook ve yüzlerce site. Yalnız indirme hakkınız olan içerikler için kullanın.">
          <div className="ft-dl__url">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus spellCheck={false} onKeyDown={(e) => { if (e.key === "Enter") start(); }} aria-label="Bağlantı" />
            {site && <span className={`pill ft-dl__site ft-dl__site--${site.key}`}>{site.label}</span>}
          </div>
        </Field>
        {clip && clip !== url.trim() && (
          <button type="button" className="chip ft-dl__clip" onClick={() => setUrl(clip)} title={clip}><FIcon name="clipboard" size={12} /> Panodaki bağlantıyı kullan: {clip.length > 60 ? `${clip.slice(0, 60)}…` : clip}</button>
        )}
        <Segmented value={mode} onChange={setMode} size="sm" ariaLabel="Ne indirilsin" options={[{ value: "video", label: "Video" }, { value: "audio", label: "Yalnız ses" }, { value: "images", label: "Görseller" }]} />
        {mode === "video" && (
          <Field label="Kalite" hint="H.264 / AAC MP4 tercih edilir: Mac ve Windows'taki her oynatıcıda açılır.">
            <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Kalite">
              <option value="best">En iyi</option><option value="2160">4K'ya kadar</option><option value="1080">1080p'ye kadar</option><option value="720">720p'ye kadar</option><option value="480">480p'ye kadar</option>
            </select>
          </Field>
        )}
        {mode === "audio" && (
          <Field label="Ses biçimi">
            <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)} aria-label="Ses biçimi"><option value="mp3">MP3</option><option value="m4a">M4A (AAC)</option></select>
          </Field>
        )}
        {mode === "images" && <p className="muted ft-note">Gönderideki fotoğraflar (Instagram çoklu gönderi dahil) ya da videonun kapak görseli JPG olarak kaydedilir.</p>}
        {mode === "video" && <label className="ft-check"><input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} /> Gönderideki fotoğrafları da indir (çoklu gönderi)</label>}
        {site?.playlist && <label className="ft-check"><input type="checkbox" checked={playlist} onChange={(e) => setPlaylist(e.target.checked)} /> Oynatma listesinin tamamını indir (en çok 300 video)</label>}
        <Field label="Tarayıcı çerezleri" hint={needsLogin ? "Instagram ve Facebook içeriklerin çoğunda oturum ister: giriş yaptığınız tarayıcıyı seçin. Çerezler yalnız bu indirme için okunur, hiçbir yere gönderilmez." : "Oturum isteyen (yaş sınırlı, gizli, “bot değilim” denetimi) içerikler için giriş yaptığınız tarayıcıyı seçin."}>
          <select value={cookies} onChange={(e) => setCookies(e.target.value)} aria-label="Tarayıcı çerezleri">
            {cookieBrowsers().map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {tool?.available && <p className="muted ft-note">yt-dlp {tool.version || ""} · {{ bundled: "uygulamayla gelen", updated: "güncellenmiş", user: "seçtiğiniz", system: "sistemdeki", dev: "geliştirme" }[tool.source] || ""}. Bir site çalışmazsa Ayarlar'dan güncelleyin.</p>}
      </div>
    </Modal>
  );
}
