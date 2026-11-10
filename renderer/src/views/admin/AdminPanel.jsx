// Yönetim — elitlig.com yönetim panelinin tamamı uygulama içinde.
//
// Panelin kendisi ana süreçteki gömülü görünümdür (app/adminPanel): bu bileşen
// yalnız araç çubuğunu (geri / ileri / yenile / adres yolu / bul / yazdır /
// indirilenler / yeni pencere) çizer, görünümün konumunu ana sürece bildirir ve
// bağlantı yokken boş durumu gösterir. Uygulamanın kendi katmanları (komut
// paleti, pencereler, açılır menüler) açılınca görünümün yerinde anlık
// görüntüsü durur; katman kapanınca görünüm geri gelir.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Empty, Icon, Spinner, keyLabel, useToast } from "../../components/ui";
import "./admin.css";
import { markPrintHandled } from "../../lib/export/exportRegistry";

const COVER_SELECTOR = ".modal-backdrop, .palette-backdrop, .menu__list, .ft-wheel-backdrop, [data-admin-cover]";

const fmtBytes = (n) => {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
};

export default function AdminPanel({ arg }) {
  const toast = useToast();
  const admin = window.elitlig.admin;
  const hostRef = useRef(null);
  const [st, setSt] = useState(null);
  const [online, setOnline] = useState(true);
  const [cover, setCover] = useState(null); // { image } | null
  const coverRef = useRef(false);
  const [address, setAddress] = useState(null); // düzenlenirken metin
  const [find, setFind] = useState(null); // { text }
  const findRef = useRef(null);
  const [downloads, setDownloads] = useState([]);
  const [dlOpen, setDlOpen] = useState(false);
  const [attachedOnce, setAttachedOnce] = useState(false);

  const offline = !online && !st?.created;
  const failed = st?.error || null;
  const showView = !offline && !failed;

  /* ------------------------- görünümün konumu ------------------------- */
  const rect = useCallback(() => {
    const el = hostRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, visible: !coverRef.current };
  }, []);

  useEffect(() => {
    window.elitlig.sync.status().then((s) => setOnline(s.online !== false));
    const off = window.elitlig.sync.onStatus((s) => setOnline(s.online !== false));
    admin.state().then(setSt);
    const offState = admin.onState(setSt);
    admin.downloads().then(setDownloads);
    const offDl = admin.onDownloads(setDownloads);
    return () => { off(); offState(); offDl(); };
  }, [admin]);

  // Bağlantı varken (ya da panel önceden açıksa) görünüm eklenir; görünümden çıkınca ayrılır.
  useLayoutEffect(() => {
    if (offline) return undefined;
    const b = rect();
    if (!b) return undefined;
    admin.attach(b).then((s) => { if (s) setSt(s); setAttachedOnce(true); });
    const update = () => { const next = rect(); if (next) admin.bounds(next); };
    const ro = new ResizeObserver(update);
    ro.observe(hostRef.current);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); admin.detach(); };
  }, [offline, rect, admin]);

  // Uygulama katmanları açılınca görünüm anlık görüntüyle yer değiştirir.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(async () => {
        const on = Boolean(document.querySelector(COVER_SELECTOR));
        if (on === coverRef.current) return;
        coverRef.current = on;
        if (on) {
          const image = await admin.cover(true);
          if (coverRef.current) setCover({ image });
        } else {
          setCover(null);
          await admin.cover(false);
          const next = rect();
          if (next) admin.bounds(next);
        }
      });
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); if (coverRef.current) { coverRef.current = false; admin.cover(false); } };
  }, [admin, rect]);

  // Kenar çubuğu / palet: belirli bir sayfaya git.
  useEffect(() => {
    const p = arg && typeof arg === "object" ? arg.path : typeof arg === "string" && arg.startsWith("/") ? arg : null;
    if (p) admin.go(p);
  }, [arg, admin]);

  // Menü komutları: ⌘R yenile, ⌘P yazdır, ⌘F bul.
  useEffect(() => window.elitlig.onCommand((cmd) => {
    if (cmd === "refresh") admin.command("reload");
    if (cmd === "print") { markPrintHandled(); admin.command("print"); }
    if (cmd === "find") { setFind((f) => f || { text: "" }); setTimeout(() => findRef.current?.focus(), 30); }
  }), [admin]);

  useEffect(() => {
    if (!find) return;
    const t = setTimeout(() => admin.command("find", { text: find.text }), 160);
    return () => clearTimeout(t);
  }, [find?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeFind = () => { setFind(null); admin.command("find", { text: "" }); admin.command("focus"); };

  const submitAddress = (e) => {
    e.preventDefault();
    let value = String(address || "").trim();
    try { const u = new URL(value); value = `${u.pathname}${u.search}${u.hash}`; } catch { /* yol */ }
    if (!value.startsWith("/")) value = `/${value}`;
    admin.go(value);
    setAddress(null);
    // Odak adres kutusunda kalmasın: kapanan katmanlar (ör. ⌘K) odağı geri verince eski yol düzenlemeye açılıyordu.
    e.currentTarget.querySelector("input")?.blur();
    admin.command("focus");
  };

  const pdf = async () => {
    const r = await admin.pdf();
    if (r?.ok) toast(`PDF kaydedildi: ${r.path.split(/[\\/]/).pop()}`, { tone: "success", action: { label: "Göster", run: () => window.elitlig.files.reveal(r.path) } });
  };

  const active = downloads.filter((d) => d.state === "progressing" || d.state === "paused");
  const progress = active.length ? active.reduce((s, d) => s + (d.total ? d.received / d.total : 0), 0) / active.length : null;
  const shownPath = address ?? (st?.path || "");

  return (
    <div className="admin-panel" data-tool="admin">
      <div className="admin-bar" role="toolbar" aria-label="Yönetim paneli araç çubuğu">
        <button type="button" className="icon-btn" onClick={() => admin.command("back")} disabled={!st?.canGoBack} aria-label="Geri" title={`Geri (${keyLabel("⌘[")})`}><Icon name="chevronLeft" size={17} /></button>
        <button type="button" className="icon-btn" onClick={() => admin.command("forward")} disabled={!st?.canGoForward} aria-label="İleri" title={`İleri (${keyLabel("⌘]")})`}><Icon name="chevronRight" size={17} /></button>
        <button type="button" className="icon-btn" onClick={() => admin.command(st?.loading ? "stop" : "reload")} aria-label={st?.loading ? "Durdur" : "Yenile"} title={st?.loading ? "Durdur" : `Yenile (${keyLabel("⌘R")})`}>
          <Icon name={st?.loading ? "x" : "refresh"} size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={() => admin.command("home")} aria-label="Panel ana sayfası" title="Panel ana sayfası"><Icon name="overview" size={15} /></button>
        <form className={`admin-addr ${st?.loading ? "is-loading" : ""}`} onSubmit={submitAddress}>
          <Icon name="lock" size={12} />
          <span className="admin-addr__host">{(st?.url && (() => { try { return new URL(st.url).host; } catch { return ""; } })()) || "elitlig.com"}</span>
          <input value={shownPath} onChange={(e) => setAddress(e.target.value)} onFocus={(e) => { setAddress(st?.path || ""); e.target.select(); }} onBlur={() => setAddress(null)}
            onKeyDown={(e) => { if (e.key === "Escape") { setAddress(null); e.currentTarget.blur(); } }} aria-label="Sayfa yolu" spellCheck={false} />
          {st?.title && address == null && <span className="admin-addr__title" title={st.title}>{st.title.replace(/\s*[|·–-]\s*Elit ?Lig.*$/i, "")}</span>}
        </form>
        {find ? (
          <div className="admin-find">
            <Icon name="search" size={13} />
            <input ref={findRef} value={find.text} placeholder="Sayfada bul" aria-label="Sayfada bul" onChange={(e) => setFind({ text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") admin.command("find", { text: find.text, next: true, forward: !e.shiftKey });
                if (e.key === "Escape") closeFind();
              }} />
            <span className="admin-find__count">{st?.find && find.text ? `${st.find.active}/${st.find.matches}` : ""}</span>
            <button type="button" className="icon-btn icon-btn--xs" onClick={closeFind} aria-label="Bulmayı kapat"><Icon name="x" size={12} /></button>
          </div>
        ) : (
          <button type="button" className="icon-btn" onClick={() => { setFind({ text: "" }); setTimeout(() => findRef.current?.focus(), 30); }} aria-label="Sayfada bul" title={`Sayfada bul (${keyLabel("⌘F")})`}><Icon name="search" size={15} /></button>
        )}
        <button type="button" className="icon-btn" onClick={() => admin.command("print")} aria-label="Yazdır" title={`Yazdır (${keyLabel("⌘P")})`}><Icon name="printer" size={15} /></button>
        <button type="button" className="icon-btn" onClick={pdf} aria-label="PDF olarak kaydet" title="PDF olarak kaydet"><Icon name="file" size={15} /></button>
        <span className="admin-dl">
          <button type="button" className={`icon-btn ${dlOpen ? "is-on" : ""}`} onClick={() => setDlOpen((v) => !v)} aria-label="İndirilenler" aria-expanded={dlOpen} title="İndirilenler">
            <Icon name="download" size={15} />
            {progress != null && <span className="admin-dl__ring" style={{ "--p": `${Math.round(progress * 100)}%` }} />}
            {!progress && downloads.length > 0 && <span className="admin-dl__dot" />}
          </button>
        </span>
        <button type="button" className="icon-btn" onClick={() => admin.command("openWindow")} aria-label="Yeni pencerede aç" title="Yeni pencerede aç"><Icon name="layers" size={15} /></button>
        <button type="button" className="icon-btn" onClick={() => admin.command("openExternal")} aria-label="Tarayıcıda aç" title="Tarayıcıda aç"><Icon name="external" size={15} /></button>
      </div>
      {dlOpen && (
        <div className="admin-dl__pop" data-admin-cover role="dialog" aria-label="İndirilenler">
          <div className="admin-dl__head"><strong>İndirilenler</strong><button type="button" className="icon-btn icon-btn--xs" onClick={() => setDlOpen(false)} aria-label="Kapat"><Icon name="x" size={12} /></button></div>
          {!downloads.length && <p className="admin-dl__empty">Panelden indirilen dosyalar (dışa aktarımlar, raporlar, görseller) burada listelenir.</p>}
          <ul>
            {[...downloads].reverse().map((d) => (
              <li key={d.id} className={`admin-dl__item is-${d.state}`}>
                <Icon name="file" size={15} />
                <span className="admin-dl__name"><strong title={d.path || d.name}>{d.name}</strong>
                  <small>{d.state === "completed" ? fmtBytes(d.received) : d.state === "cancelled" ? "İptal edildi" : d.state === "interrupted" ? "Yarıda kaldı" : `${fmtBytes(d.received)}${d.total ? ` / ${fmtBytes(d.total)}` : ""}`}</small>
                </span>
                {d.state === "completed" && <button type="button" className="btn btn--sm" onClick={() => admin.download(d.id, "open")}>Aç</button>}
                {d.state === "completed" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => admin.download(d.id, "reveal")} aria-label="Klasörde göster" title="Klasörde göster"><Icon name="folder" size={13} /></button>}
                {(d.state === "progressing" || d.state === "paused") && <button type="button" className="icon-btn icon-btn--xs" onClick={() => admin.download(d.id, "cancel")} aria-label="İptal" title="İptal"><Icon name="x" size={13} /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="admin-host" ref={hostRef} aria-busy={st?.loading || undefined}>
        {cover?.image && showView && <img className="admin-host__snap" src={cover.image} alt="" aria-hidden="true" />}
        {offline && (
          <Empty icon="cloudOff" title="Yönetim paneli için internet bağlantısı gerekir"
            text="Maç, oyuncu, takım, lig ve diğer tüm yönetim ekranları elitlig.com'dan canlı açılır. Bağlantı gelince panel kendiliğinden yüklenir. Yerel araçlar (Yapılacaklar, Ajanda, Not Defteri, Dosya Araçları…) çevrimdışı da çalışır."
            action={<button type="button" className="btn" onClick={() => window.elitlig.sync.flush().then(() => window.elitlig.sync.status().then((s) => setOnline(s.online !== false)))}>Yeniden dene</button>} />
        )}
        {!offline && failed && (
          <Empty icon={failed.offline ? "cloudOff" : "alert"} title={failed.offline ? "Yönetim paneline ulaşılamıyor" : "Sayfa açılamadı"}
            text={failed.offline ? "İnternet bağlantınızı denetleyin. Bağlantı gelince “Yeniden dene”ye basın; yerel araçlar çevrimdışı da çalışır." : `elitlig.com yanıt vermedi (${failed.description || failed.code}).`}
            action={<button type="button" className="btn btn--primary" onClick={() => admin.command("reload")}>Yeniden dene</button>} />
        )}
        {showView && !attachedOnce && <div className="admin-host__boot"><Spinner label="Yönetim paneli açılıyor…" /></div>}
      </div>
      {st?.loading && showView && <div className="admin-progress" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">{st?.loading ? "Yükleniyor" : st?.title || ""}</span>
    </div>
  );
}
