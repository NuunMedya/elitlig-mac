// Pencere düzeni ızgarası: her düzen küçük bir ekran çizimiyle; tık → öndeki pencere oraya.
// Araç takımı panelinden açılınca hedef, panel açılmadan önce öndeki penceredir (ana süreç tutar).
import React, { useEffect, useState } from "react";
import { Icon, isMac } from "../../components/ui";
import { acceleratorLabel } from "./shortcutUtils";
import { deskkit } from "./toolkitUi";

/** Düzen simgesi: ekran çerçevesi içinde vurgulu bölge. */
export function LayoutPreview({ layout, size = 34 }) {
  const w = size;
  const h = Math.round(size * 0.66);
  const r = layout.rect;
  let body = null;
  if (r) body = <rect x={1.5 + r[0] * (w - 3)} y={1.5 + r[1] * (h - 3)} width={(r[2] - r[0]) * (w - 3)} height={(r[3] - r[1]) * (h - 3)} rx={1.5} className="tk-lp__on" />;
  else if (layout.key === "center") body = <rect x={w * 0.28} y={h * 0.25} width={w * 0.44} height={h * 0.5} rx={1.5} className="tk-lp__on" />;
  else if (layout.key === "restore") body = <path d={`M${w * 0.62} ${h * 0.32}a${h * 0.24} ${h * 0.24} 0 1 0 ${h * 0.06} ${h * 0.28}M${w * 0.62} ${h * 0.18}v${h * 0.16}h-${h * 0.16}`} className="tk-lp__line" />;
  else body = <path d={layout.key === "prevDisplay" ? `M${w * 0.66} ${h / 2}H${w * 0.3}m${h * 0.16} -${h * 0.16}l-${h * 0.16} ${h * 0.16} ${h * 0.16} ${h * 0.16}` : `M${w * 0.34} ${h / 2}H${w * 0.7}m-${h * 0.16} -${h * 0.16}l${h * 0.16} ${h * 0.16}-${h * 0.16} ${h * 0.16}`} className="tk-lp__line" />;
  return (
    <svg className="tk-lp" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={3} className="tk-lp__screen" />
      {body}
    </svg>
  );
}

/** Erişilebilirlik izni uyarısı (yalnız Mac). */
export function PermissionNote({ permission, onChange, compact = false }) {
  if (!permission?.needed || permission.granted) return null;
  const dk = deskkit();
  return (
    <div className={`tk-perm${compact ? " is-compact" : ""}`} role="alert">
      <Icon name="lock" size={16} />
      <div>
        <strong>Erişilebilirlik izni gerekiyor</strong>
        <p>Başka uygulamaların pencerelerini taşımak için macOS izni şart: <b>Sistem Ayarları › Gizlilik ve Güvenlik › Erişilebilirlik</b>'te <b>Elitlig Araçlar</b>'ı açın. İlk kullanımda “System Events'i denetleme” izni de sorulur (Otomasyon).</p>
        <div className="tk-perm__btns">
          <button type="button" className="btn btn--sm btn--primary" onClick={async () => { await dk?.requestPermission(); onChange?.(await dk?.permission()); }}>İzin iste</button>
          <button type="button" className="btn btn--sm" onClick={() => dk?.openPermission("accessibility")}><Icon name="external" size={12} /> Sistem Ayarları'nı aç</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={async () => onChange?.(await dk?.permission())}>Yeniden denetle</button>
        </div>
      </div>
    </div>
  );
}

/** Izgara. info: deskkit.settings() sonucu. onDone: düzen uygulandı (panel kapanır). */
export default function LayoutTool({ info, onPermission, inPanel = true }) {
  const [result, setResult] = useState(null);
  const mac = isMac();
  useEffect(() => { setResult(null); }, [info]);
  if (!info) return <p className="muted tk-pad">Yükleniyor…</p>;
  if (!info.supported) return <p className="muted tk-pad">Pencere yerleştirme yalnız macOS ve Windows'ta çalışır.</p>;
  const groups = [];
  for (const l of info.layouts) {
    let g = groups.find((x) => x.name === l.group);
    if (!g) { g = { name: l.group, items: [] }; groups.push(g); }
    g.items.push(l);
  }
  const apply = async (key) => {
    const res = await deskkit()?.layout(key);
    if (res?.clamped) setResult(res);
    if (res && !res.ok) {
      setResult(res);
      if (res.needsPermission) onPermission?.(await deskkit()?.permission());
    }
  };
  const disabled = !info.settings.layouts.enabled;
  return (
    <div className="tk-layouts">
      <PermissionNote permission={info.permission} onChange={onPermission} compact={inPanel} />
      {info.scope === "own" && <p className="tk-note"><Icon name="info" size={13} /> Bu işletim sisteminde yalnız Elitlig Araçlar pencereleri yerleştirilir (başka uygulamalar macOS ve Windows'ta).</p>}
      {disabled && <p className="tk-note"><Icon name="info" size={13} /> Pencere kısayolları kapalı (Masaüstü araçları). Izgara yine çalışır.</p>}
      {groups.map((g) => (
        <section key={g.name} className="tk-layouts__group" aria-label={g.name}>
          <h4>{g.name}</h4>
          <div className="tk-layouts__grid">
            {g.items.map((l) => {
              const acc = info.settings.layouts.shortcuts[l.key];
              return (
                <button key={l.key} type="button" className="tk-layout" onClick={() => apply(l.key)} title={`${l.label}${acc ? ` (${acceleratorLabel(acc, mac)})` : ""}`} aria-label={l.label}>
                  <LayoutPreview layout={l} />
                  <span className="tk-layout__label">{l.label}</span>
                  {acc && <kbd className="tk-layout__kbd">{acceleratorLabel(acc, mac)}</kbd>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {result && !result.ok && !result.needsPermission && <p className="tk-err" role="alert">{result.error}</p>}
      {result?.ok && result.clamped && <p className="tk-note" role="status"><Icon name="info" size={13} /> {result.note}</p>}
      {inPanel && <p className="tk-note"><Icon name="info" size={13} /> Panel açılmadan önce öndeki pencere taşınır. Kısayollar her yerde çalışır; sürükleyerek kenara yapıştırma yoktur.</p>}
    </div>
  );
}
