// Kişiler (CRM): tablo ve aşama panosu, süzgeçler, hızlı ekleme, Excel'den ve
// Rehber'den aktarma (Directory.jsx). Müşteri ve tedarik görüşmeleri ayrı listelenir. Adımın içinde (embedded) açıldığında kişi ayrıntısı aynı
// pencerede sağda açılır.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Icon, MenuButton, Modal, Segmented, Spinner, useToast } from "../../components/ui";
import { useCommand } from "../../api";
import { filterLeads, formatWhen, kindSettings, leadColumns, leadDueState, leadKind, leadsOfKind, parseLeadRows, stageOf, supplierQuotes, waLink, telLink, mailLink } from "../../lib/projectUtils";
import { prettyPhone, relativeTime } from "../../lib/helpers";
import { Avatar, StagePill, money, pickSheetRows } from "./common";
import LeadPanel from "./LeadPanel";
import DirectoryImport from "./Directory";

const store = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

export default function Leads({ ctx: baseCtx, selectedId, initialFilter, initialKind, embedded = false, step = null }) {
  const selectedLead = selectedId ? baseCtx.leads.find((l) => String(l.id) === String(selectedId)) : null;
  const [kind, setKindState] = useState(() => initialKind || (selectedLead ? leadKind(selectedLead) : embedded ? "customer" : store("proj:leadKind", "customer")));
  const setKind = (k) => { setKindState(k); setFilter((f) => ({ ...f, stage: "", source: "" })); if (!embedded) try { localStorage.setItem("proj:leadKind", JSON.stringify(k)); } catch { /* yoksay */ } };
  // Bu görünümde ayarlar türün aşama / sonuç listeleriyle gelir; kişiler türe süzülür.
  const ctx = useMemo(() => ({ ...baseCtx, settings: kindSettings(baseCtx.settings, kind), allLeads: baseCtx.leads, leads: leadsOfKind(baseCtx.leads, kind), kind }), [baseCtx, kind]);
  const { leads, settings, people, canEdit, actions, me } = ctx;
  const supplier = kind === "supplier";
  const toast = useToast();
  const [filter, setFilter] = useState(() => ({ stage: "", source: "", owner: "", due: "", q: "", ...(initialFilter || {}) }));
  const [layout, setLayout] = useState(() => (embedded ? "table" : store("proj:leadLayout", "table")));
  const [local, setLocal] = useState(null);
  const [importing, setImporting] = useState(null); // "excel" | "directory"
  const quickRef = useRef(null);
  useEffect(() => { if (!embedded) try { localStorage.setItem("proj:leadLayout", JSON.stringify(layout)); } catch { /* yoksay */ } }, [layout, embedded]);
  useEffect(() => { if (selectedLead && leadKind(selectedLead) !== kind) setKindState(leadKind(selectedLead)); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useCommand("new", () => { if (!embedded) quickRef.current?.focus(); });
  useCommand("find", () => { if (!embedded) document.getElementById("lead-search")?.focus(); });

  const shown = useMemo(() => filterLeads(leads, filter, { meId: me, settings }), [leads, filter, me, settings]);
  const base = useMemo(() => filterLeads(leads, { ...filter, due: "" }, { meId: me, settings }), [leads, filter, me, settings]);
  const dueCounts = useMemo(() => ({
    "": base.length, due: base.filter((l) => ["today", "overdue"].includes(leadDueState(l))).length,
    overdue: base.filter((l) => leadDueState(l) === "overdue").length, none: filterLeads(base, { due: "none" }, { settings }).length,
  }), [base, settings]);
  const sources = useMemo(() => [...new Set([...((supplier ? settings.supplier_categories : settings.lead_sources) || []), ...leads.map((l) => l.source).filter(Boolean)])], [settings, leads, supplier]);
  const items = useMemo(() => [...new Set(leads.map((l) => l.item).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [leads]);
  const owners = useMemo(() => [...new Set(leads.map((l) => l.owner_id).filter(Boolean))], [leads]);
  const open = (id) => (embedded ? setLocal(id) : ctx.openLead(id));
  const activeId = embedded ? local : selectedId;
  const localLead = embedded && local ? baseCtx.leads.find((l) => String(l.id) === String(local)) : null;
  const stage = filter.stage ? stageOf(settings, filter.stage) : null;
  const allCount = { customer: leadsOfKind(baseCtx.leads, "customer").length, supplier: leadsOfKind(baseCtx.leads, "supplier").length };

  const quickAdd = async (body) => {
    const item = await actions.createLead({ ...body, kind, stage: body.stage || filter.stage || undefined });
    if (item) toast(`${item.name} eklendi.`, { tone: "success", action: { label: "Aç", run: () => open(item.id) } });
  };

  const list = (
    <>
      {canEdit && <QuickLead inputRef={quickRef} stage={stage} sources={sources} items={items} supplier={supplier} onAdd={quickAdd} />}
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input id={embedded ? undefined : "lead-search"} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder={supplier ? "Tedarikçi, konu, telefon, not…" : "Ad, firma, telefon, not…"} /></div>
        <select className="select-sm" value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })} aria-label="Aşama">
          <option value="">Tüm aşamalar</option>{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>{s.label} ({leads.filter((l) => l.stage === s.key).length})</option>)}
        </select>
        <select className="select-sm" value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })} aria-label={supplier ? "Kategori" : "Kaynak"}>
          <option value="">{supplier ? "Tüm kategoriler" : "Tüm kaynaklar"}</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!embedded && <select className="select-sm" value={filter.owner} onChange={(e) => setFilter({ ...filter, owner: e.target.value })} aria-label="Takip eden">
          <option value="">Herkesin</option><option value="me">Benim takip ettiklerim</option>{owners.filter((o) => o !== me).map((o) => <option key={o} value={o}>{people[o]?.name || `#${o}`}</option>)}
        </select>}
        <span className="spacer" />
        {!embedded && <Segmented size="sm" value={layout} onChange={setLayout} options={[{ value: "table", label: "Tablo", icon: "list" }, { value: "board", label: "Pano", icon: "board" }]} />}
        {canEdit && <button type="button" className="btn btn--sm" onClick={() => setImporting("directory")}><Icon name="users" size={13} /> Rehberden ekle</button>}
        {canEdit && <MenuButton icon="upload" label="İçe aktar" items={[{ label: "Excel / CSV'den aktar", icon: "grid", onClick: () => setImporting("excel") }, { label: "Rehberden ekle (Rehberim, üye rehberi, portföy)", icon: "users", onClick: () => setImporting("directory") }]} />}
      </div>
      <div className="contact-filters">
        {[["", "Tümü"], ["due", supplier ? "Bugün aranacak / dönülecek" : "Bugün aranacak"], ["overdue", "Gecikmiş"], ["none", "Aksiyonsuz"]].map(([k, l]) => (
          <button key={k} type="button" className={filter.due === k ? "is-active" : ""} onClick={() => setFilter({ ...filter, due: k })}>{k === "overdue" && dueCounts.overdue ? <Icon name="alert" size={12} /> : null}{l}<span>{dueCounts[k]}</span></button>
        ))}
        {(filter.q || filter.stage || filter.source || filter.owner || filter.due) && <button type="button" className="link-btn small" onClick={() => setFilter({ stage: "", source: "", owner: "", due: "", q: "" })}>Süzgeçleri temizle</button>}
      </div>
      {layout === "board" && !embedded
        ? <Board ctx={ctx} leads={shown} activeId={activeId} onOpen={open} />
        : supplier
          ? <SupplierTable ctx={ctx} leads={shown} activeId={activeId} onOpen={open} compact={embedded || Boolean(selectedId)} empty={leads.length ? "Süzgece uyan tedarikçi yok." : null} />
          : <LeadTable ctx={ctx} leads={shown} activeId={activeId} onOpen={open} compact={embedded} empty={leads.length ? "Süzgece uyan kişi yok." : null} />}
    </>
  );

  return (
    <div className={`proj-section ${embedded ? "leads-embedded" : ""}`}>
      <div className="kind-switch">
        <Segmented value={kind} onChange={setKind} options={[{ value: "customer", label: "Müşteri görüşmeleri", icon: "users", count: allCount.customer }, { value: "supplier", label: "Tedarik görüşmeleri", icon: "handshake", count: allCount.supplier }]} ariaLabel="Görüşme türü" />
        <small className="muted">{supplier ? "Maliyet oluşturan görüşmeler: fiyat al, karşılaştır, anlaş — tamamlanınca tutar bütçeye gider olarak yazılır." : "Satış görüşmeleri: ara, sonucu kaydet, kapat — kazanılan portföye (ve istenirse gelire) geçer."}</small>
      </div>
      {!embedded && (supplier ? <SupplierKpis ctx={baseCtx} /> : <Kpis ctx={baseCtx} />)}
      {embedded ? (
        <div className="embed-split">
          <div className="embed-split__list">{list}</div>
          <div className="embed-split__side">
            {localLead ? <LeadPanel key={localLead.id} ctx={baseCtx} lead={localLead} onClose={() => setLocal(null)} step={step} />
              : <Empty icon={supplier ? "handshake" : "user"} title={supplier ? "Tedarikçi seçin" : "Kişi seçin"} text={supplier ? "Soldan bir tedarikçi seçin: fiyat isteyin, teklifi kaydedin, diğerleriyle karşılaştırın, anlaşınca gidere yazın." : `Soldan bir kişi seçin: arayın, sonucu tek tıkla kaydedin, sonraki aramayı planlayın.${stage ? ` Liste “${stage.label}” aşamasına süzüldü.` : ""}`} />}
          </div>
        </div>
      ) : list}
      {importing === "excel" && <ImportLeads ctx={ctx} onClose={() => setImporting(null)} />}
      {importing === "directory" && <DirectoryImport ctx={baseCtx} kind={kind} stage={filter.stage} onClose={() => setImporting(null)} />}
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

function SupplierKpis({ ctx }) {
  const ss = ctx.stats.suppliers;
  const suppliers = leadsOfKind(ctx.leads, "supplier");
  const topics = new Set(suppliers.map((l) => String(l.item || "").trim().toLocaleLowerCase("tr-TR")).filter(Boolean)).size;
  const quoted = suppliers.filter((l) => l.value != null).length;
  return (
    <div className="kpis kpis--compact">
      <div className="kpi"><span>Tedarikçi</span><strong>{ss.total}</strong><small>{topics} konu · {ss.open} açık</small></div>
      <div className={`kpi ${ss.due ? "kpi--amber" : ""}`}><span>Bugün dönülecek</span><strong>{ss.due}</strong><small>gecikmişler dahil</small></div>
      <div className="kpi kpi--blue"><span>Teklif alınan</span><strong>{quoted}</strong><small>açık teklifler {money(ss.pipeline_value)}</small></div>
      <div className="kpi kpi--red"><span>Anlaşılan (gider)</span><strong>{money(ss.won_value)}</strong><small>{ss.won} anlaşma · {ss.lost} vazgeçildi</small></div>
    </div>
  );
}

function QuickLead({ inputRef, stage, sources, items, supplier, onAdd }) {
  const [f, setF] = useState({ name: "", phone: "", company: "", source: "", item: "" });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() && !f.company.trim()) return;
    await onAdd({ name: f.name.trim() || f.company.trim(), phone: f.phone.trim() || null, company: f.company.trim() || null, source: f.source || null, ...(supplier ? { item: f.item.trim() || null } : {}) });
    setF({ name: "", phone: "", company: "", source: f.source, item: f.item });
    inputRef.current?.focus();
  };
  return (
    <form className="quickbar quickbar--lead" onSubmit={submit}>
      <Icon name="plus" size={18} />
      <input ref={inputRef} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={supplier ? "Tedarikçi ekle (firma ya da kişi)…  (N)" : "Kişi adı ekle…  (N)"} maxLength={120} aria-label={supplier ? "Tedarikçi" : "Ad soyad"} />
      {supplier && <><input className="quickbar__mini" list="supplier-items" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder="Konu (ör. Kupa)" maxLength={160} aria-label="Tedarik konusu" /><datalist id="supplier-items">{items.map((i) => <option key={i} value={i} />)}</datalist></>}
      <input className="quickbar__mini" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Telefon" maxLength={40} aria-label="Telefon" />
      {!supplier && <input className="quickbar__mini" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Firma / takım" maxLength={160} aria-label="Firma" />}
      <select className="select-sm" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label={supplier ? "Kategori" : "Kaynak"}><option value="">{supplier ? "Kategori" : "Kaynak"}</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
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

function SupplierTable({ ctx, leads, activeId, onOpen, empty, compact = false }) {
  const { settings, canEdit, actions, allLeads } = ctx;
  if (!leads.length) return <Empty icon="handshake" title={empty ? "Eşleşen tedarikçi yok" : "Henüz tedarikçi yok"} text={empty || "Fiyat alacağınız tesis, kupa, baskı, yayın gibi tedarikçileri yukarıdan ekleyin ya da Rehber'den aktarın. Aynı konuya birden çok tedarikçi ekleyip teklifleri karşılaştırın."} />;
  return (
    <div className="table-wrap">
      <table className="table lead-table supplier-table">
        <thead><tr><th>Tedarikçi</th><th>Konu</th>{!compact && <th>Kategori</th>}<th className="num">Teklif</th><th>Aşama</th><th>Sonraki aksiyon</th></tr></thead>
        <tbody>
          {leads.map((l) => {
            const due = leadDueState(l);
            const st = stageOf(settings, l.stage);
            const q = l.item && l.value != null ? supplierQuotes(allLeads, l, settings) : null;
            const best = q?.rows.find((r) => r.cheapest)?.lead.id === l.id;
            return (
              <tr key={l.id} className={`${String(activeId) === String(l.id) ? "is-selected" : ""} ${due === "overdue" ? "is-overdue" : ""}`} onClick={() => onOpen(l.id)}>
                <td><div className="lead-cell"><Avatar name={l.company || l.name} size={28} color={st?.color} /><span className="lead-cell__text"><strong>{l.company || l.name}</strong><small>{[l.company && l.name !== l.company ? l.name : null, compact ? null : prettyPhone(l.phone)].filter(Boolean).join(" · ") || prettyPhone(l.phone) || "—"}</small></span><ContactButtons lead={l} /></div></td>
                <td>{l.item ? <strong className="small">{l.item}</strong> : <span className="muted">—</span>}{q && q.quoted > 1 && <small className="muted lead-next">{q.quoted} teklif</small>}</td>
                {!compact && <td>{l.source || <span className="muted">—</span>}</td>}
                <td className="num">{l.value != null ? <span className={best ? "quote-best" : ""}>{best && <Icon name="check" size={11} strokeWidth={3} />}{money(l.value)}</span> : <span className="muted">—</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {canEdit ? (
                    <span className="stage-select" style={{ "--sc": st?.color || "#64748b" }}>
                      <select value={l.stage} onChange={(e) => actions.updateLead(l, { stage: e.target.value })} aria-label="Aşama">{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                    </span>
                  ) : <StagePill stage={st} small />}
                </td>
                <td className={due === "overdue" ? "text-red" : due === "today" ? "text-amber" : ""}>{l.next_action_at ? <><strong className="small">{formatWhen(l.next_action_at)}</strong><small className="lead-next">{l.next_action}</small></> : <span className="muted small">—</span>}</td>
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
    if (r && st?.won && lead.kind === "supplier") toast(`${lead.company || lead.name}: anlaşıldı. Tutarı gidere yazmak için “İşlemi tamamla”yı kullanın.`, { tone: "success", timeout: 7000, action: { label: "Aç", run: () => onOpen(lead.id) } });
    else if (r && st?.won && !lead.portfolio_id) toast(`${lead.name} kazanıldı.`, { tone: "success", timeout: 7000, action: { label: "Portföye ekle", run: () => onOpen(lead.id) } });
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
                  <strong>{l.kind === "supplier" ? l.company || l.name : l.name}</strong>
                  {l.kind === "supplier" ? (l.item || (l.company && l.name !== l.company)) && <small>{[l.item, l.company && l.name !== l.company ? l.name : null].filter(Boolean).join(" · ")}</small> : (l.company && l.company !== l.name) && <small>{l.company}</small>}
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
            {!items.length && <p className="lead-col__empty">{ctx.kind === "supplier" ? "Tedarikçileri buraya sürükleyin" : "Kişileri buraya sürükleyin"}</p>}
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
    const r = await ctx.actions.bulkLeads(parsed.items.map((it) => ({ ...it, kind: ctx.kind, source: it.source || source || undefined })));
    setBusy(false);
    if (r) onClose();
  };
  return (
    <Modal title={ctx.kind === "supplier" ? "Excel'den tedarikçi aktar" : "Excel'den kişi aktar"} onClose={onClose} width={820} className="modal--wide"
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
          <label className="toggle">Kaynak: <select className="select-sm" value={source} onChange={(e) => setSource(e.target.value)}><option value="">—</option>{((ctx.kind === "supplier" ? ctx.settings.supplier_categories : ctx.settings.lead_sources) || []).map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
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
