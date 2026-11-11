// Bileşen ayarları: başlık, başlığı göster, vurgu rengi, boyut / kademe ve bileşene özgü seçenekler.
import React, { Suspense, lazy, useState } from "react";
import { Field, Icon, Modal } from "../../components/ui";
import { SIZE_PRESETS, effectiveTier, sizeLimits, tierOf } from "./dashModel";
import { ACTION_CHOICES, ROUTE_CHOICES, TIER_LABELS, TIER_SHORT } from "./registry";
import { useData } from "./data";
import { chatPreview } from "../../lib/chatUtils";
import { ButtonsField, IconField, ImageField, LeagueField, NoteField, SpecField } from "./ActionPicker";

const EmbedBody = lazy(() => import("./tiles/embedBody"));
export const SWATCHES = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#475569"];
const EMBED_SETTINGS = new Set(["clock", "weather", "rates", "matches", "messages", "todos", "livematch", "standings", "launcher", "dock"]);

function ProjectSelect({ value, onChange }) {
  const q = useData("/api/tools/projects", null, { ttl: 60000 });
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Proje">
      <option value="">Otomatik (en yakın son tarihli aktif proje)</option>
      {(q.data?.items || []).filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
function ConversationSelect({ value, onChange }) {
  const q = useData("/api/chat/conversations", null, { ttl: 30000 });
  const list = (q.data?.conversations || []).filter((c) => !c.archived);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Sohbet">
      <option value="">Yok (son sohbetler)</option>
      {list.map((c) => <option key={c.id} value={c.id}>{c.title}{c.last_message ? ` — ${chatPreview(c).text.slice(0, 30)}` : ""}</option>)}
    </select>
  );
}

function OptionField({ opt, value, onChange }) {
  const v = value ?? opt.def ?? "";
  switch (opt.type) {
    case "select": return <select value={v} onChange={(e) => onChange(e.target.value)} aria-label={opt.label}>{opt.choices.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
    case "toggle": return <label className="ft-check"><input type="checkbox" checked={Boolean(value ?? opt.def)} onChange={(e) => onChange(e.target.checked)} /> {opt.label}</label>;
    case "number": return <input type="number" value={v} onChange={(e) => onChange(Number(e.target.value))} aria-label={opt.label} />;
    case "date": return <input type="date" value={v} onChange={(e) => onChange(e.target.value)} aria-label={opt.label} />;
    case "textarea": return <textarea rows={5} value={v} onChange={(e) => onChange(e.target.value)} aria-label={opt.label} />;
    case "route": return (
      <div className="dt-routepick">
        <select value={ROUTE_CHOICES.some(([k]) => k === v) ? v : "__custom"} onChange={(e) => e.target.value !== "__custom" && onChange(e.target.value)} aria-label={opt.label}>
          {ROUTE_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          <option value="__custom">Özel adres…</option>
        </select>
        {!ROUTE_CHOICES.some(([k]) => k === v) && <input value={v} onChange={(e) => onChange(e.target.value.trim())} placeholder="ör. toolkit:qr" aria-label="Özel bölüm adresi" />}
      </div>
    );
    case "action": return <select value={v} onChange={(e) => onChange(e.target.value)} aria-label={opt.label}>{ACTION_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
    case "project": return <ProjectSelect value={value} onChange={onChange} />;
    case "conversation": return <ConversationSelect value={value} onChange={onChange} />;
    case "spec": return <SpecField value={value ?? opt.def} onChange={onChange} />;
    case "icon": return <IconField value={value || ""} onChange={onChange} />;
    case "buttons": return <ButtonsField value={value ?? opt.def ?? ""} onChange={onChange} />;
    case "league": return <LeagueField value={value} onChange={onChange} />;
    case "note": return <NoteField value={value} onChange={onChange} />;
    case "image": return <ImageField value={value || ""} onChange={onChange} />;
    default: return <input type={opt.type === "url" ? "url" : "text"} value={v} onChange={(e) => onChange(e.target.value)} aria-label={opt.label} />;
  }
}

export default function TileSettings({ item, meta, onPatch, onResize, onTier, onClose }) {
  const [title, setTitle] = useState(item.title || "");
  const o = item.o || {};
  const tier = effectiveTier(meta, item.w, item.h);
  const { min, max } = sizeLimits(meta);
  const presets = SIZE_PRESETS.filter(([w, h]) => w >= min[0] && h >= min[1] && w <= max[0] && h <= max[1] && meta.tiers.includes(tierOf(w, h)));
  const setOpt = (key, value) => onPatch(item.i, { o: { [key]: value } });
  return (
    <Modal title={`${meta.label}: ayarlar`} onClose={onClose} width={560} className="dt-settings"
      footer={<><button type="button" className="btn" onClick={() => { onPatch(item.i, { title: "", accent: "", head: true }); setTitle(""); }}>Görünümü sıfırla</button><span className="spacer" /><button type="button" className="btn btn--primary" onClick={onClose}>Bitti</button></>}>
      <div className="dt-form">
        <p className="muted small"><Icon name={meta.icon} size={13} /> {meta.hint}</p>
        <Field label="Başlık">
          <input value={title} onChange={(e) => { setTitle(e.target.value); onPatch(item.i, { title: e.target.value }); }} placeholder={meta.label} aria-label="Başlık" />
        </Field>
        <label className="ft-check"><input type="checkbox" checked={item.head !== false} onChange={(e) => onPatch(item.i, { head: e.target.checked })} /> Başlık çubuğunu göster</label>
        <Field label="Vurgu rengi">
          <div className="dt-swatches" role="radiogroup" aria-label="Vurgu rengi">
            <button type="button" role="radio" aria-checked={!item.accent} className={`dt-swatch is-auto${!item.accent ? " is-on" : ""}`} style={{ "--sw": meta.tint || "#7c3aed" }} onClick={() => onPatch(item.i, { accent: "" })} title="Bileşenin rengi">A</button>
            {SWATCHES.map((c) => <button key={c} type="button" role="radio" aria-checked={item.accent === c} className={`dt-swatch${item.accent === c ? " is-on" : ""}`} style={{ "--sw": c }} onClick={() => onPatch(item.i, { accent: c })} aria-label={c} />)}
            <input type="color" value={item.accent || meta.tint || "#7c3aed"} onChange={(e) => onPatch(item.i, { accent: e.target.value })} aria-label="Özel renk" />
          </div>
        </Field>
        <Field label={`Boyut: ${item.w}×${item.h} · ${TIER_LABELS[tier]}`} hint="Büyüdükçe daha çok işlev; 1×1 tek dokunuşluk düğme. Düzenle kipinde köşeden de boyutlanır.">
          <div className="dt-chips">
            {meta.tiers.map((t) => <button key={t} type="button" className={t === tier ? "is-on" : ""} onClick={() => onTier(item.i, t)}>{TIER_LABELS[t]} <small>{TIER_SHORT[t]}</small></button>)}
          </div>
          <div className="dt-chips is-sizes">
            {presets.map(([w, h]) => <button key={`${w}x${h}`} type="button" className={w === item.w && h === item.h ? "is-on" : ""} onClick={() => onResize(item.i, w, h)}>{w}×{h}</button>)}
          </div>
        </Field>
        {(meta.options || []).map((opt) => (
          opt.type === "toggle" ? <OptionField key={opt.key} opt={opt} value={o[opt.key]} onChange={(v) => setOpt(opt.key, v)} />
            : <Field key={opt.key} label={opt.label}><OptionField opt={opt} value={o[opt.key]} onChange={(v) => setOpt(opt.key, v)} /></Field>
        ))}
        {meta.embed && EMBED_SETTINGS.has(meta.embed) && (
          <Field label="Widget ayarları">
            <div className="dt-embed-settings">
              <Suspense fallback={null}><EmbedBody type={meta.embed} size="medium" item={item} o={o} set={(p) => onPatch(item.i, { o: p })} settings closeSettings={() => {}} /></Suspense>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
