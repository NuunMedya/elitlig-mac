// Yayın Stüdyosu · RÖPORTAJ düğmeleri: konuk hızlı seçimi + bant aç / kapat, bant
// şablonu, başlık / alt başlık düzenleme, kayıt (süre ve hedef halkası), röportajda an
// işaretleme (tekrar + bölüm), inceleme / yükleme / silme, röportaj mikrofonu (kanal),
// iki kişilik bant. Bant ve konuklar grafik modülünde (ctx.g: saveInterview,
// setInterviewOnAir, setInterviewStyle), kayıt useInterview'da (ctx.interview).
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { INTERVIEW_STYLES } from "../../../lib/studio/graphics";
import { INTERVIEW_TITLES, interviewPerson } from "../../../lib/studio/manageBroadcast";
import { Chip, FlowNote, Head, Kbd, PlayerGrid, Pill, Ring, Shell, hk, openPop, useNow, usePress } from "./wkit";
import { useLocal } from "./localStore";
import { pushRecent } from "./opsLogic";
import { optMenu, withOptions } from "./wOptions";

const gOk = (g) => Boolean(g?.matchId && g.saveInterview);
const noG = (w, h, label) => <Shell tone="blue" w={w} h={h}><Head icon="users" label={label} /><span className="st-w__empty">Röportaj bandı için maç seç.</span></Shell>;
const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const who = (p) => [p?.role, p?.teamName].filter(Boolean).join(" · ");

/** Kişiyi banda koy (tek ya da iki kişi), bandı aç, son konuklara ekle. */
async function putPeople(ctx, people, { on = true, setRecents } = {}) {
  const g = ctx.g;
  if (!gOk(g) || !people.length) return false;
  const ok = await g.saveInterview({ people }, null);
  if (ok === false) return false;
  if (on) await g.setInterviewOnAir?.(true);
  if (setRecents) setRecents((r) => people.reduce((acc, p) => pushRecent(acc, p, ctx.ops?.iv?.recentLimit || 8), r || []));
  return true;
}

/** Kişi seçici: son konuklar · elle · kadrodan (tek kişi döndürür). */
function PersonPicker({ ctx, onPick, recents, onForget, label = "Banda koy" }) {
  const [side, setSide] = useState("home");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const E = ctx.event || {};
  const team = side === "home" ? E.homeName : E.awayName;
  return (
    <>
      {recents.length > 0 && (
        <section className="wx-flow__sec"><h6>Son konuklar</h6>
          <div className="wx-grid is-3">{recents.map((p, i) => (
            <span key={`${p.name}${i}`} className="wi-rc">
              <Chip icon="user" sub={p.role || p.teamName} onClick={() => onPick(p)}>{p.name}</Chip>
              {onForget && <button type="button" className="wi-rc__x" onClick={() => onForget(p)} title="Listeden çıkar"><Icon name="x" size={10} /></button>}
            </span>
          ))}</div>
        </section>
      )}
      <section className="wx-flow__sec"><h6>Elle</h6>
        <div className="wx-row is-text">
          <input value={name} placeholder="Ad soyad" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onPick(interviewPerson({ name, role, side: "other" })); }} />
          <input value={role} placeholder="Görev (Teknik direktör…)" onChange={(e) => setRole(e.target.value)} />
          <button type="button" className="wx-primary is-sm" disabled={!name.trim()} onClick={() => onPick(interviewPerson({ name, role, side: "other" }))}>{label}</button>
        </div>
      </section>
      <section className="wx-flow__sec"><h6>Kadrodan <span className="wx-seg">{["home", "away"].map((s) => <button key={s} type="button" className={side === s ? "is-on" : ""} onClick={() => setSide(s)}>{s === "home" ? E.homeName : E.awayName}</button>)}</span></h6>
        <PlayerGrid players={E.squads?.[side] || []} side={side} allowEmpty={false} onPick={(id) => {
          const p = (E.squads?.[side] || []).find((x) => String(x.id) === String(id));
          if (p) onPick(interviewPerson({ playerId: p.id, name: p.name, side, teamName: team, role: p.position || "Oyuncu", image: p.image }));
        }} />
      </section>
    </>
  );
}

/* ═════════════════════════ KONUK HIZLI SEÇİM + BANT ═════════════════════════ */

function GuestFlow({ ctx, onClose, setWide }) {
  const [recents, setRecents] = useLocal("ivRecents", []);
  useEffect(() => { setWide?.(true); }, [setWide]);
  if (!gOk(ctx.g)) return <FlowNote tone="warn">Röportaj bandı için maç seç (grafik modülü).</FlowNote>;
  return (
    <div className="wx-flow">
      <PersonPicker ctx={ctx} recents={recents || []} onForget={(p) => setRecents((r) => (r || []).filter((x) => x !== p && !(x.name === p.name && x.role === p.role)))}
        onPick={async (p) => { if (await putPeople(ctx, [p], { setRecents })) onClose(); }} />
    </div>
  );
}
function IvGuest({ ctx, item, w, h, togglePop, popOpen }) {
  const g = ctx.g;
  const [recents, setRecents] = useLocal("ivRecents", []);
  const on = Boolean(g?.interview?.onAir);
  const person = g?.interview?.people?.[0];
  const press = usePress(() => (gOk(g) ? (on ? g.setInterviewOnAir(false) : person ? g.setInterviewOnAir(true) : openPop(item, togglePop, {})) : null), () => openPop(item, togglePop, {}));
  if (!gOk(g)) return noG(w, h, "KONUK");
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={on ? "air" : popOpen ? "armed" : null} className="wx-tile" {...press} title="Tık: bant aç / kapat · sağ tık: konuk seç">
        <Kbd k={hk(ctx, "interviewBand")} />
        <Icon name="user" size={20} strokeWidth={2.2} /><strong className="wx-t">{on ? "BANT YAYINDA" : "KONUK"}</strong><small className="wx-s">{person?.name || "seç"}</small>
      </Shell>
    );
  }
  const list = [...(g.interview.people || []), ...(recents || [])].filter((p, i, a) => p?.name && a.findIndex((x) => x.name === p.name && (x.role || "") === (p.role || "")) === i);
  const n = w >= 4 ? 8 : w >= 3 ? 6 : h >= 2 ? (w === 1 ? 4 : 4) : 2;
  const isCur = (p) => person && p.name === person.name && (p.role || "") === (person.role || "");
  return (
    <Shell tone="blue" w={w} h={h} state={on ? "air" : popOpen ? "armed" : null} className="wi-gs">
      <Head icon="user" label="KONUK" right={<><button type="button" className={`wx-sw ${on ? "is-on" : ""}`} onClick={() => g.setInterviewOnAir(!on)}>{on ? "YAYINDA" : "KAPALI"}</button><button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Konuk ekle / seç"><Icon name="plus" size={11} /></button></>} />
      <div className={`wi-gs__g ${w >= 3 ? "is-c3" : w === 1 ? "is-c1" : "is-c2"}`}>
        {list.slice(0, n).map((p, i) => (
          <button key={`${p.name}${i}`} type="button" className={`wi-gs__b ${isCur(p) ? "is-on" : ""}`} onClick={() => (isCur(p) ? g.setInterviewOnAir(!on) : putPeople(ctx, [p], { setRecents, on: item.opts?.autoOn !== false }))} title={`${p.name}${who(p) ? ` · ${who(p)}` : ""} — tık: banda koy`}>
            <strong>{p.name}</strong>{(h >= 2) && <small>{who(p) || "—"}</small>}
          </button>
        ))}
        {!list.length && <button type="button" className="wi-gs__b is-add" onClick={() => openPop(item, togglePop, {})}><Icon name="plus" size={12} /><strong>Konuk ekle</strong></button>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ BANT ŞABLONU ═════════════════════════ */

function IvTemplate({ ctx, item, w, h, togglePop }) {
  const g = ctx.g;
  if (!gOk(g)) return noG(w, h, "BANT ŞABLONU");
  const cur = g.interview.style;
  const list = INTERVIEW_STYLES.slice(0, h >= 2 || w >= 3 ? 5 : 3);
  return (
    <Shell tone="blue" w={w} h={h} state={g.interview.onAir ? "air" : null} className="wi-tp" {...optMenu(item, togglePop)}>
      <Head icon="palette" label="BANT ŞABLONU" right={g.interview.onAir ? <Pill tone="danger">YAYINDA</Pill> : null} />
      <div className={`wx-chips is-wrap is-c${w === 1 ? 1 : w >= 3 ? 3 : 2}`}>
        {list.map((s) => <button key={s.key} type="button" className={cur === s.key ? "is-on" : ""} onClick={() => g.setInterviewStyle?.(s.key)} title={s.hint}>{s.label}</button>)}
      </div>
      {h >= 2 && w >= 2 && item.opts?.hints !== false && <small className="wx-s">{INTERVIEW_STYLES.find((s) => s.key === cur)?.hint}</small>}
    </Shell>
  );
}

/* ═════════════════════════ BAŞLIK / ALT BAŞLIK ═════════════════════════ */

function TitleFlow({ ctx, onClose }) {
  const g = ctx.g;
  const [title, setTitle] = useState(g?.interview?.title || ctx.ops?.iv?.title || "RÖPORTAJ");
  const [people, setPeople] = useState(() => (g?.interview?.people || []).map((p) => ({ ...p })));
  if (!gOk(g)) return <FlowNote tone="warn">Röportaj bandı için maç seç.</FlowNote>;
  const save = async () => { if ((await g.saveInterview({ title: title.trim() || "RÖPORTAJ", people }, "Bant başlığı kaydedildi.")) !== false) onClose(); };
  return (
    <div className="wx-flow">
      <section className="wx-flow__sec"><h6>Başlık</h6>
        <div className="wx-row is-text"><input autoFocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></div>
        <div className="wx-grid">{[...INTERVIEW_TITLES, "DEVRE ARASI", "MAÇ ÖNÜ"].map((t) => <Chip key={t} on={title === t} onClick={() => setTitle(t)}>{t}</Chip>)}</div>
      </section>
      {people.length > 0 && (
        <section className="wx-flow__sec"><h6>Bantta görünen ad · alt başlık (görev)</h6>
          {people.map((p, i) => (
            <div key={i} className="wx-row is-text">
              <input value={p.name} maxLength={60} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input value={p.role || ""} maxLength={60} placeholder="Görev" onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
            </div>
          ))}
        </section>
      )}
      <button type="button" className="wx-primary" onClick={save}><Icon name="check" size={13} /> Kaydet {g.interview.onAir ? "(yayında hemen değişir)" : ""}</button>
    </div>
  );
}
function IvTitle({ ctx, item, w, h, togglePop, popOpen }) {
  const g = ctx.g;
  if (!gOk(g)) return noG(w, h, "BANT BAŞLIĞI");
  const iv = g.interview;
  const sub = iv.people?.[0];
  return (
    <Shell tone="blue" w={w} h={h} state={popOpen ? "armed" : iv.onAir ? "air" : null} className="wi-tt">
      <Head icon="pencil" label="BANT BAŞLIĞI" right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Başlık, ad, görev düzenle"><Icon name="pencil" size={11} /></button>} />
      <button type="button" className="wi-tt__v" onClick={() => openPop(item, togglePop, {})}>
        <strong>{iv.title || "RÖPORTAJ"}</strong>
        <small>{sub ? `${sub.name}${sub.role ? ` · ${sub.role}` : ""}` : "konuk yok"}</small>
      </button>
      {(h >= 2 || w >= 3) && item.opts?.quick !== false && <div className={`wx-chips is-wrap is-c${w >= 3 ? 2 : 1}`}>{INTERVIEW_TITLES.slice(0, h >= 2 ? 4 : 2).map((t) => <button key={t} type="button" className={iv.title === t ? "is-on" : ""} onClick={() => g.saveInterview({ title: t }, null)}>{t}</button>)}</div>}
    </Shell>
  );
}

/* ═════════════════════════ KAYIT + SÜRE ═════════════════════════ */

function IvRec({ ctx, item, w, h, togglePop }) {
  const iv = ctx.interview;
  const ops = ctx.ops?.iv || {};
  const now = useNow(Boolean(iv?.recording), 500);
  const target = (Number(item.opts?.targetMin) || ops.targetMin || 3) * 60_000;
  const band = item.opts?.band ?? ops.bandWithRecord ?? true;
  const main = () => (iv.recording ? iv.stop() : iv.reviewing ? iv.hideReview?.(false) : iv.start(ctx.g?.interview?.title || "Röportaj", { band }));
  const press = usePress(() => iv?.available && main(), () => openPop(item, togglePop, { mode: "options" }));
  if (!iv?.available) return <Shell tone="blue" w={w} h={h}><Head icon="mic" label="RÖPORTAJ KAYDI" /><span className="st-w__empty">Kayıt kullanılamıyor.</span></Shell>;
  const el = iv.recording ? now - iv.startedAt : 0;
  const over = el > target;
  const busy = ["starting", "stopping", "uploading"].includes(iv.status);
  const dis = busy || (!iv.recording && !iv.reviewing && !ctx.live?.onAir);
  const label = iv.recording ? "KAYDI BİTİR" : iv.reviewing ? "KAYDI İNCELE" : "KAYDI BAŞLAT";
  if (w === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={iv.recording ? "air" : iv.reviewing ? "armed" : null} className="wx-tile" disabled={dis} {...press} title="Tık: başlat / bitir · sağ tık: hedef süre, bant">
        <Kbd k={hk(ctx, "interview")} />
        <Ring frac={iv.recording ? Math.min(1, el / target) : 1} size={h >= 2 ? 44 : 32} tone={over ? "armed" : iv.recording ? "air" : "c"}><Icon name={iv.recording ? "stop" : "mic"} size={13} strokeWidth={2.3} /></Ring>
        <strong className="wx-t">{iv.recording ? clock(el) : label}</strong>
        <small className="wx-s">{iv.recording ? `hedef ${clock(target)}` : !ctx.live?.onAir ? "yayın kapalı" : band ? "bantla" : "bantsız"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} state={iv.recording ? "air" : iv.reviewing ? "armed" : null} className="wi-rec" {...optMenu(item, togglePop)}>
      <Head icon="mic" label="RÖPORTAJ KAYDI" dot={iv.recording ? "rec" : null} right={<em className={`wx-tc ${over ? "is-over" : ""}`}>{iv.recording ? clock(el) : "--:--"}</em>} />
      {h >= 2 && <span className="wx-prog"><i style={{ width: `${Math.min(100, (el / target) * 100)}%` }} /></span>}
      {h >= 2 && <small className="wx-s">{iv.recording ? (over ? `hedef aşıldı (+${clock(el - target)})` : `kalan ${clock(target - el)} · hedef ${clock(target)}`) : `hedef ${clock(target)} · ${band ? "bant kayıtla açılır" : "bant ayrı"}`}</small>}
      <button type="button" className={`wx-primary ${iv.recording ? "is-stop" : ""}`} disabled={dis} onClick={main}><Icon name={iv.recording ? "stop" : iv.reviewing ? "eye" : "mic"} size={13} /> {label}</button>
    </Shell>
  );
}

/* ═════════════════════════ AN İŞARETLE ═════════════════════════ */

function IvMark({ ctx, item, w, h, togglePop }) {
  const iv = ctx.interview;
  const [marks, setMarks] = useLocal("ivMarks", []);
  const sec = Number(item.opts?.seconds) || ctx.ops?.iv?.markSeconds || 15;
  const mark = () => {
    const at = iv?.recording ? Date.now() - iv.startedAt : null;
    if (ctx.markMoment) ctx.markMoment("Röportaj anı", sec); else ctx.replay?.momentFor?.(sec);
    if (ctx.live?.onAir && item.opts?.chapter !== false) ctx.chapter?.addLabel?.("Röportaj · önemli an");
    setMarks((m) => [{ at: Date.now(), off: at, label: `Röportaj anı${at != null ? ` · ${clock(at)}` : ""}` }, ...(m || [])].slice(0, 30));
  };
  const press = usePress(mark, () => openPop(item, togglePop, { mode: "options" }));
  const list = (marks || []).slice(0, h >= 2 ? 4 : 0);
  if (w === 1 || h === 1) {
    return (
      <Shell as="button" tone="amber" w={w} h={h} className="wx-tile" disabled={!ctx.live?.onAir} {...press} title={`Son ${sec} sn tekrar olarak kaydedilir${iv?.recording ? " (röportaj içinde)" : ""}`}>
        <Icon name="star" size={20} strokeWidth={2.2} />
        <strong className="wx-t">AN İŞARETLE</strong>
        <small className="wx-s">{(marks || []).length ? `${marks.length} işaret · son ${sec} sn` : `son ${sec} sn`}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="amber" w={w} h={h} className="wi-mk" {...optMenu(item, togglePop)}>
      <Head icon="star" label="RÖPORTAJ ANLARI" right={<b className="st-w__count">{(marks || []).length}</b>} />
      <button type="button" className="wx-primary" disabled={!ctx.live?.onAir} onClick={mark}><Icon name="star" size={13} /> An işaretle (son {sec} sn)</button>
      <ol className="wi-mk__l">{list.map((m) => <li key={m.at}><em>{new Date(m.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</em><span>{m.label}</span></li>)}</ol>
    </Shell>
  );
}

/* ═════════════════════════ İNCELE · YÜKLE · SİL ═════════════════════════ */

function IvReview({ ctx, w, h }) {
  const iv = ctx.interview;
  if (!iv?.available) return <Shell tone="blue" w={w} h={h}><Head icon="upload" label="RÖPORTAJ" /><span className="st-w__empty">Kayıt kullanılamıyor.</span></Shell>;
  const has = Boolean(iv.file) && ["review", "error", "done", "uploading"].includes(iv.status);
  const del = async () => {
    if (ctx.ops?.iv?.confirmDelete !== false && ctx.ask && !(await ctx.ask({ title: "Röportaj kaydı silinsin mi?", message: "Kayıt bu bilgisayardan silinir (yüklenmediyse geri gelmez).", confirmLabel: "Sil", danger: true }))) return;
    iv.discard();
  };
  const st = iv.status === "uploading" ? `YÜKLENİYOR %${iv.progress ?? 0}` : iv.status === "done" ? "YÜKLENDİ" : iv.status === "error" ? "HATA" : iv.recording ? "KAYITTA" : has ? "İNCELEMEDE" : "KAYIT YOK";
  return (
    <Shell tone="blue" w={w} h={h} state={iv.status === "error" ? "air" : has ? "armed" : null} className="wi-rv">
      <Head icon="upload" label="RÖPORTAJ KAYDI" right={<Pill tone={iv.status === "done" ? "green" : iv.status === "error" ? "danger" : "plain"}>{st}</Pill>} />
      {iv.status === "uploading" && <span className="wx-prog"><i style={{ width: `${iv.progress || 0}%` }} /></span>}
      {h >= 2 && <small className="wx-s">{has ? `${iv.file.name}${iv.file.durationMs ? ` · ${clock(iv.file.durationMs)}` : ""}` : iv.status === "done" ? "Maç sayfasında" : "Önce kayıt al"}</small>}
      <div className={`wx-row is-actions ${w === 1 ? "is-col" : ""}`}>
        <button type="button" disabled={!has || iv.status === "uploading"} onClick={() => iv.hideReview?.(false)} title="İnceleme penceresi"><Icon name="eye" size={11} /> İzle</button>
        <button type="button" className={has && iv.status !== "done" ? "is-on" : ""} disabled={!has || ["uploading", "done"].includes(iv.status)} onClick={() => (iv.status === "error" ? iv.retry() : iv.upload())}><Icon name="upload" size={11} /> {iv.status === "error" ? "Yeniden" : "Yükle"}</button>
        <button type="button" className="is-off" disabled={!has || iv.status === "uploading"} onClick={del}><Icon name="trash" size={11} /> Sil</button>
      </div>
    </Shell>
  );
}

/* ═════════════════════════ RÖPORTAJ MİKROFONU ═════════════════════════ */

function IvMic({ ctx, item, w, h, togglePop }) {
  const A = ctx.mixer;
  const ops = ctx.ops?.iv || {};
  const stripId = item.opts?.strip || ops.micStrip || "mic";
  const muteOthers = item.opts?.muteOthers ?? ops.muteOthers ?? false;
  const s = A?.strips?.find((x) => x.id === stripId) || A?.strips?.[0];
  const st = s ? A.settings?.strips?.[s.id] || {} : {};
  const toggle = () => {
    if (!s) return;
    const opening = Boolean(st.mute);
    A.setStrip(s.id, { mute: !opening });
    if (opening && muteOthers) for (const o of A.strips) if (o.id !== s.id && /mic|mik/i.test(`${o.id} ${o.icon || ""}`) && !A.settings.strips[o.id]?.mute) A.setStrip(o.id, { mute: true });
  };
  const press = usePress(toggle, () => openPop(item, togglePop, { mode: "options" }));
  if (!A?.strips || !A.setStrip) return <Shell tone="green" w={w} h={h}><Head icon="mic" label="RÖPORTAJ MİK" /><span className="st-w__empty">Karıştırıcı hazır değil.</span></Shell>;
  const open = s && !st.mute;
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone={open ? "green" : "danger"} w={w} h={h} state={open ? "air" : null} className="wx-tile" {...press} title="Tık: röportaj mikrofonunu aç / kapat · sağ tık: kanal">
        <Icon name={open ? "mic" : "micOff"} size={20} strokeWidth={2.2} /><strong className="wx-t">{open ? "MİK AÇIK" : "MİK KAPALI"}</strong><small className="wx-s">{s?.label || "kanal"}</small>
      </Shell>
    );
  }
  const list = A.strips.slice(0, w >= 3 ? 6 : h >= 2 ? 4 : 2);
  return (
    <Shell tone="green" w={w} h={h} state={open ? "air" : null} className="wi-mic" {...optMenu(item, togglePop)}>
      <Head icon="mic" label="RÖPORTAJ MİK" right={<button type="button" className={`wx-sw ${open ? "is-on" : ""}`} onClick={toggle}>{open ? "AÇIK" : "KAPALI"}</button>} />
      <div className={`wx-chips is-wrap is-c${w === 1 ? 1 : w >= 3 ? 3 : 2}`}>
        {list.map((x) => <button key={x.id} type="button" className={x.id === s?.id ? "is-on" : ""} onClick={() => ctx.setItemOpts?.(item.id, { strip: x.id })} title="Röportaj kanalı olarak seç">{x.label}{A.settings.strips[x.id]?.mute ? " ·" : " ●"}</button>)}
      </div>
      {h >= 2 && <small className="wx-s">{muteOthers ? "açınca öbür mikrofonlar kapanır" : "öbür kanallar etkilenmez"}</small>}
    </Shell>
  );
}

/* ═════════════════════════ İKİ KİŞİLİK BANT ═════════════════════════ */

function DuoFlow({ ctx, item, onClose, setWide }) {
  const g = ctx.g;
  const [recents, setRecents] = useLocal("ivRecents", []);
  const [pair, setPair] = useState(() => (g?.interview?.people || []).slice(0, 2));
  const [slot, setSlot] = useState(pair.length >= 1 ? 1 : 0);
  useEffect(() => { setWide?.(true); }, [setWide]);
  if (!gOk(g)) return <FlowNote tone="warn">Röportaj bandı için maç seç.</FlowNote>;
  const pick = (p) => { setPair((l) => { const n = [...l]; n[slot] = p; return n.slice(0, 2); }); setSlot((x) => (x === 0 ? 1 : x)); };
  const ready = pair.filter(Boolean).length === 2;
  return (
    <div className="wx-flow">
      <div className="wi-duo">
        {[0, 1].map((i) => (
          <button key={i} type="button" className={`wi-duo__s ${slot === i ? "is-on" : ""}`} onClick={() => setSlot(i)}>
            <b>{i + 1}</b><span><strong>{pair[i]?.name || "Kişi seç"}</strong><small>{who(pair[i]) || (slot === i ? "aşağıdan seç" : "")}</small></span>
          </button>
        ))}
        <button type="button" className="wx-icon" onClick={() => setPair((l) => [l[1], l[0]].filter((x) => x !== undefined))} title="Yer değiştir"><Icon name="swap" size={13} /></button>
      </div>
      <button type="button" className="wx-primary" disabled={!ready} onClick={async () => { if (item?.opts?.style) g.setInterviewStyle?.(item.opts.style); if (await putPeople(ctx, pair.filter(Boolean), { setRecents })) onClose(); }}><Icon name="users" size={13} /> İki kişiyi bantta göster</button>
      <PersonPicker ctx={ctx} recents={recents || []} onPick={pick} label="Seç" />
    </div>
  );
}
function IvDuo({ ctx, item, w, h, togglePop, popOpen }) {
  const g = ctx.g;
  if (!gOk(g)) return noG(w, h, "İKİ KİŞİ");
  const ppl = g.interview.people || [];
  const duo = ppl.length >= 2;
  const on = Boolean(g.interview.onAir);
  return (
    <Shell tone="blue" w={w} h={h} state={on && duo ? "air" : popOpen ? "armed" : null} className="wi-dz" {...optMenu(item, togglePop)}>
      <Head icon="users" label="İKİ KİŞİLİK BANT" right={<button type="button" className={`wx-sw ${on ? "is-on" : ""}`} disabled={!ppl.length} onClick={() => g.setInterviewOnAir(!on)}>{on ? "YAYINDA" : "KAPALI"}</button>} />
      <button type="button" className="wi-dz__p" onClick={() => openPop(item, togglePop, {})}>
        {[0, 1].map((i) => <span key={i} className={ppl[i] ? "" : "is-empty"}><b>{i + 1}</b><strong>{ppl[i]?.name || "seç"}</strong>{h >= 2 && <small>{who(ppl[i])}</small>}</span>)}
      </button>
    </Shell>
  );
}

export const ROPORTAJ_WIDGETS = {
  ivGuest: withOptions({ popTitle: "Konuk · bant", popover: (p) => <GuestFlow {...p} />, render: (p) => <IvGuest {...p} /> }, [{ key: "autoOn", label: "Konuğa dokununca bant yayına", type: "bool", def: true }], { note: "Son konuk sayısı: Ayarlar › Röportaj." }),
  ivTemplate: withOptions({ render: (p) => <IvTemplate {...p} /> }, [{ key: "hints", label: "Şablon açıklaması görünsün", type: "bool", def: true }]),
  ivTitle: withOptions({ popTitle: "Bant başlığı · ad · görev", popover: (p) => <TitleFlow {...p} />, render: (p) => <IvTitle {...p} /> }, [{ key: "quick", label: "Kartta hazır başlıklar", type: "bool", def: true }]),
  ivRec: withOptions({ render: (p) => <IvRec {...p} /> }, [
    { key: "targetMin", label: "Hedef süre (dk)", type: "select", def: null, choices: [[null, "Ayarlardaki"], [1, "1"], [2, "2"], [3, "3"], [5, "5"], [8, "8"], [10, "10"]] },
    { key: "band", label: "Kayıt başlarken bandı aç", type: "select", def: null, choices: [[null, "Ayarlardaki"], [true, "Aç"], [false, "Açma"]] },
  ]),
  ivMark: withOptions({ render: (p) => <IvMark {...p} /> }, [
    { key: "seconds", label: "Kaç saniye geriye", type: "select", def: null, choices: [[null, "Ayarlardaki"], [10, "10 sn"], [15, "15 sn"], [20, "20 sn"], [30, "30 sn"]] },
    { key: "chapter", label: "YouTube bölümü de ekle", type: "bool", def: true },
  ]),
  ivReview: withOptions({ render: (p) => <IvReview {...p} /> }, [], { note: "Silmeden önce sorma: Ayarlar › Röportaj." }),
  ivMic: withOptions({ render: (p) => <IvMic {...p} /> }, [
    { key: "strip", label: "Röportaj kanalı", type: "strip", def: null },
    { key: "muteOthers", label: "Açınca öbür mikrofonları kapat", type: "select", def: null, choices: [[null, "Ayarlardaki"], [true, "Kapat"], [false, "Dokunma"]] },
  ]),
  ivDuo: withOptions({ popTitle: "İki kişilik bant", popover: (p) => <DuoFlow {...p} />, render: (p) => <IvDuo {...p} /> }, [{ key: "style", label: "İkili için bant şablonu", type: "select", def: null, choices: [[null, "Değiştirme"], ...INTERVIEW_STYLES.map((s) => [s.key, s.label])] }]),
};
