// Gol müziği · çalma süresi (takım başına N sn ya da süresiz) ve sonda ses kısma.
import { describe, expect, it } from "vitest";
import {
  MAX_PLAY_SEC, PLAY_SEC_PRESETS, addTrack, musicPlan, musicProgress, normalizeGoalMusic, normalizePlaySec, normalizeTeamMusic,
  playSecLabel, playerArgs, readGoalMusic, teamMusicOf, updateTeamMusic, writeGoalMusic,
} from "../src/views/studio/goalmusic/goalMusic";
import { HOTKEY_ACTIONS, normalizeSettings } from "../src/views/studio/settings/settings";

const ID = "dQw4w9WgXcQ";

describe("çalma süresi", () => {
  it("hazır süreler", () => {
    expect(PLAY_SEC_PRESETS).toEqual([10, 15, 20, 30, 45, 60]);
  });
  it("normalizePlaySec: süresiz / sayı / metin / sınırlar", () => {
    expect(normalizePlaySec(null)).toBeNull();
    expect(normalizePlaySec(undefined)).toBeNull();
    expect(normalizePlaySec("")).toBeNull();
    expect(normalizePlaySec("Süresiz")).toBeNull();
    expect(normalizePlaySec(0)).toBeNull();
    expect(normalizePlaySec(-5)).toBeNull();
    expect(normalizePlaySec("abc")).toBeNull();
    expect(normalizePlaySec(20)).toBe(20);
    expect(normalizePlaySec("25")).toBe(25);
    expect(normalizePlaySec("1:30")).toBe(90);
    expect(normalizePlaySec(12.6)).toBe(13);
    expect(normalizePlaySec(0.2)).toBe(1);
    expect(normalizePlaySec(99999)).toBe(MAX_PLAY_SEC);
  });
  it("etiket", () => {
    expect(playSecLabel(null)).toBe("Süresiz");
    expect(playSecLabel(20)).toBe("20 sn");
    expect(playSecLabel(90)).toBe("1:30");
  });
  it("takım ayarında saklanır; bağlantı yokken de korunur", () => {
    expect(normalizeTeamMusic({ playSec: 30 }).playSec).toBe(30);
    expect(normalizeTeamMusic({}).playSec).toBeNull();
    let c = normalizeGoalMusic(null);
    c = updateTeamMusic(c, 7, (t) => ({ ...t, playSec: 15 }));
    expect(teamMusicOf(c, 7).playSec).toBe(15);
    c = addTrack(c, 7, ID).config;
    expect(teamMusicOf(c, 7)).toMatchObject({ playSec: 15, tracks: [expect.objectContaining({ videoId: ID })] });
    c = updateTeamMusic(c, 7, (t) => ({ ...t, playSec: null }));
    expect(teamMusicOf(c, 7).playSec).toBeNull();
    // ne bağlantı ne süre: takım kaydı silinir
    c = updateTeamMusic(c, 7, (t) => ({ ...t, tracks: [] }));
    expect(c.teams["7"]).toBeUndefined();
  });
  it("kalıcı (localStorage)", () => {
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const c = updateTeamMusic(addTrack(normalizeGoalMusic(null), 3, ID).config, 3, (t) => ({ ...t, playSec: 45 }));
    expect(writeGoalMusic(storage, c)).toBe(true);
    expect(teamMusicOf(readGoalMusic(storage), 3).playSec).toBe(45);
  });
});

describe("çalma planı", () => {
  const track = { videoId: ID, start: 60, end: null };
  it("süresiz + bitişsiz: süre yok, kısma yok, YouTube bitişi yok", () => {
    const p = musicPlan(track, null, 1000);
    expect(p).toMatchObject({ startSeconds: 60, lengthSec: null, fadeMs: 0, fadeAtSec: null, endSeconds: null, limited: false });
    expect(playerArgs(track, null)).toEqual({ videoId: ID, startSeconds: 60 });
  });
  it("N sn: sondan fadeMs önce kısma başlar, YouTube bitişi biraz sonra", () => {
    const p = musicPlan(track, 20, 1000);
    expect(p).toMatchObject({ lengthSec: 20, fadeMs: 1000, fadeAtSec: 19, endSeconds: 81, limited: true });
    expect(playerArgs(track, p)).toEqual({ videoId: ID, startSeconds: 60, endSeconds: 81 });
  });
  it("bağlantının bitişi daha erkense o geçerli; süresizde de bitişte kısılır", () => {
    const t2 = { videoId: ID, start: 10, end: 25 };
    expect(musicPlan(t2, 30, 1000)).toMatchObject({ lengthSec: 15, limited: false });
    expect(musicPlan(t2, 10, 1000)).toMatchObject({ lengthSec: 10, limited: true });
    expect(musicPlan(t2, null, 1000)).toMatchObject({ lengthSec: 15, fadeAtSec: 14 });
  });
  it("kısma sürenin yarısını geçmez", () => {
    expect(musicPlan(track, 2, 5000)).toMatchObject({ fadeMs: 1000, fadeAtSec: 1 });
    expect(musicPlan(track, 10, 0)).toMatchObject({ fadeMs: 0, fadeAtSec: 10 });
  });
  it("ilerleme: kalan süre, oran, kısma ve bitiş", () => {
    const p = musicPlan(track, 20, 1000);
    expect(musicProgress(p, 0)).toMatchObject({ remainingSec: 20, ratio: 0, fade: false, done: false });
    expect(musicProgress(p, 10_000)).toMatchObject({ remainingSec: 10, ratio: 0.5, fade: false });
    expect(musicProgress(p, 19_000)).toMatchObject({ remainingSec: 1, fade: true, done: false });
    expect(musicProgress(p, 25_000)).toMatchObject({ remainingSec: 0, ratio: 1, fade: true, done: true });
    expect(musicProgress(musicPlan(track, null), 42_000)).toMatchObject({ elapsedSec: 42, remainingSec: null, ratio: null, fade: false, done: false });
  });
});

describe("MÜZİĞİ KES kısayolu", () => {
  it("ayrı eylem, boş varsayılan tuş (K) — başka eylemle çakışmaz", () => {
    const a = HOTKEY_ACTIONS.find((x) => x.key === "goalMusicStop");
    expect(a).toBeTruthy();
    expect(a.default).toEqual(["k"]);
    const others = HOTKEY_ACTIONS.filter((x) => x.key !== "goalMusicStop").flatMap((x) => x.default);
    expect(others).not.toContain("k");
    expect(normalizeSettings({}).hotkeys.goalMusicStop).toEqual(["k"]);
    // eski kayıtta tuş yoksa varsayılan gelir
    expect(normalizeSettings({ hotkeys: { mic: ["m"] } }).hotkeys.goalMusicStop).toEqual(["k"]);
  });
  it("R = doğrudan yayına ayarı varsayılan kapalı, kalıcı", () => {
    expect(normalizeSettings({}).replay.directTake).toBe(false);
    expect(normalizeSettings({ replay: { directTake: true } }).replay.directTake).toBe(true);
  });
});
