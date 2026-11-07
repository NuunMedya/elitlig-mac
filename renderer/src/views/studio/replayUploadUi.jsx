// Yayın Stüdyosu — [gol-klip] Tekrar listesindeki küçük durum parçaları:
//   PendingNote     bekleyen yakalama: "Butondan sonrası kaydediliyor · 0:03" / "Kaydediliyor…"
//   UploadControls  planlanmış gol yüklemesi: "Yükleme 0:42 sonra · 2 açı seçili" + "Şimdi yükle" / "İptal";
//                   iptal edilmişse "Yükle".
import React from "react";
import { countdownText, scheduledText } from "../../lib/studio/goalClips";

export function pendingText(p, now = Date.now()) {
  if (p?.status === "error") return p.error || "Tekrar kaydedilemedi.";
  if (p?.status === "waiting") return `Butondan sonrası kaydediliyor · ${countdownText(Math.max(0, (p.saveAt || 0) - now))}`;
  return "Kaydediliyor…";
}

export function PendingNote({ p, now }) {
  return <small className={p.status === "waiting" ? "st-rrow__wait" : undefined}>{pendingText(p, now)}</small>;
}

export function UploadControls({ u, replay, R }) {
  if (!u || replay?.kind !== "goal") return null;
  if (u.status === "scheduled") {
    return (
      <small className="st-rrow__upl">
        {scheduledText(u.dueAt, u.plan, R?.now || Date.now())}{" "}
        <button type="button" className="btn btn--xs" onClick={() => R?.uploadNow?.(replay.id)}>Şimdi yükle</button>{" "}
        <button type="button" className="btn btn--xs btn--ghost" onClick={() => R?.cancelUpload?.(replay.id)}>İptal</button>
      </small>
    );
  }
  if (u.status === "cancelled") {
    return <small className="st-rrow__upl">Yükleme iptal edildi <button type="button" className="btn btn--xs" onClick={() => R?.uploadNow?.(replay.id)}>Yükle</button></small>;
  }
  if (u.status === "uploading" && u.plan?.mode === "angles") return <small className="st-rrow__upl">Seçilen {u.plan.count} açı birleştirilip yükleniyor…</small>;
  return null;
}
