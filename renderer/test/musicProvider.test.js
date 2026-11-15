// @vitest-environment jsdom
//
// Uygulama geneli müzik çalar: stüdyo kuralı, ana sürece yayın, menü / medya tuşu komutları, mini çalar.
import React from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

const fake = vi.hoisted(() => ({ mp: null }));
vi.mock("../src/views/studio/music/useMusicPlayer", () => ({ useMusicPlayer: () => fake.mp }));

import MusicProvider from "../src/music/MusicProvider";
import MiniPlayer from "../src/music/MiniPlayer";
import { ToastProvider } from "../src/components/ui";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

function makeMp(status = "playing") {
  const mp = {
    now: { status, title: "Isınma listesi", elapsedSec: 30, lengthSec: 120, ratio: 0.25 },
    volume: 70, config: { shuffle: false, repeat: "all" }, tracks: [{ id: "a" }, { id: "b" }],
    toggle: vi.fn(), play: vi.fn(), next: vi.fn(), prev: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), setShuffle: vi.fn(), setRepeat: vi.fn(),
    pause: vi.fn(() => { mp.now = { ...mp.now, status: "paused" }; }),
    resume: vi.fn(() => { mp.now = { ...mp.now, status: "playing" }; }),
  };
  return mp;
}

function setup() {
  const published = [];
  let command = null;
  let settingsCb = null;
  window.elitlig = {
    platform: "darwin",
    music: { publish: (s) => published.push(s), onCommand: (cb) => { command = cb; return () => {}; } },
    deskkit: { settings: () => Promise.resolve({ settings: { music: { studioRule: "pause" } } }), onSettings: (cb) => { settingsCb = cb; return () => {}; } },
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (route, child = null) => act(() => root.render(h(ToastProvider, null, h(MusicProvider, { route }, child))));
  return { host, root, published, render, cmd: (name, args) => act(() => command({ name, args })), setRule: (r) => act(() => settingsCb({ settings: { music: { studioRule: r } } })) };
}

describe("MusicProvider", () => {
  it("stüdyoya girince duraklatır, çıkınca sürdürür; durumu ana sürece yayınlar", async () => {
    fake.mp = makeMp("playing");
    const t = setup();
    t.render("music");
    expect(t.published.at(-1)).toMatchObject({ status: "playing", title: "Isınma listesi", trackCount: 2 });
    t.render("studio");
    expect(fake.mp.pause).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toMatch(/Genel müzik duraklatıldı/);
    t.render("today");
    expect(fake.mp.resume).toHaveBeenCalledTimes(1);
    act(() => t.root.unmount());
  });

  it("'çalmaya devam et' kuralında stüdyo müziğe dokunmaz", async () => {
    fake.mp = makeMp("playing");
    const t = setup();
    t.render("music");
    t.setRule("keep");
    t.render("studio");
    expect(fake.mp.pause).not.toHaveBeenCalled();
    act(() => t.root.unmount());
  });

  it("menü çubuğu / medya tuşu komutları çalara iletilir", () => {
    fake.mp = makeMp("paused");
    const t = setup();
    t.render("today");
    t.cmd("toggle");
    t.cmd("next");
    t.cmd("prev");
    t.cmd("play");
    t.cmd("volume", { value: 140 });
    t.cmd("shuffle");
    expect(fake.mp.toggle).toHaveBeenCalled();
    expect(fake.mp.next).toHaveBeenCalled();
    expect(fake.mp.prev).toHaveBeenCalled();
    expect(fake.mp.resume).toHaveBeenCalled();
    expect(fake.mp.setVolume).toHaveBeenCalledWith(100);
    expect(fake.mp.setShuffle).toHaveBeenCalledWith(true);
    act(() => t.root.unmount());
  });
});

describe("MiniPlayer", () => {
  it("parça adını gösterir, oynat / duraklat ve Müzik görünümüne gider", () => {
    fake.mp = makeMp("playing");
    const t = setup();
    const go = vi.fn();
    t.render("today", h(MiniPlayer, { go, route: "today" }));
    expect(t.host.textContent).toMatch(/Isınma listesi/);
    act(() => t.host.querySelector('[aria-label="Duraklat"]').click());
    expect(fake.mp.toggle).toHaveBeenCalled();
    act(() => t.host.querySelector(".mini-player__info").click());
    expect(go).toHaveBeenCalledWith("music");
    act(() => t.host.querySelector('[aria-label="Sonraki parça"]').click());
    expect(fake.mp.next).toHaveBeenCalled();
    act(() => t.root.unmount());
  });
  it("liste boş ve çalmıyorsa görünmez; Müzik görünümündeyken gizli", () => {
    fake.mp = { ...makeMp("idle"), tracks: [] };
    const t = setup();
    t.render("today", h(MiniPlayer, { go: () => {}, route: "today" }));
    expect(t.host.querySelector(".mini-player")).toBeNull();
    fake.mp = makeMp("playing");
    t.render("music", h(MiniPlayer, { go: () => {}, route: "music" }));
    expect(t.host.querySelector(".mini-player")).toBeNull();
    act(() => t.root.unmount());
  });
});
