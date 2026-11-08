// Yayın Stüdyosu · ÖZET düğmeleri: seçili tekrarlardan özet oluştur, son tekrarı özete
// ekle, giriş / kapanış kartı (uzun · kısa · yok), arka plan müziği ve seviyesi, özeti
// önizle / yayına al, oluştur → yükle (ilerleme halkası), maçın golü / kurtarışı olarak
// işaretle. Seçim, kartlar ve müzik Özet paneliyle ortaktır (./hlStore); oluşturma tek
// yoldan (buildHighlight → useHighlights.build).
import React, { useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { mmss } from "../../../lib/studio/highlights";
import { highlightsPayload, momentCandidates, momentFromCandidate, readHighlights, readMoments } from "../../../lib/studio/manageBroadcast";
import { defaultAngles, metaFor, replayTitle } from "../../../lib/studio/replays";
import * as manageApi from "../manage/manageApi";
import { CARD_LENGTHS } from "../settings/opsSettings";
import { Chip, FlowNote, Head, Pill, Ring, Shell, openPop, usePress } from "./wkit";
import { HL_BUSY, HL_PHASE, addToHighlight, buildHighlight, highlightPlan, mineOf, useHlCards, useHlMusic, useHlSelection } from "./hlStore";
import { toggleHighlight } from "./opsLogic";
import { optMenu, withOptions } from "./wOptions";

const noHl = (w, h, label) => <Shell tone="violet" w={w} h={h}><Head icon="sparkles" label={label} /><span className="st-w__empty">Özet için maç seç.</span></Shell>;
const okHl = (ctx) => Boolean(ctx.ozet?.hl && ctx.ozet.matchId && ctx.match);

/** Ortak: bu maçın tekrarları, seçim, plan. */
function useHl(ctx) {
  const O = ctx.ozet || {};
  const meta = ctx.replay?.meta || {};
  const mine = useMemo(() => mineOf(ctx.replay?.list || [], meta, O.matchId), [ctx.replay?.list, meta, O.matchId]);
  const sel = useHlSelection(O.matchId, mine, meta);
  const [cards, setCards] = useHlCards(ctx.ops);
  const [music, setMusic] = useHlMusic(ctx.ops);
  const live = ctx.match;
  const plan = useMemo(() => (live ? highlightPlan({ items: sel.items, mine, meta, live, cards }) : { segments: [], clipCount: 0, durationMs: 0 }), [sel.items, mine, meta, live, cards]);
  const build = async () => {
    if (!plan.clipCount) { ctx.toast?.("Özete klip ekle.", { tone: "warn" }); return; }
    const job = O.hl.job;
    if (job.file && job.phase !== "uploaded" && ctx.ask && !(await ctx.ask({ title: "Yeniden oluştur", message: "Önizlemedeki özet atılıp yenisi oluşturulsun mu?", confirmLabel: "Yeniden oluştur" }))) return;
    await buildHighlight({ hl: O.hl, plan, meta, live, imagesRef: O.imagesRef, stingerKind: O.stingerKind, music });
    if (ctx.ops?.hl?.previewWhenDone && O.hl.job.phase !== "error") ctx.modes?.setPreview?.("ozet");
  };
  const upload = async () => {
    const existing = O.hl.server?.item;
    if ((existing || ctx.ops?.hl?.confirmUpload) && ctx.ask && !(await ctx.ask({ title: existing ? "Özeti değiştir" : "Özeti yükle", message: existing ? "Maç sayfasında zaten bir özet var. Yenisiyle değiştirilsin mi?" : "Özet maç sayfasına yüklensin mi?", confirmLabel: existing ? "Değiştir" : "Yükle", danger: Boolean(existing) }))) return;
    const res = await O.hl.upload();
    if (res.ok) ctx.toast?.("Özet maç sayfasına yüklendi.", { tone: "success" }); else if (res.error) ctx.toast?.(res.error, { tone: "error", timeout: 6000 });
  };
  return { O, meta, mine, sel, cards, setCards, music, setMusic, plan, build, upload, job: O.hl?.job || { phase: "idle", progress: 0 } };
}
const jobFrac = (job) => (job.phase === "preparing" ? (job.total ? job.loaded / job.total : 0) : job.progress || 0);

/* ═════════════════════════ SEÇİLENLERDEN OLUŞTUR ═════════════════════════ */

function SelFlow({ ctx }) {
  const H = useHl(ctx);
  if (!okHl(ctx)) return <FlowNote tone="warn">Özet için maç seç.</FlowNote>;
  const on = (r) => H.sel.items.some((x) => x.replayId === r.id);
  return (
    <div className="wx-flow">
      <FlowNote icon="sparkles">{H.sel.items.length} tekrar seçili · ≈ {mmss(H.plan.durationMs)} · sıra seçim sırasıdır</FlowNote>
      <div className="wh-sel">
        {H.mine.map((r) => {
          const i = H.sel.items.findIndex((x) => x.replayId === r.id);
          return (
            <button key={r.id} type="button" className={`wh-sel__r ${on(r) ? "is-on" : ""}`} onClick={() => H.sel.edit((l) => toggleHighlight(l, r, defaultAngles(r, ctx.replay?.recordAngles)))}>
              <b>{i >= 0 ? i + 1 : ""}</b>
              <span><strong>{replayTitle(r, metaFor(r, H.meta))}</strong><small>{(r.angles || []).filter((a) => a.url).length} açı · {r.kind === "goal" ? "gol" : "an"}</small></span>
              <Icon name={on(r) ? "check" : "plus"} size={13} />
            </button>
          );
        })}
        {!H.mine.length && <p className="wx-hint">Bu maçta tekrar yok.</p>}
      </div>
      <div className="wx-row is-actions">
        <button type="button" className="wx-btn" disabled={!H.sel.edited} onClick={H.sel.reset}><Icon name="undo" size={12} /> Varsayılan (goller + anlar)</button>
        <button type="button" className="wx-btn" onClick={() => H.sel.edit([])}><Icon name="x" size={12} /> Temizle</button>
      </div>
      <button type="button" className="wx-primary" disabled={!H.plan.clipCount || HL_BUSY.includes(H.job.phase) || !H.O.hl.available} onClick={H.build}><Icon name="sparkles" size={13} /> Özeti oluştur ({H.plan.clipCount} klip)</button>
    </div>
  );
}
function HlBuild({ ctx, item, w, h, togglePop, popOpen }) {
  const H = useHl(ctx);
  if (!okHl(ctx)) return noHl(w, h, "ÖZET");
  const busy = HL_BUSY.includes(H.job.phase);
  const n = w >= 4 ? 8 : w >= 3 ? 6 : h >= 2 ? 4 : 0;
  return (
    <Shell tone="violet" w={w} h={h} state={busy ? "armed" : popOpen ? "armed" : null} className="wh-bd" {...optMenu(item, togglePop)}>
      <Head icon="sparkles" label="ÖZET · SEÇİM" right={<><b className="st-w__count">{H.sel.items.length}</b><button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Tekrarları seç / sırala"><Icon name="list" size={11} /></button></>} />
      {n > 0 && (
        <div className={`wx-chips is-wrap is-c${w >= 3 ? 2 : 1}`}>
          {H.mine.slice(0, n).map((r) => {
            const on = H.sel.items.some((x) => x.replayId === r.id);
            return <button key={r.id} type="button" className={on ? "is-on" : ""} onClick={() => H.sel.edit((l) => toggleHighlight(l, r, defaultAngles(r, ctx.replay?.recordAngles)))} title="Özete ekle / çıkar">{replayTitle(r, metaFor(r, H.meta))}</button>;
          })}
          {!H.mine.length && <span className="st-w__empty">Tekrar yok.</span>}
        </div>
      )}
      {busy && <span className="wx-prog"><i style={{ width: `${Math.round(jobFrac(H.job) * 100)}%` }} /></span>}
      <button type="button" className="wx-primary" disabled={!H.plan.clipCount || busy || !H.O.hl.available} onClick={H.build} title={`${H.plan.clipCount} klip · ≈ ${mmss(H.plan.durationMs)}`}>
        <Icon name="sparkles" size={13} /> {busy ? HL_PHASE[H.job.phase] : `Oluştur · ${mmss(H.plan.durationMs)}`}
      </button>
    </Shell>
  );
}

/* ═════════════════════════ SON TEKRARI ÖZETE EKLE ═════════════════════════ */

function HlAddLast({ ctx, item, w, h, togglePop }) {
  const H = useHl(ctx);
  const last = H.mine[0];
  const inIt = last && H.sel.items.some((x) => x.replayId === last.id);
  const add = () => {
    if (!last) return;
    if (inIt) { if (item.opts?.toggle) H.sel.edit((l) => l.filter((x) => x.replayId !== last.id)); else ctx.toast?.("Son tekrar zaten özette.", { tone: "info", timeout: 1800 }); return; }
    addToHighlight(H.O.matchId, last, H.mine, defaultAngles(last, ctx.replay?.recordAngles), H.meta);
    ctx.toast?.(`Özete eklendi: ${replayTitle(last, metaFor(last, H.meta))}.`, { tone: "success", timeout: 2200 });
  };
  const press = usePress(add, () => openPop(item, togglePop, { mode: "options" }));
  if (!okHl(ctx)) return noHl(w, h, "ÖZETE EKLE");
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={inIt ? "pvw" : null} className="wx-tile" disabled={!last} {...press} title="Son tekrarı özetin sonuna ekler">
      <Icon name={inIt ? "check" : "plus"} size={20} strokeWidth={2.2} />
      <strong className="wx-t">{inIt ? "ÖZETTE" : "ÖZETE EKLE"}</strong>
      <small className="wx-s">{last ? replayTitle(last, metaFor(last, H.meta)) : "tekrar yok"}</small>
    </Shell>
  );
}

/* ═════════════════════════ GİRİŞ / KAPANIŞ KARTI ═════════════════════════ */

function HlCards({ ctx, item, w, h, togglePop }) {
  const H = useHl(ctx);
  if (!okHl(ctx)) return noHl(w, h, "KARTLAR");
  const row = (k, l) => (
    <div className={`wx-row ${w === 1 ? "is-col" : ""}`} key={k}>
      {(w >= 2) && <span>{l}</span>}
      {CARD_LENGTHS.map((c) => <button key={c.key} type="button" className={H.cards[k] === c.key ? "is-on" : ""} onClick={() => H.setCards({ [k]: c.key })} title={`${l}: ${c.label}`}>{w === 1 ? `${l[0]} · ${c.label}` : c.label}</button>)}
    </div>
  );
  return (
    <Shell tone="violet" w={w} h={h} className="wh-cd" {...optMenu(item, togglePop)}>
      <Head icon="image" label="ÖZET KARTLARI" right={<small className="wx-head__r">≈ {mmss(H.plan.durationMs)}</small>} />
      {row("intro", "Giriş")}
      {(h >= 2 || w >= 2) && row("outro", "Kapanış")}
    </Shell>
  );
}

/* ═════════════════════════ MÜZİK ═════════════════════════ */

function HlMusic({ ctx, item, w, h, togglePop }) {
  const H = useHl(ctx);
  const [busy, setBusy] = useState(false);
  if (!okHl(ctx)) return noHl(w, h, "ÖZET MÜZİĞİ");
  const m = H.music;
  const pick = async () => {
    setBusy(true);
    try {
      const r = await window.elitlig?.studio?.media?.pick?.({ kind: "audio" });
      const f = r?.files?.[0];
      if (f?.url) H.setMusic({ url: f.url, name: f.name || "Müzik" });
      else if (!window.elitlig?.studio?.media?.pick) ctx.toast?.("Müzik seçimi bu uygulama sürümünde yok.", { tone: "warn" });
    } finally { setBusy(false); }
  };
  return (
    <Shell tone="violet" w={w} h={h} state={m.url ? "pvw" : null} className="wh-mu" {...optMenu(item, togglePop)}>
      <Head icon="music" label="ÖZET MÜZİĞİ" right={m.url ? <button type="button" className="wx-gear" onClick={() => H.setMusic({ url: null, name: "" })} title="Müziği kaldır"><Icon name="x" size={11} /></button> : null} />
      <button type="button" className="wh-mu__f" disabled={busy} onClick={pick} title="Müzik dosyası seç"><Icon name="folder" size={12} /><span>{m.url ? m.name || "Müzik" : "Müzik seç"}</span></button>
      {(h >= 2 || w >= 3) && (
        <label className="wl-sl" title="Kartlarda müzik seviyesi"><Icon name="sliders" size={12} /><input type="range" min={-40} max={0} value={m.volumeDb} onChange={(e) => H.setMusic({ volumeDb: Number(e.target.value) })} aria-label="Müzik seviyesi" /><b>{m.volumeDb}</b></label>
      )}
      {h >= 2 && (
        <label className="wl-sl" title="Kliplerde müzik bu kadar kısılır"><Icon name="micOff" size={12} /><input type="range" min={-40} max={0} value={m.duckDb} onChange={(e) => H.setMusic({ duckDb: Number(e.target.value) })} aria-label="Kliplerde kıs" /><b>{m.duckDb}</b></label>
      )}
    </Shell>
  );
}

/* ═════════════════════════ ÖNİZLE / YAYINA ═════════════════════════ */

function HlPreview({ ctx, item, w, h, togglePop }) {
  const M = ctx.modes;
  const hl = ctx.ozet?.hl;
  const has = Boolean(hl?.job?.file);
  const pvw = M?.previewMode === "ozet";
  const air = M?.airMode === "ozet";
  const press = usePress(() => (air ? M.endOnAir?.() : pvw ? M.takeMode?.("ozet") : M?.setPreview?.("ozet")), () => openPop(item, togglePop, { mode: "options" }));
  if (!M?.setPreview || !okHl(ctx)) return noHl(w, h, "ÖZET");
  const label = air ? "CANLIYA DÖN" : pvw ? "YAYINA AL" : "ÖNİZLE";
  if (w === 1 || h === 1) {
    return (
      <Shell as="button" tone="violet" w={w} h={h} state={air ? "air" : pvw ? "pvw" : null} className="wx-tile" {...press} title={has ? "Özeti önizle · önizlemedeyse yayına" : "Özet oluşmadıysa giriş kartı önizlenir"}>
        <Icon name={air ? "stop" : pvw ? "play" : "eye"} size={20} strokeWidth={2.2} />
        <strong className="wx-t">{label}</strong>
        <small className="wx-s">{air ? "özet yayında" : has ? mmss(hl.job.file.durationMs) : "giriş kartı"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="violet" w={w} h={h} state={air ? "air" : pvw ? "pvw" : null} className="wh-pv" {...optMenu(item, togglePop)}>
      <Head icon="sparkles" label="ÖZET" right={<Pill tone={air ? "danger" : pvw ? "green" : "plain"}>{air ? "YAYINDA" : pvw ? "ÖNİZLEMEDE" : has ? "HAZIR" : "KART"}</Pill>} />
      <div className="wx-row is-actions">
        <button type="button" className={pvw ? "is-on" : ""} onClick={() => (pvw ? M.clearPreview?.("ozet") : M.setPreview("ozet"))}><Icon name="eye" size={11} /> {pvw ? "Bırak" : "Önizle"}</button>
        <button type="button" className={air ? "is-air" : ""} disabled={!has && !air} onClick={() => (air ? M.endOnAir?.() : pvw ? M.takeMode?.("ozet") : (M.setPreview("ozet"), M.takeMode?.("ozet")))}><Icon name={air ? "stop" : "play"} size={11} /> {air ? "Canlıya dön" : "Yayına"}</button>
      </div>
      <small className="wx-s">{has ? `${mmss(hl.job.file.durationMs)} · kendi sesiyle oynar` : "Önce özeti oluştur"}</small>
    </Shell>
  );
}

/* ═════════════════════════ OLUŞTUR → YÜKLE ═════════════════════════ */

function HlRender({ ctx, item, w, h, togglePop }) {
  const H = useHl(ctx);
  const job = H.job;
  const busy = HL_BUSY.includes(job.phase);
  const main = () => (busy ? (job.phase !== "uploading" ? H.O.hl.cancel() : null) : job.file && job.phase !== "uploaded" ? H.upload() : H.build());
  const press = usePress(main, () => openPop(item, togglePop, { mode: "options" }));
  if (!okHl(ctx)) return noHl(w, h, "ÖZET");
  const label = busy ? (job.phase === "uploading" ? "YÜKLENİYOR" : "VAZGEÇ") : job.phase === "uploaded" ? "YENİDEN OLUŞTUR" : job.file ? "YÜKLE" : "OLUŞTUR";
  const pct = Math.round(jobFrac(job) * 100);
  const sub = busy ? `${HL_PHASE[job.phase]} %${pct}` : job.phase === "uploaded" ? "maç sayfasında" : job.file ? mmss(job.file.durationMs) : `${H.plan.clipCount} klip · ${mmss(H.plan.durationMs)}`;
  if (w === 1 || h === 1) {
    return (
      <Shell as="button" tone="violet" w={w} h={h} state={busy ? "armed" : job.phase === "uploaded" ? "pvw" : null} className="wx-tile" disabled={(!H.plan.clipCount && !job.file) || !H.O.hl.available} {...press}>
        <Ring frac={busy ? jobFrac(job) : job.file ? 1 : 0} size={32} tone={busy ? "armed" : "c"}><Icon name={busy ? "x" : job.file && job.phase !== "uploaded" ? "upload" : "sparkles"} size={13} /></Ring>
        <strong className="wx-t">{label}</strong><small className="wx-s">{sub}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="violet" w={w} h={h} state={busy ? "armed" : job.phase === "uploaded" ? "pvw" : null} className="wh-rd" {...optMenu(item, togglePop)}>
      <Head icon="sparkles" label="ÖZET DOSYASI" right={<Pill tone={job.phase === "uploaded" ? "green" : job.phase === "error" ? "danger" : "plain"}>{HL_PHASE[job.phase] || "—"}</Pill>} />
      <div className="wh-rd__m">
        <Ring frac={busy ? jobFrac(job) : job.file ? 1 : 0} size={44} tone={busy ? "armed" : "c"}><b className="wx-db">{busy ? `%${pct}` : job.file ? "✓" : "—"}</b></Ring>
        <span><strong>{job.file ? mmss(job.file.durationMs) : mmss(H.plan.durationMs)}</strong><small>{job.error || sub}</small></span>
      </div>
      <div className="wx-row is-actions">
        <button type="button" disabled={busy || !H.plan.clipCount || !H.O.hl.available} onClick={H.build}><Icon name="sparkles" size={11} /> {job.file ? "Yeniden" : "Oluştur"}</button>
        {busy && job.phase !== "uploading" ? <button type="button" className="is-off" onClick={H.O.hl.cancel}><Icon name="x" size={11} /> Vazgeç</button>
          : <button type="button" className={job.file && job.phase !== "uploaded" ? "is-on" : ""} disabled={!job.file || busy || job.phase === "uploaded"} onClick={H.upload}><Icon name="upload" size={11} /> Yükle</button>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ MAÇIN GOLÜ / KURTARIŞI ═════════════════════════ */

const KINDS = [{ key: "best_goal", kind: "goal", label: "Maçın golü" }, { key: "best_save", kind: "save", label: "Maçın kurtarışı" }];
async function saveMoment(ctx, key, cand) {
  const L = ctx.match;
  const matchId = ctx.ozet?.matchId;
  if (!L?.match || !matchId) return false;
  const players = [...(L.squads?.home || []), ...(L.squads?.away || [])];
  const highlights = { ...readHighlights(L.match, players), [key]: cand?.playerId || "" };
  const moments = { ...readMoments(L.match), [key]: cand ? momentFromCandidate(cand) : null };
  const res = await manageApi.updateMatch(matchId, highlightsPayload(highlights, (id) => L.nameOf?.(id) || "", moments));
  if (!res?.ok) { ctx.toast?.(res?.error?.message || "Kaydedilemedi.", { tone: "error" }); return false; }
  ctx.toast?.(`${KINDS.find((k) => k.key === key)?.label}: ${cand ? `${cand.minute}' ${cand.playerName || ""}` : "kaldırıldı"}.`, { tone: "success" });
  L.refresh?.();
  return true;
}
function MomentFlow({ ctx, item, onClose }) {
  const L = ctx.match;
  const [kind, setKind] = useState(item?.opts?.kind || "best_goal");
  if (!L) return <FlowNote tone="warn">Maç seç.</FlowNote>;
  const k = KINDS.find((x) => x.key === kind);
  const cands = momentCandidates(L.events, { kind: k.kind, homeTeamId: L.homeTeamId, awayTeamId: L.awayTeamId, nameOf: L.nameOf, replays: ctx.replay?.list || [] });
  const cur = readMoments(L.match)?.[kind];
  return (
    <div className="wx-flow">
      <div className="wx-seg">{KINDS.map((x) => <button key={x.key} type="button" className={kind === x.key ? "is-on" : ""} onClick={() => setKind(x.key)}>{x.label}</button>)}</div>
      <div className="wx-grid">
        {cands.map((c) => <Chip key={c.eventId} icon={c.hasClip ? "video" : k.kind === "save" ? "shield" : "ball"} on={cur?.event_id === c.eventId} sub={`${c.minute}'`} onClick={async () => { if (await saveMoment(ctx, kind, c)) onClose(); }}>{c.playerName || "Oyuncusuz"}</Chip>)}
        {!cands.length && <p className="wx-hint">Aday yok ({k.kind === "save" ? "kurtarış" : "gol"} olayı girilmemiş).</p>}
      </div>
      {cur && <button type="button" className="wx-nobody" onClick={async () => { if (await saveMoment(ctx, kind, null)) onClose(); }}>Seçimi kaldır</button>}
    </div>
  );
}
function HlSetMatch({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.match;
  if (!L?.match) return noHl(w, h, "MAÇIN ANI");
  const m = readMoments(L.match);
  const rows = KINDS.slice(0, h >= 2 || w >= 3 ? 2 : 1).map((k) => ({ ...k, cur: m?.[k.key] }));
  return (
    <Shell tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className="wh-ms" {...optMenu(item, togglePop)}>
      <Head icon="award" label="MAÇIN ANI" right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Seç"><Icon name="pencil" size={11} /></button>} />
      {rows.map((k) => (
        <button key={k.key} type="button" className={`wh-ms__r ${k.cur ? "is-on" : ""}`} onClick={() => openPop(item, togglePop, {})}>
          <Icon name={k.kind === "save" ? "shield" : "ball"} size={12} />
          <span><strong>{k.label}</strong><small>{k.cur ? `${k.cur.minute ?? "?"}' · ${L.nameOf?.(k.cur.player_id) || "oyuncusuz"}${k.cur.clip_url ? " · klip" : ""}` : "seçilmedi"}</small></span>
        </button>
      ))}
    </Shell>
  );
}

export const OZET_WIDGETS = {
  hlBuild: withOptions({ popTitle: "Özet · tekrarları seç", popover: (p) => <SelFlow {...p} />, render: (p) => <HlBuild {...p} /> }, [], { note: "Kart uzunluğu, müzik ve yükleme onayı: Ayarlar › Özet." }),
  hlAddLast: withOptions({ render: (p) => <HlAddLast {...p} /> }, [{ key: "toggle", label: "Özetteyse ikinci dokunuş çıkarsın", type: "bool", def: false }]),
  hlCards: withOptions({ render: (p) => <HlCards {...p} /> }, [], { note: "Varsayılan uzunluk: Ayarlar › Özet." }),
  hlMusic: withOptions({ render: (p) => <HlMusic {...p} /> }, [], { note: "Varsayılan seviye ve kısma: Ayarlar › Özet." }),
  hlPreview: withOptions({ render: (p) => <HlPreview {...p} /> }, [], { note: "Önizlemedeyken ikinci dokunuş yayına alır (GEÇİŞ yolu)." }),
  hlRender: withOptions({ render: (p) => <HlRender {...p} /> }, [], { note: "Yüklemeden önce sor: Ayarlar › Özet." }),
  hlSetMatch: withOptions({ popTitle: "Maçın golü / kurtarışı", popover: (p) => <MomentFlow {...p} />, render: (p) => <HlSetMatch {...p} /> }, [{ key: "kind", label: "Panel önce hangisini açsın", type: "select", def: "best_goal", choices: KINDS.map((k) => [k.key, k.label]) }]),
};
