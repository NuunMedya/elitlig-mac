// Maç yönetimi · Altyazı kaplaması (/altyazi/:matchId) — web BroadcastDesk
// SubtitleDesk'in masaüstü karşılığı. Her değişiklik PUT broadcast-state
// { subtitle: {...} } ile anında kaplamaya düşer (kaplama ~4 sn'de bir okur).
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import {
  AI_TONES, MAX_AI_HEADLINES, MAX_CUSTOM_HEADLINES, ROTATE_MINUTE_STEPS, SECOND_STEPS, SUBTITLE_SECTIONS, SUBTITLE_SPEEDS,
  addHeadlinePatch, aiHeadlinesPatch, editAt, moveItem, removeAt, sponsorHas,
} from "../../../lib/studio/manageBroadcast";
import { friendlyError } from "../../../lib/studio/manage";
import * as api from "./manageApi";

function HeadlineList({ list, onChange, onPromote, disabled }) {
  return (
    <ol className="mg-hl">
      {list.map((item, index) => (
        <li key={`${index}-${item.text}`}>
          {item.tag ? <span className="mg-hl__tag">{item.tag}</span> : null}
          <input defaultValue={item.text} maxLength={160} aria-label="Manşet metni" disabled={disabled}
            onBlur={(e) => { const text = e.target.value.trim(); if (text && text !== item.text) onChange(editAt(list, index, { text })); }} />
          {onPromote && <button type="button" className="icon-btn icon-btn--xs" title="Girilen manşetlere taşı (kalıcı)" onClick={() => onPromote(index)} disabled={disabled}><Icon name="pin" size={12} /></button>}
          <button type="button" className="icon-btn icon-btn--xs" title="Yukarı" onClick={() => onChange(moveItem(list, index, -1))} disabled={disabled || index === 0}><Icon name="chevronUp" size={12} /></button>
          <button type="button" className="icon-btn icon-btn--xs" title="Aşağı" onClick={() => onChange(moveItem(list, index, 1))} disabled={disabled || index === list.length - 1}><Icon name="chevronDown" size={12} /></button>
          <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => onChange(removeAt(list, index))} disabled={disabled}><Icon name="x" size={12} /></button>
        </li>
      ))}
    </ol>
  );
}

export default function SubtitleDesk({ desk, matchId, toast }) {
  const subtitle = desk.state.subtitle;
  const sponsors = desk.sponsors.filter((s) => sponsorHas(s, "subtitle"));
  const [message, setMessage] = useState(subtitle.message || "");
  const [draft, setDraft] = useState({ tag: "", text: "" });
  const [tone, setTone] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => { setMessage(subtitle.message || ""); }, [subtitle.message]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const patch = (next, note) => desk.save({ subtitle: next }, note);
  const sponsorId = subtitle.sponsorId || "";
  const selected = sponsors.find((s) => Number(s.id) === Number(sponsorId)) || null;
  const sponsorMode = subtitle.mode === "sponsor" && selected;
  const custom = subtitle.customHeadlines;
  const ai = subtitle.aiHeadlines;

  const saveMessage = (value) => {
    setMessage(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => patch({ message: value }), 700);
  };
  const addCustom = async (e) => {
    e.preventDefault();
    const p = addHeadlinePatch(subtitle, draft.tag, draft.text);
    if (!p) return;
    if (await desk.save(p, "Manşet şeride eklendi.")) setDraft((d) => ({ ...d, text: "" }));
  };
  const promote = (index) => {
    const item = ai[index];
    if (item) patch({ customHeadlines: [...custom, item], aiHeadlines: removeAt(ai, index) }, "Manşet girilen manşetlere taşındı.");
  };
  const generate = async (mode) => {
    setAiBusy(true);
    const res = await api.generateAiHeadlines(matchId, { count: 8, tone });
    setAiBusy(false);
    if (!res.ok) { toast(friendlyError(res, "Manşetler üretilemedi."), { tone: "error", timeout: 6000 }); return; }
    const list = Array.isArray(res.data?.headlines) ? res.data.headlines : [];
    const ok = await desk.save(aiHeadlinesPatch(ai, list, mode));
    if (ok) toast(res.data?.source === "ai" ? `${list.length} manşet yapay zekâ ile üretildi ve şeride eklendi.` : `Yapay zekâ şu an kullanılamıyor; lig verisinden ${list.length} manşet hazırlandı.`, { tone: "success" });
  };

  return (
    <div className="mg-stack">
      <div className={`mg-live${sponsorMode ? " is-sponsor" : ""}`}>
        <span className="mg-live__dot" />
        <span className="mg-row__main"><strong>{sponsorMode ? `Sponsor bandı · ${selected.name}` : "Kayan haber şeridi"}</strong>
          <small>Şu an altyazıda{!sponsorMode && subtitle.rotateSponsor && selected ? ` · her ${subtitle.rotateEveryMin} dk'da ${subtitle.sponsorSeconds} sn sponsor bandı` : ""}</small></span>
        {sponsorMode ? (
          <button type="button" className="btn btn--sm" onClick={() => patch({ mode: "ticker" }, "Altyazı haber şeridine döndü.")} disabled={desk.saving}><Icon name="rotate" size={13} /> Haber şeridine dön</button>
        ) : (
          <button type="button" className="btn btn--sm" disabled={desk.saving || !sponsors.length} title={sponsors.length ? "" : "Sponsorlar ekranında “Altyazı şeridi” yeri seçilmiş sponsor yok"}
            onClick={() => { const t = selected || sponsors[0]; if (t) patch({ mode: "sponsor", sponsorId: t.id }, `Altyazı ${t.name} sponsor bandıyla değiştirildi.`); }}>
            <Icon name="handshake" size={13} /> Sponsorla değiştir
          </button>
        )}
      </div>

      <div className="mg-grid2">
        <fieldset className="mg-box">
          <legend>Girilen manşetler <small>{custom.length}/{MAX_CUSTOM_HEADLINES}</small></legend>
          <form className="mg-inline" onSubmit={addCustom}>
            <input className="mg-tag" value={draft.tag} maxLength={14} placeholder="ETİKET" aria-label="Etiket (isteğe bağlı)" onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value.toLocaleUpperCase("tr-TR") }))} />
            <input className="mg-grow" value={draft.text} maxLength={160} placeholder="Manşet: Ör. Kartal Spor seriyi 5 maça çıkardı" aria-label="Manşet metni" onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
            <button type="submit" className="btn btn--sm" disabled={!draft.text.trim() || custom.length >= MAX_CUSTOM_HEADLINES || desk.saving}><Icon name="plus" size={13} /> Ekle</button>
          </form>
          {custom.length ? <HeadlineList list={custom} disabled={desk.saving} onChange={(next) => patch({ customHeadlines: next })} /> : <p className="mg-muted">Henüz manşet yok. Etiket isteğe bağlı (SON DAKİKA, TRANSFER…).</p>}
          <label className="mg-field"><span>Duyuru (şeridin başında, sarı etiketle)</span>
            <input value={message} maxLength={240} placeholder="Ör. Maçımız 21.00'de başlıyor" onChange={(e) => saveMessage(e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="mg-box">
          <legend>Yapay zekâ manşetleri <small>{ai.length}/{MAX_AI_HEADLINES}</small></legend>
          <div className="mg-inline">
            <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Ton">
              {AI_TONES.map((t) => <option key={t.value} value={t.value}>Ton: {t.label}</option>)}
            </select>
            <button type="button" className="btn btn--sm" onClick={() => generate("replace")} disabled={aiBusy || desk.saving}><Icon name="sparkles" size={13} /> {aiBusy ? "Üretiliyor…" : ai.length ? "Yeniden üret" : "Manşet üret"}</button>
            {ai.length > 0 && <button type="button" className="btn btn--sm btn--ghost" onClick={() => generate("append")} disabled={aiBusy || ai.length >= MAX_AI_HEADLINES}><Icon name="plus" size={13} /> Daha ekle</button>}
          </div>
          {ai.length ? <HeadlineList list={ai} disabled={desk.saving} onPromote={promote} onChange={(next) => patch({ aiHeadlines: next })} /> : <p className="mg-muted">Canlı skor, sonuçlar, puan durumu ve krallık listelerinden manşet üretir.</p>}
        </fieldset>
      </div>

      <div className="mg-grid3">
        <fieldset className="mg-box">
          <legend>Şeritte kayanlar</legend>
          {SUBTITLE_SECTIONS.map((s) => {
            const on = subtitle.sections?.[s.key] !== false;
            return (
              <label key={s.key} className="mg-check">
                <input type="checkbox" checked={on} disabled={desk.saving} onChange={() => patch({ sections: { [s.key]: !on } })} />
                <span><b>{s.label}</b><small>{s.hint}</small></span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="mg-box">
          <legend>Görünüm</legend>
          <div className="mg-field"><span>Kayma hızı</span>
            <div className="seg seg--sm">
              {SUBTITLE_SPEEDS.map((s) => <button key={s.key} type="button" className={subtitle.speed === s.key ? "is-active" : ""} disabled={desk.saving} onClick={() => patch({ speed: s.key })}>{s.label}</button>)}
            </div>
          </div>
          <label className="mg-check"><input type="checkbox" checked={Boolean(subtitle.showClock)} disabled={desk.saving} onChange={() => patch({ showClock: !subtitle.showClock })} /><span><b>Saat</b><small>Sağ blokta canlı saat</small></span></label>
          <label className="mg-check"><input type="checkbox" checked={Boolean(subtitle.showLeague)} disabled={desk.saving} onChange={() => patch({ showLeague: !subtitle.showLeague })} /><span><b>Lig ve tarih</b><small>Saatin solunda lig · sezon</small></span></label>
        </fieldset>
        <fieldset className="mg-box">
          <legend>Sponsor bandı</legend>
          {!sponsors.length ? <p className="mg-muted">Sponsorlar ekranında “Altyazı şeridi” yeri seçilmiş sponsor yok.</p> : (
            <>
              <label className="mg-field"><span>Sponsor</span>
                <select value={sponsorId} disabled={desk.saving} onChange={(e) => patch({ sponsorId: e.target.value ? Number(e.target.value) : null, ...(e.target.value ? {} : { mode: "ticker", rotateSponsor: false }) })}>
                  <option value="">Seçilmedi</option>
                  {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {selected?.images?.lower_third && <img className="mg-sponsor-img" src={selected.images.lower_third} alt="" />}
              <label className="mg-check"><input type="checkbox" checked={Boolean(subtitle.rotateSponsor)} disabled={desk.saving || !selected} onChange={() => patch({ rotateSponsor: !subtitle.rotateSponsor })} /><span><b>Şeritle dönüşümlü</b><small>Şerit belli aralıklarla sponsor bandına geçer</small></span></label>
              <div className="mg-inline">
                <select value={subtitle.rotateEveryMin} disabled={desk.saving || !selected} onChange={(e) => patch({ rotateEveryMin: Number(e.target.value) })} aria-label="Geçiş sıklığı">
                  {ROTATE_MINUTE_STEPS.map((m) => <option key={m} value={m}>Her {m} dk</option>)}
                </select>
                <select value={subtitle.sponsorSeconds} disabled={desk.saving || !selected} onChange={(e) => patch({ sponsorSeconds: Number(e.target.value) })} aria-label="Sponsor süresi">
                  {SECOND_STEPS.map((s) => <option key={s} value={s}>{s === 60 ? "1 dakika" : `${s} saniye`}</option>)}
                </select>
              </div>
            </>
          )}
        </fieldset>
      </div>
    </div>
  );
}
