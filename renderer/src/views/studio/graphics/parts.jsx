// Yayın grafikleri · sekmelerin ortak parçaları (kabuk, boş durum, yayın düğmesi).
import React, { useEffect } from "react";
import { Icon } from "../../../components/ui";
import "../manage/manage.css";
import "./graphics.css";

/** Yayın masasını ara ara tazele (başka reji / web masası değiştirmiş olabilir). */
export function useDeskPolling(g, ms = 20_000) {
  useEffect(() => {
    if (!g?.matchId) return undefined;
    const t = setInterval(() => g.desk?.refresh?.(), ms);
    return () => clearInterval(t);
  }, [g?.matchId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Dok sekmesi kabuğu: başlık şeridi + kaydırılan gövde. Maç yoksa boş durum. */
export function GraphicsTabShell({ g, title, icon, actions, children, className = "", requireMatch = true }) {
  if (!g) return <div className="mg-dock gx-dock"><p className="mg-muted gx-empty">Yayın grafikleri yüklenemedi.</p></div>;
  const noMatch = requireMatch && !g.matchId;
  return (
    <div className={`mg-dock gx-dock gx-tab ${className}`}>
      <header className="gx-tab__head">
        <h5>{icon && <Icon name={icon} size={14} />} {title}</h5>
        {!noMatch && <span className="gx-scope" title="Buradaki değişiklikler yalnız seçili maça uygulanır"><Icon name="lock" size={11} /> Yalnız bu maç</span>}
        <span className="mg-grow" />
        {!noMatch && actions}
      </header>
      <div className="gx-tab__body">
        {noMatch ? (
          <div className="mg-empty"><Icon name="calendar" size={22} /><p>Önce “Maç yönetimi › Maçlar” sekmesinden bir maç seç.</p></div>
        ) : children}
      </div>
    </div>
  );
}

export function OnAirButton({ on, onChange, labelOn, labelOff, disabled }) {
  return (
    <button type="button" className={`btn btn--sm gx-onair ${on ? "btn--red is-on" : "btn--green"}`} disabled={disabled} onClick={() => onChange(!on)}>
      {on ? <><span className="gx-dot" /> {labelOn}</> : <><Icon name="play" size={13} /> {labelOff}</>}
    </button>
  );
}

/** Başlıklı kart (grafik sekmelerinde tek tip kutu). */
export function GxCard({ title, icon, aside, children, className = "" }) {
  return (
    <section className={`gx-card ${className}`}>
      {(title || aside) && (
        <header className="gx-card__head">
          {title && <h6>{icon && <Icon name={icon} size={13} />} {title}</h6>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function DeskError({ desk }) {
  if (!desk?.error) return null;
  return <p className="mg-error">{desk.error} <button type="button" className="btn btn--xs" onClick={desk.refresh}>Yeniden dene</button></p>;
}
