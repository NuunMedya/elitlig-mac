// Yayın grafikleri / LED: maç ilk açılınca "Maç öncesi" görünümü.
import { describe, expect, it } from "vitest";
import { INITIAL_VIEW, initialViewFor, normalizeLedMode, normalizeVariant } from "../src/lib/studio/graphics/variants";

describe("ilk görünüm: maç önü", () => {
  it("başlamamış maç → pre_match (skorboard ve LED için geçerli anahtar)", () => {
    expect(INITIAL_VIEW).toBe("pre_match");
    expect(normalizeVariant(INITIAL_VIEW)).toBe("pre_match");
    expect(normalizeLedMode(INITIAL_VIEW)).toBe("pre_match");
    expect(initialViewFor({ id: 1, mac_durumu: "zamanlanmis" })).toBe("pre_match");
    expect(initialViewFor({ id: 1, mac_durumu: "taslak" })).toBe("pre_match");
    expect(initialViewFor({ id: 1, mac_durumu: "canli", first_team_score: 0, second_team_score: 0 })).toBe("pre_match");
  });
  it("skoru ilerlemiş canlı ya da bitmiş maç → mevcut görünüm korunur", () => {
    expect(initialViewFor({ id: 1, mac_durumu: "canli", first_team_score: 2, second_team_score: 1 })).toBeNull();
    expect(initialViewFor({ id: 1, mac_durumu: "yayinlanmis" })).toBeNull();
    expect(initialViewFor(null)).toBeNull();
  });
});
