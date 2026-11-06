// Yayın grafikleri · SPONSOR yayını ve OBS / LED BAĞLANTILARI (gömülebilir paneller).
//   <SponsorPanel g={g} />   <LinksPanel g={g} />
import React from "react";
import { useToast } from "../../../components/ui";
import { overlayLinks } from "../../../lib/studio/manageBroadcast";
import { LinkRow } from "../manage/pickers";
import SponsorDesk from "../manage/SponsorDesk";
import { DeskError, GxCard, useDeskPolling } from "./parts";

const SITE = "https://elitlig.com";

export function SponsorPanel({ g }) {
  useDeskPolling(g);
  if (!g?.matchId) return null;
  return (
    <div className="mg-stack">
      <DeskError desk={g.desk} />
      <GxCard title="Sponsor yayını" icon="handshake">
        {g.desk.loading ? <p className="mg-muted">Yükleniyor…</p> : <SponsorDesk desk={g.desk} ledMode={g.ledMode} onLedSponsorMode={() => g.setLedMode("sponsor")} />}
      </GxCard>
    </div>
  );
}

export function LinksPanel({ g, matchId }) {
  const toast = useToast();
  const id = Number(matchId || g?.matchId);
  if (!id) return null;
  return (
    <GxCard title="OBS / LED bağlantıları" icon="link">
      <p className="mg-muted">OBS / vMix'e “Tarayıcı kaynağı” olarak 1920×1080 ekle; LED bilgisayarında tam ekran aç. Stüdyodaki marka ve modlar kaydedilince birkaç saniyede bu adreslere de düşer.</p>
      <ul className="mg-rows">{overlayLinks(id, SITE).map((l) => <LinkRow key={l.key} label={l.label} hint={l.hint} url={l.url} toast={toast} />)}</ul>
    </GxCard>
  );
}
