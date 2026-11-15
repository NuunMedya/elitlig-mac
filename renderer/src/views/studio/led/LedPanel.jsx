// Yayın Stüdyosu · LED EKRAN paneli [2.33: sade]. Yalnız sık kullanılan birkaç LED durumu,
// büyük ve açık düğmelerle:
//
//   ┌ ● LED AÇIK · Ekran 2 · gösterilen: Yayın                         [Kapat] [⚙ Ayarlar] ┐
//   │ [ ▶  YAYINI LED'E VER  ]  (açıkken: "LED yayını gösteriyor" · [↩ Önceki içeriğe dön])  │
//   │ LED SAHNESİ   [Geniş açı] [Sponsor] [Devre arası] …   (dokun: LED o sahneyi gösterir)  │
//   │ [Logo / skor] [Sitenin LED sayfası] [Siyah]                                            │
//   └ ▸ LED grafikleri (açılır)                                                              ┘
//
// "Yayını LED'e ver" çıkışı açıp kapatmayı gerektirmez: LED kapalıysa açılır, site sayfasındaysa
// stüdyo görünümüne geçer; önceki içerik saklanır ve tek dokunuşla geri gelir (led/useLed › goLive /
// goBack). Ekran seçimi, yönlendirme ayrıntıları ve çıkış penceresi ayarları Ayarlar › LED'de.
import React, { memo } from "react";
import { Icon } from "../../../components/ui";
import { LedGraphicsPanel } from "../scenes/graphicsBridge";
import { Part } from "../dock/parts";

const CONTENT_LABEL = { scene: null, mirror: "Program aynası", scoreboard: "Logo / skor", sponsor: "Sponsor döngüsü", text: "Metin", clock: "Saat", countdown: "Geri sayım" };

/** LED'de şu an ne var (kısa metin). */
export function ledNowText(led, scenes) {
  const p = led.prefs || {};
  const st = led.status || {};
  if (!st.open) return "LED kapalı";
  if (p.web || st.mode === "web") return "Sitenin LED sayfası";
  if (led.live) return "Yayın (Program)";
  const fx = led.fx || {};
  if (fx.black) return "Siyah";
  if (CONTENT_LABEL[fx.content]) return CONTENT_LABEL[fx.content];
  if (p.route === "off") return "Siyah";
  if (p.route === "preview") return "Önizleme";
  if (p.route === "scene") return scenes.find((s) => s.id === p.sceneId)?.name || "Sahne";
  return "Yayındaki sahne";
}

function LedPanel({ led, scenes, matchId, g, live, onSettings }) {
  const p = led.prefs || {};
  const st = led.status || {};
  const fx = led.fx || {};
  const isLive = Boolean(led.live);
  const display = led.displays.find((d) => String(d.id) === String(st.open ? st.displayId : p.displayId));
  const sceneOn = (id) => st.open && !isLive && !p.web && fx.content === "scene" && p.route === "scene" && p.sceneId === id;
  const quick = [
    { key: "scoreboard", icon: "trophy", label: "Logo / skor", on: st.open && !p.web && !isLive && fx.content === "scoreboard", run: () => led.show({ content: "scoreboard" }) },
    { key: "web", icon: "globe", label: "Sitenin LED sayfası", on: st.open && Boolean(p.web), run: () => led.show({ web: true }), disabled: !matchId, title: matchId ? `elitlig.com/led/${matchId}` : "Önce maç seç" },
    { key: "off", icon: "stop", label: "Siyah", on: st.open && !p.web && !isLive && p.route === "off", run: () => led.show({ route: "off" }) },
  ];
  return (
    <div className="st-led is-simple">
      <Part id="output" label="LED durumu (aç / kapat)">
        <div className={`led-status ${st.open ? "is-open" : ""}`}>
          <span className="led-status__dot" aria-hidden="true" />
          <span className="led-status__t">
            <strong>{st.open ? "LED AÇIK" : "LED KAPALI"}</strong>
            <small title={display?.label || ""}>{st.open ? `${display?.label || `Ekran ${st.displayId ?? "?"}`} · ${ledNowText(led, scenes)}` : display ? `Ekran: ${display.label || display.id}` : "Ekran seçilmedi"}</small>
          </span>
          {led.available && (st.open
            ? <button type="button" className="btn btn--sm btn--ghost" onClick={led.close} title="LED penceresini kapat">Kapat</button>
            : <button type="button" className="btn btn--sm" onClick={() => led.open()} disabled={p.displayId == null} title={p.displayId == null ? "Ayarlar › LED'den ekran seç" : "LED çıkışını aç"}><Icon name="play" size={12} /> Aç</button>)}
          {onSettings && <button type="button" className="icon-btn" onClick={onSettings} title="LED ayarları: ekran, çıkış penceresi, yönlendirme, görüntü"><Icon name="sliders" size={14} /></button>}
        </div>
        {!led.available && <p className="st-hint is-armed">LED çıkışı bu uygulama sürümünde yok.</p>}
        {led.error && <p className="st-hint text-red">{led.error}</p>}
      </Part>

      <Part id="route" label="Yayını LED'e ver · LED sahnesi">
        <button type="button" className={`led-live ${isLive && st.open ? "is-on" : ""}`} onClick={() => led.toggleLive()} disabled={!led.available} aria-pressed={isLive && st.open}
          title={isLive ? "LED yayını gösteriyor · dokun: önceki LED içeriğine dön" : "Tek dokunuş: LED yayını göstersin (kapalıysa açılır; tekrar / VAR dahil). Önceki içerik saklanır."}>
          <Icon name={isLive && st.open ? "undo" : "broadcast"} size={20} />
          <span><b>{isLive && st.open ? "LED YAYINI GÖSTERİYOR" : "YAYINI LED'E VER"}</b><small>{isLive && st.open ? "dokun: önceki içeriğe dön" : "tek dokunuş · çıkış kendiliğinden açılır"}</small></span>
        </button>
        <h6 className="led-h">LED sahnesi</h6>
        <div className="led-scenes" role="group" aria-label="LED sahnesi">
          {scenes.map((s) => (
            <button key={s.id} type="button" className={`led-chip ${sceneOn(s.id) ? "is-on" : ""}`} onClick={() => led.show({ route: "scene", sceneId: s.id })} title={`LED'de “${s.name}” sahnesi (yayından bağımsız)`}>
              <Icon name="layers" size={12} /><span>{s.name}</span>
            </button>
          ))}
          {!scenes.length && <p className="st-hint">Sahne yok.</p>}
        </div>
        <div className="led-quick" role="group" aria-label="Diğer LED içerikleri">
          {quick.map((q) => (
            <button key={q.key} type="button" className={`led-chip is-q ${q.on ? "is-on" : ""}`} disabled={q.disabled} onClick={q.run} title={q.title || q.label}>
              <Icon name={q.icon} size={13} /><span>{q.label}</span>
            </button>
          ))}
        </div>
      </Part>

      {LedGraphicsPanel && g && (
        <Part id="graphics" label="LED grafikleri">
          <details className="led-more">
            <summary><Icon name="palette" size={12} /> LED grafikleri</summary>
            <section className="st-card st-led__gfx">
              <LedGraphicsPanel g={g} live={live} matchId={matchId} embedded scenes={scenes.map((s) => ({ id: s.id, name: s.name }))} />
            </section>
          </details>
        </Part>
      )}
    </div>
  );
}

export default memo(LedPanel);
