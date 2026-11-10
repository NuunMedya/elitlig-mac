// Ağ ve sistem: IP bilgisi, gecikme (TCP ping), DNS sorgusu, bağlantı hızı testi, sistem bilgisi
// ve pil. Ağ işleri ana süreçte (app/netTools.js, window.elitlig.netTools).
import React, { useEffect, useState } from "react";
import { Icon, Segmented } from "../../../components/ui";
import { useCopy, useStored } from "../toolkitUi";
import { fmtNum } from "./common";

const nt = () => window.elitlig?.netTools;
const bytes = (n) => (n == null ? "—" : n >= 1e12 ? `${fmtNum(n / 1e12, 2)} TB` : n >= 1e9 ? `${fmtNum(n / 1e9, 1)} GB` : `${fmtNum(n / 1e6, 0)} MB`);
const dur = (s) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); return `${d ? `${d} gün ` : ""}${h} sa ${m} dk`; };
const Missing = () => <p className="tt-warn">Bu araç uygulamanın ana penceresinde ya da panelde çalışır (ağ erişimi gerekir).</p>;

export function NetworkTool() {
  const [tab, setTab] = useStored("tt.net.tab", "ip");
  if (!nt()) return <Missing />;
  return (
    <div className="tt">
      <Segmented value={tab} onChange={setTab} size="sm" ariaLabel="Ağ aracı" options={[{ value: "ip", label: "IP" }, { value: "ping", label: "Ping" }, { value: "dns", label: "DNS" }, { value: "speed", label: "Hız testi" }]} />
      {tab === "ip" && <IpPane />}
      {tab === "ping" && <PingPane />}
      {tab === "dns" && <DnsPane />}
      {tab === "speed" && <SpeedPane />}
    </div>
  );
}

function IpPane() {
  const copy = useCopy();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); try { setInfo(await nt().info()); } finally { setBusy(false); } };
  useEffect(() => { load(); }, []);
  return (
    <div className="tt">
      {!info ? <p className="tt-muted">Okunuyor…</p> : (<>
        {info.public?.ip && <button type="button" className="tt-res is-strong" onClick={() => copy(info.public.ip, "Genel IP kopyalandı")}><span>Genel IP (internete çıkan)</span><strong data-testid="public-ip">{info.public.ip}</strong></button>}
        {info.error && <p className="tt-warn">{info.error.message}</p>}
        <dl className="tt-kv">
          <dt>Bilgisayar adı</dt><dd>{info.hostname}</dd>
          {info.public?.country && <><dt>Ülke / uç</dt><dd>{info.public.country} · {info.public.colo}</dd></>}
          {info.public?.tls && <><dt>Bağlantı</dt><dd>{info.public.http} · {info.public.tls}</dd></>}
          {info.interfaces.map((a) => <React.Fragment key={`${a.name}-${a.address}`}><dt>{a.name} ({a.family})</dt><dd>{a.address}{a.mac && a.mac !== "00:00:00:00:00:00" ? ` · ${a.mac}` : ""}</dd></React.Fragment>)}
        </dl>
      </>)}
      <button type="button" className="btn btn--sm" onClick={load} disabled={busy} style={{ alignSelf: "flex-start" }}><Icon name="refresh" size={12} /> Yenile</button>
    </div>
  );
}

function PingPane() {
  const [host, setHost] = useStored("tt.net.pingHost", "elitlig.com");
  const [port, setPort] = useStored("tt.net.pingPort", 443);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (e) => { e?.preventDefault(); setBusy(true); try { setRes(await nt().ping(host, { count: 5, port })); } finally { setBusy(false); } };
  return (
    <div className="tt">
      <form className="tt-row" onSubmit={run}>
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="elitlig.com ya da 1.1.1.1" aria-label="Sunucu" />
        <input type="number" min="1" max="65535" value={port} onChange={(e) => setPort(Number(e.target.value))} aria-label="Port" style={{ flex: "0 0 80px", minWidth: 80 }} />
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>{busy ? "Ölçülüyor…" : "Ölç"}</button>
      </form>
      <div className="tk-chips">{["elitlig.com", "google.com", "1.1.1.1", "a.rtmp.youtube.com"].map((h) => <button key={h} type="button" className="tk-chip" onClick={() => { setHost(h); setPort(h.includes("rtmp") ? 1935 : 443); }}>{h}</button>)}</div>
      {res && (res.ok ? (<>
        <div className="tt-meter" data-testid="ping-result"><div><b>{res.avg} ms</b><small>ortalama</small></div><div><b>{res.min}–{res.max}</b><small>en az – en çok</small></div><div><b>{res.jitter} ms</b><small>titreşim</small></div><div><b>%{res.loss}</b><small>kayıp</small></div></div>
        <p className="tt-muted">{res.host} → {res.address}:{res.port} · DNS {res.dnsMs} ms · ölçümler: {res.samples.map((s) => (s == null ? "✕" : `${s}`)).join(", ")} ms</p>
      </>) : <p className="tk-err">{res.error?.message}</p>)}
      <p className="tt-muted">Ölçüm TCP bağlantı kurma süresiyle yapılır (ICMP yönetici izni ister); sonuç ping ile aynı ölçektedir.</p>
    </div>
  );
}

function DnsPane() {
  const copy = useCopy();
  const [q, setQ] = useStored("tt.net.dns", { host: "elitlig.com", type: "A", resolver: "system" });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (e) => { e?.preventDefault(); setBusy(true); try { setRes(await nt().dns(q.host, q.type, { resolver: q.resolver })); } finally { setBusy(false); } };
  const fmt = (r) => (typeof r === "string" ? r : r && typeof r === "object" ? Object.entries(r).map(([k, v]) => `${k}=${v}`).join(" ") : String(r));
  return (
    <div className="tt">
      <form className="tt-row" onSubmit={run}>
        <input value={q.host} onChange={(e) => setQ({ ...q, host: e.target.value })} aria-label="Alan adı" placeholder="alan adı (PTR için IP)" />
        <select value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value })} aria-label="Kayıt türü" style={{ flex: "0 0 auto", width: "auto" }}>{["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA", "SRV", "PTR"].map((t) => <option key={t}>{t}</option>)}</select>
        <select value={q.resolver} onChange={(e) => setQ({ ...q, resolver: e.target.value })} aria-label="Çözümleyici" style={{ flex: "0 0 auto", width: "auto" }}><option value="system">Sistem</option><option value="cloudflare">Cloudflare 1.1.1.1</option><option value="google">Google 8.8.8.8</option><option value="quad9">Quad9</option></select>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>Sorgula</button>
      </form>
      {res && (res.ok ? (
        <div className="tk-copies" data-testid="dns-result">
          {res.records.map((r, i) => <button key={i} type="button" className="tk-copy" onClick={() => copy(fmt(r), "Kayıt kopyalandı")}><span className="tk-copy__label">{res.type}</span><span className="tk-copy__value is-mono">{fmt(r)}</span><Icon name="copy" size={13} /></button>)}
          <p className="tt-muted">{res.records.length} kayıt · {res.ms} ms</p>
        </div>
      ) : <p className="tk-err">{res.error?.message}</p>)}
    </div>
  );
}

function SpeedPane() {
  const [res, setRes] = useStored("tt.net.speedLast", null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  useEffect(() => nt()?.onSpeedProgress?.((p) => setLive(p)), []);
  const run = async () => { setBusy(true); setLive(null); try { setRes(await nt().speed()); } finally { setBusy(false); setLive(null); } };
  return (
    <div className="tt">
      <button type="button" className="btn btn--primary" onClick={run} disabled={busy} style={{ alignSelf: "flex-start" }}><Icon name="activity" size={13} /> {busy ? (live ? `${live.phase === "upload" ? "Yükleme" : "İndirme"}: ${fmtNum(live.kbps / 1000, 1)} Mbps…` : "Ölçülüyor…") : "Testi başlat (~20 sn)"}</button>
      {res && (<>
        <div className="tt-meter" data-testid="speed-result">
          <div><b>{res.downloadMbps ?? "—"}</b><small>indirme Mbps</small></div>
          <div><b>{res.uploadMbps ?? "—"}</b><small>yükleme Mbps</small></div>
          <div><b>{res.pingMs ?? "—"}</b><small>gecikme ms</small></div>
          <div><b>{res.jitterMs ?? "—"}</b><small>titreşim ms</small></div>
        </div>
        <p className="tt-muted">{new Date(res.at).toLocaleString("tr-TR")} · Cloudflare hız testi uç noktaları{res.uploadMbps != null ? ` · canlı yayın için önerilen en yüksek bit hızı ≈ ${fmtNum(res.uploadMbps * 0.7, 1)} Mbps` : ""}</p>
        {res.error && <p className="tk-err">{res.error.message}</p>}
        {res.warnings?.map((w) => <p key={w} className="tt-warn">{w}</p>)}
      </>)}
    </div>
  );
}

export function SystemInfoTool() {
  const copy = useCopy();
  const [s, setS] = useState(null);
  const [battery, setBattery] = useState(null);
  useEffect(() => {
    nt()?.system().then(setS).catch(() => {});
    let bat = null;
    const read = () => bat && setBattery({ level: bat.level, charging: bat.charging, chargingTime: bat.chargingTime, dischargingTime: bat.dischargingTime });
    navigator.getBattery?.().then((b) => { bat = b; read(); ["levelchange", "chargingchange", "dischargingtimechange"].forEach((ev) => b.addEventListener(ev, read)); }).catch(() => {});
    const t = setInterval(() => nt()?.system().then(setS).catch(() => {}), 5000);
    return () => { clearInterval(t); if (bat) ["levelchange", "chargingchange", "dischargingtimechange"].forEach((ev) => bat.removeEventListener(ev, read)); };
  }, []);
  if (!nt()) return <Missing />;
  if (!s) return <p className="tt-muted">Okunuyor…</p>;
  const memUsed = s.memory.total - s.memory.free;
  const diskUsed = s.disk ? s.disk.total - s.disk.free : null;
  const summary = `${s.hostname} · ${s.platform} ${s.release} (${s.arch})\nİşlemci: ${s.cpu.model} × ${s.cpu.cores}\nBellek: ${bytes(s.memory.total)}\nDisk: ${s.disk ? `${bytes(s.disk.free)} boş / ${bytes(s.disk.total)}` : "—"}\nUygulama ${s.versions.app} · Electron ${s.versions.electron}`;
  const platform = { darwin: "macOS", win32: "Windows", linux: "Linux" }[s.platform] || s.platform;
  const hasBattery = battery && !(battery.charging && battery.level === 1 && battery.chargingTime === 0 && battery.dischargingTime === Infinity);
  return (
    <div className="tt" data-testid="sysinfo">
      <div className="tt-meter">
        <div><b>{Math.round((memUsed / s.memory.total) * 100)}%</b><small>bellek dolu ({bytes(memUsed)} / {bytes(s.memory.total)})</small><div className="tt-bar"><i style={{ width: `${(memUsed / s.memory.total) * 100}%` }} /></div></div>
        {s.disk && <div><b>{bytes(s.disk.free)}</b><small>disk boş / {bytes(s.disk.total)}</small><div className="tt-bar"><i style={{ width: `${(diskUsed / s.disk.total) * 100}%` }} /></div></div>}
        <div><b>{hasBattery ? `%${Math.round(battery.level * 100)}` : "—"}</b><small>{hasBattery ? (battery.charging ? "pil · şarj oluyor" : `pil${Number.isFinite(battery.dischargingTime) ? ` · ~${dur(battery.dischargingTime)}` : ""}`) : "pil yok / prize takılı"}</small></div>
        <div><b>{s.cpu.cores}</b><small>çekirdek · yük {s.cpu.load.map((x) => fmtNum(x, 1)).join(" / ")}</small></div>
      </div>
      <dl className="tt-kv">
        <dt>Sistem</dt><dd>{platform} {s.osVersion || s.release} ({s.arch})</dd>
        <dt>Bilgisayar</dt><dd>{s.hostname}{s.user ? ` · ${s.user}` : ""}</dd>
        <dt>İşlemci</dt><dd>{s.cpu.model}{s.cpu.speedMHz ? ` · ${fmtNum(s.cpu.speedMHz / 1000, 2)} GHz` : ""}</dd>
        <dt>Açık kalma</dt><dd>{dur(s.uptimeSec)}</dd>
        {s.displays.map((d, i) => <React.Fragment key={d.id}><dt>Ekran {i + 1}{d.primary ? " (ana)" : ""}</dt><dd>{d.size} · ×{d.scale}{d.refresh ? ` · ${d.refresh} Hz` : ""}</dd></React.Fragment>)}
        <dt>Uygulama</dt><dd>{s.versions.app} · Electron {s.versions.electron} · Chrome {s.versions.chrome} · Node {s.versions.node}</dd>
      </dl>
      <button type="button" className="btn btn--sm" onClick={() => copy(summary, "Sistem bilgisi kopyalandı")} style={{ alignSelf: "flex-start" }}><Icon name="copy" size={12} /> Destek için kopyala</button>
    </div>
  );
}
