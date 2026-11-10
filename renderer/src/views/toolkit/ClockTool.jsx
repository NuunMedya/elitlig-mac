// Dünya saatleri: seçilen şehirlerin saati, tarihi, yerel saate farkı; gece / gündüz.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { ZONES, diffLabel, normalizeZones, zoneLabel, zoneNow } from "./worldClock";
import { useStored } from "./toolkitUi";

const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul"; } catch { return "Europe/Istanbul"; } };

export default function ClockTool() {
  const [zones, setZones] = useStored("toolkit.zones", null);
  const list = normalizeZones(zones);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const local = localTz();
  const add = (tz) => tz && setZones(normalizeZones([...list, tz]));
  const remove = (tz) => setZones(list.filter((z) => z !== tz));
  return (
    <div className="tk-clocks">
      <ul className="tk-clocks__list">
        {list.map((tz) => {
          const z = zoneNow(tz, now);
          return (
            <li key={tz} className={`tk-clock${z.night ? " is-night" : ""}${tz === local ? " is-local" : ""}`}>
              <Icon name={z.night ? "moon" : "sun"} size={14} />
              <span className="tk-clock__name"><strong>{zoneLabel(tz)}</strong><small>{z.day} · {tz === local ? "burası" : diffLabel(tz, local, now)}</small></span>
              <span className="tk-clock__time">{z.time}</span>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => remove(tz)} aria-label={`${zoneLabel(tz)} kaldır`} title="Kaldır"><Icon name="x" size={12} /></button>
            </li>
          );
        })}
      </ul>
      {list.length < 8 && (
        <select value="" onChange={(e) => add(e.target.value)} aria-label="Şehir ekle">
          <option value="">+ Şehir ekle…</option>
          {ZONES.filter((z) => !list.includes(z.tz)).map((z) => <option key={z.tz} value={z.tz}>{z.label}</option>)}
        </select>
      )}
    </div>
  );
}
