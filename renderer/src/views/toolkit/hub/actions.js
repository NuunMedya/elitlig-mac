// Araç Takımı eylemleri (katalogda kind: "action", kimlik "act:<anahtar>"): ana pencere ve panel ortak.
// ctx: { go, toast, fromPanel } — fromPanel'de panel önce gizlenir (yakalama paneli içermesin).
import { deskkit } from "../toolkitUi";

export async function runAction(key, { go, toast, fromPanel = false } = {}) {
  const W = window.elitlig || {};
  const dk = deskkit();
  const say = (msg, opts) => toast?.(msg, opts);
  switch (key) {
    case "capture": {
      if (fromPanel) { await dk?.hidePanel(); await new Promise((r) => setTimeout(r, 300)); }
      const res = await W.shelf?.capture?.().catch((e) => ({ ok: false, error: { message: e?.message } }));
      if (!res) say("Ekran yakalama bu sürümde yok.", { tone: "info" });
      else if (res.ok) say("Ekran görüntüsü eklendi.", { tone: "success", action: go ? { label: "Aç", run: () => go("shelf") } : undefined });
      else say(res.error?.message || "Ekran yakalanamadı.", { tone: "error", timeout: 6000 });
      return res;
    }
    case "shelfwin":
      if (W.shelf?.show) { await W.shelf.show(); if (fromPanel) dk?.hidePanel(); return true; }
      if (dk?.openShelf) { await dk.openShelf(); if (fromPanel) dk.hidePanel(); return true; }
      say("Pano rafı bu sürümde yok.", { tone: "info" });
      return false;
    case "panel":
      if (fromPanel) return true;
      dk?.showPanel();
      return true;
    case "awake": {
      if (!dk) return null;
      const cur = await dk.awake().catch(() => ({ on: false }));
      const next = await dk.setAwake({ on: !cur.on });
      say(next?.on ? "Ekran uyanık tutuluyor." : "Ekranı uyanık tutma kapatıldı.", { tone: "success", timeout: 1800 });
      return next;
    }
    case "quick":
      W.quick?.show("note");
      return true;
    default:
      return null;
  }
}
