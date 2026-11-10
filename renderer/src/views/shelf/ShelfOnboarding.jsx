// İlk açılış kartı: pano geçmişinde neyin tutulacağını açıkça sorar.
// Varsayılan (ayar sürümü 2): ekran görüntüleri, kopyalanan metinler ve
// bağlantılar açık; kopyalanan görseller kapalı. "Tamam" ile bir daha gösterilmez.
import React, { useEffect, useState } from "react";
import { FIcon } from "../files/icons";

const sh = () => window.elitlig.shelf;
const OPTIONS = [
  ["text", "Kopyalanan metinler"],
  ["link", "Kopyalanan bağlantılar"],
  ["image", "Kopyalanan görseller"],
  ["screenshots", "Ekran görüntüleri klasörü"],
];

export default function ShelfOnboarding() {
  const [s, setS] = useState(null);
  useEffect(() => { sh().settings().then((r) => { if (r.ok) setS(r.settings); }); }, []);
  if (!s || s.onboarded) return null;
  const patch = async (p) => { const r = await sh().setSettings(p); if (r.ok) setS(r.settings); };
  return (
    <div className="card shl-onb" role="region" aria-label="Pano geçmişi">
      <span className="shl-onb__icon" aria-hidden="true"><FIcon name="clipboard" size={18} /></span>
      <div className="shl-onb__body">
        <strong>Pano geçmişi açık</strong>
        <p className="muted">Kopyaladıklarınız burada ve raflarda (⌃⌥T) tutulur; uygulama yeniden açıldığında da durur. Parola yöneticilerinin gizli işaretlediği içerikler hiçbir zaman alınmaz, hiçbir şey sunucuya gönderilmez. Neler toplansın?</p>
        <div className="shl-onb__opts">
          {OPTIONS.map(([key, label]) => (
            <label key={key} className="ft-check"><input type="checkbox" checked={Boolean(s.sources[key])} onChange={(e) => patch({ sources: { [key]: e.target.checked } })} /> {label}</label>
          ))}
        </div>
      </div>
      <button type="button" className="btn btn--primary btn--sm" onClick={() => patch({ onboarded: true })}>Tamam</button>
    </div>
  );
}
