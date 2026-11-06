// Yayın grafikleri · MARKA & TEMA sekmesi (üst sekme): logo, renkler, yazı
// tipi, ölçüler. Taslak programda anında görünür; "Kaydet" yalnız bu maçın
// kaydına (PUT /api/maclar/:id/overlay-branding) ve web kaplamalarına yazar.
//   <BrandTab g={g} live={live} />
import React from "react";
import { Spinner } from "../../../components/ui";
import BrandingEditor from "./BrandingEditor";
import { GraphicsTabShell } from "./parts";

export default function BrandTab({ g, live }) {
  return (
    <GraphicsTabShell g={g} title="Marka & tema" icon="palette"
      actions={g?.brand?.dirty ? <span className="pill pill--xs pill--amber">Kaydedilmemiş değişiklik</span> : null}>
      {g?.matchId && (g.brand.loading ? <Spinner label="Yayın görünümü yükleniyor…" /> : <BrandingEditor g={g} live={live} />)}
    </GraphicsTabShell>
  );
}
