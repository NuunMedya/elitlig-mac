import { accessBadge, accountActions, aclPayload, aclUpsert, budgetGroups, entryBody, entryStatusLabel, entryTotals, entryValid, filterFinanceEntries, groupAccounts, markPaidPatch, projectTeamLevel } from "../src/lib/financeUtils";
import { parseAmount } from "../src/lib/ledgerUtils";
import { cleanMenuItems, menuPosition } from "../src/lib/menuUtils";

describe("hesap yetkileri", () => {
  test("kart menüsü yetki düzeyine göre: görüntüleme → ekstre; kayıt → + gelir/gider; yönetim → hepsi", () => {
    expect(accountActions({ level: "view" })).toEqual({ statement: true, post: false, transfer: false, edit: false, access: false, remove: false });
    expect(accountActions({ level: "post" })).toMatchObject({ statement: true, post: true, transfer: false, edit: false, access: false });
    expect(accountActions({ level: "manage" })).toMatchObject({ post: true, transfer: true, edit: true, access: true, remove: true });
    expect(accountActions({ level: "manage", archived: true })).toMatchObject({ post: false, transfer: false, edit: true });
    expect(accountActions({ can_manage: true })).toMatchObject({ access: true });
  });
  test("yetki listesi: aynı kişi bir kez, düzeyi güncellenir; sunucu biçimi; rozet", () => {
    let acl = aclUpsert([], { type: "user", id: 8, level: "view", label: "Zeynep" });
    acl = aclUpsert(acl, { type: "role", role: "editor", level: "post" });
    acl = aclUpsert(acl, { type: "user", id: 8, level: "manage" });
    expect(acl).toHaveLength(2);
    expect(acl[0]).toMatchObject({ id: 8, level: "manage", label: "Zeynep" });
    expect(aclPayload([...acl, { type: "project", id: "5", level: "post", label: "X ekibi" }])).toEqual([{ type: "user", id: 8, level: "manage" }, { type: "role", role: "editor", level: "post" }, { type: "project", id: 5, level: "post" }]);
    expect(projectTeamLevel([{ type: "project", id: 5, level: "post" }], "5")).toBe("post");
    expect(projectTeamLevel([], 5)).toBe(null);
    expect(accessBadge({ visibility: "restricted", shared_with: 2 })).toMatchObject({ icon: "lock", text: "Kısıtlı · 2 yetki" });
    expect(accessBadge({ visibility: "scope", shared_with: 3 })).toMatchObject({ text: "Paylaşıldı (3)" });
    expect(accessBadge({ visibility: "scope", shared_with: 0 })).toBe(null);
  });
  test("hesap seçici kapsamlara göre gruplar, kayıt girilemeyen ve arşivlenenleri atar", () => {
    const groups = groupAccounts([
      { id: 1, scope: "city", can_post: true }, { id: 2, scope: "personal", can_post: true }, { id: 3, scope: "shared", can_post: false },
      { id: 4, scope: "shared", can_post: true }, { id: 5, scope: "national", can_post: true, archived: true },
    ], { postable: true });
    expect(groups.map((g) => [g.scope, g.items.map((a) => a.id)])).toEqual([["personal", [2]], ["city", [1]], ["shared", [4]]]);
  });
});

describe("gelir / gider kayıtları", () => {
  test("form → gövde: boşlar null, tutar Türkçe yazımla, ödendi tarihi yalnız ödenince", () => {
    const body = entryBody({ type: "expense", amount: "18.500", estimate: "", status: "pending", entry_date: "2026-11-04", due_date: "", category: " Ödül ", party: "", description: "Kupa", document_no: "", note: "", account_id: "3", paid_date: "2026-11-01" }, parseAmount);
    expect(body).toEqual({ type: "expense", amount: 18500, estimate: null, status: "pending", entry_date: "2026-11-04", due_date: null, category: "Ödül", party: null, description: "Kupa", document_no: null, note: null, account_id: 3 });
    const paid = entryBody({ type: "income", amount: "", estimate: "1.250,50", status: "paid", paid_date: "", lead_id: "9", step_id: "" }, parseAmount);
    expect(paid).toMatchObject({ estimate: 1250.5, amount: null, paid_date: null, lead_id: 9, step_id: null, account_id: null });
    expect(entryValid(paid)).toBe(true);
    expect(entryValid({ amount: null, estimate: null })).toBe(false);
  });
  test("durum etiketleri gelirde tahsil, giderde ödeme", () => {
    expect(entryStatusLabel({ type: "income", status: "paid" })).toBe("Tahsil edildi");
    expect(entryStatusLabel({ type: "expense", status: "paid" })).toBe("Ödendi");
    expect(entryStatusLabel({ type: "expense", status: "planned" })).toBe("Tahmin");
  });
  const entries = [
    { id: 1, type: "income", estimate: 50000, amount: null, status: "planned", description: "Ana sponsor", due_date: "2026-12-01" },
    { id: 2, type: "income", estimate: 10000, amount: 12000, status: "paid", description: "Katılım ücretleri" },
    { id: 3, type: "expense", estimate: 20000, amount: 18500, status: "pending", description: "Kupa", step_id: 7, due_date: "2026-11-20" },
    { id: 4, type: "expense", estimate: 8000, amount: null, status: "planned", description: "Tesis", due_date: "2026-11-10" },
    { id: 5, type: "expense", estimate: 3000, amount: null, status: "cancelled", description: "İptal" },
  ];
  test("toplamlar sunucuyla aynı (iptal sayılmaz, tahmin alanı tutarı tamamlar)", () => {
    expect(entryTotals(entries)).toEqual({
      planned_income: 50000, planned_expense: 8000, pending_income: 0, pending_expense: 18500, paid_income: 12000, paid_expense: 0,
      estimate_income: 60000, estimate_expense: 28000, estimate_net: 32000, paid_net: 12000, open_income: 50000, open_expense: 26500,
    });
  });
  test("bütçe grupları: gelir/gider, açıklar vadeye göre önde, iptaller sonda", () => {
    const [inc, exp] = budgetGroups(entries);
    expect(inc.items.map((e) => e.id)).toEqual([1, 2]);
    expect(inc).toMatchObject({ total: 62000, paid: 12000, open: 50000 });
    expect(exp.items.map((e) => e.id)).toEqual([3, 4, 5]);
    expect(exp).toMatchObject({ total: 26500, paid: 0, open: 26500 });
  });
  test("süzgeç ve ödendi iyimser güncellemesi", () => {
    expect(filterFinanceEntries(entries, { status: "open" }).map((e) => e.id)).toEqual([1, 3, 4]);
    expect(filterFinanceEntries(entries, { type: "expense", step: "7" }).map((e) => e.id)).toEqual([3]);
    expect(filterFinanceEntries(entries, { q: "sponsor" }).map((e) => e.id)).toEqual([1]);
    const withMatch = [...entries, { id: 9, type: "income", status: "pending", amount: 1500, match_id: 701, match_label: "Kartallar – Şimşekler" }, { id: 10, type: "expense", status: "pending", amount: 1200, match_id: 702, match_label: "Yıldızspor – Atletik" }];
    expect(filterFinanceEntries(withMatch, { match: "any" }).map((e) => e.id)).toEqual([9, 10]);
    expect(filterFinanceEntries(withMatch, { match: "702" }).map((e) => e.id)).toEqual([10]);
    expect(filterFinanceEntries(withMatch, { q: "kartallar" }).map((e) => e.id)).toEqual([9]);
    expect(markPaidPatch(entries[0], "2026-11-04")).toMatchObject({ status: "paid", amount: 50000, paid_date: "2026-11-04", effective: 50000 });
  });
});

describe("açılır menü", () => {
  test("öğe temizliği: boşlar ve fazla ayraçlar atılır", () => {
    expect(cleanMenuItems(["-", null, { label: "A" }, false, "-", "-", { label: "B" }, "-"])).toEqual([{ label: "A" }, "-", { label: "B" }]);
  });
  const vp = { width: 1440, height: 900 };
  test("altta yer varsa düğmenin altında, sağ kenarlar hizalı", () => {
    expect(menuPosition({ top: 100, bottom: 130, left: 400, right: 430 }, { width: 220, height: 200 }, vp)).toMatchObject({ top: 134, left: 210, placement: "bottom" });
  });
  test("ekranın altında yukarı açılır", () => {
    const p = menuPosition({ top: 820, bottom: 850, left: 400, right: 430 }, { width: 220, height: 300 }, vp);
    expect(p.placement).toBe("top");
    expect(p.top).toBe(820 - 4 - 300);
  });
  test("solda taşmaz, sağda taşmaz", () => {
    expect(menuPosition({ top: 100, bottom: 130, left: 10, right: 40 }, { width: 220, height: 100 }, vp).left).toBe(8);
    expect(menuPosition({ top: 100, bottom: 130, left: 1420, right: 1450 }, { width: 220, height: 100 }, vp, { align: "start" }).left).toBe(1440 - 8 - 220);
  });
  test("çok uzun menü ekrana sığacak kadar kısalır (kaydırılır)", () => {
    const p = menuPosition({ top: 400, bottom: 430, left: 400, right: 430 }, { width: 220, height: 1200 }, vp);
    expect(p.maxHeight).toBeLessThan(900);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });
});
