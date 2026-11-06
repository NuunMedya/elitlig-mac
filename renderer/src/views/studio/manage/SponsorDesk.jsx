// Maç yönetimi · Sponsor yayını — "ekrana ver" (alt bant, maç öncesi, devre
// arası, maç sonu, tam ekran), skorboard köşe rozeti ve LED sponsoru
// (web BroadcastDesk SponsorDesk). Yamalar: { onAir }, { corner }, { led }.
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { DURATION_CHOICES, ON_AIR_SLOTS, formatLeft, onAirPatch, sponsorHas } from "../../../lib/studio/manageBroadcast";

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? Math.max(0, endsAt - now) : null;
}

export default function SponsorDesk({ desk, ledMode, onLedSponsorMode }) {
  const [duration, setDuration] = useState("default");
  const { sponsors, state, onAirEndsAt } = desk;
  const left = useCountdown(onAirEndsAt);
  const onAir = state.onAir && (left == null || left > 0) ? state.onAir : null;
  const onAirSponsor = onAir ? sponsors.find((s) => Number(s.id) === Number(onAir.sponsorId)) : null;
  const list = sponsors.filter((s) => ON_AIR_SLOTS.some((slot) => sponsorHas(s, slot.key)) || sponsorHas(s, "corner") || sponsorHas(s, "led_screen"));

  const takeOff = () => desk.save({ onAir: null }, "Sponsor grafiği yayından kaldırıldı.");
  const toggleCorner = (s) => {
    const on = Number(state.corner?.sponsorId) === Number(s.id);
    desk.save({ corner: { sponsorId: on ? null : s.id } }, on ? "Köşe rozeti kaldırıldı." : `${s.name} köşe rozeti skorboarda eklendi.`);
  };
  const toggleLed = async (s) => {
    const on = Number(state.led?.sponsorId) === Number(s.id) && ledMode === "sponsor";
    const ok = await desk.save({ led: { sponsorId: on ? null : s.id } }, on ? "LED sponsoru kaldırıldı; LED ekran marka görünümünde." : null);
    if (ok && !on) await onLedSponsorMode?.(s);
  };

  if (desk.loading) return <p className="mg-muted">Sponsorlar yükleniyor…</p>;
  return (
    <div className="mg-stack">
      {onAirSponsor && (
        <div className="mg-live is-sponsor">
          <span className="mg-live__dot" />
          <span className="mg-row__main"><strong>YAYINDA · {onAirSponsor.name}</strong>
            <small>{ON_AIR_SLOTS.find((s) => s.key === onAir.slot)?.label}{left == null ? " · elle kaldırılana kadar" : ` · ${formatLeft(left)} kaldı`}</small></span>
          <button type="button" className="btn btn--sm btn--danger" onClick={takeOff} disabled={desk.saving}><Icon name="eye" size={13} /> Yayından kaldır</button>
        </div>
      )}
      <div className="mg-inline mg-wrap">
        <span className="mg-muted">Ekranda kalma süresi</span>
        <select value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Ekranda kalma süresi">
          {DURATION_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {!list.length ? <p className="mg-muted">Bu maçta yayın yeri seçilmiş sponsor yok (web: Sponsorlar ekranı).</p> : (
        <ul className="mg-rows">
          {list.map((s) => {
            const slots = ON_AIR_SLOTS.filter((slot) => sponsorHas(s, slot.key));
            const cornerOn = Number(state.corner?.sponsorId) === Number(s.id);
            const ledOn = Number(state.led?.sponsorId) === Number(s.id) && ledMode === "sponsor";
            return (
              <li key={s.id} className="mg-row mg-sponsor">
                <span className="mg-sponsor__logo">{s.images?.logo ? <img src={s.images.logo} alt="" /> : String(s.name || "?").slice(0, 2).toLocaleUpperCase("tr-TR")}</span>
                <span className="mg-row__main"><strong>{s.name}</strong><small>{s.displaySeconds ? `Varsayılan ${s.displaySeconds} sn` : "Varsayılan: süresiz"}</small></span>
                <span className="mg-sponsor__btns">
                  {slots.map((slot) => {
                    const live = onAir && Number(onAir.sponsorId) === Number(s.id) && onAir.slot === slot.key;
                    return (
                      <button key={slot.key} type="button" className={`btn btn--xs${live ? " btn--danger" : ""}`} disabled={desk.saving}
                        onClick={() => (live ? takeOff() : desk.save(onAirPatch(s, slot.key, duration), `${s.name} · ${slot.label.toLocaleLowerCase("tr-TR")} yayına verildi.`))}>
                        {live ? "● " : ""}{slot.label}
                      </button>
                    );
                  })}
                  {sponsorHas(s, "corner") && <button type="button" className={`btn btn--xs${cornerOn ? " btn--soft" : ""}`} disabled={desk.saving} onClick={() => toggleCorner(s)}>{cornerOn ? "✓ " : ""}Köşe rozeti</button>}
                  {sponsorHas(s, "led_screen") && <button type="button" className={`btn btn--xs${ledOn ? " btn--soft" : ""}`} disabled={desk.saving} onClick={() => toggleLed(s)}>{ledOn ? "✓ " : ""}LED ekran</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
