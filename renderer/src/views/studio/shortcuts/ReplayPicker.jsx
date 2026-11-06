// Yayın Stüdyosu · TEKRAR kısayolu paneli: son tekrarların listesi, seçilen
// tekrarın kaydedilmiş AÇILARI (canlı küçük video). Seçilen açılar önce
// ÖNİZLEME'ye yüklenir (modes.loadReplay); "Önizle + yayına al" önce önizlemeye yükler,
// sonra Studio'nun tek GEÇİŞ yolunu çağırır (önizlemede görünen aynen gider) [önizleme-geçiş].
//
//   ctx.replay = { list, meta, sources, playing, previewing, preview(r, angles), take(), stop(), openTab(), recordAngles }
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { PROGRAM_ANGLE, angleLabel, anglesOf, defaultAngles, metaFor, replayTitle } from "../../../lib/studio/replays";

function AngleThumb({ url }) {
  return <video src={url} muted loop autoPlay playsInline preload="metadata" />;
}

export default function ReplayPicker({ ctx, onClose }) {
  const R = ctx.replay;
  const list = useMemo(() => (R.list || []).filter((r) => anglesOf(r).length).slice(0, 8), [R.list]);
  const [id, setId] = useState(() => list[0]?.id || null);
  const replay = list.find((r) => r.id === id) || list[0] || null;
  const [angles, setAngles] = useState(() => (replay ? defaultAngles(replay, R.recordAngles) : []));
  useEffect(() => { if (replay) setAngles(defaultAngles(replay, R.recordAngles)); }, [replay?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);

  // [önizleme-geçiş] Tekrar yayındayken de başka bir tekrar önizlemeye alınabilir (GEÇİŞ yayındakinin yerine koyar).
  const liveBar = R.playing ? (
    <>
      <p className="st-rp__live"><span className="gx-dot" /> Tekrar yayında</p>
      <button type="button" className="st-rp__go is-back" onClick={() => { R.stop(); onClose(); }}><Icon name="stop" size={16} /> CANLIYA DÖN</button>
    </>
  ) : null;
  if (R.playing && !list.length) return <div className="st-rp">{liveBar}</div>;
  if (!replay) {
    return (
      <div className="st-rp">
        <p className="st-hint">Henüz tekrar yok. GOL'e bas ya da <b>ÖNEMLİ AN</b> ile son saniyeleri kaydet (yayın ya da prova açık olmalı).</p>
        <button type="button" className="btn btn--sm" onClick={() => { R.openTab(); onClose(); }}><Icon name="repeat" size={13} /> Tekrar sekmesini aç</button>
      </div>
    );
  }
  const have = (replay.angles || []).filter((a) => a.url);
  const toggle = (a) => setAngles((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...have.map((x) => x.angle).filter((x) => x === a || cur.includes(x))]));
  const chosen = angles.length ? angles : [have[0]?.angle || PROGRAM_ANGLE];
  const preview = () => R.preview(replay, chosen);
  const take = async () => {
    setBusy(true);
    try { await R.take(replay, chosen); onClose(); } finally { setBusy(false); }
  };
  return (
    <div className="st-rp">
      {liveBar}
      <div className="st-rp__list" role="listbox" aria-label="Son tekrarlar">
        {list.map((r) => (
          <button key={r.id} type="button" role="option" aria-selected={r.id === replay.id} className={`st-rp__item ${r.id === replay.id ? "is-on" : ""} ${r.kind === "goal" ? "is-goal" : ""}`} onClick={() => setId(r.id)}>
            <Icon name={r.kind === "goal" ? "ball" : "star"} size={12} />
            <span>{replayTitle(r, metaFor(r, R.meta))}</span>
            <small>{anglesOf(r).length} açı</small>
          </button>
        ))}
      </div>
      <h6 className="st-rp__h">Açılar <small>sırayla yayına gider · birden çok seçilebilir</small></h6>
      <div className="st-rp__angles">
        {have.map((a, i) => {
          const on = chosen.includes(a.angle);
          const order = chosen.indexOf(a.angle);
          return (
            <button key={a.angle} type="button" className={`st-rp__angle ${on ? "is-on" : ""}`} onClick={() => toggle(a.angle)} aria-pressed={on} title={angleLabel(a, R.sources)}>
              <AngleThumb url={a.url} />
              <span>{i + 1}. {angleLabel(a, R.sources)}</span>
              {on && <b>{order + 1}</b>}
            </button>
          );
        })}
      </div>
      <div className="st-rp__actions">
        <button type="button" className={`btn btn--sm ${R.previewing ? "is-pvw" : ""}`} onClick={preview}><Icon name="eye" size={13} /> {R.previewing ? "Önizlemede · yenile" : "Önizlemeye al"}</button>
        <button type="button" className="st-rp__go" onClick={take} disabled={busy} title="Önizlemeye yükler ve aynı GEÇİŞ yoluyla yayına verir (önizlemede görünen aynen gider)"><Icon name="play" size={15} /> ÖNİZLE + YAYINA AL</button>
      </div>
      <button type="button" className="st-link st-rp__more" onClick={() => { R.openTab(); onClose(); }}>Tekrar sekmesinde ayrıntılı düzenle (ağır çekim, kuyruk, katmanlar) →</button>
    </div>
  );
}
