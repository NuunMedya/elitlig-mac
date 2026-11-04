// Kişiler (CRM): tablo ve aşama panosu, süzgeçler, hızlı ekleme, Excel'den ve
// Rehber'den aktarma. Adımın içinde (embedded) açıldığında kişi ayrıntısı aynı
// pencerede sağda açılır.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Icon, MenuButton, Modal, Segmented, Spinner, useToast } from "../../components/ui";
import { get, useCommand, useDebounced } from "../../api";
import { filterLeads, formatWhen, leadColumns, leadDueState, parseLeadRows, stageOf, waLink, telLink, mailLink } from "../../lib/projectUtils";
import { includesTr, prettyPhone, relativeTime } from "../../lib/helpers";
import { Avatar, StagePill, money, pickSheetRows } from "./common";
import LeadPanel from "./LeadPanel";

const store = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

export default function Leads({ ctx, selectedId, initialFilter, embedded = false, step = null }) {
  const { leads, settings, people, canEdit, actions, me } = ctx;
  const toast = useToast();
  const [filter, setFilter] = useState(() => ({ stage: "", source: "", owner: "", due: "", q: "", ...(initialFilter || {}) }));
  const [layout, setLayout] = useState(() => (embedded ? "table" : store("proj:leadLayout", "table")));
  const [local, setLocal] = useState(null);
  const [importing, setImporting] = useState(null); // "excel" | "contacts"
  const quickRef = useRef(null);
  useEffect(() => { if (!embedded) try { localStorage.setItem("proj:leadLayout", JSON.stringify(layout)); } catch { /* yoksay */ } }, [layout, embedded]);
  useCommand("new", () => { if (!embedded) quickRef.current?.focus(); });
  useCommand("find", () => { if (!embedded) document.getElementById("lead-search")?.focus(); });

  const shown = useMemo(() => filterLeads(leads, filter, { meId: me, settings }), [leads, filter, me, settings]);
  const base = useMemo(() => filterLeads(leads, { ...filter, due: "" }, { meId: me, settings }), [leads, filter, me, settings]);
  const dueCounts = useMemo(() => ({
    "": base.length, due: base.filter((l) => ["today", "overdue"].includes(leadDueState(l))).length,
    overdue: base.filter((l) => leadDueState(l) === "overdue").length, none: filterLeads(base, { due: "none" }, { settings }).length,
  }), [base, settings]);
  const sources = useMemo(() => [...new Set([...(settings.lead_sources || []), ...leads.map((l) => l.source).filter(Boolean)])], [settings, leads]);
  const owners = useMemo(() => [...new Set(leads.map((l) => l.owner_id).filter(Boolean))], [leads]);
  const open = (id) => (embedded ? setLocal(id) : ctx.openLead(id));
  const activeId = embedded ? local : selectedId;
  const localLead = embedded && local ? leads.find((l) => String(l.id) === String(local)) : null;
  const stage = filter.stage ? stageOf(settings, filter.stage) : null;

  const quickAdd = async (body) => {
    const item = await actions.createLead({ ...body, stage: body.stage || filter.stage || undefined });
    if (item) toast(`${item.name} eklendi.`, { tone: "success", action: { label: "Aç", run: () => open(item.id) } });
  };

  const list = (
    <>
      {canEdit && <QuickLead inputRef={quickRef} stage={stage} sources={sources} onAdd={quickAdd} />}
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input id={embedded ? undefined : "lead-search"} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Ad, firma, telefon, not…" /></div>
        <select className="select-sm" value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })} aria-label="Aşama">
          <option value="">Tüm aşamalar</option>{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>{s.label} ({leads.filter((l) => l.stage === s.key).length})</option>)}
        </select>
        <select className="select-sm" value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })} aria-label="Kaynak">
          <option value="">Tüm kaynaklar</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!embedded && <select className="select-sm" value={filter.owner} onChange={(e) => setFilter({ ...filter, owner: e.target.value })} aria-label="Takip eden">
          <option value="">Herkesin</option><option value="me">Benim takip ettiklerim</option>{owners.filter((o) => o !== me).map((o) => <option key={o} value={o}>{people[o]?.name || `#${o}`}</option>)}
        </select>}
        <span className="spacer" />
        {!embedded && <Segmented size="sm" value={layout} onChange={setLayout} options={[{ value: "table", label: "Tablo", icon: "list" }, { value: "board", label: "Pano", icon: "board" }]} />}
        {canEdit && <MenuButton icon="upload" label="İçe aktar" items={[{ label: "Excel / CSV'den kişi aktar", icon: "grid", onClick: () => setImporting("excel") }, { label: "Rehber'den seç", icon: "users", onClick: () => setImporting("contacts") }]} />}
      </div>
      <div className="contact-filters">
        {[["", "Tümü"], ["due", "Bugün aranacak"], ["overdue", "Gecikmiş"], ["none", "Aksiyonsuz"]].map(([k, l]) => (
          <button key={k} type="button" className={filter.due === k ? "is-active" : ""} onClick={() => setFilter({ ...filter, due: k })}>{k === "overdue" && dueCounts.overdue ? <Icon name="alert" size={12} /> : null}{l}<span>{dueCounts[k]}</span></button>
        ))}
        {(filter.q || filter.stage || filter.source || filter.owner || filter.due) && <button type="button" className="link-btn small" onClick={() => setFilter({ stage: "", source: "", owner: "", due: "", q: "" })}>Süzgeçleri temizle</button>}
      </div>
      {layout === "board" && !embedded
        ? <Board ctx={ctx} leads={shown} activeId={activeId} onOpen={open} />
        : <LeadTable ctx={ctx} leads={shown} activeId={activeId} onOpen={open} compact={embedded} empty={leads.length ? "Süzgece uyan kişi yok." : null} />}
    </>
  );

  return (
    <div className={`proj-section ${embedded ? "leads-embedded" : ""}`}>
      {!embedded && <Kpis ctx={ctx} />}
      {embedded ? (
        <div className="embed-split">
          <div className="embed-split__list">{list}</div>
          <div className="embed-split__side">
            {localLead ? <LeadPanel key={localLead.id} ctx={ctx} lead={localLead} onClose={() => setLocal(null)} step={step} />
              : <Empty icon="user" title="Kişi seçin" text={`Soldan bir kişi seçin: arayın, sonucu tek tıkla kaydedin, sonraki aramayı planlayın.${stage ? ` Liste “${stage.label}” aşamasına süzüldü.` : ""}`} />}
          </div>
        </div>
      ) : list}
      {importing === "excel" && <ImportLeads ctx={ctx} onClose={() => setImporting(null)} />}
      {importing === "contacts" && <PickContacts ctx={ctx} stage={filter.stage} onClose={() => setImporting(null)} />}
    </div>
  );
}

function Kpis({ ctx }) {
  const ls = ctx.stats.leads;
  return (
    <div className="kpis kpis--compact">
      <div className="kpi"><span>Kişi</span><strong>{ls.total}</strong><small>{ls.open} açık</small></div>
      <div className={`kpi ${ls.due ? "kpi--amber" : ""}`}><span>Bugün aranacak</span><strong>{ls.due}</strong><small>gecikmişler dahil</small></div>
      <div className="kpi kpi--green"><span>Kazanılan</span><strong>{money(ls.won_value)}</strong><small>{ls.won} kişi</small></div>
      <div className="kpi kpi--blue"><span>Açık satış hattı</span><strong>{money(ls.pipeline_value)}</strong><small>{ls.lost} kaybedildi</small></div>
    </div>
  );
}

function QuickLead({ inputRef, stage, sources, onAdd }) {
  const [f, setF] = useState({ name: "", phone: "", company: "", source: "" });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() && !f.company.trim()) return;
    await onAdd({ name: f.name.trim() || f.company.trim(), phone: f.phone.trim() || null, company: f.company.trim() || null, source: f.source || null });
    setF({ name: "", phone: "", company: "", source: f.source });
    inputRef.current?.focus();
  };
  return (
    <form className="quickbar quickbar--lead" onSubmit={submit}>
      <Icon name="plus" size={18} />
      <input ref={inputRef} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Kişi adı ekle…  (N)" maxLength={120} aria-label="Ad soyad" />
      <input className="quickbar__mini" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Telefon" maxLength={40} aria-label="Telefon" />
      <input className="quickbar__mini" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Firma / takım" maxLength={160} aria-label="Firma" />
      <select className="select-sm" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Kaynak"><option value="">Kaynak</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      {stage && <span className="pill pill--tool">{stage.label}</span>}
      <button type="submit" className="btn btn--primary btn--sm" disabled={!f.name.trim() && !f.company.trim()}>Ekle</button>
    </form>
  );
}

function ContactButtons({ lead }) {
  const tel = telLink(lead.phone);
  const wa = waLink(lead.phone);
  const mail = mailLink(lead.email);
  const ext = (url) => (e) => { e.stopPropagation(); window.elitlig.app.openExternal(url); };
  return (
    <span className="contact-mini">
      {tel && <button type="button" className="icon-btn icon-btn--xs" title={`Ara: ${prettyPhone(lead.phone)}`} onClick={ext(tel)}><Icon name="phone" size={12} /></button>}
      {wa && <button type="button" className="icon-btn icon-btn--xs icon-btn--wa" title="WhatsApp" onClick={ext(wa)}><Icon name="message" size={12} /></button>}
      {mail && <button type="button" className="icon-btn icon-btn--xs" title={lead.email} onClick={ext(mail)}><Icon name="mail" size={12} /></button>}
    </span>
  );
}

function LeadTable({ ctx, leads, activeId, onOpen, empty, compact = false }) {
  const { settings, people, canEdit, actions } = ctx;
  if (!leads.length) return <Empty icon="users" title={empty ? "Eşleşen kişi yok" : "Henüz kişi yok"} text={empty || "Aradığınız ya da arayacağınız kişileri yukarıdan ekleyin, Excel'den ya da Rehber'den aktarın."} />;
  return (
    <div className="table-wrap">
      <table className="table lead-table">
        <thead><tr><th>Kişi</th><th>İletişim</th><th>Aşama</th><th>Sonraki aksiyon</th>{!compact && <><th className="num">Görüşme</th><th className="num">Tutar</th><th /></>}</tr></thead>
        <tbody>
          {leads.map((l) => {
            const due = leadDueState(l);
            const st = stageOf(settings, l.stage);
            return (
              <tr key={l.id} className={`${String(activeId) === String(l.id) ? "is-selected" : ""} ${due === "overdue" ? "is-overdue" : ""}`} onClick={() => onOpen(l.id)}>
                <td><div className="lead-cell"><Avatar name={l.name} size={28} color={st?.color} /><span><strong>{l.name}</strong><small>{[l.company !== l.name ? l.company : null, l.title, l.city].filter(Boolean).join(" · ") || prettyPhone(l.phone)}</small></span></div></td>
                <td><span className="lead-phone">{l.phone ? prettyPhone(l.phone) : <span className="muted">—</span>}</span><ContactButtons lead={l} /></td>
                <td onClick={(e) => e.stopPropagation()}>
                  {canEdit ? (
                    <span className="stage-select" style={{ "--sc": st?.color || "#64748b" }}>
                      <select value={l.stage} onChange={(e) => actions.updateLead(l, { stage: e.target.value })} aria-label="Aşama">{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                    </span>
                  ) : <StagePill stage={st} small />}
                </td>
                <td className={due === "overdue" ? "text-red" : due === "today" ? "text-amber" : ""}>{l.next_action_at ? <><strong className="small">{formatWhen(l.next_action_at)}</strong><small className="lead-next">{l.next_action}</small></> : <span className="muted small">—</span>}</td>
                {!compact && <><td className="num">{l.contact_count ? <>{l.contact_count}<small className="muted lead-last">{relativeTime(l.last_contact_at)}</small></> : <span className="muted">0</span>}</td>
                <td className="num">{l.value != null ? money(l.value) : <span className="muted">—</span>}</td>
                <td>{l.portfolio_id ? <span className="pill pill--green pill--xs" title="Portföyde"><Icon name="briefcase" size={10} /></span> : l.owner_id && people[l.owner_id] ? <Avatar name={people[l.owner_id].name} size={20} /> : null}</td></>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Board({ ctx, leads, activeId, onOpen }) {
  const { settings, canEdit, actions } = ctx;
  const toast = useToast();
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const columns = useMemo(() => leadColumns(settings, leads), [settings, leads]);
  const drop = async (stageKey) => {
    const lead = leads.find((l) => l.id === drag);
    setDrag(null); setOver(null);
    if (!lead || lead.stage === stageKey || !canEdit) return;
    const st = stageOf(settings, stageKey);
    const r = await actions.updateLead(lead, { stage: stageKey });
    if (r && st?.won && !lead.portfolio_id) toast(`${lead.name} kazanıldı.`, { tone: "success", timeout: 7000, action: { label: "Portföye ekle", run: () => onOpen(lead.id) } });
  };
  return (
    <div className="lead-board">
      {columns.map(({ stage, items, value }) => (
        <section key={stage.key} className={`lead-col ${over === stage.key ? "is-over" : ""}`} style={{ "--sc": stage.color }}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(stage.key); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }} onDrop={(e) => { e.preventDefault(); drop(stage.key); }}>
          <header><span className="lead-col__dot" /><h3>{stage.label}</h3><span>{items.length}</span></header>
          {value > 0 && <small className="lead-col__sum">{money(value)}</small>}
          <div className="lead-col__cards">
            {items.map((l) => {
              const due = leadDueState(l);
              return (
                <article key={l.id} draggable={canEdit} className={`lead-card ${String(activeId) === String(l.id) ? "is-active" : ""} ${drag === l.id ? "is-dragging" : ""} ${due ? `is-${due}` : ""}`}
                  onDragStart={(e) => { setDrag(l.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => onOpen(l.id)}>
                  <strong>{l.name}</strong>
                  {(l.company && l.company !== l.name) && <small>{l.company}</small>}
                  {l.next_action_at && <span className="lead-card__next"><Icon name="clock" size={11} /> {formatWhen(l.next_action_at)}{l.next_action ? ` · ${l.next_action}` : ""}</span>}
                  <footer>
                    {l.contact_count > 0 && <span><Icon name="phone" size={10} /> {l.contact_count}</span>}
                    {l.value != null && <span>{money(l.value)}</span>}
                    <span className="spacer" />
                    <ContactButtons lead={l} />
                  </footer>
                </article>
              );
            })}
            {!items.length && <p className="lead-col__empty">Kişileri buraya sürükleyin</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Excel / CSV'den kişi aktarma. */
function ImportLeads({ ctx, onClose }) {
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(0);
  const [source, setSource] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (file ? parseLeadRows(file.sheets[sheet]?.rows || [], ctx.settings) : null), [file, sheet, ctx.settings]);
  const choose = async () => {
    setError(null);
    try { const f = await pickSheetRows(); if (f) { setFile(f); setSheet(0); } } catch (e) { setError(e?.message || "Dosya okunamadı."); }
  };
  const submit = async () => {
    setBusy(true);
    const r = await ctx.actions.bulkLeads(parsed.items.map((it) => ({ ...it, source: it.source || source || undefined })));
    setBusy(false);
    if (r) onClose();
  };
  return (
    <Modal title="Excel'den kişi aktar" onClose={onClose} width={820} className="modal--wide"
      footer={<><span className="muted small spacer">{parsed?.items?.length ? `${parsed.items.length} kişi · aynı telefon ya da e-postayla kayıtlı olanlar atlanır` : ""}</span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!parsed?.items?.length || busy} onClick={submit}>{busy ? "Aktarılıyor…" : `${parsed?.items?.length || 0} kişiyi ekle`}</button></>}>
      <div className="info-box"><Icon name="grid" /><div>
        <strong>Kişi listesi</strong>
        <span className="muted small">Başlıklar: <b>Ad Soyad</b> (ya da Firma), Telefon, E-posta, Firma / Takım, Unvan, Şehir, Kaynak, Not, Aşama (aşama adıyla), Tutar.</span>
        <span className="row-gap"><button type="button" className="btn btn--primary btn--sm" onClick={choose}><Icon name="upload" size={13} /> {file ? "Başka dosya seç" : "Dosya seç (.xlsx, .csv)"}</button></span>
      </div></div>
      {error && <div className="error-note">{error}</div>}
      {file && (<>
        <div className="filters">
          <strong>{file.name}</strong>
          {file.sheets.length > 1 && <select className="select-sm" value={sheet} onChange={(e) => setSheet(Number(e.target.value))}>{file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select>}
          <span className="spacer" />
          <label className="toggle">Kaynak: <select className="select-sm" value={source} onChange={(e) => setSource(e.target.value)}><option value="">—</option>{(ctx.settings.lead_sources || []).map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        </div>
        {parsed.error ? <div className="error-note">{parsed.error}</div> : (
          <div className="table-wrap import-preview">
            <table className="table">
              <thead><tr><th>Ad</th><th>Firma</th><th>Telefon</th><th>E-posta</th><th>Aşama</th></tr></thead>
              <tbody>{parsed.items.slice(0, 60).map((it, i) => <tr key={i}><td>{it.name}</td><td>{it.company || ""}</td><td>{it.phone || ""}</td><td>{it.email || ""}</td><td>{stageOf(ctx.settings, it.stage)?.label || <span className="muted">{ctx.settings.lead_stages[0]?.label}</span>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </>)}
    </Modal>
  );
}

/** Rehber'den (elle eklenen kişiler + siteye kayıtlı üyeler) seçip projeye ekleme. */
function PickContacts({ ctx, stage, onClose }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q, 250);
  const [manual, setManual] = useState(null);
  const [members, setMembers] = useState({ items: [], loading: false, error: null });
  const [picked, setPicked] = useState(new Map());
  const [busy, setBusy] = useState(false);
  useEffect(() => { get("/api/tools/contacts").then((r) => setManual(r.ok ? r.data?.items || [] : [])); }, []);
  useEffect(() => {
    setMembers((m) => ({ ...m, loading: true }));
    get("/api/tools/contacts/directory", { q: query || undefined, page_size: 40, has_phone: query ? undefined : 1 }).then((r) => setMembers({ items: r.ok ? r.data?.items || [] : [], loading: false, error: r.ok ? null : r.error }));
  }, [query]);
  const rows = useMemo(() => [
    ...(manual || []).filter((c) => !q || includesTr(`${c.name} ${c.company} ${c.phone} ${c.email}`, q)).map((c) => ({ key: `c${c.id}`, name: c.name, company: c.company, title: c.title, phone: c.phone, email: c.email, city: c.city, kind: "Kişi" })),
    ...members.items.map((m) => ({ key: `m${m.id}`, name: m.name, company: m.team?.name || m.player?.team || "", phone: m.phone, email: m.email, city: m.city, kind: "Üye" })),
  ], [manual, members.items, q]);
  const existing = useMemo(() => new Set(ctx.leads.map((l) => String(l.phone || "").replace(/\D/g, "").slice(-10)).filter((p) => p.length >= 7)), [ctx.leads]);
  const toggle = (r) => setPicked((m) => { const n = new Map(m); if (n.has(r.key)) n.delete(r.key); else n.set(r.key, r); return n; });
  const submit = async () => {
    setBusy(true);
    const items = [...picked.values()].map(({ name, company, title, phone, email, city }) => ({ name, company, title, phone, email, city, source: "Rehber", stage: stage || undefined }));
    const r = await ctx.actions.bulkLeads(items);
    setBusy(false);
    if (r) onClose();
  };
  return (
    <Modal title="Rehber'den kişi seç" onClose={onClose} width={640}
      footer={<><span className="muted small spacer">{picked.size} kişi seçildi</span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!picked.size || busy} onClick={submit}>Projeye ekle</button></>}>
      <div className="search-box search-box--full"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rehberde ve üyelerde ara" autoFocus /></div>
      {members.error && members.error.status === 403 && <p className="muted small">Üye rehberine erişiminiz yok; yalnız kendi kişileriniz listelenir.</p>}
      {manual == null ? <Spinner /> : (
        <div className="pick-rows">
          {rows.map((r) => {
            const dup = existing.has(String(r.phone || "").replace(/\D/g, "").slice(-10));
            return (
              <label key={r.key} className={`pick-row ${picked.has(r.key) ? "is-on" : ""} ${dup ? "is-dup" : ""}`}>
                <input type="checkbox" checked={picked.has(r.key)} disabled={dup} onChange={() => toggle(r)} />
                <Avatar name={r.name} size={26} />
                <span><strong>{r.name}</strong><small>{[r.kind, r.company, prettyPhone(r.phone), r.city].filter(Boolean).join(" · ")}</small></span>
                {dup && <span className="pill pill--xs">Projede var</span>}
              </label>
            );
          })}
          {!rows.length && !members.loading && <p className="muted small">Sonuç yok.</p>}
          {members.loading && <Spinner label="Üyeler aranıyor…" />}
        </div>
      )}
    </Modal>
  );
}
