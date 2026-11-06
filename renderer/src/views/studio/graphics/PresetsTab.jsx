// Yayın grafikleri · ÖN AYARLAR sekmesi (üst sekme). Ön ayarlar genel
// ŞABLONLARDIR (kaydet / listele / adlandır / sil); "Uygula" yalnız şu anki
// maça yazar. Hiçbir ön ayar kendiliğinden uygulanmaz ya da varsayılan olmaz.
//   <PresetsTab g={g} />
import React from "react";
import { GraphicsTabShell } from "./parts";
import PresetsPanel from "./PresetsPanel";

export default function PresetsTab({ g }) {
  return (
    <GraphicsTabShell g={g} title="Ön ayarlar" icon="star">
      {g?.matchId && <PresetsPanel g={g} />}
    </GraphicsTabShell>
  );
}
