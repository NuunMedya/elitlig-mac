// Projeler: uçtan uca proje ve süreç yönetimi.
//   Ana sayfa  — proje kartları, Takip (tüm projelerde aranacaklar, adımlarım,
//                açık sorular) ve genel Portföy.
//   Proje      — Genel bakış, Süreç (aşamalar ve adımlar), Kişiler (CRM),
//                Sorular, İletişim, Portföy, Ayarlar. Adımdaki araç (ör.
//                "Potansiyel müşterilerin aranması" → Kişiler) adımın içinde açılır.
import React, { useCallback, useEffect, useState } from "react";
import Home from "./Home";
import ProjectView from "./ProjectView";

const readLast = () => { try { return JSON.parse(localStorage.getItem("projects:last")) || null; } catch { return null; } };
const writeLast = (v) => { try { localStorage.setItem("projects:last", JSON.stringify(v)); } catch { /* yoksay */ } };

/** go("projects", …) argümanı: "new" | "12" | { id, tab, step, lead, question } | { section } */
function parseArg(arg) {
  if (arg == null || arg === "") return null;
  if (typeof arg === "object") return arg;
  if (arg === "new") return { newProject: true };
  if (/^\d+$/.test(String(arg))) return { id: Number(arg) };
  if (["projects", "timeline", "followups", "portfolio"].includes(arg)) return { section: arg };
  return null;
}

export default function Projects({ go, arg, auth }) {
  const [route, setRoute] = useState(() => parseArg(arg) || readLast() || {});
  useEffect(() => { const r = parseArg(arg); if (r) setRoute({ ...r, nonce: Date.now() }); }, [arg]);
  useEffect(() => { writeLast(route.id ? { id: route.id, tab: route.tab || "overview" } : { section: route.section || "projects" }); }, [route.id, route.tab, route.section]);

  const openProject = useCallback((id, extra = {}) => setRoute({ id: Number(id), tab: "overview", ...extra, nonce: Date.now() }), []);
  const backHome = useCallback((section = "projects") => setRoute({ section }), []);

  if (route.id) {
    return <ProjectView key={route.id} id={route.id} route={route} setRoute={setRoute} onBack={backHome} openProject={openProject} go={go} auth={auth} />;
  }
  return <Home section={route.section || "projects"} newProject={route.newProject} nonce={route.nonce} onSection={(section) => setRoute({ section })} onOpen={openProject} go={go} auth={auth} />;
}
