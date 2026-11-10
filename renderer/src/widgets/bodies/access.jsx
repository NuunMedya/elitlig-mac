// Hızlı erişim widget'ları: Başlatıcı (ızgara + yeni kayıt), Araç çubuğu (Dock benzeri şerit) ve
// Yayın Stüdyosu durumu. Araç listesi ana süreçten (app/launcher: yetkiye göre süzülmüş) gelir;
// tıklayınca uygulamada ilgili görünüm açılır, "yeni …" Hızlı kayıt penceresini o türle açar.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { W, openApp, Hero, isBig, pick } from "../common";
import { DEFAULT_DOCK, DEFAULT_LAUNCHER, durationLabel, launcherTools, studioLabel } from "../widgetModel";

function useLauncherState() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    const load = () => W().launcher?.state().then(setSt).catch(() => {});
    load();
    return W().auth.onChange(load);
  }, []);
  return st;
}

/** Araç seçimi (ayarlar): hangi araçlar görünsün, sırasıyla. */
function ToolPicker({ st, chosen, fallback, update, closeSettings, max = 16 }) {
  const cur = chosen?.length ? chosen : fallback;
  const toggle = (k) => update({ options: { tools: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(0, max) } });
  return (
    <div className="wg-settings">
      <p className="wg-muted">Görünecek araçlar (en çok {max}):</p>
      <div className="wg-zones">{st.tools.map((t) => <label key={t.key} className="wg-check"><input type="checkbox" checked={cur.includes(t.key)} onChange={() => toggle(t.key)} /> {t.label}</label>)}</div>
      <div className="wg-bar"><button type="button" className="wg-btn" onClick={closeSettings}>Tamam</button><button type="button" className="wg-btn is-ghost" onClick={() => update({ options: { tools: null } })}>Varsayılan</button></div>
    </div>
  );
}

export function LauncherWidget({ item, size, settings, update, closeSettings }) {
  const st = useLauncherState();
  if (!st) return <p className="wg-muted">…</p>;
  if (settings) return <ToolPicker st={st} chosen={item.options.tools} fallback={DEFAULT_LAUNCHER} update={update} closeSettings={closeSettings} />;
  const tools = launcherTools(st.tools, item.options.tools, DEFAULT_LAUNCHER).slice(0, pick(size, 4, 8, 12));
  const actions = isBig(size) ? st.actions.filter((a) => ["new-task", "new-expense", "new-note", "new-event"].includes(a.id)) : [];
  return (
    <div className={`wg-launch is-${size}`}>
      <div className="wg-launch__grid">
        {tools.map((t) => (
          <button key={t.key} type="button" className="wg-tile" data-tool={t.key} onClick={() => W().launcher.open(t.key)} title={t.label}>
            <span className="wg-tile__ic"><Icon name={t.icon} size={isBig(size) ? 18 : 16} /></span><span>{t.label}</span>
          </button>
        ))}
      </div>
      {isBig(size) && <div className="wg-bar">
        {actions.map((a) => <button key={a.id} type="button" className="wg-btn" data-action={a.id} onClick={() => W().launcher.action(a.id)}><Icon name="plus" size={10} /> {a.label.replace(/^Yeni /, "")}</button>)}
        <span className="wg__grow" />
        <button type="button" className="wg-ib is-sm" onClick={() => W().launcher.show()} aria-label="Hızlı geçiş" title="Hızlı geçiş (ara)"><Icon name="search" size={12} /></button>
      </div>}
    </div>
  );
}

export function DockWidget({ item, size, settings, update, closeSettings }) {
  const st = useLauncherState();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    W().chat.status().then((s) => setUnread(s?.unread || 0)).catch(() => {});
    return W().chat.onUnread((n) => setUnread(n || 0));
  }, []);
  if (!st) return null;
  if (settings) return <ToolPicker st={st} chosen={item.options.tools} fallback={DEFAULT_DOCK} update={update} closeSettings={closeSettings} max={10} />;
  const tools = launcherTools(st.tools, item.options.tools, DEFAULT_DOCK).slice(0, size !== "small" ? 10 : 7);
  return (
    <div className="wg-dock" role="toolbar" aria-label="Araç çubuğu">
      {tools.map((t) => (
        <button key={t.key} type="button" className="wg-dock__btn" data-tool={t.key} onClick={() => W().launcher.open(t.key)} title={t.label} aria-label={t.label}>
          <Icon name={t.icon} size={size !== "small" ? 20 : 17} />
          {t.key === "messages" && unread > 0 && <em className="wg-badge">{unread > 99 ? "99+" : unread}</em>}
          <span className="wg-dock__tip">{t.label}</span>
        </button>
      ))}
      <span className="wg-dock__sep" />
      <button type="button" className="wg-dock__btn is-add" onClick={() => W().launcher.action("new-task")} title="Yeni görev" aria-label="Yeni görev"><Icon name="plus" size={size !== "small" ? 20 : 17} /><span className="wg-dock__tip">Yeni görev</span></button>
      <button type="button" className="wg-dock__btn" onClick={() => W().launcher.show()} title="Hızlı geçiş" aria-label="Hızlı geçiş"><Icon name="search" size={size !== "small" ? 19 : 16} /><span className="wg-dock__tip">Hızlı geçiş</span></button>
    </div>
  );
}

export function StudioWidget({ size }) {
  const [s, setS] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => W().widgets.studio().then((x) => alive && setS(x)).catch(() => {});
    load();
    const off = W().studio?.onStatus?.(() => load());
    const t = setInterval(load, 5000);
    return () => { alive = false; off?.(); clearInterval(t); };
  }, []);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!s) return <p className="wg-muted">…</p>;
  const l = studioLabel(s);
  return (
    <div className={`wg-studio is-${size} is-${l.tone || "idle"}`}>
      <div className="wg-studio__state"><i className="wg-studio__dot" /><b data-testid="studio-state">{l.text}</b>{s.active && <strong>{durationLabel(s.durationMs)}</strong>}</div>
      {s.active ? (
        <div className="wg-studio__meta">
          <span><small>Bit hızı</small><b>{s.bitrateKbps != null ? `${(s.bitrateKbps / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mb/sn` : "—"}</b></span>
          <span><small>FPS</small><b>{s.fps != null ? Math.round(s.fps) : "—"}</b></span>
          {size !== "small" && <span><small>Bağlantı</small><b>{s.rtmp === "up" ? "Bağlı" : s.rtmp === "down" ? "Koptu" : s.recordOnly ? "Yalnız kayıt" : "—"}</b></span>}
          {size !== "small" && s.droppedFrames > 0 && <span><small>Düşen kare</small><b>{s.droppedFrames}</b></span>}
        </div>
      ) : <p className="wg-muted">{s.available ? "Yayın ya da kayıt başlamadı." : "Yayın Stüdyosu bu sürümde yok."}</p>}
      {s.warning && <p className="wg-note-line is-amber">{String(s.warning).slice(0, 80)}</p>}
      <div className="wg-bar">
        <button type="button" className="wg-btn" onClick={() => openApp("studio")}><Icon name="broadcast" size={11} /> {size === "small" ? "Aç" : "Stüdyoyu aç"}</button>
        {s.led && <span className="wg-pill">LED açık</span>}
      </div>
    </div>
  );
}
