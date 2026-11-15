// Rehber: "Kişiler" (contacts/People.jsx — Elitlig sistem kitlesi + kendi
// hedef kitleleriniz, zengin kişi kartları, içe / dışa aktarma) ve "Takımlar"
// (contacts/Teams.jsx — takım bazlı rehber). Web'deki Rehber'le aynı.
import React, { useEffect, useState } from "react";
import { Segmented } from "../components/ui";
import Teams from "./contacts/Teams";
import People from "./contacts/People";

export default function Contacts({ arg, argSeq, go }) {
  const [tab, setTab] = useState(() => (arg?.tab === "teams" ? "teams" : arg && typeof arg !== "object" ? "people" : localStorage.getItem("contacts:tab") || "people"));
  useEffect(() => { try { localStorage.setItem("contacts:tab", tab); } catch { /* yoksay */ } }, [tab]);
  useEffect(() => { if (arg?.tab) setTab(arg.tab); }, [arg]);
  const tabs = <Segmented value={tab} onChange={setTab} ariaLabel="Rehber görünümü" options={[{ value: "people", label: "Kişiler", icon: "users" }, { value: "teams", label: "Takımlar", icon: "team" }]} />;
  if (tab === "teams") return <Teams key={`${arg?.teamId || ""}${arg?.q || ""}`} go={go} tabs={tabs} initialTeam={arg?.teamId} initialQuery={arg?.q} />;
  return <People arg={typeof arg === "object" ? null : arg} argSeq={argSeq} go={go} tabs={tabs} onTeam={(teamId, name) => { setTab("teams"); go("contacts", teamId ? { tab: "teams", teamId } : { tab: "teams", q: name }); }} />;
}
