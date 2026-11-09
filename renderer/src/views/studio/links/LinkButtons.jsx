// Yayın Stüdyosu · YAYIN BAĞLANTILARI: "YouTube yayınını aç", "YouTube Studio'da aç",
// "Maç sayfasını aç" + "Bağlantıyı kopyala" ve "QR göster" (programın köşesinde N sn).
//
//   const links = useBroadcastLinks({ stream: yt.stream, match: live.match, g, toast });
//   <LinksMenu links={links} />        üst çubuk düğmesi (açılır menü)
//   <LinksInline links={links} />      Yayın paneli satırı
//   railCtx.links = links              parçacıklar (./shortcuts/wLinks.jsx)
//
// Adresler lib/studio/links.js'te (saf, sınanır); açma window.elitlig.app.openExternal.
// Adres yoksa düğme devre dışı, ipucunda nedeni yazar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { QR_DURATIONS, broadcastLinks, qrVisible } from "../../../lib/studio/links";
import "./links.css";

const QR_KEY = "studio.linkQrSec";
const readQrSec = () => { try { const raw = localStorage.getItem(QR_KEY); const n = Number(raw); return raw != null && QR_DURATIONS.includes(n) ? n : 20; } catch { return 20; } };
const QR_LABEL = { youtube: "YOUTUBE'DA İZLE", studio: "YOUTUBE STUDIO", match: "MAÇ SAYFASI" };

export function openUrl(url) {
  if (!url) return false;
  const open = window.elitlig?.app?.openExternal;
  if (open) { Promise.resolve(open(url)).catch(() => {}); return true; }
  try { window.open(url, "_blank", "noopener"); return true; } catch { return false; }
}

export function useBroadcastLinks({ stream = null, match = null, g = null, toast = null } = {}) {
  const list = useMemo(() => broadcastLinks({ stream, match }), [stream?.broadcast_id, stream?.watch_url, match?.id, match?.city_id, match?.city]); // eslint-disable-line react-hooks/exhaustive-deps
  const [qrSec, setQrSecState] = useState(readQrSec);
  const setQrSec = useCallback((n) => { setQrSecState(n); try { localStorage.setItem(QR_KEY, String(n)); } catch { /* yoksay */ } }, []);
  const ref = useRef(null);
  ref.current = { list, g, toast, qrSec };
  const byKey = (key) => ref.current.list.find((l) => l.key === key) || null;
  const open = useCallback((key) => {
    const l = byKey(key);
    if (!l?.url) { if (l?.reason) ref.current.toast?.(l.reason, { tone: "warn" }); return false; }
    return openUrl(l.url);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = useCallback(async (key) => {
    const l = byKey(key);
    if (!l?.url) return false;
    try { await navigator.clipboard.writeText(l.url); ref.current.toast?.("Bağlantı kopyalandı.", { tone: "success", timeout: 1800 }); return true; } catch { ref.current.toast?.("Kopyalanamadı.", { tone: "error" }); return false; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Programda QR kartı (aynı bağlantı gösteriliyorsa kaldırır). */
  const qr = useCallback((key, seconds = null) => {
    const { g: gr, toast: t, qrSec: sec } = ref.current;
    const l = byKey(key);
    if (!l?.url || !gr?.showQr) { if (!gr?.showQr) t?.("QR kartı için yayın grafikleri gerekli.", { tone: "warn" }); return false; }
    if (gr.qr && gr.qr.text === l.url && qrVisible(gr.qr)) { gr.hideQr(); return true; }
    const s = seconds ?? sec;
    gr.showQr(l.url, { label: QR_LABEL[key] || l.label, seconds: s });
    t?.(s ? `QR kodu programda ${s} sn gösteriliyor.` : "QR kodu programda (kaldırana kadar).", { tone: "success", timeout: 2000 });
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hideQr = useCallback(() => ref.current.g?.hideQr?.(), []);
  const qrOn = g?.qr && qrVisible(g.qr) ? list.find((l) => l.url === g.qr.text)?.key || "other" : null;
  return { list, open, copy, qr, hideQr, qrOn, qrSec, setQrSec, canQr: Boolean(g?.showQr) };
}

const shortUrl = (url) => String(url || "").replace(/^https?:\/\/(www\.)?/, "");

/** Bağlantı satırları (menü ve Yayın paneli ortak). */
export function LinkRows({ links, keys = null, onDone = null }) {
  const rows = links.list.filter((l) => !keys || keys.includes(l.key));
  return (
    <>
      {rows.map((l) => (
        <div key={l.key} className="lnk-row" data-link={l.key}>
          <button type="button" className="lnk-row__main" disabled={!l.url} title={l.url ? `${l.label}: ${l.url}` : l.reason} onClick={() => { links.open(l.key); onDone?.(); }}>
            <Icon name={l.icon} size={15} />
            <span>{l.label}<small>{l.url ? shortUrl(l.url) : l.reason}</small></span>
          </button>
          <button type="button" className="icon-btn icon-btn--xs" disabled={!l.url} onClick={() => links.copy(l.key)} title={l.url ? "Bağlantıyı kopyala" : l.reason} aria-label={`${l.label}: bağlantıyı kopyala`}><Icon name="copy" size={13} /></button>
          {l.key !== "studio" && (
            <button type="button" className={`icon-btn icon-btn--xs ${links.qrOn === l.key ? "is-on" : ""}`} disabled={!l.url || !links.canQr} onClick={() => links.qr(l.key)}
              title={!l.url ? l.reason : !links.canQr ? "QR için yayın grafikleri gerekli" : links.qrOn === l.key ? "QR kartını kaldır" : `QR göster (programda ${links.qrSec ? `${links.qrSec} sn` : "kaldırana kadar"})`} aria-label={`${l.label}: QR göster`} aria-pressed={links.qrOn === l.key}>
              <Icon name="grid" size={13} />
            </button>
          )}
        </div>
      ))}
    </>
  );
}

export function QrDuration({ links }) {
  return (
    <div className="lnk-qr">
      <Icon name="grid" size={12} />
      <span>QR programda</span>
      <select value={links.qrSec} onChange={(e) => links.setQrSec(Number(e.target.value))} aria-label="QR gösterim süresi">
        {QR_DURATIONS.map((n) => <option key={n} value={n}>{n ? `${n} sn` : "kaldırana kadar"}</option>)}
      </select>
      {links.qrOn && <button type="button" className="btn btn--xs is-on" onClick={links.hideQr}><Icon name="x" size={11} /> QR'ı kaldır</button>}
    </div>
  );
}

/** Üst çubuk: "Bağlantılar" düğmesi + açılır menü. */
export function LinksMenu({ links }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const any = links.list.some((l) => l.url);
  return (
    <span className="lnk-menu" ref={ref}>
      <button type="button" className={`icon-btn st-links ${open ? "is-on" : ""} ${links.qrOn ? "is-qr" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}
        title={any ? "Bağlantılar: YouTube yayını, YouTube Studio, maç sayfası · kopyala · QR" : "Bağlantılar (maç seç / YouTube yayınını aç)"}>
        <Icon name="link" size={16} />
      </button>
      {open && (
        <div className="lnk-pop" role="menu">
          <LinkRows links={links} onDone={() => setOpen(false)} />
          <QrDuration links={links} />
        </div>
      )}
    </span>
  );
}

/** Yayın paneli: YouTube kartının altında satır satır. */
export function LinksInline({ links }) {
  return (
    <div className="lnk-inlinebox">
      <LinkRows links={links} />
      <QrDuration links={links} />
    </div>
  );
}
