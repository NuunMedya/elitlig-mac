// Yayın Stüdyosu · GEÇİŞLER sekmesi — geçişlerin TEK düzenleme yeri:
//   1. Sahne geçişi (GEÇİŞ / Boşluk): tür (canlı küçük önizlemeli kartlar) + süre + stüdyo modu
//   2. Özel kiplere giriş / çıkış (Tekrar · VAR · Röportaj · Özet): prefs.modes.transition
//   3. Tekrarlar arası geçiş: prefs.modes.between
//   4. Logo geçişleri: markanın renkleri ve logosuyla (Marka sekmesinden)
// Monitörlerin yanındaki geçiş paneli yalnız GEÇİŞ + hızlı tür seçimi tutar.
import React, { memo, useEffect, useRef } from "react";
import { canvasLoop } from "../perf/renderLoad";
import { Field, Icon } from "../../../components/ui";
import { TRANSITION_KINDS, drawTransitionStinger, isStingerKind, transitionFrame, transitionKind, transitionMs } from "../../../lib/studio/transitions";

const W = 192;
const H = 108;

/** Küçük örnek kare: A (mor) → B (yeşil). */
function paintSide(ctx, which) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (which === "a") { g.addColorStop(0, "#3b1470"); g.addColorStop(1, "#140726"); } else { g.addColorStop(0, "#0f5132"); g.addColorStop(1, "#06240f"); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "800 30px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(which === "a" ? "A" : "B", W / 2, H / 2);
}
function drawView(ctx, which, v) {
  if (v.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, v.alpha));
  if (v.blur) ctx.filter = `blur(${(v.blur * 6).toFixed(1)}px)`;
  ctx.translate(W / 2 + v.dx * W, H / 2 + v.dy * H);
  ctx.scale(v.scale || 1, v.scale || 1);
  ctx.translate(-W / 2, -H / 2);
  paintSide(ctx, which);
  ctx.restore();
}
export function paintTransitionSample(ctx, kind, p, logo, branding) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const f = transitionFrame(kind, p);
  if (f.wipe != null) {
    drawView(ctx, "a", f.from);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * f.wipe, H); ctx.clip(); drawView(ctx, "b", f.to); ctx.restore();
  } else if (f.order === "from-over") { drawView(ctx, "b", f.to); drawView(ctx, "a", f.from); } else { drawView(ctx, "a", f.from); drawView(ctx, "b", f.to); }
  if (isStingerKind(kind)) { try { drawTransitionStinger(ctx, W, H, kind, p, logo, branding); } catch { /* yoksay */ } }
}

/** Döngüyle oynayan örnek (görünürken ~30 fps; görünmüyorsa çizmez). */
function Sample({ kind, ms, brandRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const t0 = performance.now();
    const dur = Math.max(300, ms || 600);
    const cycle = dur + 900;
    const loop = (now) => {
      const c = ref.current;
      if (!c || c.offsetParent === null) return;
      const t = (now - t0) % cycle;
      const p = t < 450 ? 0 : Math.min(1, (t - 450) / dur);
      paintTransitionSample(c.getContext("2d"), kind, p, brandRef?.current?.logo || null, brandRef?.current?.branding || null);
    };
    return canvasLoop("Geçiş örnekleri", { fps: 20, el: () => ref.current }, loop);
  }, [kind, ms, brandRef]);
  return <canvas ref={ref} width={W} height={H} className="st-trs__canvas" />;
}

/** Tür kartları + süre (bir geçiş ayarı için). */
function KindPicker({ value, ms, onKind, onMs, brandRef, compact = false }) {
  const k = transitionKind(value);
  return (
    <>
      <div className={`st-trs__grid ${compact ? "is-compact" : ""}`}>
        {TRANSITION_KINDS.map((t) => (
          <button key={t.key} type="button" className={`st-trs__card ${k.key === t.key ? "is-on" : ""} ${t.stinger ? "is-stinger" : ""}`} onClick={() => onKind(t.key)} aria-pressed={k.key === t.key}>
            {!compact && <Sample kind={t.key} ms={transitionMs(t.key, k.key === t.key ? { [t.key]: ms } : {})} brandRef={brandRef} />}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {k.key !== "cut" && (
        <Field label={`Süre · ${ms} ms`}>
          <input type="range" min={k.min} max={k.max} step={50} value={ms} onChange={(e) => onMs(Number(e.target.value))} />
        </Field>
      )}
    </>
  );
}

function TransitionsTab({ prefs, setPref, hasModes, brandRef, onOpenBrand }) {
  const tKind = transitionKind(prefs.transition);
  const tMs = transitionMs(tKind.key, prefs.transitionMs);
  const modes = prefs.modes && typeof prefs.modes === "object" ? prefs.modes : {};
  const modeTr = { kind: transitionKind(modes.transition?.kind || modes.transition || "stinger").key };
  modeTr.ms = transitionMs(modeTr.kind, modes.transition?.ms != null ? { [modeTr.kind]: modes.transition.ms } : {});
  const between = { kind: transitionKind(modes.between?.kind || modes.between || "stinger").key };
  between.ms = transitionMs(between.kind, modes.between?.ms != null ? { [between.kind]: modes.between.ms } : {});
  const setModes = (key, patch) => setPref("modes", (m) => {
    const cur = m && typeof m === "object" ? m : {};
    const prev = typeof cur[key] === "object" && cur[key] ? cur[key] : { kind: key === "transition" ? modeTr.kind : between.kind };
    return { ...cur, [key]: { ...prev, ...patch } };
  });
  return (
    <div className="st-trs st-cols st-cols--wide">
      <section className="st-panel st-trs__main">
        <header className="st-panel__head"><Icon name="swap" size={14} /><h4>Sahne geçişi</h4><span className="st-hint">GEÇİŞ düğmesi, Boşluk / Enter, sahneye çift tık</span></header>
        <KindPicker value={tKind.key} ms={tMs} brandRef={brandRef} onKind={(k) => setPref("transition", k)} onMs={(v) => setPref("transitionMs", (m) => ({ ...(m || {}), [tKind.key]: v }))} />
        <label className="st-switchrow">
          <span><strong>Önizleme (stüdyo modu)</strong><small>Kapalıyken sahneye tek tık doğrudan yayına alır</small></span>
          <input type="checkbox" className="st-switch" checked={Boolean(prefs.studioMode)} onChange={(e) => setPref("studioMode", e.target.checked)} />
        </label>
      </section>
      <div className="st-trs__side">
        {hasModes && (
          <section className="st-panel">
            <header className="st-panel__head"><Icon name="sparkles" size={14} /><h4>Özel kiplere giriş / çıkış</h4></header>
            <p className="st-hint">Tekrar, VAR, Röportaj ve Özet yayına alınırken ve canlıya dönerken.</p>
            <KindPicker compact value={modeTr.kind} ms={modeTr.ms} brandRef={brandRef} onKind={(k) => setModes("transition", { kind: k, ms: undefined })} onMs={(v) => setModes("transition", { ms: v })} />
          </section>
        )}
        {hasModes && (
          <section className="st-panel">
            <header className="st-panel__head"><Icon name="repeat" size={14} /><h4>Tekrarlar arası</h4></header>
            <p className="st-hint">Birden çok açı / tekrar art arda oynarken araya giren geçiş.</p>
            <KindPicker compact value={between.kind} ms={between.ms} brandRef={brandRef} onKind={(k) => setModes("between", { kind: k, ms: undefined })} onMs={(v) => setModes("between", { ms: v })} />
          </section>
        )}
        <section className="st-panel">
          <header className="st-panel__head"><Icon name="palette" size={14} /><h4>Logo geçişleri</h4></header>
          <p className="st-hint">“Marka logosu” ve “Logo ·” geçişleri markanın renklerini ve logosunu kullanır. Logoyu ve renkleri Marka sekmesinden değiştir.</p>
          {onOpenBrand && <button type="button" className="btn btn--sm" onClick={onOpenBrand}><Icon name="palette" size={13} /> Marka & ön ayarlar</button>}
        </section>
      </div>
    </div>
  );
}

export default memo(TransitionsTab);
