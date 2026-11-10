// Yönetim: kenar çubuğu / palet yardımcıları ve içerik araması (views/admin).
import { activePath, adminIcon, paletteEntries, sidebarSections } from "../src/views/admin/adminNavUi";
import { contentResults } from "../src/views/admin/adminPalette";

const NAV = {
  source: "web",
  groups: [
    { key: "genel", label: "Ana sayfa", top: true, items: [{ name: "Ana sayfa", path: "/editor", icon: "home" }] },
    { key: "is-akisi", label: "İş akışı", top: true, items: [{ name: "Talepler", path: "/yonetim/talepler" }] },
    { key: "maclar", label: "Maçlar", icon: "ball", items: [{ name: "Maç listesi", path: "/editor/maclar", icon: "ball", keywords: "fikstür skor" }, { name: "Toplu düzenleme", path: "/editor/maclar/toplu-duzenle" }] },
    { key: "ligler", label: "Ligler", items: [{ name: "Lig statüsü ve gruplar", path: "/editor/lig-ayarlari?bolum=lig-statusu" }, { name: "Lig ayarları ve kurallar", path: "/editor/lig-ayarlari" }] },
    { key: "oyuncular", label: "Oyuncular", items: [{ name: "Oyuncular", path: "/editor/oyuncular" }] },
    { key: "takimlar", label: "Takımlar", items: [{ name: "Takımlar", path: "/editor/takimlar" }] },
    { key: "araclar", label: "Araçlarım", tools: true, items: [{ name: "Ajanda", path: "/yonetim/araclar/ajanda" }] },
  ],
  actions: [{ key: "new-match", name: "Yeni maç oluştur", path: "/editor/mac-olustur", icon: "plus", keywords: "maç ekle" }],
};

describe("Yönetim menüsü", () => {
  test("kenar çubuğu: üst gruplar ve Araçlarım (yerelde var) gösterilmez", () => {
    expect(sidebarSections(NAV.groups).map((g) => g.key)).toEqual(["maclar", "ligler", "oyuncular", "takimlar"]);
  });

  test("palet: ad, bölüm ve eş anlamlıyla arar; işlemler dahil", () => {
    expect(paletteEntries(NAV, "fikstür").map((e) => e.path)).toEqual(["/editor/maclar"]);
    expect(paletteEntries(NAV, "maç").map((e) => e.path)).toEqual(["/editor/maclar", "/editor/maclar/toplu-duzenle", "/editor/mac-olustur"]);
    expect(paletteEntries(NAV, "").length).toBe(10);
    expect(paletteEntries(null, "x")).toEqual([]);
  });

  test("etkin öğe: en uzun ön ek, sorgulu öğe yalnız sorgu uyunca", () => {
    expect(activePath("/editor/maclar/12/oncesi", NAV.groups)).toBe("/editor/maclar");
    expect(activePath("/editor/maclar/toplu-duzenle", NAV.groups)).toBe("/editor/maclar/toplu-duzenle");
    expect(activePath("/editor/lig-ayarlari?bolum=lig-statusu", NAV.groups)).toBe("/editor/lig-ayarlari?bolum=lig-statusu");
    expect(activePath("/editor/lig-ayarlari", NAV.groups)).toBe("/editor/lig-ayarlari");
    expect(activePath("/editor/xyz", NAV.groups)).toBe(null);
    expect(activePath(null, NAV.groups)).toBe(null);
  });

  test("bilinmeyen web simgesi güvenli varsayılana düşer", () => {
    expect(adminIcon("ball")).toBe("ball");
    expect(adminIcon("yok-boyle")).toBe("globe");
  });
});

describe("içerik araması (maç / oyuncu / takım)", () => {
  const matches = [{ id: 101, first_team_name: "Kartal Spor", second_team_name: "Boğaziçi FK", first_team_score: 3, second_team_score: 1, is_it_fixture: 0, date: "2026-11-08", league_name: "Süper Lig" }];
  const teams = [{ id: 11, team_name: "Kartal Spor", city: "İstanbul" }, { id: 12, team_name: "Boğaziçi FK" }];
  const players = [{ id: 501, player_name: "Mert Yılmaz", team_name: "Kartal Spor" }];

  test("yetkili kullanıcıya kayıt sayfalarını açar", () => {
    const rows = contentResults({ query: "kartal", nav: NAV, user: { role: "admin" }, players, teams, matches });
    expect(rows.map((r) => r.path)).toEqual(["/editor/maclar/101/oncesi", "/editor/oyuncular/501", "/editor/takimlar/11", "/editor/maclar?q=kartal"]);
    expect(rows[0].hint).toContain("3-1");
  });

  test("menüde olmayan bölümde arama yapılmaz; düzenleme yetkisi yoksa listeye gider", () => {
    const nav = { groups: [NAV.groups[4]] };
    const rows = contentResults({ query: "mert", nav, user: { role: "x", permissions: ["players.create"] }, players, teams, matches });
    expect(rows).toEqual([{ label: "Mert Yılmaz", icon: "user", hint: "Oyuncu · Kartal Spor", path: "/editor/oyuncular" }]);
  });

  test("2 harften kısa sorgu sonuç vermez", () => {
    expect(contentResults({ query: "k", nav: NAV, user: { role: "admin" }, players, teams, matches })).toEqual([]);
  });
});
