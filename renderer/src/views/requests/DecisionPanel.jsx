// Talep karar paneli (Talepler görünümünün sağ bölmesi).
// Veri: GET /api/admin/requests/:id/context — otomatik denetimler (Uyarılar),
// talebin kendisi (alan farkı, ekler, not, teklif şartları, saat seçenekleri,
// kadro farkı), talep eden ve geçmişi, oyuncu ve takım dosyası, karar etkisi,
// zaman çizelgesi; altta gerekçeli onay / ret (not talep sahibine iletilir).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Spinner, ErrorNote, useConfirm, useToast } from "../../components/ui";
import { request } from "../../api";
import { LEVELS, OUTCOME_LABELS, VERDICTS, decisionConfirm, decisionRequest, fmtDate, meterTone, sortChecks, splitDecision } from "../../lib/requestDecision";
import "./decision.css";

const openWeb = (path) => window.elitlig?.app?.openWeb?.(path);
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toLocaleUpperCase("tr-TR");

function Avatar({ src, name, square }) {
  const [broken, setBroken] = useState(false);
  return <span className={`rqd-avatar ${square ? "is-square" : ""}`}>{src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : initials(name)}</span>;
}
const Sec = ({ icon, title, children, id }) => (
  <section className="rqd-sec" data-sec={id}><h4><Icon name={icon} size={13} /> {title}</h4>{children}</section>
);
function Fields({ rows }) {
  const list = (rows || []).filter((r) => r && r.value != null && r.value !== "");
  return list.length ? <dl className="rqd-fields">{list.map((r) => <React.Fragment key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></React.Fragment>)}</dl> : null;
}
const Stat = ({ label, value, tone }) => <div className={`rqd-stat ${tone ? `is-${tone}` : ""}`}><b>{value ?? "—"}</b><span>{label}</span></div>;
function Meter({ label, used, cap }) {
  if (used == null) return null;
  const { pct, tone } = meterTone(used, cap);
  return (
    <div className="rqd-meter">
      <div className="rqd-meter__head"><span>{label}</span><b>{used}{cap != null ? ` / ${cap}` : " (limitsiz)"}</b></div>
      {cap != null && <div className="rqd-meter__bar"><span className={tone ? `is-${tone}` : ""} style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

function Checks({ checks }) {
  const [all, setAll] = useState(false);
  const sorted = sortChecks(checks);
  const hidden = sorted.filter((c) => c.level === "pass").length;
  return (
    <div className="rqd-checks">
      {sorted.filter((c) => all || c.level !== "pass").map((c) => (
        <div key={c.key} className={`rqd-check is-${c.level}`} data-level={c.level}>
          <Icon name={LEVELS[c.level]?.icon || "circle"} size={15} />
          <div><strong>{c.label}</strong>{c.detail && <small>{c.detail}</small>}</div>
          <span className="rqd-tag">{LEVELS[c.level]?.label}</span>
        </div>
      ))}
      {hidden > 0 && <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>{all ? "Geçenleri gizle" : `${hidden} denetim geçti — göster`}</button>}
    </div>
  );
}

function Subject({ s, kind }) {
  if (!s) return null;
  return (
    <>
      <Fields rows={s.fields} />
      {s.diff?.length > 0 && (
        <table className="rqd-table"><thead><tr><th>Alan</th><th>Şu an</th><th>İstenen</th></tr></thead>
          <tbody>{s.diff.map((d) => <tr key={d.field} className={d.changed ? "is-changed" : "is-same"}><th>{d.label}</th><td>{d.kind === "image" && d.before ? <img src={d.before} alt="" /> : d.before || "—"}</td><td>{d.kind === "image" && d.after ? <img src={d.after} alt="" /> : d.after || "—"}{!d.changed && " (aynı)"}</td></tr>)}</tbody>
        </table>
      )}
      {s.attachments?.length > 0 && (
        <div className="rqd-attach">{s.attachments.map((a) => (
          <div key={a.url} className="rqd-attach__pair">
            {a.before && <figure><img src={a.before} alt="" /><figcaption>Mevcut</figcaption></figure>}
            <figure><img src={a.url} alt="" onClick={() => window.elitlig?.app?.openExternal?.(a.url)} /><figcaption>{a.label}</figcaption></figure>
          </div>
        ))}</div>
      )}
      {s.terms?.length > 0 && <Fields rows={s.terms} />}
      {s.slots?.length > 0 && (
        <table className="rqd-table"><thead><tr><th>Tarih</th><th>Saat</th><th>Sahada</th><th>Rakip talep</th></tr></thead>
          <tbody>{s.slots.map((x) => <tr key={x.id} className={x.available ? "is-ok" : "is-bad"}><td>{fmtDate(x.date)}</td><td>{x.time}</td><td>{x.cell_label}</td><td>{x.competing || "—"}</td></tr>)}</tbody>
        </table>
      )}
      {s.roster_diff && (
        <div className="rqd-roster">
          {[["additions", "Eklenen", "+"], ["removals", "Çıkarılan", "−"], ["license_changes", "Lisans", "±"]].map(([k, label, sign]) => (s.roster_diff[k] || []).length > 0 && (
            <div key={k}><h5>{label}</h5><ul>{s.roster_diff[k].map((m) => <li key={m.player_id}>{sign} {m.name}{m.position ? ` · ${m.position}` : ""}{m.kind === "loan" ? " · kiralık" : ""}{m.is_licensed ? " · lisanslı" : ""}</li>)}</ul></div>
          ))}
        </div>
      )}
      {s.items?.length > 0 && <ul className="rqd-list">{s.items.map((i) => <li key={i.index}>{i.type === "add" ? "+" : "−"} {i.name}{i.team_matches != null ? ` · bu takımda ${i.team_matches} maç` : ""} <em>{{ pending: "karar bekliyor", approved: "onaylandı", rejected: "reddedildi" }[i.decision] || i.decision}</em></li>)}</ul>}
      {s.similar?.length > 0 && <><h5>Benzer kayıtlar</h5><ul className="rqd-list">{s.similar.map((x) => <li key={`${x.kind}${x.id}`}><button type="button" className="link-btn" onClick={() => openWeb(x.kind === "player" ? `/editor/oyuncular/${x.id}` : `/editor/takimlar/${x.id}`)}>{x.name}</button>{x.detail ? ` · ${x.detail}` : ""}</li>)}</ul></>}
      {s.note && <blockquote className="rqd-note">“{s.note}”<cite>{kind === "transfer" || kind === "release" ? "Teklif mesajı" : "Talep edenin notu"}</cite></blockquote>}
      {s.decision_text && <blockquote className="rqd-note">{s.decision_text}<cite>Kurul kararı</cite></blockquote>}
    </>
  );
}

function Requester({ r, onOpen }) {
  return (
    <>
      <div className="rqd-person">
        <Avatar src={r.photo} name={r.name} />
        <div><strong>{r.name}{r.verified && <span className="rqd-badge is-ok"><Icon name="checks" size={11} /> Doğrulanmış</span>}</strong><small>{[r.username && `@${r.username}`, r.role_label, r.city].filter(Boolean).join(" · ")}</small></div>
        <span className={`rqd-badge is-${r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "bad"}`}>{r.status_label || "—"}</span>
      </div>
      <div className="rqd-contact">
        {r.phone ? <span><Icon name="phone" size={12} /> {r.phone}</span> : <span className="is-missing"><Icon name="phone" size={12} /> Telefon yok</span>}
        {r.email ? <span><Icon name="mail" size={12} /> {r.email}</span> : <span className="is-missing"><Icon name="mail" size={12} /> E-posta yok</span>}
        <span><Icon name="calendar" size={12} /> Üyelik {fmtDate(r.member_since)}{r.account_age_days != null ? ` (${r.account_age_days} gün)` : ""}</span>
      </div>
      <div className="rqd-links">
        {r.player && <button type="button" className="link-btn" onClick={() => openWeb(`/editor/oyuncular/${r.player.id}`)}>Oyuncu: {r.player.name}</button>}
        {r.team && <button type="button" className="link-btn" onClick={() => openWeb(`/editor/takimlar/${r.team.id}`)}>Takım: {r.team.name}</button>}
        <button type="button" className="link-btn" onClick={() => openWeb(`/yonetim/admin/kullanicilar?uye=${r.id}`)}>Üye kartı</button>
      </div>
      <div className="rqd-stats">
        <Stat label="Önceki talep" value={r.history.total} />
        <Stat label="Olumlu" value={r.history.approved} tone="ok" />
        <Stat label="Ret" value={r.history.rejected} tone={r.history.rejected ? "bad" : null} />
        <Stat label="Bekleyen" value={r.history.pending} tone={r.history.pending ? "warn" : null} />
      </div>
      {r.history.recent?.length > 0 && (
        <ul className="rqd-history">{r.history.recent.map((h) => (
          <li key={h.id}><button type="button" className="link-btn" onClick={() => onOpen(h.id)}>{h.title || h.type}</button>
            <span className={`rqd-badge is-${h.outcome === "approved" ? "ok" : h.outcome === "rejected" ? "bad" : h.outcome === "pending" ? "warn" : "muted"}`}>{h.label || OUTCOME_LABELS[h.outcome]}</span><time>{fmtDate(h.created_at)}</time></li>
        ))}</ul>
      )}
    </>
  );
}

function Player({ p, compact }) {
  return (
    <div className="rqd-player">
      <div className="rqd-person">
        <Avatar src={p.image} name={p.name} square />
        <div><strong><button type="button" className="link-btn" onClick={() => openWeb(`/editor/oyuncular/${p.id}`)}>{p.name}</button>{p.verified && <span className="rqd-badge is-ok">Hesaplı</span>}</strong>
          <small>{[p.position, p.age != null ? `${p.age} yaş` : "doğum tarihi yok", p.team_name, p.city].filter(Boolean).join(" · ")}</small></div>
        {p.penalties.active.length > 0 && <span className="rqd-badge is-bad"><Icon name="ban" size={11} /> Cezalı</span>}
      </div>
      <div className="rqd-stats">
        <Stat label="Maç" value={p.stats.matches} /><Stat label="Gol" value={p.stats.goals} />
        <Stat label="Sarı" value={p.stats.yellow} tone={p.stats.yellow >= 8 ? "warn" : null} /><Stat label="Kırmızı" value={p.stats.red} tone={p.stats.red ? "bad" : null} />
        {!compact && <Stat label="Disiplin" value={p.penalties.total} tone={p.penalties.total ? "warn" : null} />}
      </div>
      {!compact && <Fields rows={[
        { label: "Takımları", value: p.teams.map((t) => `${t.name}${t.jersey != null ? ` (#${t.jersey})` : ""}${t.current ? " · güncel" : ""}`).join(", ") || "—" },
        { label: "Sezon kadroları", value: p.season_rosters.map((x) => `${x.team_name || `#${x.team_id}`}${x.season_name ? ` · ${x.season_name}` : ""}${x.kind === "loan" ? " (kiralık)" : ""}`).join(" / ") || "Kayıtlı değil" },
        { label: "Bağlı hesap", value: p.owner ? `${p.owner.name} (@${p.owner.username})` : "Yok" },
        p.open_offers.length ? { label: "Açık teklifler", value: p.open_offers.map((o) => o.team_name || "—").join(", ") } : null,
      ]} />}
      {!compact && p.penalties.recent.length > 0 && <ul className="rqd-list rqd-pen">{p.penalties.recent.map((x) => <li key={x.id} className={x.active ? "is-active" : ""}>{x.match_label || "Disiplin"}{x.duration_type ? ` · ${x.duration_type === "suresiz" ? "süresiz" : `${x.match_count || 1} maç`}` : ""}{x.ban_end_at ? ` · bitiş ${fmtDate(x.ban_end_at)}` : ""}{x.active ? " · SÜRÜYOR" : ""}</li>)}</ul>}
    </div>
  );
}

function Team({ t, onOpen, go }) {
  const rules = t.roster_rules;
  return (
    <>
      <div className="rqd-person">
        <Avatar src={t.logo} name={t.name} square />
        <div><strong><button type="button" className="link-btn" onClick={() => go?.("contacts", { tab: "teams", teamId: t.id })}>{t.name}</button></strong><small>{[t.city, t.season?.name, t.colors].filter(Boolean).join(" · ")}</small></div>
      </div>
      <Fields rows={[
        { label: "Başkan / yönetici", value: t.manager ? `${t.manager.name}${t.manager.phone ? ` · ${t.manager.phone}` : ""}` : "Atanmamış" },
        { label: "Kayıtlı oyuncu", value: t.roster_count },
        rules?.rule_set ? { label: "Kural seti", value: `${rules.rule_set}${rules.period ? ` · ${rules.period}` : ""}` } : null,
      ]} />
      {rules?.applies ? (
        <div className="rqd-meters">
          <Meter label="Sezon kadrosu" used={rules.general?.used} cap={rules.general?.cap} />
          <Meter label="Lisanslı" used={rules.licensed?.used} cap={rules.licensed?.cap} />
          {rules.transfer_rights && !rules.transfer_rights.unlimited && <Meter label="Transfer hakkı (kullanılan)" used={rules.transfer_rights.used} cap={rules.transfer_rights.granted} />}
        </div>
      ) : <p className="muted rqd-small">{rules?.message || "Bu sezon için kadro kural seti yok; limit denetlenmez."}</p>}
      <div className="rqd-stats">
        <Stat label="Maç" value={t.stats.matches} /><Stat label="G-B-M" value={`${t.stats.wins}-${t.stats.draws}-${t.stats.losses}`} />
        <Stat label="Puan" value={t.stats.points} /><Stat label="Averaj" value={`${t.stats.goals_for}:${t.stats.goals_against}`} />
      </div>
      {t.open_requests?.length > 0 && <><h5>Takımın bekleyen diğer talepleri ({t.open_requests.length})</h5><ul className="rqd-history">{t.open_requests.map((o) => <li key={o.id}><button type="button" className="link-btn" onClick={() => onOpen(o.id)}>{o.title || o.type}</button><time>{fmtDate(o.created_at)}</time></li>)}</ul></>}
    </>
  );
}

export default function DecisionPanel({ id, onClose, onDecided, onOpen, go }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const asideRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await request({ path: `/api/admin/requests/${encodeURIComponent(id)}/context`, cache: false, queue: false });
    if (res.ok) setCtx(res.data); else setError(res.offline ? { message: "Karar paneli için internet bağlantısı gerekir." } : res.error || { message: "Talep ayrıntıları yüklenemedi." });
  }, [id]);
  useEffect(() => { setCtx(null); setNote(""); load(); }, [load]);
  // Panel açılınca karar düğmeleri görünür olsun.
  useEffect(() => { if (ctx) asideRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [ctx?.request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (action) => {
    if (action.style === "danger" && !note.trim()) { toast("Ret gerekçesi seçin ya da yazın; gerekçe talep sahibine iletilir.", { tone: "error" }); return; }
    if (!(await confirm(decisionConfirm(action, ctx, note)))) return;
    setBusy(action.key);
    const res = await request({ ...decisionRequest(action, note), queue: false, cache: false });
    setBusy("");
    if (res.ok) { toast(res.data?.message || `${action.label}: tamamlandı.`, { tone: "success" }); onDecided?.(ctx.request); }
    else toast(res.offline ? "Bu işlem için internet bağlantısı gerekir." : res.error?.message || "İşlem yapılamadı.", { tone: "error", timeout: 6000 });
  };

  const head = ctx?.request;
  const verdict = ctx ? VERDICTS[ctx.summary.verdict] : null;
  const { approve, reject } = splitDecision(ctx?.decision?.actions);
  const open = head?.status === "open";
  return (
    <aside ref={asideRef} className="rqd" data-panel="decision" aria-label="Talep karar paneli">
      <header className="rqd-head">
        <div><small>{ctx?.kind_label || "Talep"}{head ? ` · #${head.id}` : ""}</small><h3>{head?.title || "Yükleniyor…"}</h3>{ctx?.subject?.headline && <p>{ctx.subject.headline}</p>}</div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose} title="Kapat (Esc)"><Icon name="x" size={14} /></button>
      </header>
      {error && <ErrorNote error={error} onRetry={load} />}
      {!ctx && !error && <Spinner />}
      {ctx && (
        <div className="rqd-body">
          <div className={`rqd-verdict is-${ctx.summary.verdict}`} data-verdict={ctx.summary.verdict}>
            <Icon name={verdict.icon} size={18} /><strong>{verdict.label}</strong>
            <span>{ctx.summary.fail} engel · {ctx.summary.warn} dikkat · {ctx.summary.pass} geçti</span>
            {ctx.record && <em>Kayıt: {ctx.record.label}</em>}
          </div>
          <Sec icon="alert" title="Uyarılar" id="checks"><Checks checks={ctx.checks} /></Sec>
          <Sec icon="file" title="Talep" id="subject"><Subject s={ctx.subject} kind={ctx.kind} />{head.description && <p className="muted rqd-small">{head.description}</p>}</Sec>
          <Sec icon="target" title="Kararın etkisi" id="impact">
            <div className="rqd-impact">
              <div className="is-approve"><h5>Onaylarsan</h5><ul>{ctx.impact.approve.map((t) => <li key={t}>{t}</li>)}</ul></div>
              {ctx.impact.reject?.length > 0 && <div className="is-reject"><h5>Reddedersen</h5><ul>{ctx.impact.reject.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            </div>
          </Sec>
          {ctx.requester && <Sec icon="user" title="Talep eden" id="requester"><Requester r={ctx.requester} onOpen={onOpen} /></Sec>}
          {ctx.player && <Sec icon="ball" title="Oyuncu" id="player"><Player p={ctx.player} /></Sec>}
          {ctx.added_players?.length > 0 && <Sec icon="userPlus" title={`Kadroya girecek oyuncular (${ctx.added_players.length})`} id="added">{ctx.added_players.map((p) => <Player key={p.id} p={p} compact />)}</Sec>}
          {ctx.team && <Sec icon="team" title={ctx.kind === "transfer" ? "Teklif veren takım" : "Takım"} id="team"><Team t={ctx.team} onOpen={onOpen} go={go} /></Sec>}
          {ctx.related?.duplicates?.length > 0 && <Sec icon="copy" title="Benzer açık talepler" id="dups"><ul className="rqd-history">{ctx.related.duplicates.map((d) => <li key={d.id}><button type="button" className="link-btn" onClick={() => onOpen(d.id)}>#{d.id} {d.title}</button><time>{fmtDate(d.created_at)}</time></li>)}</ul></Sec>}
          <Sec icon="clock" title="Zaman çizelgesi" id="timeline">
            <ol className="rqd-timeline">{ctx.timeline.map((e, i) => <li key={`${e.at}${i}`} className={e.kind ? `is-${e.kind}` : ""}><time>{fmtDate(e.at, true)}</time><span>{e.label}{e.by ? ` · ${e.by}` : ""}</span>{e.note && <small>{e.note}</small>}</li>)}</ol>
          </Sec>
        </div>
      )}
      {ctx && (
        <footer className="rqd-foot">
          {open && (approve.length || reject.length) ? (
            <>
              <label className="rqd-notefield"><span>Karar notu {ctx.decision.notifies ? "(talep sahibine bildirimle iletilir)" : ""}</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Onay notu ya da ret gerekçesi…" /></label>
              {reject.length > 0 && <div className="rqd-templates">{ctx.decision.templates.map((t) => <button key={t} type="button" className={`rqd-chip ${note === t ? "is-on" : ""}`} onClick={() => setNote(t)}>{t}</button>)}</div>}
              <div className="rqd-actions">
                {approve.map((a) => <button key={a.key} type="button" data-action={a.key} className="btn btn--sm btn--green" disabled={Boolean(busy)} onClick={() => decide(a)}>{busy === a.key ? <span className="spinner__dot" /> : <Icon name="check" size={13} />} {a.label}</button>)}
                {reject.map((a) => <button key={a.key} type="button" data-action={a.key} className="btn btn--sm btn--red" disabled={Boolean(busy)} onClick={() => decide(a)}>{busy === a.key ? <span className="spinner__dot" /> : <Icon name="x" size={13} />} {a.label}</button>)}
                <span className="rqd-spacer" />
                {(ctx.decision.links || []).map((l) => <button key={l.key} type="button" className="link-btn" onClick={() => openWeb(l.web)}>{l.label} →</button>)}
              </div>
            </>
          ) : (
            <div className="rqd-actions"><span className="muted">{open ? "Bu talep ilgili sayfada sonuçlandırılır." : `Sonuçlandı: ${head.resolved_label || "—"}`}</span><span className="rqd-spacer" />
              {(ctx.decision.links || []).map((l) => <button key={l.key} type="button" className="link-btn" onClick={() => openWeb(l.web)}>{l.label} →</button>)}</div>
          )}
        </footer>
      )}
    </aside>
  );
}
