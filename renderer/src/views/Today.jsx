// Bugün: tasarlanabilir pano. Yayın Stüdyosu'ndaki gibi geniş bir bileşen kütüphanesinden (hızlı
// işlemler, maçlar, muhasebe, proje etapları, mesajlar, talepler, ajanda, saat / hava / odak / müzik…)
// istenen bileşen istenen boyutta eklenir; boyut büyüdükçe işlev artar, 1×1'de tek dokunuşluk düğme olur.
// Birden çok sayfa (Genel, Maç günü, Muhasebe…) ve hazır şablonlar; düzen kullanıcı başına saklanır.
// Ayrıntı: ./today/ (dashModel: düzen modeli, registry: kütüphane, tiles/*: bileşenler).
import React from "react";
import { OfflineNote } from "../components/ui";
import { useData } from "./today/data";
import "./todos/todoProjects.css";
import "./equipment/equipment.css";
import ToolkitIntro from "./toolkit/ToolkitIntro";
import Dashboard from "./today/Dashboard";

export default function Today({ go, auth }) {
  // Çevrimdışı uyarısı: genel özet önbellekten geliyorsa sayfanın üstünde bir kez gösterilir.
  const overview = useData("/api/tools/overview");
  return (
    <div className="view view--today">
      <ToolkitIntro go={go} />
      <OfflineNote offline={overview.offline} savedAt={overview.savedAt} />
      <Dashboard go={go} auth={auth} />
    </div>
  );
}
