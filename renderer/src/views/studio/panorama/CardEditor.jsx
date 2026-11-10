// Panorama · KART AYARLARI — her kart türünün seçenekleri (web Panorama sahnesi + parametreleri ve
// seçicileri, haftanın maçı, geri sayım, hava durumu, anket, sponsor / slayt medyası, sosyal
// gönderi, çoklu il, özel metin) ve kart başına stil geçersiz kılma.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import { request } from "../../../api";
import { CARD_KINDS, CARD_PRESETS, makeCard } from "../../../lib/studio/panorama/model";
import { lookupWeb, paramFields, webSceneOf } from "../../../lib/studio/panorama/webScenes";
import { imageToData } from "./BrandPanel";

const LOOKUP = { playerId: "players", playerId2: "players", teamId: "teams", teamId2: "teams", matchId: "matches", awardSetId: "award-sets" };
const LABELS = { leagueId: "Lig", seasonId: "Sezon", from: "Sıradan", to: "Sıraya", date: "O gün itibarıyla", dateFrom: "Başlangıç", dateTo: "Bitiş", playerId: "Oyuncu", playerId2: "2. oyuncu", teamId: "Takım", teamId2: "2. takım", matchId: "Maç", awardSetId: "Haftanın enleri seti", title: "Başlık", text: "Metin" };
const itemLabel = (kind, it) => {
  if (kind === "players") return `${it.name}${it.teamName ? ` · ${it.teamName}` : ""}`;
  if (kind === "teams") return it.name;
  if (kind === "matches") return `${it.homeName} ${it.homeScore ?? ""}${it.homeScore != null ? "-" : "– "}${it.awayScore ?? ""} ${it.awayName}${it.date ? ` · ${String(it.date).slice(0, 10)}` : ""}`;
  return `${it.title || `Set #${it.id}`}${it.endDate ? ` · ${String(it.endDate).slice(0, 10)}` : ""}`;
};

/** Ara-seç: yazdıkça sunucudan (il / kapsam içinde) arar. Seçilen ad kartta saklanır. */
function Lookup({ kind, value, label, valueLabel, scope, onPick }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const list = await lookupWeb(request, kind, { q, cityId: scope.cityId, leagueId: kind === "matches" || kind === "award-sets" ? undefined : scope.leagueId, seasonId: scope.seasonId });
      if (n === seq.current) setItems(list);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, kind, scope.cityId, scope.leagueId, scope.seasonId]);
  return (
    <div className="field pn-mini pn-lookup"><span>{label}</span>
      <div className="pn-row2">
        <input className="input" value={open ? q : valueLabel || (value ? `#${value}` : "")} placeholder="Ara…" onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => setQ(e.target.value)} data-lookup={kind} />
        {value ? <button type="button" className="icon-btn" onClick={() => onPick(null, "")} title="Temizle"><Icon name="x" size={12} /></button> : null}
      </div>
      {open && (
        <ul className="pn-lookup__list">
          {items.map((it) => <li key={it.id}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(it.id, itemLabel(kind, it)); setOpen(false); }}>{itemLabel(kind, it)}</button></li>)}
          {!items.length && <li className="st-hint">Sonuç yok</li>}
          <li><button type="button" className="pn-lookup__close" onClick={() => setOpen(false)}>Kapat</button></li>
        </ul>
      )}
    </div>
  );
}

function WebOptions({ card, set, catalog, data, scope }) {
  const o = card.opts || {};
  const scene = webSceneOf(o.scene, catalog.scenes);
  const groups = useMemo(() => [...new Set(catalog.scenes.map((s) => s.group))], [catalog.scenes]);
  const fields = paramFields(scene);
  const sc = { cityId: scope.cityId, leagueId: o.leagueId || scope.leagueId, seasonId: o.seasonId || scope.seasonId };
  return (
    <>
      <label className="field pn-mini"><span>Web Panorama sahnesi</span>
        <select className="input" value={o.scene || ""} onChange={(e) => set({ scene: e.target.value })} data-field="web-scene">
          {groups.map((g) => <optgroup key={g} label={g}>{catalog.scenes.filter((s) => s.group === g).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}
        </select>
      </label>
      {scene?.hint && <p className="st-hint">{scene.hint}</p>}
      {fields.map((f) => {
        if (LOOKUP[f]) return <Lookup key={f} kind={LOOKUP[f]} label={`${LABELS[f]}${(scene.required || []).includes(f) ? " *" : ""}`} value={o[f]} valueLabel={o[`${f}Label`]} scope={sc} onPick={(id, lbl) => set({ [f]: id, [`${f}Label`]: lbl })} />;
        if (f === "leagueId") return (
          <label key={f} className="field pn-mini"><span>Lig</span>
            <select className="input" value={o.leagueId || ""} onChange={(e) => set({ leagueId: Number(e.target.value) || null, seasonId: null })}>
              <option value="">Yayının ligi</option>{(data.options.leagues || []).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
        );
        if (f === "seasonId") return (
          <label key={f} className="field pn-mini"><span>Sezon</span>
            <select className="input" value={o.seasonId || ""} onChange={(e) => set({ seasonId: Number(e.target.value) || null })} disabled={Boolean(o.leagueId && o.leagueId !== scope.leagueId)}>
              <option value="">Yayının sezonu</option>{(data.options.seasons || []).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
        );
        if (f === "from" || f === "to") return <label key={f} className="field pn-mini"><span>{LABELS[f]}</span><input className="input" type="number" min={1} max={200} value={o[f] || ""} placeholder={f === "from" ? "1" : "12"} onChange={(e) => set({ [f]: Number(e.target.value) || null })} /></label>;
        if (f === "date" || f === "dateFrom" || f === "dateTo") return <label key={f} className="field pn-mini"><span>{LABELS[f]}</span><input className="input" type="date" value={o[f] || ""} onChange={(e) => set({ [f]: e.target.value || null })} /></label>;
        if (f === "text") return <label key={f} className="field pn-mini"><span>Metin</span><textarea className="input" rows={2} value={o.text || ""} maxLength={1200} onChange={(e) => set({ text: e.target.value })} /></label>;
        return <label key={f} className="field pn-mini"><span>{LABELS[f] || f}</span><input className="input" value={o[f] || ""} maxLength={120} onChange={(e) => set({ [f]: e.target.value })} /></label>;
      })}
    </>
  );
}

function MediaList({ items, onChange, kinds = "image,video", toast }) {
  const add = async (kind) => {
    const r = await window.elitlig?.studio?.media?.pick?.({ kind, multiple: true });
    if (!r?.files?.length) { if (r?.error) toast(r.error.message, { tone: "error" }); return; }
    onChange([...(items || []), ...r.files.map((f) => ({ src: f.url, kind, name: f.name, mediaId: f.id }))]);
  };
  return (
    <div className="pn-field"><span>Medya (yerel dosyalar)</span>
      <ol className="pn-medialist">{(items || []).map((m, i) => (
        <li key={`${m.src}-${i}`}>
          {m.kind === "image" ? <img src={m.src} alt="" /> : <Icon name="video" size={16} />}
          <input className="input" value={m.caption || ""} placeholder={m.name || "Alt yazı"} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))} />
          <button type="button" className="icon-btn" disabled={i === 0} onClick={() => { const a = [...items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }} title="Yukarı"><Icon name="chevronUp" size={12} /></button>
          <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, k) => k !== i))} title="Kaldır"><Icon name="trash" size={12} /></button>
        </li>
      ))}</ol>
      <div className="pn-row2">
        {kinds.includes("image") && <button type="button" className="btn btn--sm" onClick={() => add("image")} data-act="add-image"><Icon name="image" size={12} /> Görsel ekle</button>}
        {kinds.includes("video") && <button type="button" className="btn btn--sm" onClick={() => add("video")} data-act="add-video"><Icon name="video" size={12} /> Video ekle</button>}
      </div>
    </div>
  );
}

function StyleOverride({ card, onChange }) {
  const s = card.style || {};
  const set = (patch) => onChange({ ...card, style: { ...s, ...patch } });
  const col = (k, label) => (
    <label className="pn-color"><input type="checkbox" checked={Boolean(s[k])} onChange={(e) => set({ [k]: e.target.checked ? "#c026d3" : null })} />
      {s[k] ? <input type="color" value={s[k]} onChange={(e) => set({ [k]: e.target.value })} /> : null}<span>{label}</span></label>
  );
  return (
    <details className="pn-cardstyle"><summary>Kart stili (bu kart için)</summary>
      <div className="pn-colors">{col("accent", "Vurgu")}{col("primary", "Başlık şeridi")}{col("panel", "Zemin")}{col("text", "Metin")}</div>
      <div className="pn-row2">
        <label className="field pn-mini pn-range"><span>Köşe <b>{s.radius ?? "marka"}</b></span><input type="range" min={0} max={60} value={s.radius ?? 22} onChange={(e) => set({ radius: Number(e.target.value) })} /></label>
        <label className="field pn-mini pn-range"><span>Saydamlık <b>{s.opacity != null ? `${Math.round(s.opacity * 100)}%` : "marka"}</b></span><input type="range" min={30} max={100} value={Math.round((s.opacity ?? 1) * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} /></label>
      </div>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Giriş</span><select className="input" value={s.anim || ""} onChange={(e) => set({ anim: e.target.value || null })}><option value="">Markanınki</option>{["slide", "fade", "zoom", "rise", "wipe", "flip", "none"].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label className="pn-check"><input type="checkbox" checked={Boolean(s.hideTitle)} onChange={(e) => set({ hideTitle: e.target.checked })} /> Başlık şeridini gizle</label>
      </div>
      {card.style && <button type="button" className="btn btn--sm" onClick={() => onChange({ ...card, style: null })}>Stili sıfırla</button>}
    </details>
  );
}

export function CardOptions({ card, data, onChange, catalog, scope, onRefresh }) {
  const toast = useToast();
  const o = card.opts || {};
  const set = (patch) => onChange({ ...card, opts: { ...o, ...patch } });
  const teams = data.standings?.rows || [];
  const teamSel = (k, label) => (
    <label className="field pn-mini"><span>{label}</span>
      <select className="input" value={o[k] || ""} onChange={(e) => set({ [k]: Number(e.target.value) || null })}>
        <option value="">Otomatik</option>
        {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.rank}. {t.teamName}</option>)}
      </select>
    </label>
  );
  const txt = (k, label, max = 120, ph = "") => <label className="field pn-mini"><span>{label}</span><input className="input" value={o[k] || ""} maxLength={max} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} data-opt={k} /></label>;
  const area = (k, label, max = 1200) => <label className="field pn-mini"><span>{label}</span><textarea className="input" rows={3} value={o[k] || ""} maxLength={max} onChange={(e) => set({ [k]: e.target.value })} data-opt={k} /></label>;
  let body = null;
  switch (card.kind) {
    case "team": body = teamSel("teamId", "Takım"); break;
    case "compare": body = <>{teamSel("teamA", "1. takım")}{teamSel("teamB", "2. takım")}</>; break;
    case "notice": body = <>{txt("title", "Başlık", 60)}{area("text", "Metin", 300)}</>; break;
    case "qr": body = <>{txt("url", "Adres", 300, "https://elitlig.com")}{txt("label", "Etiket", 60, "elitlig.com")}</>; break;
    case "web": body = <WebOptions card={card} set={set} catalog={catalog} data={data} scope={scope} />; break;
    case "motw": body = (
      <>
        <Lookup kind="matches" label="Maç (boşsa otomatik: en üst sıraların yaklaşan maçı)" value={o.matchId} valueLabel={o.matchLabel} scope={scope} onPick={(id, lbl) => set({ matchId: id, matchLabel: lbl })} />
      </>
    ); break;
    case "countdown": body = <>{txt("title", "Başlık", 60, "MAÇA KALAN")}<label className="field pn-mini"><span>Hedef tarih / saat</span><input className="input" type="datetime-local" value={o.target ? String(o.target).slice(0, 16) : ""} onChange={(e) => set({ target: e.target.value ? new Date(e.target.value).toISOString() : "" })} data-opt="target" /></label>{txt("doneText", "Bitince yazı", 60, "BAŞLADI!")}</>; break;
    case "weather": body = <>{txt("city", "Şehir / stadyum şehri", 80, data.scope?.city?.label || "Ankara")}<div className="pn-row2">{txt("lat", "Enlem (isteğe bağlı)", 12)}{txt("lon", "Boylam", 12)}</div><button type="button" className="btn btn--sm" onClick={() => onRefresh?.(card)}><Icon name="refresh" size={12} /> Tazele</button></>; break;
    case "poll": body = (
      <>
        {txt("question", "Soru", 120, "Maçın adamı kim?")}
        {(o.options || []).map((op, i) => (
          <div key={i} className="pn-row2">
            <input className="input" value={op.label} placeholder={`${String.fromCharCode(65 + i)} seçeneği`} maxLength={80} onChange={(e) => set({ options: o.options.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} data-poll={i} />
            <input className="input pn-sec" type="number" min={0} value={op.votes || 0} title="Oy (elle girilir)" onChange={(e) => set({ options: o.options.map((x, k) => (k === i ? { ...x, votes: Number(e.target.value) || 0 } : x)) })} />
            <button type="button" className="icon-btn" onClick={() => set({ options: o.options.filter((_, k) => k !== i) })}><Icon name="trash" size={12} /></button>
          </div>
        ))}
        {(o.options || []).length < 6 && <button type="button" className="btn btn--sm" onClick={() => set({ options: [...(o.options || []), { label: "", votes: 0 }] })}><Icon name="plus" size={12} /> Seçenek</button>}
        {txt("url", "Oy bağlantısı (QR) — anket formu / YouTube anketi", 300, "https://…")}
      </>
    ); break;
    case "promo": body = (
      <>
        {txt("name", "Sponsor adı", 60)}{area("text", "Tanıtım metni", 300)}{txt("url", "Bağlantı", 300)}
        <div className="pn-field"><span>Sponsor logosu</span>
          <div className="pn-row2">
            {o.logo ? <img className="pn-logo__pic" src={o.logo} alt="" /> : null}
            <button type="button" className="btn btn--sm" onClick={async () => { const r = await window.elitlig?.studio?.media?.pick?.({ kind: "image" }); const f = r?.files?.[0]; if (!f) return; try { set({ logo: (await imageToData(f.url, 512)).data }); } catch (e) { toast(e.message, { tone: "error" }); } }}><Icon name="folder" size={12} /> Logo seç</button>
            {o.logo ? <button type="button" className="icon-btn" onClick={() => set({ logo: "" })}><Icon name="trash" size={12} /></button> : null}
          </div>
        </div>
        <MediaList items={o.items} onChange={(items) => set({ items })} toast={toast} />
        <div className="pn-row2"><label className="field pn-mini"><span>Medya başına (sn)</span><input className="input" type="number" min={2} max={120} value={o.perSec || 8} onChange={(e) => set({ perSec: Number(e.target.value) || 8 })} /></label>
          <label className="field pn-mini"><span>Sığdırma</span><select className="input" value={o.fit || "contain"} onChange={(e) => set({ fit: e.target.value })}><option value="contain">Sığdır</option><option value="cover">Doldur</option></select></label></div>
      </>
    ); break;
    case "slides": body = (
      <>
        <MediaList items={o.items} onChange={(items) => set({ items })} toast={toast} />
        <div className="pn-row2"><label className="field pn-mini"><span>Slayt süresi (sn)</span><input className="input" type="number" min={2} max={120} value={o.perSec || 6} onChange={(e) => set({ perSec: Number(e.target.value) || 6 })} data-opt="perSec" /></label>
          <label className="field pn-mini"><span>Sığdırma</span><select className="input" value={o.fit || "contain"} onChange={(e) => set({ fit: e.target.value })}><option value="contain">Sığdır</option><option value="cover">Doldur</option></select></label></div>
        <p className="st-hint">Video slaytları program sahnesinde kart kutusunda oynar (sesli).</p>
      </>
    ); break;
    case "social": {
      const fetchMeta = async () => {
        const fn = window.elitlig?.studio?.panorama?.linkMeta;
        if (!fn) { toast("Bu sürümde bağlantı önizlemesi yok.", { tone: "warn" }); return; }
        const r = await fn(o.url);
        if (!r?.ok) { toast(r?.error || "Bağlantı okunamadı.", { tone: "error", timeout: 5000 }); return; }
        set({ title: r.title || o.title, text: r.text || o.text, image: r.image || o.image, site: r.site || o.site, author: r.author || o.author });
        toast("Gönderi bilgileri alındı.", { tone: "success", timeout: 2000 });
      };
      body = (
        <>
          <div className="pn-row2">{txt("url", "Gönderi bağlantısı", 300, "https://…")}<button type="button" className="btn btn--sm" onClick={fetchMeta} disabled={!/^https?:\/\//i.test(o.url || "")} data-act="social-fetch"><Icon name="download" size={12} /> Getir</button></div>
          {txt("site", "Site / hesap", 60)}{txt("author", "Yazar", 80)}{txt("title", "Başlık", 300)}{area("text", "Metin", 600)}{txt("image", "Görsel adresi", 1000)}
        </>
      );
      break;
    }
    case "cities": body = (
      <div className="pn-field"><span>İller (en çok 6)</span>
        <div className="pn-checks pn-checks--grid">{(data.options.cities || []).map((c) => (
          <label key={c.id}><input type="checkbox" checked={(o.cityIds || []).includes(c.id)} onChange={(e) => set({ cityIds: e.target.checked ? [...(o.cityIds || []), c.id].slice(0, 6) : (o.cityIds || []).filter((x) => x !== c.id) })} data-city={c.id} /> {c.label}</label>
        ))}</div>
      </div>
    ); break;
    case "scoreboard": body = (
      <>
        <label className="field pn-mini pn-range"><span>Hız <b>{o.speed || 90} px/sn</b></span><input type="range" min={20} max={300} value={o.speed || 90} onChange={(e) => set({ speed: Number(e.target.value) })} /></label>
        <div className="pn-checks">{[["live", "Canlı"], ["results", "Son sonuçlar"], ["fixtures", "Yaklaşan"]].map(([k, l]) => {
          const list = String(o.sources || "live,results,fixtures").split(",").filter(Boolean);
          return <label key={k}><input type="checkbox" checked={list.includes(k)} onChange={(e) => set({ sources: (e.target.checked ? [...list, k] : list.filter((x) => x !== k)).join(",") })} /> {l}</label>;
        })}</div>
      </>
    ); break;
    case "text": body = (
      <>
        {txt("title", "Kart başlığı (boş: şeritte başlık yok)", 60)}{area("text", "Metin (her satır ayrı)", 1200)}
        <div className="pn-row4">
          <label className="field pn-mini"><span>Boy</span><input className="input" type="number" min={18} max={140} value={o.size || 60} onChange={(e) => set({ size: Number(e.target.value) || 60 })} /></label>
          <label className="field pn-mini"><span>Hizalama</span><select className="input" value={o.align || "center"} onChange={(e) => set({ align: e.target.value })}><option value="left">Sola</option><option value="center">Ortaya</option><option value="right">Sağa</option></select></label>
          <label className="field pn-mini"><span>Yazı</span><select className="input" value={o.font || "sans"} onChange={(e) => set({ font: e.target.value })}><option value="sans">Metin</option><option value="cond">Başlık (dar)</option></select></label>
          <label className="field pn-mini"><span>Renk</span><input type="color" className="input" value={o.color || "#111111"} onChange={(e) => set({ color: e.target.value })} /></label>
        </div>
        <label className="pn-check"><input type="checkbox" checked={Boolean(o.upper)} onChange={(e) => set({ upper: e.target.checked })} /> BÜYÜK HARF</label>
      </>
    ); break;
    default: body = null;
  }
  return <>{body}<StyleOverride card={card} onChange={onChange} /></>;
}

/** "Kart ekle" menüsü: gruplu türler + web sahnesi kısayolları. */
export function AddCardSelect({ onAdd, catalog }) {
  const groups = [...new Set(CARD_KINDS.map((k) => k.group))];
  return (
    <label className="field pn-mini"><span>Kart ekle</span>
      <select className="input" value="" onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        if (v.startsWith("preset:")) { const p = CARD_PRESETS[Number(v.slice(7))]; onAdd(makeCard(p.kind, { opts: p.opts })); }
        else if (v.startsWith("web:")) onAdd(makeCard("web", { opts: { scene: v.slice(4) } }));
        else onAdd(makeCard(v));
      }} data-field="add-card">
        <option value="">Kart türü seç…</option>
        {groups.map((g) => <optgroup key={g} label={g}>{CARD_KINDS.filter((k) => k.group === g && k.key !== "web").map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</optgroup>)}
        <optgroup label="Hazır seçimler">{CARD_PRESETS.map((p, i) => <option key={p.label} value={`preset:${i}`}>{p.label}</option>)}</optgroup>
        {[...new Set(catalog.scenes.map((s) => s.group))].map((g) => (
          <optgroup key={`w-${g}`} label={`Web Panorama · ${g}`}>{catalog.scenes.filter((s) => s.group === g).map((s) => <option key={s.key} value={`web:${s.key}`}>{s.label}</option>)}</optgroup>
        ))}
      </select>
    </label>
  );
}
