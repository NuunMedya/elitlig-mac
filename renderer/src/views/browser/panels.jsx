// Tarayıcı — yan paneller: İndirilenler, Geçmiş, Yer imleri, Medya (+ yt-dlp), Profiller, Ayarlar.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, Segmented, Spinner, useConfirm } from "../../components/ui";
import { displayUrl, filterMedia, formatBytes, formatEta, formatSpeed, groupByDay, hostOf, isWeb, mediaLabel, qualityOptions } from "./browserState";

const TITLES = { downloads: "İndirilenler", history: "Geçmiş", bookmarks: "Yer imleri", media: "Medya", profiles: "Profiller ve oturumlar", settings: "Tarayıcı ayarları" };
const ICONS = { downloads: "download", history: "clock", bookmarks: "star", media: "image", profiles: "users", settings: "sliders" };

export function Panel({ name, onClose, ...props }) {
  const Body = { downloads: DownloadsPanel, history: HistoryPanel, bookmarks: BookmarksPanel, media: MediaPanel, profiles: ProfilesPanel, settings: SettingsPanel }[name];
  return (
    <aside className={`br-panel br-panel--${name}`} aria-label={TITLES[name]}>
      <header className="br-panel__head">
        <Icon name={ICONS[name]} size={15} /><strong>{TITLES[name]}</strong>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Paneli kapat"><Icon name="x" size={14} /></button>
      </header>
      <div className="br-panel__body">{Body ? <Body {...props} /> : null}</div>
    </aside>
  );
}

/* ---------------------------------- İndirilenler ---------------------------------- */
function DownloadsPanel({ downloads, cmd, st }) {
  const list = [...downloads].reverse();
  const act = (did, action) => cmd("download", { did, action });
  return (
    <>
      <div className="br-row">
        <small className="muted" title={st?.settings?.downloadDir || ""}>Klasör: {st?.settings?.downloadDir ? st.settings.downloadDir.split(/[\\/]/).pop() : "İndirilenler › Elitlig Tarayıcı"}</small>
        <span className="br-tabs__spacer" />
        <button type="button" className="btn btn--xs" onClick={() => cmd("downloadDir")}>Değiştir</button>
        <button type="button" className="btn btn--xs" onClick={() => cmd("downloadsClear")} disabled={!list.length}>Temizle</button>
      </div>
      {!list.length && <p className="br-empty">Tarayıcıdan indirilen dosyalar burada listelenir. Görsel ve videolar için <strong>Medya</strong> panelini kullanın.</p>}
      <ul className="br-list">
        {list.map((d) => {
          const busy = d.state === "progressing" || d.state === "paused";
          const pct = d.total ? Math.round((d.received / d.total) * 100) : null;
          return (
            <li key={d.id} className={`br-dlitem is-${d.state}`} data-download={d.state}>
              <Icon name={/^image\//.test(d.mime || "") ? "image" : /^video\//.test(d.mime || "") ? "video" : /^audio\//.test(d.mime || "") ? "music" : "file"} size={16} />
              <div className="br-dlitem__main">
                <strong title={d.path || d.name}>{d.name}</strong>
                {busy && <div className="br-progress"><span style={{ width: `${pct ?? 100}%` }} className={pct == null ? "is-indeterminate" : ""} /></div>}
                <small className="muted">
                  {d.state === "completed" ? `${formatBytes(d.received)} · tamamlandı` : d.state === "cancelled" ? "İptal edildi" : d.state === "interrupted" ? "Yarıda kaldı" : d.state === "paused" ? `Duraklatıldı · ${formatBytes(d.received)}` : `${formatBytes(d.received)}${d.total ? ` / ${formatBytes(d.total)}` : ""} ${formatSpeed(d.speed)} ${formatEta(d.received, d.total, d.speed)}`}
                </small>
              </div>
              <div className="br-dlitem__tools">
                {d.state === "completed" && <button type="button" className="btn btn--xs" onClick={() => act(d.id, "open")}>Aç</button>}
                {d.state === "completed" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => act(d.id, "reveal")} aria-label="Klasörde göster" title="Klasörde göster"><Icon name="folder" size={13} /></button>}
                {d.state === "progressing" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => act(d.id, "pause")} aria-label="Duraklat"><Icon name="pause" size={12} /></button>}
                {d.state === "paused" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => act(d.id, "resume")} aria-label="Sürdür"><Icon name="play" size={12} /></button>}
                {busy && <button type="button" className="icon-btn icon-btn--xs" onClick={() => act(d.id, "cancel")} aria-label="İptal"><Icon name="x" size={12} /></button>}
                {(d.state === "interrupted" || d.state === "cancelled") && <button type="button" className="icon-btn icon-btn--xs" onClick={() => act(d.id, "retry")} aria-label="Yeniden dene" title="Yeniden dene"><Icon name="refresh" size={12} /></button>}
                {!busy && <button type="button" className="icon-btn icon-btn--xs" onClick={() => act(d.id, "forget")} aria-label="Listeden kaldır" title="Listeden kaldır"><Icon name="trash" size={12} /></button>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ------------------------------------- Geçmiş ------------------------------------- */
function HistoryPanel({ cmd, active, profileOf }) {
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const load = useCallback(() => cmd("history", { query: q, limit: 400 }).then((h) => setList(Array.isArray(h) ? h : [])), [cmd, q]);
  useEffect(() => { const t = setTimeout(load, 120); return () => clearTimeout(t); }, [load]);
  const clear = async (since, label) => {
    if (!(await confirm({ title: "Geçmişi temizle", message: `${label} geçmişi silinsin mi? (Çerezler ve girişler silinmez.)`, confirmLabel: "Temizle", danger: true }))) return;
    await cmd("historyClear", { since });
    load();
  };
  return (
    <>
      <input className="input br-panel__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Geçmişte ara" aria-label="Geçmişte ara" />
      <div className="br-row">
        <button type="button" className="btn btn--xs" onClick={() => clear(Date.now() - 3600000, "Son bir saatin")}>Son 1 saat</button>
        <button type="button" className="btn btn--xs" onClick={() => clear(Date.now() - 86400000, "Son 24 saatin")}>Son 24 saat</button>
        <button type="button" className="btn btn--xs" onClick={() => clear(0, "Tüm")}>Tümü</button>
      </div>
      {!list && <Spinner />}
      {list && !list.length && <p className="br-empty">{q ? "Eşleşen kayıt yok." : "Henüz geçmiş yok. Gizli sekmeler geçmişe yazılmaz."}</p>}
      {list && groupByDay(list).map((g) => (
        <section key={g.day} className="br-hgroup">
          <h4>{g.label}</h4>
          <ul className="br-list">
            {g.items.map((h, i) => {
              const p = profileOf(h.profileId);
              return (
                <li key={`${h.url}-${h.at}-${i}`} className="br-hitem">
                  <span className="br-hitem__time">{new Date(h.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                  {p && <span className="br-pdot" style={{ background: p.color }} title={p.name} />}
                  <button type="button" className="br-hitem__link" title={h.url} onClick={(e) => (e.metaKey || e.ctrlKey || !active ? cmd("newTab", { url: h.url, profileId: h.profileId, background: e.metaKey || e.ctrlKey }) : cmd("navigate", { id: active.id, input: h.url }))}>
                    <strong>{h.title || displayUrl(h.url)}</strong><small>{hostOf(h.url)}</small>
                  </button>
                  <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("historyRemove", { url: h.url }).then(load)} aria-label="Geçmişten sil"><Icon name="x" size={11} /></button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/* ----------------------------------- Yer imleri ----------------------------------- */
function BookmarksPanel({ st, cmd, active }) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const [drag, setDrag] = useState(null);
  const all = st?.bookmarks || [];
  const list = q ? all.filter((b) => `${b.title} ${b.url}`.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR"))) : all;
  return (
    <>
      <input className="input br-panel__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yer imlerinde ara" aria-label="Yer imlerinde ara" />
      <div className="br-row">
        <label className="br-check"><input type="checkbox" checked={st?.settings?.showBookmarks !== false} onChange={(e) => cmd("settings", { showBookmarks: e.target.checked })} /> Yer imleri çubuğunu göster</label>
        <span className="br-tabs__spacer" />
        {isWeb(active?.url) && <button type="button" className="btn btn--xs" onClick={() => cmd("bookmark")}><Icon name="star" size={12} /> {all.some((b) => b.url === active.url) ? "Bu sayfayı çıkar" : "Bu sayfayı ekle"}</button>}
      </div>
      {!list.length && <p className="br-empty">{q ? "Eşleşen yer imi yok." : "Yer imi eklemek için adres çubuğundaki yıldıza basın (⌘D)."}</p>}
      <ul className="br-list">
        {list.map((b, i) => (
          <li key={b.id} className={`br-bmitem ${drag === b.id ? "is-drag" : ""}`} draggable={!q && !edit} onDragStart={() => setDrag(b.id)} onDragEnd={() => setDrag(null)}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag && drag !== b.id) cmd("bookmarkMove", { bid: drag, index: all.findIndex((x) => x.id === b.id) }); setDrag(null); }}>
            {edit?.id === b.id ? (
              <form className="br-bmitem__edit" onSubmit={(e) => { e.preventDefault(); cmd("bookmarkUpdate", { bid: b.id, title: edit.title, url: edit.url }); setEdit(null); }}>
                <input className="input input--sm" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="Başlık" autoFocus />
                <input className="input input--sm" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} aria-label="Adres" />
                <div className="br-row"><button type="submit" className="btn btn--xs btn--primary">Kaydet</button><button type="button" className="btn btn--xs" onClick={() => setEdit(null)}>Vazgeç</button></div>
              </form>
            ) : (
              <>
                <Icon name="grip" size={12} />
                <button type="button" className="br-hitem__link" onClick={(e) => (e.metaKey || e.ctrlKey || !active ? cmd("newTab", { url: b.url, background: true }) : cmd("navigate", { id: active.id, input: b.url }))} title={b.url}>
                  <strong>{b.title || displayUrl(b.url)}</strong><small>{displayUrl(b.url)}</small>
                </button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setEdit({ id: b.id, title: b.title, url: b.url })} aria-label="Düzenle"><Icon name="pencil" size={11} /></button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("bookmarkRemove", { bid: b.id })} aria-label="Sil"><Icon name="trash" size={11} /></button>
              </>
            )}
            <span hidden>{i}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------- Medya -------------------------------------- */
function MediaPanel({ cmd, active, toast, arg }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("all");
  const [minSide, setMinSide] = useState(200);
  const [sel, setSel] = useState(() => new Set());
  const scan = useCallback(async () => {
    if (!active || !isWeb(active.url)) { setData(null); return; }
    setBusy(true);
    const r = await cmd("media", { id: active.id });
    setBusy(false);
    setData(r);
    setSel(new Set());
  }, [cmd, active?.id, active?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scan(); }, [active?.id, active?.url, arg?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => filterMedia(data?.items || [], { kind, minSide }), [data, kind, minSide]);
  const counts = useMemo(() => {
    const c = { all: 0, video: 0, image: 0, audio: 0 };
    for (const m of data?.items || []) { c.all += 1; c[m.kind] += 1; }
    return c;
  }, [data]);
  const save = (m, saveAs = false) => cmd("saveMedia", { id: active.id, url: m.url, saveAs }).then((ok) => ok && toast(`${m.name} indiriliyor…`, { tone: "info" }));
  const saveSelected = async () => {
    const list = items.filter((m) => sel.has(m.id) && m.downloadable);
    for (const m of list) await cmd("saveMedia", { id: active.id, url: m.url });
    toast(`${list.length} dosya indiriliyor…`, { tone: "info" });
  };
  const ytUrl = arg?.ytdlp || (data?.suggestYtdlp ? data.pageUrl : null);
  if (!active || !isWeb(active.url)) return <p className="br-empty">Bir web sayfası açın: sayfadaki görseller ve videolar burada listelenir.</p>;
  return (
    <>
      {ytUrl && <YtdlpBox key={ytUrl} url={ytUrl} site={data?.site} cmd={cmd} toast={toast} profileId={active.profileId} />}
      <div className="br-row">
        <Segmented size="sm" value={kind} onChange={setKind} ariaLabel="Tür" options={[
          { value: "all", label: `Tümü ${counts.all}` }, { value: "image", label: `Görsel ${counts.image}` }, { value: "video", label: `Video ${counts.video}` }, ...(counts.audio ? [{ value: "audio", label: `Ses ${counts.audio}` }] : []),
        ]} />
        <span className="br-tabs__spacer" />
        <button type="button" className="icon-btn icon-btn--sm" onClick={scan} aria-label="Yeniden tara" title="Yeniden tara"><Icon name="refresh" size={13} /></button>
      </div>
      <div className="br-row">
        <label className="br-check" title="Küçük simge ve izleme pikselleri gizlenir"><input type="checkbox" checked={minSide > 0} onChange={(e) => setMinSide(e.target.checked ? 200 : 0)} /> Küçük görselleri gizle</label>
        <span className="br-tabs__spacer" />
        {sel.size > 0 && <button type="button" className="btn btn--xs btn--primary" onClick={saveSelected}><Icon name="download" size={12} /> Seçilenleri indir ({sel.size})</button>}
        {!sel.size && items.length > 1 && <button type="button" className="btn btn--xs" onClick={() => setSel(new Set(items.filter((m) => m.downloadable).map((m) => m.id)))}>Tümünü seç</button>}
      </div>
      {busy && <Spinner label="Sayfa taranıyor…" />}
      {!busy && data && !data.ok && <p className="br-empty">{data.error || "Sayfa okunamadı."}</p>}
      {!busy && data?.ok && !items.length && <p className="br-empty">{data.streams ? "Bu sayfadaki video akış olarak oynatılıyor: yukarıdaki “Yüksek kalitede indir” ile kaydedin." : "Bu süzgeçle eşleşen medya yok."}</p>}
      <ul className="br-media">
        {items.map((m) => (
          <li key={m.id} className={`br-mitem is-${m.kind} ${sel.has(m.id) ? "is-sel" : ""}`} data-media={m.kind}>
            <label className="br-mitem__thumb">
              <input type="checkbox" checked={sel.has(m.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} aria-label={`${m.name} seç`} />
              {m.kind === "image" && /^(https:|data:)/.test(m.url) ? <img src={m.url} alt={m.alt || ""} loading="lazy" />
                : m.kind === "video" && /^https:/.test(m.poster || "") ? <img src={m.poster} alt="" loading="lazy" />
                  : <Icon name={m.kind === "video" ? "video" : m.kind === "audio" ? "music" : "image"} size={26} />}
              {m.kind !== "image" && <span className="br-mitem__kind">{m.kind === "video" ? "VİDEO" : "SES"}</span>}
            </label>
            <div className="br-mitem__info">
              <strong title={m.url}>{m.name}</strong>
              <small>{mediaLabel(m) || (m.hls ? "Akış (HLS/DASH)" : "Boyut bilinmiyor")}{m.original ? " · özgün boyut" : ""}</small>
              <div className="br-mitem__tools">
                {m.downloadable ? <>
                  <button type="button" className="btn btn--xs btn--primary" onClick={() => save(m)} data-save={m.url}><Icon name="download" size={11} /> İndir</button>
                  <button type="button" className="btn btn--xs" onClick={() => save(m, true)}>Farklı kaydet</button>
                </> : <button type="button" className="btn btn--xs btn--primary" onClick={() => cmd("ytDownload", { id: active.id, url: m.url }).then((r) => toast(r?.ok ? "İndirme Dosya Araçları kuyruğunda." : r?.error || "Başlatılamadı.", { tone: r?.ok ? "success" : "error" }))}>yt-dlp ile indir</button>}
                {m.kind === "image" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("copyImage", { id: active.id, url: m.url }).then((ok) => toast(ok ? "Görsel panoya kopyalandı." : "Kopyalanamadı.", { tone: ok ? "success" : "error" }))} aria-label="Görseli kopyala" title="Görseli kopyala"><Icon name="copy" size={12} /></button>}
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("newTab", { url: m.url, background: true })} aria-label="Yeni sekmede aç" title="Yeni sekmede aç"><Icon name="external" size={12} /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const ACTIVE_JOB = new Set(["queued", "running"]);
function YtdlpBox({ url, site, cmd, toast, profileId }) {
  const [info, setInfo] = useState(null); // { loading } | formatsFromInfo | { error }
  const [mode, setMode] = useState("video");
  const [quality, setQuality] = useState("best");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [job, setJob] = useState(null);
  useEffect(() => window.elitlig.fileTools.onJob((j) => setJob((cur) => (cur && j.id === cur.id ? j : cur))), []);
  const probe = async () => {
    setInfo({ loading: true });
    const r = await cmd("ytFormats", { url, profileId });
    setInfo(r?.ok ? r : { error: r?.error || "Biçimler okunamadı.", code: r?.code });
  };
  const start = async () => {
    const r = await cmd("ytDownload", { url, profileId, mode, quality, audioFormat });
    if (r?.ok) { setJob(r.job); toast("Yüksek kaliteli indirme başladı (Dosya Araçları kuyruğu).", { tone: "success" }); } else toast(r?.error || "Başlatılamadı.", { tone: "error", timeout: 7000 });
  };
  const opts = qualityOptions(info?.heights ? info : null);
  const pct = Math.round((job?.progress || 0) * 100);
  return (
    <div className="br-yt">
      <div className="br-yt__head">
        <Icon name="zap" size={14} />
        <strong>Yüksek kalitede indir</strong>
        <small className="muted">{site?.label || hostOf(url)} · yt-dlp</small>
      </div>
      {info?.title && <p className="br-yt__title" title={info.title}>{info.title}{info.uploader ? <small> — {info.uploader}</small> : null}{info.best ? <small> · en iyi {info.best.height}p{info.best.fps ? ` ${Math.round(info.best.fps)}fps` : ""}</small> : null}</p>}
      <div className="br-row">
        <Segmented size="sm" value={mode} onChange={setMode} ariaLabel="İndirme türü" options={[{ value: "video", label: "Video" }, { value: "audio", label: "Yalnız ses" }, { value: "images", label: "Görseller" }]} />
      </div>
      <div className="br-row">
        {mode === "video" && <select className="input input--sm" value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Kalite">{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
        {mode === "audio" && <select className="input input--sm" value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)} aria-label="Ses biçimi"><option value="mp3">MP3 (en iyi)</option><option value="m4a">M4A / AAC (özgün)</option></select>}
        {!info && <button type="button" className="btn btn--xs" onClick={probe}>Kaliteleri göster</button>}
        {info?.loading && <Spinner label="Okunuyor…" />}
        <span className="br-tabs__spacer" />
        <button type="button" className="btn btn--sm btn--primary" onClick={start} disabled={job && ACTIVE_JOB.has(job.status)}><Icon name="download" size={13} /> İndir</button>
      </div>
      {info?.error && <p className="br-yt__err">{info.error}{info.code === "NO_YTDLP" && <> <button type="button" className="linklike" onClick={() => window.elitlig.fileTools.ytdlp.update().then((r) => { toast(r?.ok ? "yt-dlp kuruldu." : r?.error?.message || "Kurulamadı.", { tone: r?.ok ? "success" : "error" }); if (r?.ok) probe(); })}>yt-dlp'yi şimdi indir</button></>}</p>}
      {job && (
        <div className="br-yt__job">
          {ACTIVE_JOB.has(job.status) && <div className="br-progress"><span style={{ width: `${job.indeterminate ? 100 : pct}%` }} className={job.indeterminate ? "is-indeterminate" : ""} /></div>}
          <small className="muted">{job.status === "done" ? `Hazır: ${(job.outputs || []).map((o) => o.name).join(", ")}` : job.status === "error" ? job.error : job.note || (job.status === "queued" ? "Sırada…" : `İndiriliyor %${pct}`)}</small>
          {job.status === "done" && job.outputs?.[0] && <button type="button" className="btn btn--xs" onClick={() => window.elitlig.fileTools.reveal(job.outputs[0].path)}>Klasörde göster</button>}
          {ACTIVE_JOB.has(job.status) && <button type="button" className="btn btn--xs" onClick={() => window.elitlig.fileTools.cancel(job.id)}>İptal</button>}
        </div>
      )}
      <p className="br-yt__hint">Bu profilin oturumu (çerezleri) kullanılır: giriş gerektiren Instagram / X gönderileri de indirilir. Video ve ses en iyi kalitede birleştirilip MP4 olarak kaydedilir.</p>
    </div>
  );
}

/* ------------------------------------ Profiller ------------------------------------ */
const COLORS = ["#7c3aed", "#2563eb", "#059669", "#e11d48", "#d97706", "#0891b2", "#c026d3", "#4b5563"];
const AVATARS = ["😀", "💼", "🏠", "⚽", "🎬", "🛒", "🎓", "🧪", "🌙", "⭐"];

function ProfilesPanel({ st, cmd, toast, active }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null); // ayrıntısı açık profil
  const [sites, setSites] = useState([]);
  const [cookieCount, setCookieCount] = useState({});
  const profiles = st?.profiles || [];
  const tabs = st?.tabs || [];
  useEffect(() => {
    for (const p of profiles) cmd("cookies", { profileId: p.id }).then((c) => Array.isArray(c) && setCookieCount((m) => ({ ...m, [p.id]: c.length })));
  }, [profiles.length, cmd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) cmd("profileSites", { profileId: open }).then((s) => setSites(Array.isArray(s) ? s : [])); }, [open, cmd, st?.profiles]);
  const create = async (e) => {
    e.preventDefault();
    const p = await cmd("profileCreate", form);
    setForm(null);
    if (p?.id) { toast(`${p.name} profili oluşturuldu.`, { tone: "success" }); cmd("newTab", { profileId: p.id }); }
  };
  const remove = async (p) => {
    if (!(await confirm({ title: `${p.name} profilini sil`, message: "Profilin sekmeleri kapanır; çerezleri, girişleri, önbelleği ve geçmişi bu bilgisayardan silinir. Geri alınamaz.", confirmLabel: "Profili sil", danger: true }))) return;
    const r = await cmd("profileDelete", { profileId: p.id });
    if (r?.ok === false) toast(r.error, { tone: "error" }); else toast(`${p.name} silindi.`, { tone: "success" });
  };
  return (
    <>
      <p className="br-help">Her profil <strong>ayrı bir oturumdur</strong>: çerezler, girişler ve site verileri birbirinden yalıtılmıştır. İki farklı Google hesabını iki profilde aynı anda açık tutabilir, sekmeleri yan yana görüntüleyebilirsiniz.</p>
      <ul className="br-profiles">
        {profiles.map((p) => {
          const count = tabs.filter((t) => t.profileId === p.id).length;
          return (
            <li key={p.id} className={`br-prof ${p.id === active?.profileId ? "is-current" : ""}`} data-profile={p.id}>
              <div className="br-prof__row">
                <span className="br-pbadge br-pbadge--md" style={{ background: p.color }}>{p.avatar}</span>
                <div className="br-prof__text">
                  {open === p.id && !p.private ? (
                    <input className="input input--sm" defaultValue={p.name} aria-label="Profil adı" onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && cmd("profileUpdate", { profileId: p.id, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                  ) : <strong>{p.name}{p.id === st?.defaultProfileId ? <small className="br-tag">varsayılan</small> : null}{p.private ? <small className="br-tag">yalnız bellekte</small> : null}</strong>}
                  <small className="muted">{count} sekme · {cookieCount[p.id] ?? "…"} çerez{p.sites ? ` · ${p.sites} site izni` : ""}</small>
                </div>
                <button type="button" className="btn btn--xs" onClick={() => cmd("newTab", { profileId: p.id })}>Yeni sekme</button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setOpen(open === p.id ? null : p.id)} aria-label="Ayrıntılar" aria-expanded={open === p.id}><Icon name={open === p.id ? "chevronUp" : "chevronDown"} size={12} /></button>
              </div>
              {open === p.id && (
                <div className="br-prof__more">
                  {!p.private && <>
                    <div className="br-swatches">{COLORS.map((c) => <button key={c} type="button" className={`br-swatch ${p.color === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => cmd("profileUpdate", { profileId: p.id, color: c })} aria-label={`Renk ${c}`} />)}</div>
                    <div className="br-swatches">{AVATARS.map((a) => <button key={a} type="button" className={`br-avatar ${p.avatar === a ? "is-on" : ""}`} onClick={() => cmd("profileUpdate", { profileId: p.id, avatar: a })}>{a}</button>)}</div>
                  </>}
                  <div className="br-row">
                    {!p.private && p.id !== st?.defaultProfileId && <button type="button" className="btn btn--xs" onClick={() => cmd("profileDefault", { profileId: p.id })}>Varsayılan yap</button>}
                    <button type="button" className="btn btn--xs" onClick={() => cmd("clearData", { profileId: p.id, what: "cache" }).then(() => toast("Önbellek temizlendi.", { tone: "success" }))}>Önbelleği temizle</button>
                    <button type="button" className="btn btn--xs" onClick={async () => { if (await confirm({ title: "Çerezleri sil", message: `${p.name} profilindeki tüm sitelerden çıkış yapılır.`, confirmLabel: "Sil", danger: true })) { await cmd("clearData", { profileId: p.id, what: "cookies" }); setCookieCount((m) => ({ ...m, [p.id]: 0 })); } }}>Çerezleri sil</button>
                    {!p.private && <button type="button" className="btn btn--xs btn--danger" onClick={() => remove(p)}>Profili sil</button>}
                  </div>
                  {sites.length > 0 && <>
                    <h4>Site izinleri</h4>
                    <ul className="br-list">{sites.map((s) => Object.entries(s.perms).map(([key, v]) => (
                      <li key={`${s.origin}-${key}`} className="br-site">
                        <span>{hostOf(s.origin)}</span><small>{{ media: "Kamera + mikrofon", camera: "Kamera", microphone: "Mikrofon", notifications: "Bildirimler", geolocation: "Konum" }[key] || key}</small>
                        <span className={`pill ${v === "allow" ? "pill--green" : "pill--red"}`}>{v === "allow" ? "İzinli" : "Engelli"}</span>
                        <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("permissionSet", { profileId: p.id, origin: s.origin, key, value: null })} aria-label="İzni sıfırla" title="Sıfırla (yeniden sorulsun)"><Icon name="x" size={11} /></button>
                      </li>
                    )))}</ul>
                  </>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {form ? (
        <form className="br-newprof" onSubmit={create}>
          <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Profil adı (ör. İş, Kulüp hesabı)" aria-label="Profil adı" />
          <div className="br-swatches">{COLORS.map((c) => <button key={c} type="button" className={`br-swatch ${form.color === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={`Renk ${c}`} />)}</div>
          <div className="br-swatches">{AVATARS.map((a) => <button key={a} type="button" className={`br-avatar ${form.avatar === a ? "is-on" : ""}`} onClick={() => setForm({ ...form, avatar: a })}>{a}</button>)}</div>
          <div className="br-row"><button type="submit" className="btn btn--sm btn--primary">Oluştur ve yeni sekme aç</button><button type="button" className="btn btn--sm" onClick={() => setForm(null)}>Vazgeç</button></div>
        </form>
      ) : <button type="button" className="btn btn--sm br-newprof__btn" onClick={() => setForm({ name: "", color: COLORS[(profiles.length) % COLORS.length], avatar: AVATARS[profiles.length % AVATARS.length] })}><Icon name="userPlus" size={13} /> Yeni profil</button>}
    </>
  );
}

/* ------------------------------------- Ayarlar ------------------------------------- */
function SettingsPanel({ st, cmd, toast }) {
  const s = st?.settings || {};
  const [kw, setKw] = useState(() => (s.keywords || []).map((k) => ({ ...k })));
  const [custom, setCustom] = useState((s.customBlock || []).join("\n"));
  const [info, setInfo] = useState(null);
  useEffect(() => { cmd("blocklistInfo").then(setInfo); }, [cmd, s.customBlock]);
  const [ident, setIdent] = useState(null);
  useEffect(() => { cmd("identityInfo").then(setIdent); }, [cmd]);
  return (
    <div className="br-settings">
      <label className="br-field"><span>Arama motoru</span>
        <select className="input input--sm" value={s.engine} onChange={(e) => cmd("settings", { engine: e.target.value })}>{Object.entries(st?.engines || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="br-field"><span>Çeviri dili</span>
        <select className="input input--sm" value={s.translateTo} onChange={(e) => cmd("settings", { translateTo: e.target.value })}>{[["tr", "Türkçe"], ["en", "İngilizce"], ["de", "Almanca"], ["fr", "Fransızca"], ["es", "İspanyolca"], ["ar", "Arapça"], ["ru", "Rusça"]].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="br-check"><input type="checkbox" checked={s.showBookmarks !== false} onChange={(e) => cmd("settings", { showBookmarks: e.target.checked })} /> Yer imleri çubuğunu göster</label>
      <label className="br-check"><input type="checkbox" checked={s.popOutOnLeave !== false} onChange={(e) => cmd("settings", { popOutOnLeave: e.target.checked })} /> Tarayıcıdan çıkınca yana sabitlenen video yüzen pencereye geçsin</label>

      <h4>Google girişi</h4>
      <label className="br-field"><span>Google girişi uyumluluk modu</span>
        <select className="input input--sm" value={s.googleCompat || "auto"} onChange={(e) => cmd("settings", { googleCompat: e.target.value }).then(() => cmd("identityInfo").then(setIdent))} aria-label="Google girişi uyumluluk modu">
          <option value="auto">Otomatik</option>
          <option value="chrome">Chrome</option>
          <option value="firefox">Firefox</option>
        </select>
      </label>
      <p className="br-help">Tarayıcı sitelere standart bir masaüstü Chrome olarak tanıtılır. <strong>Otomatik</strong>: önce Chrome; Google “güvenli olmayabilir” derse o profilde yalnız Google giriş sayfası (accounts.google.com) Firefox olarak açılır. <strong>Firefox</strong>: giriş sayfası her zaman Firefox kimliğiyle. Yalnız kimlik sunumu değişir; giriş bilgileriniz yalnız Google'a gider.{(s.googleFallback || []).length > 0 && <> Firefox'a geçilen profiller: {(s.googleFallback || []).join(", ")}.</>}</p>
      {ident && <p className="br-ident" title="Gönderilen kimlik">Chrome: {ident.chrome}<br />{ident.brands}<br />Firefox (Google girişi): {ident.firefox}</p>}

      <h4>Reklam ve izleyici engelleyici</h4>
      <label className="br-check"><input type="checkbox" checked={s.adblock !== false} onChange={(e) => cmd("settings", { adblock: e.target.checked })} /> Açık ({info ? `${info.builtIn} yerleşik + ${info.custom} sizin alan adınız` : "…"})</label>
      {(s.adblockAllow || []).length > 0 && <p className="br-help">Kapalı olduğu siteler: {(s.adblockAllow || []).map((h) => <button key={h} type="button" className="br-chip" onClick={() => cmd("settings", { adblockAllow: s.adblockAllow.filter((x) => x !== h) })} title="Bu sitede yeniden aç">{h} ×</button>)}</p>}
      <label className="br-field br-field--col"><span>Ek engellenecek alan adları (satır başına bir)</span>
        <textarea className="input" rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => cmd("settings", { customBlock: custom.split(/[\s,]+/).filter(Boolean) })} placeholder="ornek-reklam.com" />
      </label>

      <h4>Hızlı arama anahtar sözcükleri</h4>
      <p className="br-help">Adres çubuğuna “<strong>yt</strong> maç özeti” yazın: doğrudan YouTube'da arar. %s aranan metnin yeridir.</p>
      <ul className="br-list br-kw">
        {kw.map((k, i) => (
          <li key={i}>
            <input className="input input--sm" value={k.key} onChange={(e) => setKw(kw.map((x, n) => (n === i ? { ...x, key: e.target.value.trim() } : x)))} aria-label="Anahtar" />
            <input className="input input--sm" value={k.url} onChange={(e) => setKw(kw.map((x, n) => (n === i ? { ...x, url: e.target.value } : x)))} aria-label="Adres (%s)" />
            <button type="button" className="icon-btn icon-btn--xs" onClick={() => setKw(kw.filter((_, n) => n !== i))} aria-label="Sil"><Icon name="x" size={11} /></button>
          </li>
        ))}
      </ul>
      <div className="br-row">
        <button type="button" className="btn btn--xs" onClick={() => setKw([...kw, { key: "", label: "", url: "https://" }])}>Ekle</button>
        <button type="button" className="btn btn--xs btn--primary" onClick={() => cmd("settings", { keywords: kw.map((k) => ({ ...k, label: k.label || k.key })) }).then((r) => { setKw((r?.keywords || []).map((x) => ({ ...x }))); toast("Anahtar sözcükler kaydedildi.", { tone: "success" }); })}>Kaydet</button>
      </div>
    </div>
  );
}
