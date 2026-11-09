// OYUNCU TAKİBİ — otomatik izleyici iş parçacığı (arayüzü kilitlemez).
// Gelen: { id, frames: [{ t, frame: { w, h, data } }], key: { x, y }, size } → { id, samples }
import { trackSegment } from "../../../lib/studio/playerTrack";

self.onmessage = (e) => {
  const { id, frames, key, size } = e.data || {};
  let samples = [];
  try { samples = trackSegment(frames || [], key || { x: 0.5, y: 0.5 }, { size }); } catch { samples = []; }
  self.postMessage({ id, samples });
};
