// Saha ve maç planlama: sitedeki /editor/sahalar çağrı merkezinin masaüstü
// hâli (bütün sahalar): Talepler, Program, Takımlar, Kayıtlar.
import React from "react";
import { ViewHeader } from "../components/ui";
import Desk from "./planning/Desk";

export default function Planning() {
  return (
    <div className="view view--planning">
      <Desk header={<ViewHeader icon="ball" title="Saha ve maç planlama" subtitle="Talepler, haftalık program, takımlar ve görüşmeler — sitedeki saha ve maç planlamayla ortak" />} />
    </div>
  );
}
