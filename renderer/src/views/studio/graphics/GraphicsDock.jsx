// Yayın grafikleri · tam panel (stüdyo dok sekmesi):
//   Skorbord   tüm çeşitler canlı önizlemeyle; tıkla → programa (web ile eşitlenebilir)
//   Marka      logo, renk, yazı tipi, ölçüler (taslak anında programda)
//   Ön ayarlar adlı görünümler ("CCL CUP"), uygula / varsayılan / sil
//   Altyazı    yayına al / kaldır, satır ekle / kaldır / sırala, gelişmiş ayarlar
//   Röportaj   bant görünümü, konuklar (kadro, görevliler, elle), yayına al / kaldır
//   LED        LED ekran içeriği, maçın enleri, LED sponsoru
//   Sponsor    sponsor grafiği yayını, köşe rozeti
//   Bağlantılar OBS / LED adresleri
import React, { useEffect, useState } from "react";
import { Icon, Spinner, useToast } from "../../../components/ui";
import { INTERVIEW_STYLES } from "../../../lib/studio/graphics";
import { LED_MODES, SCOREBOARD_VARIANTS, VARIANT_GROUPS } from "../../../lib/studio/graphics/variants";
import { overlayLinks } from "../../../lib/studio/manageBroadcast";
import HighlightsDesk from "../manage/HighlightsDesk";
import InterviewDesk from "../manage/InterviewDesk";
import { LinkRow } from "../manage/pickers";
import SponsorDesk from "../manage/SponsorDesk";
import SubtitleDesk from "../manage/SubtitleDesk";
import BrandingEditor from "./BrandingEditor";
import GraphicsPreview from "./GraphicsPreview";
import PresetsPanel from "./PresetsPanel";
import "../manage/manage.css";
import "./graphics.css";

const SITE = "https://elitlig.com";
const SECTIONS = [
  { key: "score", label: "Skorbord", icon: "layers" },
  { key: "brand", label: "Marka & tema", icon: "palette" },
  { key: "presets", label: "Ön ayarlar", icon: "star" },
  { key: "subtitle", label: "Altyazı", icon: "list" },
  { key: "interview", label: "Röportaj", icon: "mic" },
  { key: "led", label: "LED ekran", icon: "grid" },
  { key: "sponsor", label: "Sponsor", icon: "handshake" },
  { key: "links", label: "Bağlantılar", icon: "link" },
];
const STORE = "elitlig.studio.graphicsSection";
const readSection = () => { try { return localStorage.getItem(STORE) || "score"; } catch { return "score"; } };

function OnAirButton({ on, onChange, labelOn, labelOff, disabled }) {
  return (
    <button type="button" className={`btn btn--sm ${on ? "btn--red" : "btn--green"}`} disabled={disabled} onClick={() => onChange(!on)}>
      {on ? <><span className="gx-dot" /> {labelOn}</> : <><Icon name="play" size={13} /> {labelOff}</>}
    </button>
  );
}

function SubtitleLines({ g }) {
  const [draft, setDraft] = useState({ tag: "", text: "" });
  const [edits, setEdits] = useState({});
  const lines = g.subtitle.lines;
  const add = async (e) => {
    e.preventDefault();
    if (await g.addLine(draft.tag, draft.text)) setDraft({ tag: draft.tag, text: "" });
  };
  return (
    <fieldset className="mg-box">
      <legend>Altyazı satırları <small>{lines.length}/20</small></legend>
      <form className="mg-inline" onSubmit={add}>
        <input className="gx-tag" value={draft.tag} maxLength={14} placeholder="ETİKET" onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value.toLocaleUpperCase("tr-TR") }))} />
        <input className="mg-grow" value={draft.text} maxLength={160} placeholder="Satır metni (ör. Maç sonu röportajları için yayında kalın)" onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
        <button type="submit" className="btn btn--sm btn--primary" disabled={!draft.text.trim() || g.desk.saving}><Icon name="plus" size={13} /> Ekle</button>
      </form>
      {lines.length ? (
        <ol className="mg-hl">
          {lines.map((item, i) => (
            <li key={`${i}-${item.text}`}>
              {item.tag ? <span className="mg-hl__tag">{item.tag}</span> : null}
              <input value={edits[i] ?? item.text} maxLength={160} aria-label="Satır metni" onChange={(e) => setEdits((m) => ({ ...m, [i]: e.target.value }))}
                onBlur={() => { const t = (edits[i] ?? item.text).trim(); setEdits((m) => { const n = { ...m }; delete n[i]; return n; }); if (t && t !== item.text) g.editLine(i, { text: t }); }} />
              <button type="button" className="icon-btn icon-btn--xs" title="Yukarı" disabled={i === 0} onClick={() => g.moveLine(i, -1)}><Icon name="chevronUp" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" title="Aşağı" disabled={i === lines.length - 1} onClick={() => g.moveLine(i, 1)}><Icon name="chevronDown" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" title="Kaldır" onClick={() => g.removeLine(i)}><Icon name="x" size={12} /></button>
            </li>
          ))}
        </ol>
      ) : <p className="mg-muted">Satır yok. Şeritte maçın skoru, golcüler ve yapay zekâ manşetleri yine kayar.</p>}
    </fieldset>
  );
}

export default function GraphicsDock({ g, matchId, live }) {
  const toast = useToast();
  const [section, setSection] = useState(readSection);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => { try { localStorage.setItem(STORE, section); } catch { /* yoksay */ } }, [section]);
  // Yayın masasını ara ara tazele (başka reji / web masası değiştirmiş olabilir).
  useEffect(() => {
    if (!g?.matchId) return undefined;
    const t = setInterval(() => g.desk.refresh(), 20_000);
    return () => clearInterval(t);
  }, [g?.matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) return null;
  if (!g.matchId) return <p className="mg-muted gx-empty mg-dock">Grafikler için önce “Maçlar” sekmesinden bir maç seç.</p>;
  const desk = g.desk;
  const id = Number(matchId || g.matchId);

  return (
    <div className="mg-dock gx-dock"><div className="mg-graphics">
      <nav className="mg-subnav" aria-label="Yayın grafikleri">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? "is-on" : ""} onClick={() => setSection(s.key)}>
            <Icon name={s.icon} size={13} /> {s.label}
            {s.key === "subtitle" && g.subtitle.onAir && <span className="gx-dot" />}
            {s.key === "interview" && g.interview.onAir && <span className="gx-dot" />}
            {s.key === "brand" && g.brand.dirty && <span className="gx-dot is-amber" />}
          </button>
        ))}
        <span className="mg-grow" />
        <label className="mg-check" title="Seçilen skorbord / röportaj modu OBS'teki web kaplamasına da yazılır"><input type="checkbox" checked={g.syncWeb} onChange={(e) => g.setSyncWeb(e.target.checked)} /> Web kaplamasıyla eşitle</label>
      </nav>
      {desk.error && ["subtitle", "interview", "sponsor", "led"].includes(section) && <p className="mg-error">{desk.error} <button type="button" className="btn btn--xs" onClick={desk.refresh}>Yeniden dene</button></p>}

      <div className="mg-graphics__body">
        {section === "score" && (
          <div className="mg-stack">
            {VARIANT_GROUPS.map((grp) => (
              <section key={grp.key}>
                <h6 className="mg-sidehead">{grp.title}</h6>
                <div className="gx-tiles">
                  {SCOREBOARD_VARIANTS.filter((v) => v.group === grp.key).map((v, i) => (
                    <button key={v.key} type="button" className={`gx-tile${g.scorebugVariant === v.key ? " is-on" : ""}`} onClick={() => g.setScorebugVariant(v.key)} title={v.hint}>
                      <GraphicsPreview snapshot={g.snapshot} variant={v.key} isolate width={232} fps={1} delay={i * 90} />
                      <span className="gx-tile__label">{g.scorebugVariant === v.key && <span className="gx-dot" />}<b>{v.label}</b><small>{v.hint}</small></span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {section === "brand" && (g.brand.loading ? <Spinner label="Yayın görünümü yükleniyor…" /> : <BrandingEditor g={g} live={live} />)}
        {section === "presets" && <PresetsPanel g={g} />}

        {section === "subtitle" && (
          <div className="mg-stack">
            <div className="mg-inline mg-wrap">
              <OnAirButton on={g.subtitle.onAir} onChange={g.setSubtitleOnAir} labelOn="Altyazıyı kaldır" labelOff="Altyazıyı yayına al" />
              <span className="mg-muted">Program çıkışında alt bant şeridi. Satırlar web /altyazi kaplamasıyla ortaktır.</span>
            </div>
            <div className="mg-grid2">
              <SubtitleLines g={g} />
              <GraphicsPreview snapshot={{ ...g.snapshot, subtitle: { ...g.snapshot.subtitle, onAir: true } }} variant="off" width={420} fps={12} title="Altyazı önizlemesi" />
            </div>
            <button type="button" className="btn btn--sm btn--ghost gx-adv" onClick={() => setAdvanced((a) => !a)}>
              <Icon name={advanced ? "chevronUp" : "chevronDown"} size={13} /> Gelişmiş: bölümler, hız, sponsor dönüşümü, yapay zekâ manşetleri
            </button>
            {advanced && (desk.loading ? <p className="mg-muted">Yükleniyor…</p> : <SubtitleDesk desk={desk} matchId={id} toast={toast} />)}
          </div>
        )}

        {section === "interview" && (
          <div className="mg-stack">
            <div className="mg-inline mg-wrap">
              <OnAirButton on={g.interview.onAir} onChange={(on) => g.setInterviewOnAir(on)} labelOn="Bandı yayından kaldır" labelOff="Bandı yayına al" disabled={!g.interview.onAir && !g.interview.people.length} />
              {!g.interview.people.length && <span className="mg-muted">Önce aşağıdan konuk seç ve kaydet.</span>}
            </div>
            <h6 className="mg-sidehead">Bant görünümü</h6>
            <div className="gx-tiles">
              {INTERVIEW_STYLES.map((s, i) => (
                <button key={s.key} type="button" className={`gx-tile${g.interview.style === s.key ? " is-on" : ""}`} onClick={() => g.setInterviewStyle(s.key)} title={s.hint} disabled={desk.saving}>
                  <GraphicsPreview snapshot={{ ...g.snapshot, interview: { ...g.snapshot.interview, style: s.key, onAir: true }, subtitle: { ...g.snapshot.subtitle, onAir: false } }} variant="scoreboard" width={232} fps={1} delay={i * 90} />
                  <span className="gx-tile__label"><b>{s.label}</b><small>{s.hint}</small></span>
                </button>
              ))}
            </div>
            {desk.loading ? <p className="mg-muted">Röportaj bilgisi yükleniyor…</p> : (
              <InterviewDesk desk={desk} live={live} matchId={id} isLive={g.interview.onAir} onGoLive={() => g.setInterviewOnAir(true)} onTakeOff={() => g.setInterviewOnAir(false)} />
            )}
          </div>
        )}

        {section === "led" && (
          <div className="mg-stack">
            <div className="mg-modes">
              {LED_MODES.map((m) => (
                <button key={m.key} type="button" className={`mg-mode is-led${g.ledMode === m.key ? " is-on" : ""}`} disabled={g.busy} onClick={() => g.setLedMode(m.key)}>
                  <strong>{g.ledMode === m.key && <span className="mg-live__dot" />}{m.label}</strong><small>{m.hint}</small>
                </button>
              ))}
            </div>
            <div className="mg-grid2">
              <HighlightsDesk matchId={id} match={live?.match} live={live} />
              <fieldset className="mg-box">
                <legend>LED sponsoru</legend>
                <p className="mg-muted">“Marka / sponsor” içeriğinde gösterilecek sponsor. Seçince LED ekran sponsor görünümüne geçer.</p>
                <select value={desk.state.led?.sponsorId || ""} disabled={desk.saving || desk.loading} onChange={async (e) => {
                  const sid = e.target.value ? Number(e.target.value) : null;
                  const ok = await desk.save({ led: { sponsorId: sid } }, sid ? null : "LED sponsoru kaldırıldı.");
                  if (ok && sid) await g.setLedMode("sponsor");
                }}>
                  <option value="">Elit Lig marka ekranı</option>
                  {desk.sponsors.filter((s) => s.placements?.includes("led_screen")).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </fieldset>
            </div>
          </div>
        )}

        {section === "sponsor" && <SponsorDesk desk={desk} ledMode={g.ledMode} onLedSponsorMode={() => g.setLedMode("sponsor")} />}

        {section === "links" && (
          <div className="mg-stack">
            <p className="mg-muted">OBS / vMix'e “Tarayıcı kaynağı” olarak 1920×1080 ekle; LED bilgisayarında tam ekran aç. Stüdyodaki marka ve modlar kaydedilince birkaç saniyede bu adreslere de düşer.</p>
            <ul className="mg-rows">{overlayLinks(id, SITE).map((l) => <LinkRow key={l.key} label={l.label} hint={l.hint} url={l.url} toast={toast} />)}</ul>
          </div>
        )}
      </div>
    </div></div>
  );
}
