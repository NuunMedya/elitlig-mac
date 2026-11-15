import { describe, expect, it } from "vitest";
import { arrangeRequests, bulkApprovable, decisionBody, decisionConfirm, decisionRequest, meterTone, sortChecks, splitDecision } from "../src/lib/requestDecision.js";

const approve = { key: "a", label: "Onayla", style: "primary", api: { method: "patch", url: "/api/match-requests/admin/requests/mr-1", body: { decision: "approve" }, confirm: "Maç talebi onaylansın mı?" } };
const reject = { key: "r", label: "Reddet", style: "danger", api: { method: "PATCH", url: "/api/match-requests/admin/requests/mr-1", body: { decision: "reject" } } };

describe("karar isteği", () => {
  it("not her ucun okuduğu adla gövdeye eklenir, boş not eklenmez", () => {
    expect(decisionBody(reject, " Saat dolu ")).toEqual({ decision: "reject", note: "Saat dolu", review_note: "Saat dolu", admin_note: "Saat dolu" });
    expect(decisionBody(approve, "  ")).toEqual({ decision: "approve" });
    expect(decisionRequest(approve, "")).toEqual({ method: "PATCH", path: "/api/match-requests/admin/requests/mr-1", body: { decision: "approve" } });
  });
  it("dış adrese giden eylem karar düğmesi olmaz", () => {
    const evil = { key: "x", label: "Onayla", api: { url: "https://evil.example/api" } };
    expect(splitDecision([approve, reject, evil, { key: "w", web: "/x" }])).toEqual({ approve: [approve], reject: [reject] });
  });
  it("onay sorusu engelleri ve notu sayar; ret her zaman tehlikeli", () => {
    const ctx = { checks: [{ level: "fail", label: "Seçilen saatler dolu" }, { level: "pass", label: "x" }] };
    const c = decisionConfirm(approve, ctx, "Tamam");
    expect(c.message).toBe("Maç talebi onaylansın mı? Dikkat: 1 engel var (Seçilen saatler dolu). Not: “Tamam”");
    expect(c.danger).toBe(true);
    expect(decisionConfirm(reject, { checks: [] }, "").danger).toBe(true);
    expect(decisionConfirm(approve, { checks: [] }, "").danger).toBe(false);
  });
});

describe("liste", () => {
  const items = [{ id: 1, status: "open", created_at: "2026-11-01", actions: [approve, reject] }, { id: 2, status: "open", created_at: "2026-11-05", actions: [approve] }, { id: 3, status: "open", created_at: "2026-11-03", actions: [reject] }];
  const insights = { 1: { verdict: "clear", fail: 0, warn: 0, can_bulk_approve: true }, 2: { verdict: "review", fail: 0, warn: 2, can_bulk_approve: true }, 3: { verdict: "blocked", fail: 1, warn: 0, can_bulk_approve: false } };
  it("süzgeç ve sıralama", () => {
    expect(arrangeRequests(items, insights).map((i) => i.id)).toEqual([2, 3, 1]);
    expect(arrangeRequests(items, insights, { sort: "oldest" }).map((i) => i.id)).toEqual([1, 3, 2]);
    expect(arrangeRequests(items, insights, { sort: "risk" }).map((i) => i.id)).toEqual([3, 2, 1]);
    expect(arrangeRequests(items, insights, { filter: "blocked" }).map((i) => i.id)).toEqual([3]);
  });
  it("toplu onay yalnız engelsiz ve onay düğmeli taleplere", () => {
    expect(bulkApprovable(items, insights).map((i) => i.id)).toEqual([1, 2]);
    expect(bulkApprovable(items, {}).length).toBe(0);
  });
  it("denetimler engel → dikkat → bilgi → geçti; gösterge tonu", () => {
    expect(sortChecks([{ level: "pass" }, { level: "info" }, { level: "fail" }, { level: "warn" }]).map((c) => c.level)).toEqual(["fail", "warn", "info", "pass"]);
    expect(meterTone(18, 20)).toEqual({ pct: 90, tone: "high" });
    expect(meterTone(20, 20).tone).toBe("full");
    expect(meterTone(3, null)).toEqual({ pct: 0, tone: "" });
  });
});
