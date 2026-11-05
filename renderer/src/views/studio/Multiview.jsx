// Yayın Stüdyosu · ÇOKLU GÖRÜNÜM şeridi (OBS "multiview").
//
// Her kaynak (ve her düzen) canlı küçük resimli bir kutu: tıkla → ÖNİZLEME
// (yeşil çerçeve), çift tıkla → doğrudan PROGRAM (yayına, kırmızı çerçeve).
// 1–9 kısayolu kutunun numarasıdır. Sonda "+ Kaynak ekle".
//
// Küçük resimler tek bir zamanlayıcıyla (saniyede 10 kare) doğrudan tuvallere
// çizilir; React durumu kare başına değişmez.
import React, { memo, useEffect, useRef } from "react";
import { Icon, MenuButton } from "../../components/ui";
import { kindIcon, resolveScene } from "../../lib/studio/layouts";
import { drawScene } from "./draw";

const BAD = new Set(["missing", "denied", "ended", "busy", "error", "file"]);
const STATUS_TEXT = { waiting: "Açılıyor…", missing: "Kaynak yok", denied: "İzin yok", ended: "Bağlantı koptu", busy: "Meşgul", error: "Açılamadı", file: "Dosya seçilmeli" };
const TILE_W = 288;
const TILE_H = 162;

function Multiview({ items, configRef, runtimeRef, previewId, programId, studioMode, version, onPreview, onProgram, onAdd, onEdit, onReacquire, onRemove }) {
  const canvases = useRef(new Map());
  void version;

  useEffect(() => {
    const draw = () => {
      const cfg = configRef.current;
      if (!cfg) return;
      for (const [id, c] of canvases.current) {
        if (!c.isConnected) continue;
        const ctx = c.getContext("2d", { alpha: false });
        drawScene(ctx, resolveScene(cfg, id), cfg.sources, runtimeRef.current, c.width, c.height, { placeholders: true });
      }
    };
    draw();
    const t = setInterval(draw, 100);
    return () => clearInterval(t);
  }, [configRef, runtimeRef]);

  return (
    <section className="st-mv" aria-label="Kaynaklar">
      <div className="st-mv__scroll">
        {items.map((it) => {
          const src = it.kind === "source" ? configRef.current?.sources.find((s) => s.id === it.sourceId) : null;
          const rt = src ? runtimeRef.current.get(src.id) : null;
          const bad = rt && BAD.has(rt.status);
          const onAir = it.id === programId;
          const inPreview = studioMode && it.id === previewId && !onAir;
          return (
            <div key={it.id} className={`st-tile ${onAir ? "is-program" : ""} ${inPreview ? "is-preview" : ""} ${it.kind === "layout" ? "is-layout" : ""} ${bad ? "is-bad" : ""}`}>
              <button type="button" className="st-tile__hit" onClick={() => onPreview(it.id)} onDoubleClick={() => onProgram(it.id)}
                title={studioMode ? "Tıkla: önizlemeye al · Çift tıkla: yayına ver" : "Tıkla: yayına ver"}>
                <canvas ref={(el) => { if (el) canvases.current.set(it.id, el); else canvases.current.delete(it.id); }} width={TILE_W} height={TILE_H} />
                {onAir && <span className="st-tile__badge is-live">YAYINDA</span>}
                {inPreview && <span className="st-tile__badge">ÖNİZLEME</span>}
                {bad && <span className="st-tile__warn">{STATUS_TEXT[rt.status]}</span>}
              </button>
              <div className="st-tile__bar">
                {it.number && <b className="st-tile__no">{it.number}</b>}
                <Icon name={it.kind === "layout" ? "layers" : kindIcon(src?.kind)} size={12} />
                <span className="st-tile__name" title={it.name}>{it.name}</span>
                {it.kind === "layout" && <span className="st-tile__kind">DÜZEN</span>}
                {src && (
                  <MenuButton label="Kaynak" size={13} items={[
                    { label: "Önizlemeye al", icon: "eye", onClick: () => onPreview(it.id) },
                    { label: "Yayına ver", icon: "play", onClick: () => onProgram(it.id) },
                    "-",
                    { label: "Ayarlar…", icon: "sliders", onClick: () => onEdit(src) },
                    { label: "Yeniden bağlan", icon: "refresh", onClick: () => onReacquire(src) },
                    "-",
                    { label: "Kaynağı sil", icon: "trash", danger: true, onClick: () => onRemove(src) },
                  ]} />
                )}
              </div>
            </div>
          );
        })}
        <button type="button" className="st-tile st-tile--add" onClick={onAdd} title="Kamera, ekran, görsel, video ya da renk plakası ekle">
          <Icon name="plus" size={20} strokeWidth={2.4} />
          <span>Kaynak ekle</span>
        </button>
      </div>
    </section>
  );
}

export default memo(Multiview);
