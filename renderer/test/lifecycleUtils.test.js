// Projeler → künye / maliyet / akış saf yardımcıları ve akış olaylarının listeye uygulanması.
import { describe, expect, it } from "vitest";
import { COST_EXPORT, costLine, countdownText, daysFrom, insertMention, kpiProgress, mentionQuery, money, summaryHtml, targetOf, timeline, timelineLayout, tokenize } from "../src/lib/lifecycleUtils";
import { applyFeedEvent, rebase } from "../src/views/projects/Feed";
import { parseNum } from "../src/views/projects/Costs";
import { toBody } from "../src/views/projects/BriefEditor";

const brief = {
  start_date: "2026-12-05", end_date: "2027-01-31", event_date: "2027-01-30",
  key_dates: [{ id: "a", label: "Kayıt kapanışı", date: "2026-11-28" }, { id: "b", label: "Kura", date: null }],
  kpis: [{ id: "k", name: "Takım", target: 32, actual: 24, unit: "takım" }], risks: [{ id: "r", title: "Kötü hava", level: "high", status: "open" }],
  segments: [], success_criteria: [], stakeholders: [],
};

describe("lifecycleUtils", () => {
  it("tarih şeridi sıralı; bugün işareti aralıkta", () => {
    const pts = timeline(brief);
    expect(pts.map((p) => p.kind)).toEqual(["milestone", "start", "event", "end"]);
    const lay = timelineLayout(pts, new Date("2026-12-20T09:00:00"));
    expect(lay.points[0].at).toBe(0);
    expect(lay.points.at(-1).at).toBe(100);
    expect(lay.today).toBeGreaterThan(20);
    expect(timelineLayout([], new Date()).points).toEqual([]);
  });
  it("geri sayım, KPI ilerlemesi, hedef ayrıştırma", () => {
    expect(daysFrom("2026-11-12", new Date("2026-11-10T22:00:00"))).toBe(2);
    expect(countdownText(0)).toBe("Bugün");
    expect(countdownText(5)).toBe("5 gün kaldı");
    expect(countdownText(-3)).toBe("3 gün önce");
    expect(kpiProgress(brief.kpis[0])).toBe(75);
    expect(kpiProgress({ target: 10, actual: 30 })).toBe(100);
    expect(targetOf("tab:maliyet")).toEqual({ type: "tab", key: "maliyet" });
    expect(targetOf("")).toBeNull();
  });
  it("maliyet satırı ve dışa aktarma sütunları", () => {
    const item = { quantity: 4, unit: "gün", unit_price: 2500, basis: "per_team", vat_rate: 20, vat_included: false };
    expect(costLine(item, { teams: 16 })).toMatch(/4 gün × .*2\.500.* × 16 takım \+ KDV %20/);
    const cols = COST_EXPORT(() => "Onaylandı", () => "Takım başı");
    expect(cols.map((c) => c[0])).toContain("Tahmini (KDV dahil)");
    expect(cols.find((c) => c[0] === "Durum")[1]({})).toBe("Onaylandı");
    expect(money(null)).toBe("—");
  });
  it("@bahsetme ve metin parçaları", () => {
    expect(mentionQuery("Selam @Ca", 9)).toEqual({ query: "Ca", start: 6 });
    expect(insertMention("Selam @Ca", 9, "Can Demir")).toEqual({ text: "Selam @Can Demir ", caret: 17 });
    expect(tokenize("@Can Demir bak https://a.com", ["Can Demir"]).map((t) => t.type)).toEqual(["mention", "text", "url"]);
  });
  it("proje özeti HTML'i kaçışlı ve künyeyi içerir", () => {
    const html = summaryHtml({ project: { name: "<Kupa>", color: "#6d28d9" }, view: { brief, costs: { cost: { total: 1000 }, revenue: { total: 1500 }, actual: { cost: 0 }, profit: 500, by_category: [] }, lifecycle: { stages: [{ key: "idea", label: "Fikir", state: "past", progress: 100 }] } } });
    expect(html).toMatch(/&lt;Kupa&gt;/);
    expect(html).toMatch(/Kötü hava/);
    expect(html).toMatch(/Takım/);
  });
});

describe("akış ve maliyet bileşen yardımcıları", () => {
  it("olaylar listeye uygulanır; yorumlar korunur", () => {
    const items = [{ id: 1, pinned: true, comments: [{ id: 9, parent_id: 1 }] }, { id: 2, comments: [] }];
    expect(applyFeedEvent(items, { action: "post", post: { id: 5 } })[0]).toMatchObject({ id: 5, unread: true });
    expect(applyFeedEvent(items, { action: "react", post: { id: 1, comments: [] } })[0].comments).toHaveLength(1);
    expect(applyFeedEvent(items, { action: "comment", post: { id: 7, parent_id: 2 } })[1].comments[0].id).toBe(7);
    expect(applyFeedEvent(items, { action: "delete", post_id: 9, parent_id: 1 })[0].comments).toHaveLength(0);
    const r = rebase({ id: 1, created_by: 3, mine: true, reactions: [{ emoji: "👍", user_ids: [2], mine: false }] }, 2);
    expect(r.mine).toBe(false);
    expect(r.reactions[0].mine).toBe(true);
  });
  it("Türkçe tutar girişi sunucuyla aynı okunur; künye taslağı gövdeye çevrilir", () => {
    expect(parseNum("3.000")).toBe(3000);
    expect(parseNum("1.250,50")).toBe(1250.5);
    expect(parseNum("12.5")).toBe(12.5);
    expect(parseNum("")).toBeNull();
    const body = toBody({ age_min: "", age_max: "40", expected_count: "", expected_teams: "", budget_limit: "", revenue_target: "5000", sponsorship_target: "", start_date: "", end_date: "", event_date: "2027-01-30", kpis: [{ name: " ", target: "" }, { name: "Takım", target: "32", actual: "" }], key_dates: [{ label: "" }], stakeholders: [], risks: [{ title: "Hava" }] });
    expect(body).toMatchObject({ age_min: null, age_max: "40", revenue_target: "5000", start_date: null, event_date: "2027-01-30" });
    expect(body.kpis).toEqual([{ name: "Takım", target: "32", actual: null }]);
    expect(body.key_dates).toEqual([]);
    expect(body.risks).toHaveLength(1);
  });
});
