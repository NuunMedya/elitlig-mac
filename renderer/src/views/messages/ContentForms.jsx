// Mesajlar · hazır içerik formları (2.8): "+" menüsünden açılır.
//   Günün maçları   — gün seç, maçlar (hepsi seçili), not, canlı önizleme → gönder
//   Ben talibim     — gün + maçlar, görevler (spiker, reji, hakem…), başlık / not / son tarih
//   Haftanın Enleri — Yapılacaklar'daki kapsam alanları (hafta, lig, sezon, tarih, kategoriler, kadro)
// Haftanın enleri kartlarından açılan aday önerisi / koordinasyon pencereleri
// Yapılacaklar'ın AwardProposal / AwardBoard bileşenlerini kullanır.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, Modal, Spinner } from "../../components/ui";
import { get } from "../../api";
import { C } from "./common";
import { MatchesCard, SignupCard } from "./ContentCards";
import { AwardScope } from "../todos/Composer";
import { AwardBoard, AwardProposal } from "../todos/Award";
import { ALL_AWARD } from "../todos/todoUtils";
import { DUTIES, DUTY_MAP, awardRecipients, groupMatches, isoDate, matchDayLabel } from "../../lib/chatContent";

const shiftDay = (date, n) => { const [y, m, d] = date.split("-").map(Number); return isoDate(new Date(y, m - 1, d + n)); };

/** Gün seçici + o günün maçları (onay kutulu, lige göre gruplu). */
function MatchPicker({ date, setDate, items, loading, error, picked, setPicked }) {
  const all = items.length > 0 && items.every((m) => picked.has(m.id));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="ms-mpick">
      <div className="ms-mpick__day">
        <button type="button" className="icon-btn" aria-label="Önceki gün" onClick={() => setDate(shiftDay(date, -1))}><Icon name="chevronLeft" /></button>
        <label className="ms-mpick__date"><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /><strong>{matchDayLabel(date)}</strong></label>
        <button type="button" className="icon-btn" aria-label="Sonraki gün" onClick={() => setDate(shiftDay(date, 1))}><Icon name="chevronRight" /></button>
        {date !== isoDate() && <button type="button" className="link-btn small" onClick={() => setDate(isoDate())}>Bugün</button>}
        <span className="spacer" />
        {items.length > 0 && <button type="button" className="link-btn small" onClick={() => setPicked(all ? new Set() : new Set(items.map((m) => m.id)))}>{all ? "Hiçbirini seçme" : "Tümünü seç"}</button>}
      </div>
      <div className="ms-mpick__list">
        {loading ? <Spinner label="Maçlar yükleniyor…" /> : error ? <p className="ms-note">{error}</p> : !items.length ? (
          <div className="ms-mpick__empty"><Icon name="ball" size={26} /><strong>Bu günde maç yok</strong><span>Başka bir gün seçin.</span></div>
        ) : groupMatches(items).map((g) => (
          <section key={g.key}>
            <h6>{g.league || "Diğer"} <em>{g.items.length}</em></h6>
            {g.items.map((m) => {
              const on = picked.has(m.id);
              const crew = Object.keys(m.crew || {});
              return (
                <button key={m.id} type="button" className={`ms-mpick__row ${on ? "is-on" : ""}`} data-match={m.id} onClick={() => toggle(m.id)}>
                  <span className={`ms-check ms-check--sq ${on ? "is-on" : ""}`}>{on && <Icon name="check" size={11} strokeWidth={3} />}</span>
                  <span className="ms-fx__time">{m.time || "--:--"}</span>
                  <span className="ms-mpick__teams"><strong>{m.home}</strong> <em>–</em> <strong>{m.away}</strong><small>{[m.field, crew.length ? `${crew.map((d) => DUTY_MAP[d]?.label || d).join(", ")} atandı` : null].filter(Boolean).join(" · ")}</small></span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

function useDayMatches(initialDate) {
  const [date, setDate] = useState(initialDate || isoDate());
  const [state, setState] = useState({ loading: true, items: [], error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    get(`${C}/content/matches`, { date }).then((r) => {
      if (!live) return;
      setState({ loading: false, items: r.ok ? r.data.items || [] : [], error: r.ok ? null : r.offline ? "Maç listesi için bağlantı gerekir." : r.error?.message || "Maçlar alınamadı." });
    });
    return () => { live = false; };
  }, [date]);
  return { date, setDate, ...state };
}

/** Önizleme sahnesi: balonu sohbet duvarında gösterir. */
const Preview = ({ children, label = "Önizleme" }) => (
  <aside className="ms-cform__preview">
    <span className="ms-cform__plabel"><Icon name="eye" size={12} /> {label}</span>
    <div className="ms-cform__wall"><div className="ms-row is-mine is-first is-last"><div className="ms-bubble-wrap"><div className="ms-bubble ms-bubble--card">{children}</div></div></div></div>
  </aside>
);

/* ------------------------------- günün maçları ------------------------------- */
export function MatchesForm({ conv, initial, onClose, onSend }) {
  const day = useDayMatches(initial?.date);
  const [picked, setPicked] = useState(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Gün değişince o günün tüm maçları seçili gelir.
  useEffect(() => { setPicked(new Set(day.items.map((m) => m.id))); }, [day.items]);
  const chosen = day.items.filter((m) => picked.has(m.id));
  const preview = { id: 0, kind: "matches", sender: { is_me: true }, meta: { matches: { date: day.date, note: note.trim() || null, items: chosen } } };
  const send = async () => { setBusy(true); const ok = await onSend("matches", { match_ids: chosen.map((m) => m.id), date: day.date, note: note.trim() || null }); setBusy(false); if (ok) onClose(); };
  return (
    <Modal title="Günün maçlarını gönder" onClose={onClose} width={900} className="ms-modal ms-cform" footer={(
      <>
        <span className="ms-cform__foot">{chosen.length ? `${chosen.length} maç “${conv.title}” sohbetine gidecek` : "En az bir maç seçin"}</span>
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" data-act="send-matches" disabled={!chosen.length || busy} onClick={send}><Icon name="send" size={14} /> {busy ? "Gönderiliyor…" : "Gönder"}</button>
      </>
    )}>
      <div className="ms-cform__grid">
        <div className="ms-cform__form">
          <MatchPicker {...day} picked={picked} setPicked={setPicked} />
          <Field label="Not (isteğe bağlı)"><textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="örn. Ekipler 19:30'da sahada olsun." /></Field>
        </div>
        <Preview><MatchesCard m={preview} canCompose={false} onAction={() => {}} /></Preview>
      </div>
    </Modal>
  );
}

/* --------------------------------- ben talibim --------------------------------- */
export function SignupForm({ conv, meId, initial, onClose, onSend }) {
  const day = useDayMatches(initial?.date);
  const [picked, setPicked] = useState(() => new Set(initial?.match_ids || []));
  const [duties, setDuties] = useState(["spiker", "reji"]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const first = React.useRef(true);
  useEffect(() => {
    // İlk yüklemede karttan gelen seçim korunur; gün değişirse o günün maçları seçilir.
    if (first.current && initial?.match_ids?.length) { first.current = false; return; }
    first.current = false;
    setPicked(new Set(day.items.map((m) => m.id)));
  }, [day.items]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = day.items.filter((m) => picked.has(m.id));
  const rows = chosen.length * duties.length;
  const autoTitle = `Görev talibi aranıyor: ${duties.map((d) => DUTY_MAP[d].label).join(", ")}`;
  const signup = useMemo(() => ({
    title: title.trim() || autoTitle, note: note.trim() || null, deadline: deadline || null, duties, volunteers: {}, closed: false,
    slots: chosen.flatMap((m) => duties.map((d) => ({ id: `${m.id}:${d}`, match_id: m.id, duty: d, duty_label: DUTY_MAP[d].label, match: { home: m.home, away: m.away, time: m.time, date: m.date, field: m.field, league: m.league }, assigned: m.crew?.[d] || null }))),
  }), [title, note, deadline, duties, chosen, autoTitle]);
  const toggleDuty = (k) => setDuties((list) => (list.includes(k) ? list.filter((x) => x !== k) : DUTIES.map((d) => d.key).filter((x) => x === k || list.includes(x))));
  const send = async () => { setBusy(true); const ok = await onSend("signup", { title: title.trim() || null, match_ids: chosen.map((m) => m.id), duties, note: note.trim() || null, deadline: deadline || null }); setBusy(false); if (ok) onClose(); };
  return (
    <Modal title="“Ben talibim” görev anketi" onClose={onClose} width={940} className="ms-modal ms-cform" footer={(
      <>
        <span className="ms-cform__foot">{rows > 80 ? "Tek ankette en fazla 80 satır olabilir — maç ya da görev azaltın." : rows ? `${chosen.length} maç × ${duties.length} görev = ${rows} satır` : "Maç ve görev seçin"}</span>
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" data-act="send-signup" disabled={!rows || rows > 80 || busy} onClick={send}><Icon name="send" size={14} /> {busy ? "Gönderiliyor…" : "Anketi gönder"}</button>
      </>
    )}>
      <div className="ms-cform__grid">
        <div className="ms-cform__form">
          <div>
            <span className="field__label">Hangi görevler?</span>
            <div className="ms-duty-pick">
              {DUTIES.map((d) => <button key={d.key} type="button" data-duty={d.key} className={duties.includes(d.key) ? "is-on" : ""} style={{ "--duty": d.tone }} onClick={() => toggleDuty(d.key)}><Icon name={d.icon} size={14} strokeWidth={2} /> {d.label}{duties.includes(d.key) && <Icon name="check" size={12} strokeWidth={3} />}</button>)}
            </div>
          </div>
          <MatchPicker {...day} picked={picked} setPicked={setPicked} />
          <div className="form-grid">
            <Field label="Başlık" className="span2"><input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} /></Field>
            <Field label="Son tarih (isteğe bağlı)"><input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
            <Field label="Not"><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="örn. Önce gelen alır" /></Field>
          </div>
        </div>
        <Preview><SignupCard m={{ id: 0, kind: "signup", sender: { is_me: true }, _pending: true, meta: { signup } }} meId={meId} canAssign={false} onAction={() => {}} /></Preview>
      </div>
    </Modal>
  );
}

/* -------------------------------- haftanın enleri -------------------------------- */
const lastWeek = () => {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7);
  return { start: isoDate(monday), end: isoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
};

export function AwardForm({ conv, meId, onClose, onSend }) {
  const lw = lastWeek();
  const [scope, setScope] = useState({ week: "", start_date: lw.start, end_date: lw.end, categories: ALL_AWARD.map((c) => c.key), squad_size: 7, league_id: "", season_id: "" });
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const people = awardRecipients(conv.participants, meId);
  const valid = scope.categories.length > 0 && scope.league_id && scope.season_id;
  const send = async () => {
    setBusy(true);
    const ok = await onSend("award", { week: scope.week || null, categories: scope.categories, league_id: Number(scope.league_id), season_id: Number(scope.season_id), start_date: scope.start_date, end_date: scope.end_date, squad_size: scope.squad_size, due_at: due ? new Date(due).toISOString() : null, note: note.trim() || null });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal title="Haftanın Enleri anketi" onClose={onClose} width={720} className="ms-modal ms-cform ms-cform--award" footer={(
      <>
        <span className="ms-cform__foot">{valid ? `${people.length || "Yönetim"} kişiye aday öneri kartı açılacak` : "Lig, sezon ve en az bir kategori seçin"}</span>
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" data-act="send-award" disabled={!valid || busy} onClick={send}><Icon name="trophy" size={14} /> {busy ? "Gönderiliyor…" : "Anketi gönder"}</button>
      </>
    )}>
      <div className="ms-award-intro">
        <span className="ms-award-intro__cup"><Icon name="trophy" size={26} strokeWidth={1.8} /></span>
        <div>
          <strong>Yapılacaklar'daki “Haftanın enleri aday önerisi” ile aynı akış</strong>
          <p>Sohbetteki yönetim ekibine birer <b>aday öneri kartı</b>, size önerileri toplayıp listeyi yayına alacağınız <b>koordinasyon kartı</b> açılır. İlerleme mesajda görünür.</p>
          {people.length > 0 && <div className="ms-award-intro__who">{people.slice(0, 8).map((p) => <span key={p.user_id}>{p.name}</span>)}{people.length > 8 && <span>+{people.length - 8}</span>}</div>}
        </div>
      </div>
      <AwardScope value={scope} onChange={setScope} />
      <div className="form-grid">
        <Field label="Son tarih (isteğe bağlı)"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Not"><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="örn. Pazartesi 12:00'ye kadar" /></Field>
      </div>
    </Modal>
  );
}

/** Karttan açılan aday önerisi / koordinasyon penceresi (Yapılacaklar bileşenleri). */
export function AwardTaskModal({ kind, id, week, onClose, go }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    get("/api/todos", { view: "mine", status: "all", kind }).then((r) => {
      if (!live) return;
      const t = r.ok ? (r.data.items || []).find((x) => Number(x.id) === Number(id)) : null;
      if (t) setTask(t); else setError(r.ok ? "Kart bulunamadı (silinmiş ya da size ait değil)." : r.error?.message || "Kart alınamadı.");
    });
    return () => { live = false; };
  }, [kind, id]);
  const close = () => { window.dispatchEvent(new CustomEvent("ms:award-refresh")); onClose(); };
  const coord = kind === "award_coordination";
  return (
    <Modal title={coord ? `Önerileri topla${week ? ` · ${week}` : ""}` : `Adaylarını öner${week ? ` · ${week}` : ""}`} onClose={close} width={coord ? 820 : 680} className="ms-modal ms-award-modal" footer={(
      <>
        <button type="button" className="link-btn small" onClick={() => { close(); go?.("todos"); }}><Icon name="checkSquare" size={13} /> Yapılacaklar'da aç</button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={close}>Kapat</button>
      </>
    )}>
      {!task ? (error ? <p className="ms-note">{error}</p> : <Spinner />) : coord
        ? <AwardBoard task={task} onUpdated={(item) => item && setTask(item)} />
        : <AwardProposal task={task} onUpdated={(item) => { if (item) setTask(item); window.dispatchEvent(new CustomEvent("ms:award-refresh")); }} />}
    </Modal>
  );
}

