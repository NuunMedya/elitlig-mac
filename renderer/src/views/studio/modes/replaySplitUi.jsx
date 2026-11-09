// YAN YANA TEKRAR ve OYUNCU TAKİBİ — deste denetimleri (monitör kaplaması, Tekrar paneli).
//
//   SplitChips     yerleşim çipleri (50/50 · Üst–alt · PiP · 1+2 · 2×2) + kırp / sığdır + etiket + kapat
//   SplitPanes     her pencerenin üstünde (yalnız operatör): açı adı, ±kare kayması, "Ana yap"
//                  (önizleme), odak çerçevesi (yakınlaştırma düğmeleri o pencereye)
//   SplitAngles    açı çoklu seçimi (2…4) → bölmeye ekle / çıkar
//   TrackBar       takip aracı: vurgu biçimi, renk, boyut, isim (kadrodan), Otomatik izle,
//                  Dondur ve göster, Yeni oyuncu, izler
// deck.split / deck.track: useReplayMode (decks.preview | decks.program).
import React from "react";
import { SPLIT_LAYOUTS } from "../../../lib/studio/replaySplit";

const SHORT = { halka: "Halka", spot: "Spot", ok: "Ok", daire: "Daire" };
const offText = (n) => (n > 0 ? `+${n}` : String(n || 0));

export function SplitChips({ deck, compact = false, closable = true }) {
  const S = deck?.split;
  if (!S?.available) return null;
  return (
    <span className="rsp-chips" role="group" aria-label="Yan yana tekrar yerleşimi">
      {!compact && <b className="rsp-chips__h">YAN YANA</b>}
      {SPLIT_LAYOUTS.map((l) => (
        <button key={l.key} type="button" className={S.layout === l.key ? "is-on" : ""} onClick={() => S.setLayout(l.key)}
          disabled={!S.active && deck.target !== "preview"} title={`${l.label}${S.active ? "" : " — aynı anın açıları yan yana (önizleme)"}`}>
          <i className={`rsp-ico is-${l.key}`} aria-hidden="true" />{compact ? "" : <span>{l.short}</span>}
        </button>
      ))}
      {S.active && !compact && (
        <>
          <button type="button" className={S.fit === "cover" ? "is-on" : ""} onClick={() => S.setFit(S.fit === "cover" ? "contain" : "cover")} title="Pencereyi doldur (kırp) / tüm kareyi sığdır">{S.fit === "cover" ? "Kırp" : "Sığdır"}</button>
          <button type="button" className={S.labels ? "is-on" : ""} onClick={S.toggleLabels} title="Açı adlarını yayında göster / gizle">Ad</button>
        </>
      )}
      {S.active && closable && <button type="button" className="rsp-chips__x" onClick={S.close} title={deck.target === "program" ? "Yayında tek açıya dön (ana açı sürer)" : "Yan yanayı kapat (tek açı)"}>✕{compact ? "" : " Tek açı"}</button>}
    </span>
  );
}

/** Pencere üstü denetimler (DOM; yayına çizilmez). */
export function SplitPanes({ deck }) {
  const S = deck?.split;
  if (!S?.active) return null;
  return (
    <div className="rsp-panes" aria-hidden="false">
      {S.rects.map((r, i) => {
        const p = S.panes[i];
        if (!p) return null;
        return (
          <div key={p.angle} className={`rsp-pane ${S.focus === i ? "is-focus" : ""} ${r.inset ? "is-inset" : ""} ${r.y < 0.01 ? "is-top" : ""}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
            <span className="rsp-pane__bar" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className="rsp-pane__name" onClick={() => S.setFocus(i)} title="Bu pencereyi seç (yakınlaştırma düğmeleri buna uygulanır)">{i === 0 ? "● " : ""}{p.label}{!p.ready ? " …" : ""}</button>
              {i > 0 && (
                <span className="rsp-off" title="Kamera gecikmesi: bu açıyı ana açıya göre kare kare kaydır (30 fps)">
                  <button type="button" onClick={() => S.nudge(i, -1)} aria-label="Bir kare geri">−</button>
                  <b onDoubleClick={() => S.resetOffset(i)}>{offText(p.offsetFrames)}k</b>
                  <button type="button" onClick={() => S.nudge(i, 1)} aria-label="Bir kare ileri">+</button>
                </span>
              )}
              {i > 0 && deck.target === "preview" && <button type="button" onClick={() => S.swap(i)} title="Ana açı yap: taşıma, ses ve yükleme bu açıyı izler">Ana</button>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Açı çoklu seçimi (önizleme): bölmeye ekle / çıkar. */
export function SplitAngles({ deck }) {
  const S = deck?.split;
  if (!S?.available || deck.target !== "preview") return null;
  return (
    <span className="rsp-angles" role="group" aria-label="Yan yana açıları">
      {S.angles.map((a) => (
        <button key={a.angle} type="button" className={a.on ? "is-on" : ""} onClick={() => S.toggleAngle(a.angle)} title={a.on ? "Bölmeden çıkar" : "Bölmeye ekle (en çok 4)"}>{a.on ? "✓ " : "+ "}{a.label}</button>
      ))}
    </span>
  );
}

/** Takip aracı şeridi. */
export function TrackBar({ deck, compact = false }) {
  const T = deck?.track;
  if (!T) return null;
  const tool = T.tool || {};
  const squad = T.squads ? [...(T.squads.home || []), ...(T.squads.away || [])] : [];
  const busy = T.busy;
  const active = T.tracks.find((x) => x.active) || null;
  return (
    <div className={`rtk ${compact ? "is-compact" : ""}`} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <b className="rtk__h">◎ TAKİP</b>
      {!compact && <span className="rtk__hint">{T.tracks.length ? `${T.tracks.length} iz · ${active ? `${active.keys} anahtar` : "yeni: oyuncuya tıkla"}` : "Durdur (K), oyuncunun gövdesine tıkla · ⌥ tık: anahtarı sil"}</span>}
      <span className="rtk__group" role="group" aria-label="Vurgu biçimi">
        {T.styles.map((s) => <button key={s.key} type="button" className={tool.style === s.key ? "is-on" : ""} onClick={() => T.setTool({ style: s.key })} title={s.label}>{compact ? SHORT[s.key] : s.label}</button>)}
      </span>
      <span className="rtk__colors" role="group" aria-label="Renk">
        {T.colors.map((c) => <button key={c} type="button" className={tool.color === c ? "is-on" : ""} style={{ "--rtk-c": c }} onClick={() => T.setTool({ color: c })} aria-label={`Renk ${c}`} />)}
      </span>
      {!compact && (
        <span className="rtk__size" title="Oyuncu boyu (vurgu ölçüsü ve izleme yaması)">
          <button type="button" onClick={() => T.setTool({ size: Math.max(0.05, Math.round(((tool.size || 0.14) - 0.02) * 100) / 100) })}>−</button>
          <b>{Math.round((tool.size || 0.14) * 100)}</b>
          <button type="button" onClick={() => T.setTool({ size: Math.min(0.45, Math.round(((tool.size || 0.14) + 0.02) * 100) / 100) })}>+</button>
        </span>
      )}
      <input className="rtk__label" list={`rtk-squad-${deck.target}`} value={tool.label ?? ""} placeholder={T.defaultLabel || "İsim (ok için)"}
        onChange={(e) => T.setTool({ label: e.target.value.slice(0, 40) })} aria-label="Oyuncu adı (kadrodan)" />
      {squad.length > 0 && <datalist id={`rtk-squad-${deck.target}`}>{squad.map((p) => <option key={p.id} value={p.number ? `${p.number} ${p.name}` : p.name} />)}</datalist>}
      <button type="button" className={`rtk__fz ${tool.freeze ? "is-on" : ""}`} onClick={() => T.setTool({ freeze: !tool.freeze })} title="Dondur ve göster: tekrar ilk anahtar karede 2 sn durur, vurgu belirir, sonra sürer">❚❚ {compact ? "Dondur" : "Dondur ve göster"}</button>
      {busy
        ? <button type="button" className="rtk__auto is-busy" onClick={T.cancel} title="İptal">İzleniyor {Math.round((busy.p || 0) * 100)}% ✕</button>
        : <button type="button" className="rtk__auto" onClick={T.auto} disabled={!T.tracks.some((x) => x.keys > 0)} title="Otomatik izle: anahtar karelerden ileri / geri şablon eşleme; kaybolduğu yerde anahtarlar arası ara değer">⟳ {compact ? "Otomatik" : "Otomatik izle"}</button>}
      <button type="button" onClick={T.newPlayer} title="Yeni oyuncu: sonraki tık yeni iz başlatır">+ Oyuncu</button>
      {T.tracks.map((x) => (
        <span key={x.id} className={`rtk__trk ${x.active ? "is-on" : ""}`} style={{ "--rtk-c": x.color }}>
          <button type="button" onClick={() => T.select(x.id)} title={`${x.angleLabel} · ${x.keys} anahtar${x.auto.n ? ` · otomatik ${Math.round(x.auto.ratio * 100)}% güvenli` : ""}`}>
            <i />{x.label || x.angleLabel}{x.auto.n ? ` · ${Math.round(x.auto.ratio * 100)}%` : ""}
          </button>
          <button type="button" className="rtk__del" onClick={() => T.remove(x.id)} aria-label="İzi sil">✕</button>
        </span>
      ))}
    </div>
  );
}
