// Parola üretici: uzunluk, karakter kümeleri, karışabilecekleri (I l 1 O 0) çıkar, güç ölçer.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { DEFAULT_OPTS, generatePassword, strength } from "./password";
import { useCopy, useStored } from "./toolkitUi";

const LABELS = { lower: "a–z", upper: "A–Z", digits: "0–9", symbols: "!@#" };

export default function PasswordTool() {
  const copy = useCopy();
  const [opts, setOpts] = useStored("toolkit.pwOpts", DEFAULT_OPTS);
  const [pw, setPw] = useState("");
  const regen = (o = opts) => setPw(generatePassword(o));
  useEffect(() => { regen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch) => { const o = { ...opts, ...patch }; setOpts(o); regen(o); };
  const st = strength(pw);
  return (
    <div className="tk-pw">
      <button type="button" className="tk-pw__value" onClick={() => copy(pw, "Parola kopyalandı")} title="Kopyalamak için tıklayın" aria-label="Parolayı kopyala">{pw}</button>
      <div className={`tk-pw__meter is-${st.level}`} aria-label={`Güç: ${st.label}`}><i style={{ width: `${(st.level + 1) * 20}%` }} /></div>
      <p className="tk-note">{st.label} · yaklaşık {st.bits} bit</p>
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(pw, "Parola kopyalandı")}><Icon name="copy" size={12} /> Kopyala</button>
        <button type="button" className="btn btn--sm" onClick={() => regen()}><Icon name="refresh" size={12} /> Yenile</button>
      </div>
      <label className="tk-range">Uzunluk <b>{opts.length}</b>
        <input type="range" min={8} max={64} value={opts.length} onChange={(e) => set({ length: Number(e.target.value) })} aria-label="Uzunluk" />
      </label>
      <div className="tk-chips" role="group" aria-label="Karakterler">
        {Object.keys(LABELS).map((k) => (
          <label key={k} className={`tk-chip is-check${opts[k] ? " is-on" : ""}`}>
            <input type="checkbox" checked={Boolean(opts[k])} onChange={(e) => set({ [k]: e.target.checked })} /> {LABELS[k]}
          </label>
        ))}
        <label className={`tk-chip is-check${opts.avoidAmbiguous ? " is-on" : ""}`}><input type="checkbox" checked={Boolean(opts.avoidAmbiguous)} onChange={(e) => set({ avoidAmbiguous: e.target.checked })} /> Karışanları çıkar</label>
      </div>
      <p className="tk-note"><Icon name="shield" size={12} /> Parolalar bu bilgisayarda üretilir, hiçbir yere gönderilmez ve saklanmaz.</p>
    </div>
  );
}
