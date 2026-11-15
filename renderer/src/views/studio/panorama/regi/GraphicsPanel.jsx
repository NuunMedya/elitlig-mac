// Panorama rejisi · GRAFİKLER: alt yazılar (isim / bilgi / sponsor / sosyal; göster-gizle kısayolu,
// otomatik gizle, sıradaki, oynatma listesi, öğe başına biçim ve renk), tam ekran kartlar (başlık,
// geri sayım, ara, sosyal medya), kayan bant (elle yazılan öğeler kuyruğu + site içeriği), CANLI rozeti.
// Hepsi program tuvaline çizilir (drawTheme.js) — yayına ve kayda gider.
import React, { useState } from "react";
import { Icon, Kbd } from "../../../../components/ui";
import { LOWER_KINDS, TITLE_KINDS, gfxId, hideLower, hideTitle, nextLower, playLowers, toggleLower, toggleTitle } from "../../../../lib/studio/panorama/gfx";
import { LOWER_STYLES, TITLE_STYLES } from "../../../../lib/studio/panorama/themeSchema";
import { SOCIAL_PLATFORMS } from "../../../../lib/studio/panorama/drawTheme";
import { hotkeyLabel, hotkeyMap } from "../../../../lib/studio/panorama/regi";
import { useRegi } from "./RegiCtx";

const onNow = (o) => Boolean(o && !o.hideAt);

function LowerEditor({ item, onChange, onDelete, pickLogo }) {
  const set = (patch) => onChange({ ...item, ...patch });
  return (
    <div className="pr-ed" data-lower-editor={item.id}>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Tür</span><select className="input" value={item.kind} onChange={(e) => set({ kind: e.target.value })}>{LOWER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field pn-mini"><span>Üst etiket</span><input className="input" value={item.kicker} maxLength={30} placeholder="ör. KONUK" onChange={(e) => set({ kicker: e.target.value })} data-field="lt-kicker" /></label>
      </div>
      <label className="field pn-mini"><span>{item.kind === "social" ? "Hesap (@ad)" : item.kind === "sponsor" ? "Sponsor adı" : "Ad / başlık"}</span><input className="input" value={item.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} data-field="lt-title" /></label>
      <label className="field pn-mini"><span>{item.kind === "name" ? "Unvan / görev" : "Alt satır"}</span><input className="input" value={item.subtitle} maxLength={120} onChange={(e) => set({ subtitle: e.target.value })} data-field="lt-sub" /></label>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Biçim (bu öğe)</span><select className="input" value={item.style} onChange={(e) => set({ style: e.target.value })} data-field="lt-style"><option value="">Temanınki</option>{LOWER_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field pn-mini"><span>Vurgu rengi (bu öğe)</span>
          <span className="pr-colorrow"><input type="color" value={item.color || "#e11d48"} onChange={(e) => set({ color: e.target.value })} data-field="lt-color" />{item.color && <button type="button" className="btn btn--xs" onClick={() => set({ color: "" })}>Temanın</button>}</span>
        </label>
      </div>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Otomatik gizle (sn; 0 = elle)</span><input className="input" type="number" min={0} max={600} value={item.sec} onChange={(e) => set({ sec: Number(e.target.value) || 0 })} data-field="lt-sec" /></label>
        <label className="field pn-mini"><span>Kısayol (harf / F1–F12)</span><input className="input" value={item.key} maxLength={3} onChange={(e) => set({ key: e.target.value.toUpperCase() })} data-field="lt-key" /></label>
      </div>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Forma no (spor biçimi)</span><input className="input" value={item.number} maxLength={3} onChange={(e) => set({ number: e.target.value })} /></label>
        <div className="field pn-mini"><span>Logo (bu öğe)</span>
          <span className="pr-colorrow">{item.logo ? <img className="pr-minilogo" src={item.logo} alt="" /> : <small className="st-hint">temanın logosu</small>}
            <button type="button" className="btn btn--xs" onClick={async () => { const u = await pickLogo(); if (u) set({ logo: u }); }}><Icon name="image" size={11} /> Seç</button>
            {item.logo && <button type="button" className="icon-btn icon-btn--xs" onClick={() => set({ logo: "" })}><Icon name="x" size={11} /></button>}
          </span>
        </div>
      </div>
      <button type="button" className="btn btn--xs btn--danger-ghost" onClick={onDelete}><Icon name="trash" size={11} /> Sil</button>
    </div>
  );
}

function TitleEditor({ item, onChange, onDelete }) {
  const set = (patch) => onChange({ ...item, ...patch });
  return (
    <div className="pr-ed" data-title-editor={item.id}>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Tür</span><select className="input" value={item.kind} onChange={(e) => set({ kind: e.target.value })}>{TITLE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field pn-mini"><span>Biçim (bu kart)</span><select className="input" value={item.style} onChange={(e) => set({ style: e.target.value })}><option value="">Temanınki</option>{TITLE_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <label className="field pn-mini"><span>Başlık</span><input className="input" value={item.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} data-field="tc-title" /></label>
      <label className="field pn-mini"><span>Alt yazı</span><input className="input" value={item.subtitle} maxLength={140} onChange={(e) => set({ subtitle: e.target.value })} /></label>
      {item.kind === "countdown" && <label className="field pn-mini"><span>Hedef zaman</span><input className="input" type="datetime-local" value={item.target} onChange={(e) => set({ target: e.target.value })} data-field="tc-target" /></label>}
      {item.kind === "social" && (
        <div className="pr-handles">{[0, 1, 2, 3].map((i) => {
          const h = item.handles[i] || { platform: "instagram", handle: "" };
          const upd = (p) => { const hs = [...item.handles]; hs[i] = { ...h, ...p }; set({ handles: hs.filter((x) => x) }); };
          return (
            <div key={i} className="pn-row2">
              <select className="input" value={h.platform} onChange={(e) => upd({ platform: e.target.value })}>{SOCIAL_PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input className="input" value={h.handle} maxLength={40} placeholder="@hesap" onChange={(e) => upd({ handle: e.target.value })} />
            </div>
          );
        })}</div>
      )}
      <div className="pn-row2">
        <label className="field pn-mini"><span>Otomatik kapan (sn; 0 = elle)</span><input className="input" type="number" min={0} max={3600} value={item.sec} onChange={(e) => set({ sec: Number(e.target.value) || 0 })} /></label>
        <label className="field pn-mini"><span>Kısayol</span><input className="input" value={item.key} maxLength={3} onChange={(e) => set({ key: e.target.value.toUpperCase() })} /></label>
      </div>
      <label className="field pn-mini"><span>Vurgu rengi (bu kart)</span><span className="pr-colorrow"><input type="color" value={item.color || "#e11d48"} onChange={(e) => set({ color: e.target.value })} />{item.color && <button type="button" className="btn btn--xs" onClick={() => set({ color: "" })}>Temanın</button>}</span></label>
      <button type="button" className="btn btn--xs btn--danger-ghost" onClick={onDelete}><Icon name="trash" size={11} /> Sil</button>
    </div>
  );
}

export default function GraphicsPanel() {
  const R = useRegi();
  const g = R.pano.gfx;
  const [tab, setTab] = useState("alt");
  const [open, setOpen] = useState(null);
  const [newTick, setNewTick] = useState("");
  const keys = hotkeyMap(R.pano.regi.hotkeys);
  const setG = R.setGfx;
  const now = () => Date.now();
  const updLower = (it) => setG((x) => ({ ...x, lowers: x.lowers.map((l) => (l.id === it.id ? it : l)) }));
  const updTitle = (it) => setG((x) => ({ ...x, titles: x.titles.map((l) => (l.id === it.id ? it : l)) }));
  const move = (list, id, d) => { const a = [...list]; const i = a.findIndex((x) => x.id === id); const j = i + d; if (i < 0 || j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const pickLogo = async () => { const r = await window.elitlig?.studio?.media?.pick?.({ kind: "image" }); return r?.files?.[0]?.url || null; };
  return (
    <div className="pr-gfx" data-panel="grafikler">
      <nav className="pr-subtabs">
        {[["alt", "Alt yazılar", "type"], ["tam", "Tam ekran", "monitor"], ["bant", "Kayan bant", "list"], ["rozet", "Rozet / logo", "broadcast"]].map(([k, l, ic]) => (
          <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)} data-gtab={k}><Icon name={ic} size={12} /> {l}</button>
        ))}
      </nav>
      {tab === "alt" && (
        <>
          <div className="pr-bar">
            <button type="button" className={`btn btn--xs ${onNow(g.lowerOn) ? "btn--red" : ""}`} onClick={() => setG((x) => hideLower(x, now()))} disabled={!onNow(g.lowerOn)} data-act="lower-hide"><Icon name="eye" size={11} /> Gizle <Kbd>{hotkeyLabel(keys.lowerHide)}</Kbd></button>
            <button type="button" className="btn btn--xs" onClick={() => setG((x) => nextLower(x, now()))} data-act="lower-next"><Icon name="skip" size={11} /> Sıradaki <Kbd>{hotkeyLabel(keys.lowerNext)}</Kbd></button>
            <button type="button" className={`btn btn--xs ${g.auto.on ? "btn--primary" : ""}`} onClick={() => setG((x) => playLowers(x, !x.auto.on, now()))} title="Listeyi sırayla oynat (her öğe kendi süresi kadar; aralık aşağıda)" data-act="lower-play"><Icon name={g.auto.on ? "stop" : "play"} size={11} /> {g.auto.on ? "Listeyi durdur" : "Listeyi oynat"}</button>
            <label className="pr-inline">aralık <input className="input" type="number" min={0} max={120} value={g.auto.gap} onChange={(e) => setG((x) => ({ ...x, auto: { ...x.auto, gap: Number(e.target.value) || 0 } }))} /> sn</label>
            <span className="st-top__spacer" />
            <button type="button" className="btn btn--xs btn--primary" onClick={() => { const id = gfxId("lt"); setG((x) => ({ ...x, lowers: [...x.lowers, { id, kind: "name", title: "Yeni alt yazı", subtitle: "", kicker: "", number: "", logo: "", style: "", color: "", sec: 8, key: "" }] })); setOpen(id); }} data-act="lower-add"><Icon name="plus" size={11} /> Alt yazı</button>
          </div>
          <ol className="pr-list">
            {g.lowers.map((l) => {
              const live = g.lowerOn?.id === l.id && !g.lowerOn.hideAt;
              return (
                <li key={l.id} className={live ? "is-live" : ""} data-lower={l.id}>
                  <div className="pr-row">
                    <button type="button" className={`pr-go ${live ? "is-live" : ""}`} onClick={() => setG((x) => toggleLower(x, l.id, now()))} title={live ? "Gizle" : "Yayına ver"} data-act="lower-toggle">
                      <span className="pr-go__dot" />{l.kicker && <em>{l.kicker}</em>}<b>{l.title || "—"}</b><small>{l.subtitle}</small>
                    </button>
                    {l.key && <Kbd>{l.key}</Kbd>}
                    {l.sec > 0 && <small className="pr-sec" title="Otomatik gizle">{l.sec} sn</small>}
                    {l.color && <i className="pr-dot" style={{ background: l.color }} />}
                    <button type="button" className={`icon-btn ${open === l.id ? "is-on" : ""}`} onClick={() => setOpen(open === l.id ? null : l.id)} title="Düzenle"><Icon name="sliders" size={12} /></button>
                    <button type="button" className="icon-btn" onClick={() => setG((x) => ({ ...x, lowers: move(x.lowers, l.id, -1) }))} title="Yukarı"><Icon name="chevronUp" size={12} /></button>
                    <button type="button" className="icon-btn" onClick={() => setG((x) => ({ ...x, lowers: move(x.lowers, l.id, 1) }))} title="Aşağı"><Icon name="arrowDown" size={12} /></button>
                  </div>
                  {open === l.id && <LowerEditor item={l} onChange={updLower} onDelete={() => setG((x) => ({ ...x, lowers: x.lowers.filter((y) => y.id !== l.id), lowerOn: x.lowerOn?.id === l.id ? null : x.lowerOn }))} pickLogo={pickLogo} />}
                </li>
              );
            })}
          </ol>
          <p className="st-hint">Biçim ve renkler temadan; öğe başına değiştirilebilir. İçerik panelinden maç, oyuncu, takım ya da haberden tek tıkla alt yazı yapılır.</p>
        </>
      )}
      {tab === "tam" && (
        <>
          <div className="pr-bar">
            <button type="button" className="btn btn--xs" onClick={() => setG((x) => hideTitle(x, now()))} disabled={!onNow(g.titleOn)} data-act="title-hide"><Icon name="eye" size={11} /> Kapat <Kbd>{hotkeyLabel(keys.titleHide)}</Kbd></button>
            <span className="st-top__spacer" />
            <button type="button" className="btn btn--xs btn--primary" onClick={() => { const id = gfxId("tc"); setG((x) => ({ ...x, titles: [...x.titles, { id, kind: "title", title: "BAŞLIK", subtitle: "", target: "", handles: [], style: "", color: "", sec: 0, key: "" }] })); setOpen(id); }}><Icon name="plus" size={11} /> Kart</button>
          </div>
          <ol className="pr-list">
            {g.titles.map((t) => {
              const live = g.titleOn?.id === t.id && !g.titleOn.hideAt;
              return (
                <li key={t.id} className={live ? "is-live" : ""} data-title={t.id}>
                  <div className="pr-row">
                    <button type="button" className={`pr-go ${live ? "is-live" : ""}`} onClick={() => setG((x) => toggleTitle(x, t.id, now()))} data-act="title-toggle">
                      <span className="pr-go__dot" /><em>{TITLE_KINDS.find(([k]) => k === t.kind)?.[1]}</em><b>{t.title}</b><small>{t.subtitle}</small>
                    </button>
                    {t.key && <Kbd>{t.key}</Kbd>}
                    <button type="button" className={`icon-btn ${open === t.id ? "is-on" : ""}`} onClick={() => setOpen(open === t.id ? null : t.id)}><Icon name="sliders" size={12} /></button>
                  </div>
                  {open === t.id && <TitleEditor item={t} onChange={updTitle} onDelete={() => setG((x) => ({ ...x, titles: x.titles.filter((y) => y.id !== t.id), titleOn: x.titleOn?.id === t.id ? null : x.titleOn }))} />}
                </li>
              );
            })}
          </ol>
          <p className="st-hint">Tam ekran kart bütün açıların üstüne yayına çıkar (tema zemini ve yazılarıyla). Geri sayım her saniye güncellenir.</p>
        </>
      )}
      {tab === "bant" && (
        <>
          <div className="pr-bar">
            <button type="button" className={`btn btn--xs ${g.tickerOn ? "btn--primary" : ""}`} onClick={() => setG((x) => ({ ...x, tickerOn: !x.tickerOn }))} data-act="ticker-toggle"><Icon name={g.tickerOn ? "eye" : "x"} size={11} /> {g.tickerOn ? "Bant açık" : "Bant kapalı"} <Kbd>{hotkeyLabel(keys.ticker)}</Kbd></button>
            <span className="st-top__spacer" />
            <small className="st-hint">Biçim, yer ve yükseklik: Tema › Kayan bant</small>
          </div>
          <form className="pr-addrow" onSubmit={(e) => { e.preventDefault(); const t = newTick.trim(); if (!t) return; setG((x) => ({ ...x, tickerItems: [...x.tickerItems, { id: gfxId("tk"), text: t, on: true }] })); setNewTick(""); }}>
            <input className="input" value={newTick} maxLength={200} placeholder="Banda öğe yaz ve Enter (ör. SON DAKİKA: …)" onChange={(e) => setNewTick(e.target.value)} data-field="ticker-new" />
            <button type="submit" className="btn btn--xs btn--primary"><Icon name="plus" size={11} /> Ekle</button>
          </form>
          <ol className="pr-list">
            {g.tickerItems.map((t) => (
              <li key={t.id} className={t.on ? "" : "is-off"} data-ticker-item={t.id}>
                <div className="pr-row">
                  <label className="pr-tick"><input type="checkbox" checked={t.on} onChange={(e) => setG((x) => ({ ...x, tickerItems: x.tickerItems.map((y) => (y.id === t.id ? { ...y, on: e.target.checked } : y)) }))} /> <span>{t.text}</span></label>
                  <button type="button" className="icon-btn" onClick={() => setG((x) => ({ ...x, tickerItems: move(x.tickerItems, t.id, -1) }))}><Icon name="chevronUp" size={12} /></button>
                  <button type="button" className="icon-btn" onClick={() => setG((x) => ({ ...x, tickerItems: move(x.tickerItems, t.id, 1) }))}><Icon name="arrowDown" size={12} /></button>
                  <button type="button" className="icon-btn" onClick={() => setG((x) => ({ ...x, tickerItems: x.tickerItems.filter((y) => y.id !== t.id) }))}><Icon name="trash" size={12} /></button>
                </div>
              </li>
            ))}
          </ol>
          <h4 className="pr-h">Site içeriğinden</h4>
          <div className="pn-checks pn-checks--col">{[["live", "Canlı skorlar"], ["results", "Son sonuçlar"], ["fixtures", "Yaklaşan maçlar"], ["news", "Haber başlıkları"], ["custom", "Serbest metin (aşağıda)"]].map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={R.pano.ticker.sources.includes(k)} onChange={(e) => R.setPano((p) => ({ ...p, ticker: { ...p.ticker, sources: e.target.checked ? [...p.ticker.sources, k] : p.ticker.sources.filter((x) => x !== k) } }))} /> {l}</label>
          ))}</div>
          <div className="pn-row2">
            <label className="field pn-mini"><span>Bant etiketi</span><input className="input" value={R.pano.ticker.label} maxLength={24} onChange={(e) => R.setPano((p) => ({ ...p, ticker: { ...p.ticker, label: e.target.value } }))} data-field="ticker-label" /></label>
            <label className="field pn-mini"><span>Hız (px/sn)</span><input className="input" type="number" min={40} max={400} value={R.pano.ticker.speed} onChange={(e) => R.setPano((p) => ({ ...p, ticker: { ...p.ticker, speed: Number(e.target.value) || 120 } }))} /></label>
          </div>
          <label className="field pn-mini"><span>Serbest metin (her satır bir öğe)</span><textarea className="input" rows={2} value={R.pano.ticker.text} maxLength={600} onChange={(e) => R.setPano((p) => ({ ...p, ticker: { ...p.ticker, text: e.target.value } }))} /></label>
        </>
      )}
      {tab === "rozet" && (
        <div className="pr-badges">
          <button type="button" className={`pr-bigtoggle ${g.live ? "is-live" : ""}`} onClick={() => setG((x) => ({ ...x, live: !x.live }))} data-act="live-toggle">
            <span className="pr-go__dot" /> <b>{R.tokens.liveBug?.text || "CANLI"} rozeti</b> <small>{g.live ? "YAYINDA" : "kapalı"}</small> <Kbd>{hotkeyLabel(keys.live)}</Kbd>
          </button>
          <p className="st-hint">Rozetin biçimi, köşesi ve yazısı: Tema › CANLI rozeti. Temada “Göster” açıksa yayın başlayınca kendiliğinden görünür.</p>
          <label className="field pn-mini"><span>Program başlığı (künye)</span><input className="input" value={R.pano.title} maxLength={60} onChange={(e) => R.setPano((p) => ({ ...p, title: e.target.value }))} /></label>
          <label className="pn-check"><input type="checkbox" checked={R.pano.band.on} onChange={(e) => R.setPano((p) => ({ ...p, band: { on: e.target.checked } }))} /> Sponsor kutusu (sağ altta dönen logolar)</label>
        </div>
      )}
    </div>
  );
}
