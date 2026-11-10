// Bilgi: karşılama (eski Bugün başlığı), odak sayacı. Diğer saat / hava / müzik / pano / sistem
// bileşenleri masaüstü widget gövdeleridir (./embed.jsx).
import React, { useEffect, useMemo, useState } from "react";
import { Icon, isMac } from "../../../components/ui";
import { formatMoney, formatTime, greeting, groupTodos } from "../../../lib/helpers";
import { mergeUpcoming } from "../../../lib/projectAgenda";
import { useBridge, useData } from "../data";
import { XsButton } from "../parts";

const useClock = (ms = 30000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
};
const useFocus = () => useBridge(() => window.elitlig.focus.state(), (cb) => window.elitlig.focus.onState(cb), [])[0];

export function HeroTile({ tier, go, auth }) {
  const now = useClock();
  const overview = useData("/api/tools/overview");
  const todos = useData("/api/todos", { view: "mine", status: "active" });
  const focus = useFocus();
  const groups = useMemo(() => groupTodos(todos.data?.items || [], now), [todos.data, now]);
  const o = overview.data;
  const upcoming = useMemo(() => mergeUpcoming(o), [o]);
  const name = (auth?.user?.fullName || auth?.user?.username || "").split(" ")[0];
  const date = now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <header className={`hero dt-hero is-${tier}`}>
      <div style={{ position: "relative", zIndex: 1 }}>
        <span className="eyebrow">{date}</span>
        <h1>{greeting(now.getHours())}{name ? `, ${name}` : ""} 👋</h1>
        {tier !== "s" && <p>{groups.overdue.length ? `${groups.overdue.length} gecikmiş işin var. ` : "Gecikmiş işin yok. "}Bugün {groups.today.length} iş ve 7 gün içinde {upcoming.length} plan seni bekliyor.</p>}
        {(tier === "l" || tier === "xl") && (
          <div className="hero__stats">
            <button type="button" className="hero__stat" onClick={() => go("todos")}><strong>{groups.overdue.length + groups.today.length}</strong><span>bugünün işi</span></button>
            <button type="button" className="hero__stat" onClick={() => go("agenda")}><strong>{o ? upcoming.length : "–"}</strong><span>yaklaşan plan</span></button>
            <button type="button" className="hero__stat" onClick={() => go("ledger")}><strong>{o?.ledger ? formatMoney(o.ledger.net, 0) : "–"}</strong><span>bu ay net</span></button>
            <button type="button" className="hero__stat" onClick={() => go("focus")}><strong>{focus?.stats?.minutes || 0} dk</strong><span>bugün odak</span></button>
          </div>
        )}
      </div>
      <div className="hero__clock">{formatTime(now)}</div>
    </header>
  );
}

export function FocusTile({ tier, go }) {
  const focus = useFocus();
  const toggle = () => window.elitlig.focus.command("toggle");
  const running = Boolean(focus?.running);
  if (tier === "xs") return <XsButton icon={running ? "pause" : "timer"} value={running ? undefined : `${focus?.stats?.minutes || 0} dk`} label={running ? "Duraklat" : "Odak"} tone={running ? "red" : ""} onClick={toggle} />;
  const ms = focus ? (focus.mode === "stopwatch" ? focus.elapsedMs : focus.remainingMs) : 0;
  const mm = Math.floor((ms || 0) / 60000), ss = Math.floor(((ms || 0) % 60000) / 1000);
  return (
    <div className="dt-stack">
      <div className="focus-mini">
        {tier !== "s" && <div><strong>{focus?.stats?.sessions || 0}</strong><span>tur bugün</span></div>}
        <div><strong>{focus?.stats?.minutes || 0}</strong><span>dakika</span></div>
        {focus && (running || ms) ? <div><strong className="mono">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</strong><span>{focus.phase === "break" ? "mola" : "kalan"}</span></div> : null}
        <button type="button" className="btn btn--primary btn--sm" onClick={toggle}>
          <Icon name={running ? "pause" : "play"} size={14} /> {running ? "Duraklat" : "Başlat"}
        </button>
      </div>
      {(tier === "m" || tier === "l") && (
        <div className="dt-actions">
          <button type="button" className="btn btn--xs" onClick={() => window.elitlig.focus.command("reset")}><Icon name="rotate" size={12} /> Sıfırla</button>
          {tier === "l" && <button type="button" className="btn btn--xs" onClick={() => window.elitlig.focus.command("skip")}><Icon name="skip" size={12} /> Atla</button>}
          <button type="button" className="link-btn" onClick={() => go("focus")}>Sayaç →</button>
        </div>
      )}
      {tier === "l" && <p className="muted small">Sayaç pencere kapalıyken de {isMac() ? "menü çubuğunda" : "bildirim alanında (sistem tepsisi)"} çalışır.</p>}
    </div>
  );
}
