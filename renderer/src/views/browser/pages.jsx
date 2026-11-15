// Tarayıcı — uygulamanın kendi çizdiği sayfalar: yeni sekme, hata, sabitlenmiş sekme, okuma kipi.
import React, { useEffect, useState } from "react";
import { Icon, Kbd } from "../../components/ui";
import { displayUrl, hostOf, topSites } from "./browserState";

const initials = (s) => (String(s || "").replace(/^www\./, "")[0] || "?").toLocaleUpperCase("tr-TR");
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

function Tile({ url, title, onOpen, onOpenBg }) {
  const host = hostOf(url).replace(/^www\./, "");
  return (
    <button type="button" className="br-tile" onClick={onOpen} onAuxClick={(e) => { if (e.button === 1) onOpenBg?.(); }} title={`${title || host}\n${displayUrl(url)}`}>
      <span className="br-tile__icon" style={{ background: `hsl(${hue(host)} 62% 46%)` }}>{initials(host)}</span>
      <span className="br-tile__name">{title || host}</span>
      <small>{host}</small>
    </button>
  );
}

export function NewTabPage({ tab, st, cmd, profile, focusOmni }) {
  const [q, setQ] = useState("");
  const [sites, setSites] = useState([]);
  useEffect(() => {
    // Gizli sekmede geçmiş gösterilmez (başka profillerin geçmişi de sızmasın).
    if (profile?.private) { setSites([]); return; }
    cmd("history", { limit: 800, profileId: tab.profileId }).then((h) => Array.isArray(h) && setSites(topSites(h, 8)));
  }, [cmd, tab.profileId, profile?.private]);
  const bookmarks = (st?.bookmarks || []).slice(0, 12);
  const engine = st?.engines?.[st?.settings?.engine] || "Google";
  const keywords = st?.settings?.keywords || [];
  const submit = (e) => { e.preventDefault(); if (q.trim()) cmd("navigate", { id: tab.id, input: q }); };
  return (
    <div className={`br-ntp ${profile?.private ? "is-private" : ""}`} style={{ "--pc": profile?.color }}>
      <div className="br-ntp__inner">
        <div className="br-ntp__profile">
          <span className="br-pbadge br-pbadge--lg" style={{ background: profile?.color }}>{profile?.avatar}</span>
          <div>
            <strong>{profile?.private ? "Gizli sekme" : `${profile?.name || ""} profili`}</strong>
            <small>{profile?.private ? "Geçmiş, çerezler ve girişler bu pencere kapanınca silinir." : "Bu profilin çerezleri ve girişleri diğer profillerden ayrıdır — başka bir hesapla aynı anda kullanın."}</small>
          </div>
        </div>
        <form className="br-ntp__search" onSubmit={submit}>
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${engine} ile ara ya da adres yazın`} aria-label="Ara ya da adres yazın" spellCheck={false} />
          <Kbd>⌘L</Kbd>
        </form>
        <p className="br-ntp__kw">
          Hızlı arama: {keywords.slice(0, 6).map((k) => <button type="button" key={k.key} className="br-chip" onClick={() => { setQ(`${k.key} `); }}>{k.key} <small>{k.label}</small></button>)}
        </p>
        {sites.length > 0 && <>
          <h3>Sık ziyaret edilenler</h3>
          <div className="br-tiles">{sites.map((s) => <Tile key={s.host} url={s.url} title={s.title?.split(/\s[-|–·]\s/)[0] || s.host} onOpen={() => cmd("navigate", { id: tab.id, input: s.url })} onOpenBg={() => cmd("newTab", { url: s.url, background: true })} />)}</div>
        </>}
        {bookmarks.length > 0 && !profile?.private && <>
          <h3>Yer imleri</h3>
          <div className="br-tiles">{bookmarks.map((b) => <Tile key={b.id} url={b.url} title={b.title} onOpen={() => cmd("navigate", { id: tab.id, input: b.url })} onOpenBg={() => cmd("newTab", { url: b.url, background: true })} />)}</div>
        </>}
        <div className="br-ntp__tips">
          <span><Icon name="pin" size={13} /> <strong>Sabitle</strong>: videoyu her zaman üstte küçük pencereye alın, diğer sekmelerde gezinin <Kbd>⇧⌘S</Kbd></span>
          <span><Icon name="users" size={13} /> <strong>Profiller</strong>: her profil ayrı oturum — iki Google hesabı yan yana</span>
          <span><Icon name="image" size={13} /> <strong>Medya</strong>: sayfadaki görsel ve videoları özgün kalitede indirin</span>
          <span><Icon name="layout" size={13} /> <strong>Yan yana</strong>: iki sekmeyi birlikte görüntüleyin</span>
          <span><Icon name="shield" size={13} /> <strong>Engelleyici</strong>: reklam ve izleyiciler varsayılan olarak engellenir</span>
          <button type="button" className="br-chip" onClick={focusOmni}>Adres çubuğuna geç</button>
        </div>
      </div>
    </div>
  );
}

export function ErrorPage({ tab, cmd }) {
  const e = tab.error || {};
  const crashed = e.code === "crashed";
  const msg = crashed ? "Sayfa çöktü." : e.offline ? "İnternet bağlantısı yok ya da siteye ulaşılamıyor." : e.code === -105 ? "Site adresi bulunamadı." : e.code === -102 ? "Site bağlantıyı reddetti." : e.code === -501 || e.code === -200 || (e.code <= -200 && e.code > -300) ? "Güvenli bağlantı kurulamadı (sertifika hatası)." : "Sayfa açılamadı.";
  return (
    <div className="br-err">
      <Icon name={e.offline ? "cloudOff" : "alert"} size={34} />
      <h2>{msg}</h2>
      <p>{displayUrl(e.url || tab.url)}</p>
      <code>{e.description || e.code}</code>
      <div className="br-err__actions">
        <button type="button" className="btn btn--primary" onClick={() => cmd("reload", { id: tab.id })}>Yeniden dene</button>
        <button type="button" className="btn" onClick={() => cmd("home", { id: tab.id })}>Yeni sekme sayfası</button>
      </div>
    </div>
  );
}

export function PinnedPlaceholder({ tab, cmd }) {
  return (
    <div className="br-err br-pinned">
      <Icon name="pin" size={34} />
      <h2>Bu sekme yüzen pencerede sabitlendi</h2>
      <p>{tab.title || displayUrl(tab.url)}</p>
      <div className="br-err__actions">
        <button type="button" className="btn btn--primary" onClick={() => cmd("unpin")}>Sekmeye geri al</button>
        <button type="button" className="btn" onClick={() => cmd("pin", { id: tab.id, mode: "dock" })}>Yan panele al</button>
      </div>
    </div>
  );
}

export function ReaderView({ data, onClose }) {
  const [size, setSize] = useState(18);
  const [theme, setTheme] = useState("paper");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={`br-reader is-${theme}`} data-browser-cover role="dialog" aria-label="Okuma kipi">
      <div className="br-reader__bar">
        <Icon name="note" size={14} /><span>Okuma kipi · {data.minutes} dk</span>
        <span className="br-tabs__spacer" />
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => setSize((s) => Math.max(14, s - 1))} aria-label="Yazıyı küçült">A−</button>
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => setSize((s) => Math.min(28, s + 1))} aria-label="Yazıyı büyüt">A+</button>
        {["paper", "sepia", "night"].map((t) => <button key={t} type="button" className={`br-reader__sw is-${t} ${theme === t ? "is-on" : ""}`} onClick={() => setTheme(t)} aria-label={`Tema: ${t}`} />)}
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Okuma kipini kapat"><Icon name="x" size={14} /></button>
      </div>
      <article className="br-reader__body" style={{ fontSize: size }}>
        <small className="br-reader__site">{data.site}</small>
        <h1>{data.title}</h1>
        {data.byline && <p className="br-reader__by">{data.byline}</p>}
        {data.blocks.map((b, i) => {
          if (b.t === "h") return React.createElement(`h${Math.min(6, Math.max(2, b.level || 2))}`, { key: i }, b.text);
          if (b.t === "p") return <p key={i}>{b.text}</p>;
          if (b.t === "li") return <p key={i} className="br-reader__li">• {b.text}</p>;
          if (b.t === "quote") return <blockquote key={i}>{b.text}</blockquote>;
          if (b.t === "pre") return <pre key={i}>{b.text}</pre>;
          if (b.t === "caption") return <p key={i} className="br-reader__cap">{b.text}</p>;
          if (b.t === "img" && /^https:/.test(b.src)) return <img key={i} src={b.src} alt={b.alt || ""} loading="lazy" />;
          return null;
        })}
      </article>
    </div>
  );
}

/* Google girişi reddedildiğinde ("Bu tarayıcı veya uygulama güvenli olmayabilir") sekmenin üstünde şerit. */
const IDENTITY_LABEL = { chrome: "Chrome", firefox: "Firefox" };
export function GoogleBanner({ tab, cmd }) {
  const g = tab.google;
  if (!g) return null;
  if (g.state === "fallback") {
    return (
      <div className="br-prompt br-google" role="status">
        <Icon name="refresh" size={15} />
        <span>Google bu tarayıcıyı Chrome kimliğiyle reddetti; giriş sayfası <strong>Firefox uyumluluğuyla</strong> yeniden açılıyor (Otomatik mod).</span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => cmd("googleDismiss", { id: tab.id })}>Kapat</button>
      </div>
    );
  }
  return (
    <div className="br-prompt br-google br-google--err" role="alert" aria-label="Google girişi reddedildi">
      <Icon name="shield" size={15} />
      <span>
        <strong>Google girişi reddetti</strong>{g.popup ? " (açılır pencerede)" : ""}: “Bu tarayıcı veya uygulama güvenli olmayabilir”.
        <small> Tarayıcı şu an Google'a <strong>{IDENTITY_LABEL[g.identity] || g.identity}</strong> olarak tanıtıldı. Uyumluluk modunu <strong>{IDENTITY_LABEL[g.next] || g.next}</strong> yapıp yeniden deneyebilirsiniz. Yine olmazsa girişi sistem tarayıcınızda (Safari / Chrome) açabilirsiniz; ancak orada açılan oturum bu profile taşınmaz.</small>
      </span>
      <button type="button" className="btn btn--sm btn--primary" onClick={() => cmd("googleRetry", { id: tab.id })}>Uyumluluk modunu değiştir ve tekrar dene</button>
      <button type="button" className="btn btn--sm" onClick={() => cmd("googleExternal", { id: tab.id })}><Icon name="external" size={12} /> Sistem tarayıcısında aç</button>
      <button type="button" className="icon-btn icon-btn--xs" aria-label="Kapat" onClick={() => cmd("googleDismiss", { id: tab.id })}><Icon name="x" size={11} /></button>
    </div>
  );
}
