// Saha ve maç planlama: sitedeki /editor/sahalar çağrı merkezinin masaüstü
// hâli, kapsamsız (bütün sahalar). Projelerdeki "Saha ve maç" sekmesi aynı
// masayı proje sahalarına süzerek kullanır.
import React from "react";
import { ViewHeader } from "../components/ui";
import Desk from "./planning/Desk";

export default function Planning({ go }) {
  return (
    <div className="view view--planning">
      <Desk viewKey="planning:view" header={(
        <ViewHeader icon="ball" title="Saha ve maç planlama" subtitle="Çağrı merkezi · sahalar, haftalık program, talepler, bekleyenler, takımlar ve kayıtlar — sitedeki saha ve maç planlamayla ortak">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => go("projects")}>Projelerde aç</button>
        </ViewHeader>
      )} />
    </div>
  );
}
