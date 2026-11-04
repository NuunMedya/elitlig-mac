// Mesajlar · hazır içerik balonları (2.8): günün maçları fikstür kartı,
// "Ben talibim" görev anketi ve Haftanın Enleri (kupa) kartı.
// Eylemler ChatPane'e onAction ile gider; kartlar yalnız çizer.
import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { get } from "../../api";
import { Avatar, C } from "./common";
import { ALL_AWARD } from "../todos/todoUtils";
import { DUTY_MAP, awardProgress, awardRole, deadlineInfo, dutyLabel, groupMatches, longDate, matchDayLabel, matchesSummary, signupGroups } from "../../lib/chatContent";

const stop = (e) => e.stopPropagation();
const openWeb = (p) => window.elitlig.app.openWeb(p);

function DutyIcon({ duty, size = 13 }) {
  const d = DUTY_MAP[duty];
  return <span className="ms-duty-ic" style={{ "--duty": d?.tone || "var(--tool)" }}><Icon name={d?.icon || "user"} size={size} strokeWidth={2} /></span>;
}

/** Üst üste binen küçük avatarlar (en çok 4 + kalan sayı). */
export function AvatarStack({ people, max = 4, size = 24, dimmed }) {
  const list = people || [];
  return (
    <span className="ms-stack" style={{ "--s": `${size}px` }}>
      {list.slice(0, max).map((p) => <span key={p.user_id} className={`ms-stack__item ${dimmed?.(p) ? "is-dim" : ""}`} title={p.name}><Avatar name={p.name} id={p.user_id} size={size} /></span>)}
      {list.length > max && <span className="ms-stack__more">+{list.length - max}</span>}
    </span>
  );
}

/* ------------------------------- günün maçları ------------------------------- */
export function MatchesCard({ m, canCompose, onAction }) {
  const x = m.meta?.matches || {};
  const items = x.items || [];
  const groups = groupMatches(items);
  const s = matchesSummary(items);
  return (
    <div className="ms-card ms-card--matches" onClick={stop}>
      <header className="ms-card__hero">
        <span className="ms-card__icon"><Icon name="ball" size={20} strokeWidth={2} /></span>
        <span className="ms-card__titles">
          <small>{matchDayLabel(x.date) === "Bugün" ? "Günün maçları" : "Maç programı"}</small>
          <strong>{matchDayLabel(x.date) === "Bugün" ? `Bugün · ${longDate(x.date)}` : longDate(x.date)}</strong>
        </span>
        <span className="ms-card__count"><b>{s.count}</b><small>maç</small></span>
      </header>
      <div className="ms-card__facts">
        {s.from && <span><Icon name="clock" size={12} /> {s.from === s.to ? s.from : `${s.from} – ${s.to}`}</span>}
        {s.fields > 0 && <span><Icon name="map" size={12} /> {s.fields} saha</span>}
        <span><Icon name="users" size={12} /> {s.crew ? `${s.crew} görevli` : "görevli yok"}</span>
      </div>
      {x.note && <p className="ms-card__note">{x.note}</p>}
      <div className="ms-fx-list">
        {groups.map((g) => (
          <section key={g.key} className="ms-fx-group">
            {(groups.length > 1 || g.league) && <h6><span className="ms-league">{g.league || "Diğer"}</span><em>{g.items.length} maç</em></h6>}
            {g.items.map((it) => {
              const played = it.home_score != null && it.away_score != null;
              const crew = Object.entries(it.crew || {});
              return (
                <button key={it.id} type="button" className="ms-fx" title="Maçı sitede aç" onClick={() => openWeb(`/editor/maclar/${it.id}/oncesi`)}>
                  <span className={`ms-fx__time ${played ? "is-played" : ""}`}>{played ? "MS" : it.time || "--:--"}</span>
                  <span className="ms-fx__body">
                    <span className="ms-fx__teams">
                      <strong>{it.home}</strong>
                      <em>{played ? `${it.home_score} – ${it.away_score}` : "vs"}</em>
                      <strong>{it.away}</strong>
                    </span>
                    <span className="ms-fx__meta">
                      {it.field && <span><Icon name="map" size={11} /> {it.field}</span>}
                      {crew.map(([duty, c]) => <span key={duty} className="ms-crew" style={{ "--duty": DUTY_MAP[duty]?.tone }}><DutyIcon duty={duty} size={10} /> {c.name || dutyLabel(duty)}</span>)}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        ))}
        {!items.length && <p className="ms-card__empty">Bu günde maç yok.</p>}
      </div>
      <footer className="ms-card__actions">
        <button type="button" onClick={() => openWeb("/editor/maclar")}><Icon name="external" size={13} /> Sitede aç</button>
        {canCompose && items.length > 0 && <button type="button" className="is-primary" onClick={() => onAction("contentForm", m, { type: "signup", date: x.date, match_ids: items.map((i) => i.id) })}><Icon name="handshake" size={13} /> Talip anketi aç</button>}
      </footer>
    </div>
  );
}

/* --------------------------------- ben talibim --------------------------------- */
export function SignupCard({ m, meId, canAssign, onAction }) {
  const s = m.meta?.signup || {};
  const sum = signupGroups(s, meId);
  const mineSender = Boolean(m.sender?.is_me);
  const dl = deadlineInfo(s.deadline);
  const closed = Boolean(s.closed);
  const assignable = canAssign && !m._pending;
  return (
    <div className={`ms-card ms-card--signup ${closed ? "is-closed" : ""}`} onClick={stop}>
      <header className="ms-card__hero">
        <span className="ms-card__icon"><Icon name="handshake" size={20} strokeWidth={2} /></span>
        <span className="ms-card__titles">
          <small>Görev anketi · Ben talibim</small>
          <strong>{s.title}</strong>
        </span>
      </header>
      <div className="ms-card__facts">
        {(s.duties || []).map((d) => <span key={d} className="ms-duty-chip" style={{ "--duty": DUTY_MAP[d]?.tone }}><DutyIcon duty={d} size={10} /> {dutyLabel(d)}</span>)}
        {dl && <span className={dl.late ? "is-late" : ""}><Icon name="clock" size={12} /> {dl.label}</span>}
      </div>
      {s.note && <p className="ms-card__note">{s.note}</p>}
      <div className="ms-su-progress" title={`${sum.filled} görev atandı, ${sum.open} açık`}>
        <span className="ms-su-progress__bar"><i style={{ width: `${sum.total ? Math.round((sum.filled / sum.total) * 100) : 0}%` }} /></span>
        <small><b>{sum.filled}/{sum.total}</b> görev dolu · {sum.volunteers} talip{sum.mine ? ` · siz ${sum.mine} göreve talipsiniz` : ""}</small>
      </div>
      <div className="ms-su-list">
        {sum.groups.map((g) => (
          <section key={g.match_id} className="ms-su-match">
            <h6>
              <span className="ms-fx__time">{g.match.time || "--:--"}</span>
              <span className="ms-su-match__teams"><strong>{g.match.home}</strong> <em>vs</em> <strong>{g.match.away}</strong></span>
              {g.match.field && <small><Icon name="map" size={11} /> {g.match.field}</small>}
            </h6>
            {g.rows.map((r) => (
              <div key={r.slot.id} className={`ms-su-row ${r.mine ? "is-mine" : ""} ${r.assigned ? "is-assigned" : ""}`} data-slot={r.slot.id}>
                <span className="ms-su-row__duty"><DutyIcon duty={r.slot.duty} /> {r.slot.duty_label || dutyLabel(r.slot.duty)}</span>
                <span className="ms-su-row__who">
                  {r.assigned ? (
                    <span className={`ms-assigned ${r.assignedMe ? "is-me" : ""}`}><Icon name="check" size={11} strokeWidth={3} /> {r.assignedMe ? "Siz görevlisiniz" : r.assigned.name || "Görevli atandı"}</span>
                  ) : r.volunteers.length ? <AvatarStack people={r.volunteers} size={22} /> : <em className="ms-su-row__empty">Henüz talip yok</em>}
                  {r.assigned && r.volunteers.length > 0 && <AvatarStack people={r.volunteers} size={18} max={3} dimmed={(p) => Number(p.user_id) !== Number(r.assigned.user_id)} />}
                </span>
                <span className="ms-su-row__acts">
                  {assignable && (r.volunteers.length > 0 || r.assigned) && (
                    <button type="button" className="ms-su-assign" title="Talip olanlardan birini görevlendir" onClick={(e) => onAction("signupAssignMenu", m, { row: r, rect: e.currentTarget.getBoundingClientRect() })}><Icon name="userPlus" size={13} /> {r.assigned ? "Değiştir" : "Görevlendir"}</button>
                  )}
                  {!closed && !r.assigned && (
                    <button type="button" className={`ms-su-toggle ${r.mine ? "is-on" : ""}`} disabled={m._pending} onClick={() => onAction("signupToggle", m, { slot_id: r.slot.id, on: !r.mine })}>
                      {r.mine ? <><Icon name="check" size={13} strokeWidth={3} /> <span className="ms-su-toggle__on">Talibim</span><span className="ms-su-toggle__off">Vazgeç</span></> : <><Icon name="plus" size={13} strokeWidth={2.6} /> Talibim</>}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
      {(closed || mineSender) && (
        <footer className="ms-card__actions">
          {closed && <span className="ms-card__closed"><Icon name="lock" size={12} /> Anket kapandı — yeni talip alınmıyor</span>}
          {mineSender && <button type="button" onClick={() => onAction("signupClose", m, { closed: !closed })}><Icon name={closed ? "refresh" : "lock"} size={13} /> {closed ? "Yeniden aç" : "Anketi kapat"}</button>}
        </footer>
      )}
    </div>
  );
}

/* -------------------------------- haftanın enleri -------------------------------- */
export function AwardCard({ m, conv, meId, onAction }) {
  const a = m.meta?.award || {};
  const [status, setStatus] = useState(null);
  const load = useCallback(() => {
    if (!m.id || m._pending) return;
    get(`${C}/conversations/${conv.id}/messages/${m.id}/award`).then((r) => r.ok && setStatus(r.data));
  }, [conv.id, m.id, m._pending]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = (e) => { if (!e.detail || Number(e.detail) === Number(m.id)) load(); };
    window.addEventListener("ms:award-refresh", on);
    return () => window.removeEventListener("ms:award-refresh", on);
  }, [load, m.id]);
  const p = awardProgress(status);
  const role = awardRole(a, status, meId);
  const dl = deadlineInfo(a.due_at);
  const cats = (a.categories || []).map((k) => ALL_AWARD.find((c) => c.key === k)?.label || k);
  return (
    <div className="ms-card ms-card--award" onClick={stop}>
      <header className="ms-card__hero">
        <span className="ms-card__icon"><Icon name="trophy" size={21} strokeWidth={2} /></span>
        <span className="ms-card__titles">
          <small>Haftanın Enleri · aday anketi</small>
          <strong>{a.week || "Bu hafta"}</strong>
        </span>
        <span className="ms-card__ring" style={{ "--p": p.pct }} title={p.label}><b>{status ? `${p.submitted}/${p.total}` : "…"}</b></span>
      </header>
      <div className="ms-award-cats">{cats.map((c) => <span key={c}>{c.replace(/^Haftanın\s+/, "")}</span>)}</div>
      {a.note && <p className="ms-card__note">{a.note}</p>}
      <div className="ms-award-progress">
        <div className="ms-award-progress__top">
          <strong>{status ? p.label : "Durum yükleniyor…"}</strong>
          {dl && <small className={dl.late ? "is-late" : ""}><Icon name="clock" size={11} /> {dl.label}</small>}
        </div>
        <span className="ms-su-progress__bar"><i style={{ width: `${p.pct}%` }} /></span>
        {status?.people?.length > 0 && (
          <div className="ms-award-people">
            {status.people.map((x) => (
              <span key={x.user_id} className={`ms-award-person ${x.submitted ? "is-done" : ""}`} title={`${x.name} · ${x.submitted ? "önerisini gönderdi" : "bekleniyor"}`}>
                <Avatar name={x.name} id={x.user_id} size={26} />
                {x.submitted && <i><Icon name="check" size={8} strokeWidth={4} /></i>}
              </span>
            ))}
          </div>
        )}
      </div>
      <footer className="ms-card__actions">
        {role.myTask && <button type="button" className={role.mineSubmitted ? "" : "is-primary"} onClick={() => onAction("awardTask", m, { kind: "award_nomination", id: role.myTask })}><Icon name={role.mineSubmitted ? "pencil" : "award"} size={13} /> {role.mineSubmitted ? "Önerimi düzenle" : "Adaylarını öner"}</button>}
        {role.coordinationTask && <button type="button" className="is-gold" onClick={() => onAction("awardTask", m, { kind: "award_coordination", id: role.coordinationTask })}><Icon name="trophy" size={13} /> Önerileri topla</button>}
        {!role.myTask && !role.coordinationTask && status && <span className="ms-card__closed"><Icon name="info" size={12} /> Aday önerisi yönetim ekibinden istenir</span>}
      </footer>
    </div>
  );
}
