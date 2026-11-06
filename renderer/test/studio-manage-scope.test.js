// Maç yönetimi › maç listesi: il kapsamı (yalnız yetkili ilin maçları).
import { describe, expect, it } from "vitest";
import { filterMatches, inScope, isMissingRoute, liveStripRows, matchScopeOf, readScopedList, scopeRows, toListMatch } from "../src/lib/studio/manageMatches";
import { selfTestLines } from "../src/views/studio/modes/UploadLog";

const ROWS = [
  { id: 1, first_team_name: "A", second_team_name: "B", city: "Ankara", city_id: 6, date: "2026-11-06", mac_durumu: "canli" },
  { id: 2, first_team_name: "C", second_team_name: "D", city: "İstanbul", city_id: 34, date: "2026-11-06", mac_durumu: "canli" },
  { id: 3, first_team_name: "E", second_team_name: "F", city: "ankara", city_id: null, date: "2026-11-06", mac_durumu: "zamanlanmis" },
  { id: 4, first_team_name: "G", second_team_name: "H", city: "", city_id: null, date: "2026-11-06", mac_durumu: "canli" },
];

describe("il kapsamı", () => {
  it("sunucu kapsamı esas; yoksa kullanıcıdan; ikisi de yoksa liste boş", () => {
    expect(matchScopeOf(null, { nationwide: false, city_id: 6, city: "Ankara" })).toEqual({ nationwide: false, cityId: 6, city: "Ankara", source: "server" });
    expect(matchScopeOf({ role: "admin", city: "Ankara" }, { nationwide: true, city_id: null, city: null }).nationwide).toBe(true);
    expect(matchScopeOf({ role: "editor", city: "Ankara" }, null)).toEqual({ nationwide: false, cityId: null, city: "Ankara", source: "user" });
    expect(matchScopeOf(null, null)).toBe(null);
    expect(scopeRows(filterMatches(ROWS, {}), null)).toEqual([]);
  });

  it("il kısıtlı: yalnız yetkili ilin maçları (kimlikle, kimliksizde adla); ilsiz maç gösterilmez", () => {
    const scope = matchScopeOf(null, { nationwide: false, city_id: 6, city: "Ankara" });
    expect(scopeRows(filterMatches(ROWS, {}), scope).map((m) => m.id).sort()).toEqual([1, 3]);
    expect(inScope(toListMatch(ROWS[1]), scope)).toBe(false);
    expect(inScope(toListMatch(ROWS[3]), scope)).toBe(false);
    // Türkiye geneli: hepsi.
    expect(scopeRows(filterMatches(ROWS, {}), { nationwide: true }).length).toBe(4);
    // Canlı şerit de kapsamla süzülür (önceden ilsiz / başka il maçı sızabiliyordu).
    expect(liveStripRows(ROWS, { scope }).map((m) => m.id)).toEqual([1]);
    expect(liveStripRows(ROWS, { scope: { nationwide: true } }).map((m) => m.id).sort()).toEqual([1, 2, 4]);
  });

  it("kapsamlı uç yanıtı ve eski sunucu algısı", () => {
    expect(readScopedList({ items: ROWS, scope: { nationwide: false, city_id: 6, city: "Ankara" } }).scope.city_id).toBe(6);
    expect(readScopedList(ROWS)).toEqual({ rows: ROWS, scope: null });
    expect(isMissingRoute({ ok: false, error: { status: 404, message: "Sunucu hatası (404)." } })).toBe(true);
    expect(isMissingRoute({ ok: false, error: { status: 404, code: "MATCH_NOT_FOUND" } })).toBe(false);
    expect(isMissingRoute({ ok: false, error: { status: 403, code: "PERMISSION_DENIED" } })).toBe(false);
  });
});

describe("yükleme sınaması satırları", () => {
  it("adımlar Türkçe; başarısız adımın kodu ve iletisi görünür", () => {
    const lines = selfTestLines({ ok: true, data: { ok: false, steps: [{ step: "config", ok: true, ms: 1 }, { step: "put", ok: false, status: 403, code: "SignatureDoesNotMatch", message: "Spaces ön-imzalı PUT'u reddetti." }] } });
    expect(lines).toEqual([
      { ok: true, label: "Spaces ayarı", text: "tamam · 1 ms" },
      { ok: false, label: "Spaces'e yükleme", text: "SignatureDoesNotMatch · Spaces ön-imzalı PUT'u reddetti." },
    ]);
    expect(selfTestLines({ ok: false, error: { status: 404 } })[0].text).toMatch(/Sunucu güncel değil/);
  });
});
