// Gol anı yükü tanılaması (lib/studio/goalStress): GOL'den sonraki 20 sn'de atlanan kare,
// ses boşluğu, aktarıcı atlaması, en düşük gönderim.
import { describe, expect, it } from "vitest";
import { GOAL_STRESS_WINDOW_MS, createGoalStress, goalStressSnapshot, goalStressText, summarizeGoalStress } from "../src/lib/studio/goalStress";

const snap = (at, o = {}) => goalStressSnapshot({
  at,
  draw: { totalStalls: o.stalls ?? 0 },
  enc: { encodeDropped: o.dropped ?? 0, gaps: o.gaps ?? 0, framesEncoded: o.frames ?? 0, audioWorker: { gapMs: o.audioGapMs ?? 0, dropped: 0 } },
  status: { droppedFrames: 0, network: { dropEvents: o.relayDrops ?? 0, droppedBytes: 0, pendingBytes: o.pending ?? 0, sentKbps: o.sent ?? 6000 } },
});

describe("gol anı yükü", () => {
  it("GOL anından 20 sn sonra özet: farklar, en büyük tampon, en düşük gönderim", () => {
    const g = createGoalStress();
    g.mark(snap(0, { dropped: 5, gaps: 10, stalls: 2, frames: 100 }));
    expect(g.active()).toBe(true);
    expect(g.sample(snap(5000, { dropped: 6, gaps: 30, stalls: 4, pending: 3_000_000, sent: 900, frames: 240 }))).toBeNull();
    const s = g.sample(snap(GOAL_STRESS_WINDOW_MS, { dropped: 7, gaps: 31, stalls: 5, pending: 1000, sent: 6100, audioGapMs: 1200, relayDrops: 1, frames: 700 }));
    expect(s).toMatchObject({ seconds: 20, droppedFrames: 23, encodeDropped: 2, gridGaps: 21, stalls: 3, audioGapMs: 1200, relayDrops: 1, maxPendingBytes: 3_000_000, minSentKbps: 900, framesEncoded: 600, ok: false });
    expect(g.active()).toBe(false);
    expect(g.last()).toEqual({ ...s });
    expect(goalStressText(s)).toMatch(/23 kare atlandı · 3 çizim takılması · 1200 ms ses boşluğu · ağ 1 kez görüntü attı · en düşük gönderim 900 kbps \(20 sn\)/);
  });
  it("sorunsuz gol: ok; pencere sürerken yeni gol öncekini kapatır", () => {
    const g = createGoalStress();
    g.mark(snap(0));
    g.mark(snap(8000, { gaps: 1 }));
    expect(g.last().seconds).toBe(8);
    const s = g.sample(snap(28000, { gaps: 2 }));
    expect(s.ok).toBe(true);
    expect(goalStressText(s)).toMatch(/1 kare atlandı · ses kesintisiz/);
    expect(goalStressText(null)).toBe("henüz gol yok");
    expect(summarizeGoalStress(snap(0), snap(1000)).droppedFrames).toBe(0);
  });
});
