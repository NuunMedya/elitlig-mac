// Projeler → Saha ve maç: projenin maçları ve sitedeki saha / maç planlama
// masası (proje sahalarına süzülü).
//   Maçlar   — haftalara / günlere gruplu liste, aşama (planlandı → teyit →
//              oynandı), kontrol listesi, not, maç ücretleri (bütçeye ve maç
//              hesabına yazılır), "Maç oluştur" (sitedeki maç oluşturma akışı)
//              ve "Maç bağla" (sitedeki mevcut maçlar).
//   Program, Talepler, Bekleyenler, Takımlar, Kayıtlar — çağrı merkezi.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, Modal, Spinner, useConfirm, useToast } from "../../components/ui";
import { del, patch, request, useResource } from "../../api";
import { AccountSelectField, EntryStatusPill } from "../../components/finance";
import { parseAmount } from "../../lib/ledgerUtils";
import { formatDate } from "../../lib/helpers";
import { MATCH_SCREENS, MATCH_STAGE_TONE, SOURCE_LABELS, dayLabel, feePreview, feeTotals, filterMatches, groupMatchesByWeek, localIso, matchChecklist, matchStatusLabel, matchSitePath, venueOfMatch } from "../../lib/planningUtils";
import Desk from "../planning/Desk";
import { SidePanel, Tag, openSite } from "../planning/shared";
import { BASE, FINANCE_EVENT, money, useRun } from "./common";
import { useProjectFinance } from "./Budget";
import { CrewPanel } from "../todos/MatchDesk";

/** Skor yalnız oynanmış / başlamış maçta: sitede yeni oluşturulan maç 0-0 ile kaydedilir (taslak / zamanlandı). */
const scoreOf = (m) => (m.home_score != null && m.away_score != null && !["taslak", "zamanlandi"].includes(String(m.site_status || "").toLowerCase()) ? `${m.home_score} – ${m.away_score}` : null);
export const matchPlanning = (settings) => settings?.match_planning || {};
export const matchesEnabled = (settings) => Boolean(settings?.match_planning?.enabled);

/** Projenin maç listesi (Genel bakış kartı, Saha ve maç sekmesi). */
export function useProjectMatches(projectId, { enabled = true } = {}) {
  return useResource(`${BASE}/${projectId}/matches`, null, { enabled });
}

export default function ProjectMatches({ ctx, embedded = false, initialView }) {
  const { project, settings, actions, canEdit } = ctx;
  const mp = matchPlanning(settings);
  const res = useProjectMatches(project.id);
  const run = useRun();
  const toast = useToast();
  const setPlanning = (changes) => actions.updateProject({ settings: { match_planning: changes } }, { silent: true });
  const venueIds = mp.venue_ids || [];
  const extraViews = useMemo(() => [{
    key: "matches", label: "Maçlar", short: "Maçlar", icon: "ball", badge: res.data?.summary?.this_week || null,
    render: (api) => <MatchList ctx={ctx} res={res} api={api} />,
  }], [ctx, res]);
  return (
    <div className={`proj-section proj-matches ${embedded ? "is-embedded" : ""}`}>
      <Desk
        scope={{ venueIds, leagueIds: mp.league_ids || [], seasonIds: mp.season_ids || [], projectName: project.name }}
        extraViews={extraViews}
        initialView={initialView}
        viewKey={`project:${project.id}:matches${embedded ? ":tool" : ""}`}
        onMatchCreated={async (matchId, label) => {
          const r = await request({ method: "POST", path: `${BASE}/${project.id}/matches/link`, body: { match_ids: [matchId], created: true, label }, queue: false });
          if (r.ok) { toast(`Maç projeye bağlandı: ${label}`, { tone: "success" }); res.reload({ quiet: true }); actions.reload(); } else run(r);
        }}
        onVenueCreated={canEdit ? async (v) => { await setPlanning({ venue_ids: [...new Set([...venueIds, v.id])] }); toast(`“${v.name}” projenin sahalarına eklendi.`, { tone: "success" }); res.reload({ quiet: true }); } : undefined}
        onToggleProjectVenue={canEdit ? async (v, on) => { await setPlanning({ venue_ids: on ? [...new Set([...venueIds, v.id])] : venueIds.filter((x) => Number(x) !== Number(v.id)) }); res.reload({ quiet: true }); } : undefined}
        onAddLeads={canEdit ? async (items) => Boolean(await actions.bulkLeads(items)) : undefined}
      />
    </div>
  );
}

/* ================================ Maç listesi ================================ */

function MatchList({ ctx, res, api }) {
  const { project, settings, canEdit } = ctx;
  const mp = matchPlanning(settings);
  const run = useRun();
  const [f, setF] = useState({ stage: "", venue: "", when: "upcoming", q: "", fees: "" });
  const [openId, setOpenId] = useState(null);
  const [linking, setLinking] = useState(false);
  const [fees, setFees] = useState(null);
  const d = res.data;
  const today = localIso();
  const items = useMemo(() => d?.items || [], [d]);
  const shown = useMemo(() => filterMatches(items, f, today), [items, f, today]);
  const groups = useMemo(() => groupMatchesByWeek(shown, today), [shown, today]);
  const stages = d?.stages || [];
  const s = d?.summary || {};
  const perms = d?.permissions || api.permissions || {};
  const canCreate = canEdit && (perms.matches_create || perms.venues_manage) && perms.venues_view !== false;
  const venues = d?.venues || [];
  const open = items.find((m) => m.id === openId) || null;
  const setStage = async (m, stage) => {
    res.setData((x) => ({ ...x, items: x.items.map((i) => (i.id === m.id ? { ...i, stage } : i)) }));
    const r = await patch(`${BASE}/${project.id}/matches/${m.id}`, { stage });
    if (!run(r, `${m.home} – ${m.away}: ${stages.find((st) => st.key === stage)?.label || stage}`) || !r.queued) res.reload({ quiet: true });
  };
  const kpi = (key, label, value, sub, tone, filter) => (
    <button type="button" className={`kpi kpi--btn ${tone ? `kpi--${tone}` : ""}`} onClick={() => setF({ stage: "", venue: "", q: "", fees: "", when: "", ...filter })}><span>{label}</span><strong>{value ?? 0}</strong><small>{sub}</small></button>
  );
  if (res.loading && !d) return <Spinner />;
  if (res.error && !d) return <ErrorNote error={res.error} onRetry={res.reload} />;
  return (
    <div className="pl-matches">
      <div className="kpis kpis--compact">
        {kpi("week", "Bu hafta", s.this_week, `${s.upcoming || 0} yaklaşan maç`, "hero", { when: "upcoming" })}
        {kpi("unconfirmed", "Teyit bekleyen", s.unconfirmed, "planlandı / teyit bekleniyor", s.unconfirmed ? "amber" : "", { when: "upcoming", stage: "unconfirmed" })}
        {kpi("played", "Oynanan", s.played, `${s.total || 0} maç toplam`, "green", { stage: "oynandi" })}
        {kpi("fees", "Ücreti yazılmamış", s.fees_missing, "bütçeye yazılmayan maç", s.fees_missing ? "red" : "", { fees: "missing" })}
      </div>
      <div className="filters">
        <select className="select-sm" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} aria-label="Zaman"><option value="upcoming">Yaklaşan</option><option value="past">Geçmiş</option><option value="">Tüm maçlar</option></select>
        <select className="select-sm" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} aria-label="Aşama"><option value="">Tüm aşamalar</option><option value="unconfirmed">Teyidi alınmamış (planlandı + teyit bekleniyor)</option>{stages.map((st) => <option key={st.key} value={st.key}>{st.label} ({s.by_stage?.[st.key] || 0})</option>)}</select>
        <select className="select-sm" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} aria-label="Saha"><option value="">Tüm sahalar</option>{[...new Set([...venues.map((v) => v.name), ...items.map((m) => m.field).filter(Boolean)])].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        {f.fees && <button type="button" className="chip" onClick={() => setF({ ...f, fees: "" })}>Ücreti yazılmamış ×</button>}
        <div className="search-box"><Icon name="search" size={13} /><input value={f.q} placeholder="Takım, saha, lig, not…" onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Maçlarda ara" /></div>
        <span className="spacer" />
        {canEdit && <button type="button" className="btn btn--sm" onClick={() => setLinking(true)}><Icon name="link" size={13} /> Maç bağla</button>}
        {canEdit && <button type="button" className="btn btn--sm btn--primary" disabled={!canCreate} title={canCreate ? "Sitedeki maç oluşturma akışı: iki takım, saha ve saat, lig ve sezon" : "Maç oluşturmak için saha yönetimi yetkisi gerekir"} onClick={() => api.openNew({ kind: "match_entry", venueId: api.venues[0]?.public_id })}><Icon name="plus" size={13} /> Maç oluştur</button>}
      </div>
      <p className="muted small"><Icon name="alert" size={11} /> Projenin maçları: projeden oluşturulan ya da bağlanan maçlar, proje sahalarının saatlerine yazılan maçlar{mp.include_league_matches && (mp.league_ids?.length || mp.season_ids?.length) ? " ve proje lig / sezonunun proje tarihlerindeki maçları" : ""}. Maçlar sitede (Maçlar) her zamanki gibi görünür.</p>
      {!items.length ? (
        <Empty icon="ball" title="Projede henüz maç yok" text={venues.length ? "Program'dan saat eşleştirerek ya da “Maç oluştur” ile maç kurun; sitedeki maçları “Maç bağla” ile ekleyin." : "Ayarlar → Saha ve maç planlama'dan proje sahalarını, ligini ve sezonunu seçin; ya da “Maç oluştur / Maç bağla” ile başlayın."}
          action={canEdit && <div className="row-gap"><button type="button" className="btn" onClick={() => setLinking(true)}><Icon name="link" size={13} /> Maç bağla</button>{canCreate && <button type="button" className="btn btn--primary" onClick={() => api.openNew({ kind: "match_entry" })}><Icon name="plus" size={13} /> Maç oluştur</button>}</div>} />
      ) : !shown.length ? <p className="muted pl-empty">Süzgece uyan maç yok.</p> : groups.map((w) => (
        <section key={w.key} className={`card pl-week ${w.current ? "is-current" : ""} ${w.past ? "is-past" : ""}`}>
          <header className="card__head"><h2 className="card__title"><Icon name="calendar" /> {w.label}</h2><span className="muted small">{w.count} maç</span></header>
          {w.days.map((day) => (
            <div key={day.date} className="pl-mday">
              <h4>{day.label}</h4>
              <ul className="pl-mrows">
                {day.items.map((m) => {
                  const st = stages.find((x) => x.key === m.stage);
                  const score = scoreOf(m);
                  return (
                    <li key={m.id} className={`pl-mrow ${openId === m.id ? "is-selected" : ""}`} style={{ "--sc": st?.color || "#64748b" }}>
                      <button type="button" className="pl-mrow__main" onClick={() => setOpenId(m.id)}>
                        <span className="pl-mrow__time">{m.time || "—"}</span>
                        <span className="pl-mrow__teams"><strong>{m.home} <em>{score || "–"}</em> {m.away}</strong><small className="muted">{[m.field, m.league, m.season].filter(Boolean).join(" · ")}</small></span>
                      </button>
                      <span className="pl-mrow__meta">
                        {m.source && <Tag title="Projeye nasıl girdi">{SOURCE_LABELS[m.source] || m.source}</Tag>}
                        {m.finance ? <Tag tone={m.finance.open ? "amber" : "green"} icon="wallet" title="Bütçedeki maç kalemleri">{money(m.finance.income - m.finance.expense)}{m.finance.open ? ` · ${m.finance.open} açık` : ""}</Tag> : m.stage !== "ertelendi" && <Tag tone="red" icon="wallet">ücret yok</Tag>}
                        <select className={`pl-stage-select is-${MATCH_STAGE_TONE[m.stage] || "plain"}`} value={m.stage} disabled={!canEdit} onChange={(e) => setStage(m, e.target.value)} aria-label="Maç aşaması">{stages.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {open && <MatchDrawer ctx={ctx} match={open} stages={stages} venues={venues} api={api} onClose={() => setOpenId(null)} onFees={() => setFees(open)} onChanged={() => res.reload({ quiet: true })} setLocal={(patchItem) => res.setData((x) => ({ ...x, items: x.items.map((i) => (i.id === open.id ? { ...i, ...patchItem } : i)) }))} />}
      {fees && <FeesDialog ctx={ctx} match={fees} onClose={() => setFees(null)} onDone={() => { setFees(null); res.reload({ quiet: true }); window.dispatchEvent(new Event(FINANCE_EVENT)); }} />}
      {linking && <LinkDialog ctx={ctx} linked={new Set(items.map((m) => m.id))} onClose={() => setLinking(false)} onDone={() => { setLinking(false); res.reload({ quiet: true }); }} />}
    </div>
  );
}

/* ================================ Maç ayrıntısı ================================ */

function MatchDrawer({ ctx, match: m, stages, venues, api, onClose, onFees, onChanged, setLocal }) {
  const { project, settings, canEdit } = ctx;
  const run = useRun();
  const confirm = useConfirm();
  const fin = useProjectFinance(project.id);
  const [note, setNote] = useState(m.note || "");
  const [item, setItem] = useState("");
  const checklist = matchChecklist(m, matchPlanning(settings));
  const lines = (fin.data?.items || []).filter((e) => Number(e.match_id) === Number(m.id));
  const venue = venueOfMatch(m, api.allVenues || venues);
  const save = async (body, okMsg) => {
    setLocal(body);
    const r = await patch(`${BASE}/${project.id}/matches/${m.id}`, body);
    if (!run(r, okMsg) || !r.queued) onChanged();
  };
  const unlink = async () => {
    if (!(await confirm({ title: "Projeden çıkar", message: `“${m.home} – ${m.away}” projenin listesinden çıkarılsın mı? Maç sitede kalır; bütçedeki kalemleri silinmez.`, confirmLabel: "Projeden çıkar", danger: true }))) return;
    if (run(await del(`${BASE}/${project.id}/matches/${m.id}`), "Maç projeden çıkarıldı.")) { onClose(); onChanged(); }
  };
  const done = checklist.filter((c) => c.done).length;
  const st = stages.find((x) => x.key === m.stage);
  return (
    <SidePanel eyebrow={[dayLabel(m.date), m.time].filter(Boolean).join(" · ")} title={`${m.home} – ${m.away}`} badge={<span className="row-gap"><Tag tone={MATCH_STAGE_TONE[m.stage]} solid={Boolean(MATCH_STAGE_TONE[m.stage])}>{st?.label || m.stage}</Tag>{m.site_status && <Tag title="Sitedeki maç durumu">Sitede: {matchStatusLabel(m.site_status)}</Tag>}</span>} onClose={onClose} width={520}
      footer={<div className="row-gap"><span className="muted small spacer">Maç #{m.id} · {SOURCE_LABELS[m.source] || ""}</span>{canEdit && <button type="button" className="btn btn--sm btn--danger-ghost" onClick={unlink}><Icon name="x" size={12} /> Projeden çıkar</button>}</div>}>
      <section className="pl-scorecard"><div><strong>{m.home}</strong></div><div className="pl-scorecard__score"><strong>{scoreOf(m) || "vs"}</strong><small>{m.time || ""}</small></div><div><strong>{m.away}</strong></div></section>
      <dl className="kv">
        <dt>Tarih</dt><dd>{m.date ? formatDate(`${m.date}T12:00:00`, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"} {m.time || ""}</dd>
        <dt>Saha</dt><dd>{m.field || "—"}</dd>
        <dt>Lig / sezon</dt><dd>{[m.league, m.season].filter(Boolean).join(" · ") || "—"}</dd>
        {m.city && <><dt>İl</dt><dd>{m.city}</dd></>}
      </dl>
      <div className="row-gap">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => openSite(matchSitePath(m.id))}><Icon name="external" size={12} /> Sitede aç</button>
        {MATCH_SCREENS.slice(1).map((s) => <button key={s.key} type="button" className="btn btn--xs btn--ghost" onClick={() => openSite(s.path(m.id))}>{s.label}</button>)}
        {venue && m.date && m.time && <button type="button" className="btn btn--xs btn--ghost" onClick={() => { const [h, mi] = m.time.split(":").map(Number); onClose(); api.jumpToCell({ venue_public_id: venue.public_id, date: m.date, hour: h, minute: mi || 0 }); }}><Icon name="calendar" size={11} /> Programda aç</button>}
      </div>
      <section className="pl-section">
        <div className="pl-section__head"><h3>Projedeki aşama</h3>{m.stage_set === false && <small className="muted">maçın sitedeki durumundan</small>}</div>
        <div className="pl-stagebar">{stages.map((x) => <button key={x.key} type="button" disabled={!canEdit} className={`is-${MATCH_STAGE_TONE[x.key] || "plain"} ${m.stage === x.key ? "is-active" : ""}`} onClick={() => x.key !== m.stage && save({ stage: x.key }, `Aşama: ${x.label}`)}>{x.label}</button>)}</div>
      </section>
      {canEdit && <CrewPanel matchId={m.id} canAssign />}
      <section className="pl-section">
        <div className="pl-section__head"><h3>Kontrol listesi <span className="muted">{done}/{checklist.length}</span></h3></div>
        {checklist.length > 0 && <div className="progress"><span style={{ width: `${(done / checklist.length) * 100}%` }} /></div>}
        <ul className="checklist">
          {checklist.map((c, i) => (
            <li key={`${c.text}${i}`}><input type="checkbox" checked={c.done} disabled={!canEdit} onChange={() => save({ checklist: checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} /><span className={c.done ? "is-done" : ""}>{c.text}</span>
              {canEdit && <button type="button" className="icon-btn icon-btn--xs" onClick={() => save({ checklist: checklist.filter((_, j) => j !== i) })} aria-label="Sil"><Icon name="x" size={11} /></button>}</li>
          ))}
        </ul>
        {canEdit && <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (item.trim()) { save({ checklist: [...checklist, { text: item.trim().slice(0, 120), done: false }] }); setItem(""); } }}><input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Bu maça madde ekle ve ↩" /></form>}
      </section>
      <section className="pl-section">
        <div className="pl-section__head"><h3>Not</h3></div>
        <textarea rows={3} value={note} readOnly={!canEdit} placeholder="Maçla ilgili not: teyit, saha, ekip…" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (m.note || "") && save({ note }, "Not kaydedildi.")} />
      </section>
      <section className="pl-section">
        <div className="pl-section__head"><h3><Icon name="wallet" size={13} /> Bütçedeki kalemleri</h3>{m.fees_at && <small className="muted">ücretler {formatDate(m.fees_at)} yazıldı</small>}</div>
        {lines.length ? (
          <ul className="pl-feelines">
            {lines.map((e) => <li key={e.id}><span><strong>{e.description || e.category}</strong><small className="muted">{[e.party, e.account_name].filter(Boolean).join(" · ")}</small></span><EntryStatusPill entry={e} small /><strong className={e.type === "income" ? "text-green" : "text-red"}>{e.type === "income" ? "+" : "−"}{money(e.effective ?? e.amount ?? e.estimate)}</strong></li>)}
          </ul>
        ) : <p className="muted small">Bu maçın bütçede kalemi yok.</p>}
        {canEdit && <button type="button" className="btn btn--sm btn--soft" onClick={onFees}><Icon name="plus" size={12} /> Ücretleri bütçeye yaz</button>}
        {lines.length > 0 && <button type="button" className="link-btn small" onClick={() => { onClose(); ctx.setTab("budget", { budgetFilter: { match: String(m.id) } }); }}>Bütçede gör →</button>}
      </section>
    </SidePanel>
  );
}

/* ================================ Ücretler ================================ */

const PER_LABELS = { match: "Maç başı", home: "Ev sahibi", away: "Deplasman", team: "Her iki takım" };

function FeesDialog({ ctx, match, onClose, onDone }) {
  const { project, settings } = ctx;
  const mp = matchPlanning(settings);
  const fin = useProjectFinance(project.id);
  const run = useRun();
  const confirm = useConfirm();
  const [fees, setFees] = useState(() => (mp.fees || []).map((f) => ({ ...f, amount: f.amount ? String(f.amount).replace(".", ",") : "" })));
  const [account, setAccount] = useState(String(mp.account_id || settings.default_account_id || ""));
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState(false);
  const parsed = fees.map((f) => ({ ...f, amount: f.amount === "" ? 0 : parseAmount(f.amount) || 0 }));
  const lines = feePreview(match, parsed);
  const t = feeTotals(lines);
  const accounts = fin.data?.accounts || [];
  const submit = async (force = false) => {
    setBusy(true);
    const r = await request({ method: "POST", path: `${BASE}/${project.id}/matches/${match.id}/fees`, body: { items: parsed.map(({ key, label, type, amount, per }) => ({ key, label, type, amount, per })), account_id: account ? Number(account) : null, status, ...(force ? { force: true } : {}) }, queue: false });
    setBusy(false);
    if (r.error?.code === "FEES_EXIST" && !force) {
      if (await confirm({ title: "Ücretler zaten yazılmış", message: `${r.error.message} Aynı kalemler ikinci kez eklenir.`, confirmLabel: "Yine de ekle" })) submit(true);
      return;
    }
    const acc = accounts.find((a) => String(a.id) === account);
    if (run(r, `${r.data?.items?.length || 0} kalem bütçeye yazıldı${acc ? ` (${acc.name}${status === "paid" ? ", hesaba işlendi" : ""})` : ""}.`)) onDone();
  };
  return (
    <Modal title={`Maç ücretleri · ${match.home} – ${match.away}`} onClose={onClose} width={680} className="pl-fees"
      footer={<><span className="muted small spacer">Gelir {money(t.income)} · gider {money(t.expense)} · net <b className={t.net < 0 ? "text-red" : "text-green"}>{money(t.net)}</b></span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={busy || !lines.length} onClick={() => submit()}><Icon name="check" size={13} /> {lines.length} kalemi bütçeye yaz</button></>}>
      <p className="muted small">Kalemler proje ayarlarındaki maç ücretlerinden gelir; bu maç için tutarı değiştirebilirsiniz. “Her iki takım” iki ayrı satır yazar. Ödendi / tahsil edildi yapılan kalem seçilen hesaba işlenir.</p>
      <table className="table pl-feetable">
        <thead><tr><th>Kalem</th><th>Tür</th><th>Kime</th><th className="num">Tutar</th></tr></thead>
        <tbody>
          {fees.map((f, i) => (
            <tr key={f.key || i}>
              <td>{f.label}</td>
              <td><span className={f.type === "income" ? "text-green" : "text-red"}>{f.type === "income" ? "Gelir" : "Gider"}</span></td>
              <td className="muted small">{PER_LABELS[f.per] || f.per}</td>
              <td className="num"><input className="pl-amount" inputMode="decimal" value={f.amount} placeholder="0" onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label={`${f.label} tutarı`} /></td>
            </tr>
          ))}
          {!fees.length && <tr><td colSpan={4} className="muted small">Ücret kalemi tanımlı değil. Ayarlar → Saha ve maç planlama → Maç ücretleri.</td></tr>}
        </tbody>
      </table>
      <h4 className="pl-subtitle">Bütçeye yazılacak satırlar</h4>
      {lines.length ? (
        <ul className="pl-feelines">{lines.map((l) => <li key={l.key}><span><strong>{l.description}</strong><small className="muted">{l.party ? `Cari: ${l.party}` : "Cari yok"}</small></span><strong className={l.type === "income" ? "text-green" : "text-red"}>{l.type === "income" ? "+" : "−"}{money(l.amount)}</strong></li>)}</ul>
      ) : <p className="muted small">Tutarı girilmiş kalem yok.</p>}
      <div className="form-grid">
        <AccountSelectField accounts={accounts} value={account} onChange={setAccount} label="Maç hesabı" emptyLabel="Hesapsız (yalnız proje bütçesinde)" hint="Projenin maç hesabı ayarlarda seçilir." />
        <Field label="Durum"><div className="seg seg--sm">{[["planned", "Tahmin"], ["pending", "Bekliyor"], ["paid", "Ödendi / tahsil"]].map(([k, l]) => <button key={k} type="button" className={status === k ? "is-active" : ""} onClick={() => setStatus(k)}>{l}</button>)}</div></Field>
      </div>
    </Modal>
  );
}

/* ================================ Maç bağla ================================ */

function LinkDialog({ ctx, linked, onClose, onDone }) {
  const { project } = ctx;
  const run = useRun();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  const [picked, setPicked] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const search = async (e) => {
    e?.preventDefault();
    const r = await request({ path: "/api/todos/lookup", query: { type: "match", q: q.trim() }, cache: false });
    if (run(r)) setHits(r.data?.items || []);
  };
  const submit = async () => {
    setBusy(true);
    const r = await request({ method: "POST", path: `${BASE}/${project.id}/matches/link`, body: { match_ids: [...picked.keys()] }, queue: false });
    setBusy(false);
    if (run(r, `${r.data?.linked || 0} maç projeye bağlandı.`)) onDone();
  };
  return (
    <Modal title="Sitedeki maçı projeye bağla" onClose={onClose} width={560}
      footer={<><span className="muted small spacer">{picked.size} maç seçildi</span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={busy || !picked.size} onClick={submit}><Icon name="link" size={13} /> Bağla</button></>}>
      <form className="input-with-btn" onSubmit={search}><input value={q} autoFocus placeholder="Takım adı ya da tarih (ör. Kartallar)" onChange={(e) => setQ(e.target.value)} /><button type="submit" className="btn btn--sm">Ara</button></form>
      <p className="muted small">Bağlanan maç sitede değişmez; yalnız bu projenin maç listesine, aşamasına ve bütçesine eklenir.</p>
      {hits && (hits.length ? (
        <ul className="pick-list">
          {hits.map((h) => (
            <li key={h.id}><label className={`pick-row ${linked.has(h.id) ? "is-dup" : ""}`}><input type="checkbox" disabled={linked.has(h.id)} checked={picked.has(h.id)} onChange={() => setPicked((m) => { const n = new Map(m); if (n.has(h.id)) n.delete(h.id); else n.set(h.id, h); return n; })} /><span><strong>{h.label}</strong><small className="muted">{h.sub}{linked.has(h.id) ? " · zaten projede" : ""}</small></span></label></li>
          ))}
        </ul>
      ) : <p className="muted small">Maç bulunamadı.</p>)}
    </Modal>
  );
}

/* ================================ Genel bakış kartı ================================ */

export function MatchesOverviewCard({ ctx }) {
  const res = useProjectMatches(ctx.project.id);
  const s = res.data?.summary;
  const next = (res.data?.items || []).filter((m) => (m.date || "") >= localIso() && m.stage !== "ertelendi").slice(0, 4);
  return (
    <section className="card ov-matches">
      <header className="card__head"><h2 className="card__title"><Icon name="ball" /> Maçlar</h2><button type="button" className="link-btn" onClick={() => ctx.setTab("matches")}>Saha ve maç →</button></header>
      {!s ? <p className="muted small">{res.loading ? "Yükleniyor…" : "Maç listesi alınamadı."}</p> : (
        <>
          <div className="counts counts--3">
            <button type="button" className="stat" onClick={() => ctx.setTab("matches")}><strong>{s.this_week}</strong><small>bu hafta</small></button>
            <button type="button" className={`stat ${s.unconfirmed ? "text-amber" : ""}`} onClick={() => ctx.setTab("matches")}><strong>{s.unconfirmed}</strong><small>teyit bekleyen</small></button>
            <button type="button" className={`stat ${s.fees_missing ? "text-red" : ""}`} onClick={() => ctx.setTab("matches")}><strong>{s.fees_missing}</strong><small>ücreti yazılmamış</small></button>
          </div>
          {next.map((m) => <div key={m.id} className="fu-row"><span className="fu-row__main"><strong>{m.home} – {m.away}</strong><small>{[dayLabel(m.date), m.time, m.field].filter(Boolean).join(" · ")}</small></span></div>)}
          {!next.length && <p className="muted small">Yaklaşan maç yok.</p>}
        </>
      )}
    </section>
  );
}
