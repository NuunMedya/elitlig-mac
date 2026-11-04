import {
  actionPlan, actionResultText, actorTarget, badgeText, categoryIcon, categoryTabs, countRequests, dismissBody, groupRequestsByDay, requestTime, splitActions, topCategories,
} from "../src/lib/requestUtils";

const NOW = new Date(2026, 10, 4, 15, 30);
const at = (dayOffset, h = 12, m = 0) => new Date(2026, 10, 4 + dayOffset, h, m).toISOString();
const summary = {
  total: 7,
  categories: [
    { key: "profile", label: "Profil Değişiklikleri", open: 2, path: "/yonetim/admin/kullanicilar?bolum=changes" },
    { key: "account", label: "Sahiplenme ve Yetki", open: 0, path: "/yonetim/admin/kullanicilar?bolum=requests" },
    { key: "transfer", label: "Transferler", open: 4, path: "/yonetim/admin/transfer-onaylari" },
    { key: "general", label: "Diğer", open: 1, path: "/yonetim/talepler" },
  ],
};

describe("kategori sekmeleri ve sayılar", () => {
  test("Tümü önde, açık talebi olanlar sunucu sırasıyla, boşlar sonda ve soluk", () => {
    const tabs = categoryTabs(summary, "transfer");
    expect(tabs.map((t) => t.key)).toEqual(["", "profile", "transfer", "general", "account"]);
    expect(tabs[0]).toMatchObject({ label: "Tümü", open: 7, active: false });
    expect(tabs.find((t) => t.key === "transfer")).toMatchObject({ open: 4, active: true, muted: false, icon: "swap", path: "/yonetim/admin/transfer-onaylari" });
    expect(tabs.find((t) => t.key === "account")).toMatchObject({ open: 0, muted: true });
    expect(categoryTabs(null)).toEqual([{ key: "", label: "Tümü", open: 0, icon: "inbox", muted: false, active: true }]);
  });
  test("toplam yoksa kategorilerden hesaplanır; Bugün kartı en kalabalıkları alır", () => {
    expect(categoryTabs({ categories: summary.categories })[0].open).toBe(7);
    expect(topCategories(summary, 2).map((c) => [c.key, c.open])).toEqual([["transfer", 4], ["profile", 2]]);
    expect(topCategories({ categories: [{ key: "x", open: 0 }] })).toEqual([]);
  });
  test("yüklenen taleplerin kategori / durum sayıları", () => {
    const c = countRequests([{ category: "profile", status: "open" }, { category: "profile", status: "info" }, { category: null, status: "resolved" }, { category: "transfer", status: "open" }]);
    expect(c).toEqual({ byCategory: { profile: 2, general: 1, transfer: 1 }, byStatus: { open: 2, info: 1, resolved: 1 }, total: 4 });
  });
  test("simge eşlemesi ve rozet metni", () => {
    expect(categoryIcon("penalty")).toBe("flag");
    expect(categoryIcon("bilinmeyen")).toBe("bell");
    expect(badgeText(0)).toBeNull();
    expect(badgeText(5)).toBe("5");
    expect(badgeText(140)).toBe("99+");
  });
});

describe("gün gruplama ve zaman", () => {
  test("yeniden eskiye Bugün / Dün / tarih", () => {
    const g = groupRequestsByDay([{ id: 1, created_at: at(-1, 9) }, { id: 2, created_at: at(0, 8) }, { id: 3, created_at: at(0, 14) }, { id: 4, created_at: at(-6) }], NOW);
    expect(g.map((x) => x.label)).toEqual(["Bugün", "Dün", "29 Ekim"]);
    expect(g[0].items.map((r) => r.id)).toEqual([3, 2]);
  });
  test("kart zamanı", () => {
    expect(requestTime(at(0, 9, 5), NOW)).toBe("09:05");
    expect(requestTime(at(-1, 14, 5), NOW)).toBe("dün 14:05");
    expect(requestTime(at(-10, 8, 0), NOW)).toMatch(/^25 Eki 08:00$/);
    expect(requestTime(null, NOW)).toBe("");
  });
});

describe("eylem planı (onay penceresi + API çağrısı ya da site)", () => {
  const approve = { key: "change_approve", label: "Onayla", style: "primary", api: { method: "POST", url: "/api/admin/users/changes/12/review", body: { decision: "approved" }, confirm: "Değişiklik onaylanıp yayınlansın mı?" }, web: "/yonetim/admin/kullanicilar?bolum=changes" };
  const reject = { key: "transfer_reject", label: "Reddet", style: "danger", api: { method: "post", url: "/api/transfer-offers/admin/T9/reject" } };
  const open = { key: "change_open", label: "Talebi İncele", style: "secondary", web: "/yonetim/admin/kullanicilar?bolum=changes" };
  test("API eylemi: yöntem, yol, gövde ve onay metni", () => {
    expect(actionPlan(approve)).toEqual({
      kind: "api", method: "POST", path: "/api/admin/users/changes/12/review", body: { decision: "approved" },
      confirm: { title: "Onayla?", message: "Değişiklik onaylanıp yayınlansın mı?", confirmLabel: "Onayla", danger: false },
    });
  });
  test("onay metni yoksa varsayılan; tehlikeli düğme kırmızı onay", () => {
    expect(actionPlan(reject)).toMatchObject({ method: "POST", body: {}, confirm: { title: "Reddet?", message: "“Reddet” işlemi yapılsın mı?", danger: true } });
  });
  test("site eylemi ve güvenlik: dış adres ya da bilinmeyen yöntem API'ye gitmez", () => {
    expect(actionPlan(open)).toEqual({ kind: "web", path: "/yonetim/admin/kullanicilar?bolum=changes" });
    expect(actionPlan({ label: "X", api: { method: "POST", url: "https://kotu.example/api/x" } })).toBeNull();
    expect(actionPlan({ label: "X", api: { method: "TRACE", url: "/api/x" }, web: "/a" })).toEqual({ kind: "web", path: "/a" });
    expect(actionPlan({ label: "X", web: "javascript:alert(1)" })).toBeNull();
    expect(actionPlan(null)).toBeNull();
  });
  test("düğmeler API ve site olarak ayrılır; sonuç metni", () => {
    const { api, web } = splitActions([approve, reject, open, { key: "bos", label: "Boş" }]);
    expect(api.map((x) => x.action.key)).toEqual(["change_approve", "transfer_reject"]);
    expect(web.map((x) => x.action.key)).toEqual(["change_open"]);
    expect(actionResultText(approve, { data: { message: "Değişiklik onaylandı." } })).toBe("Değişiklik onaylandı.");
    expect(actionResultText(reject, { data: {} })).toBe("Reddet: tamamlandı.");
    expect(dismissBody()).toEqual({ label: "Kapatıldı" });
  });
  test("talebi gönderen: takım → Rehber, üye → site üye kartı", () => {
    expect(actorTarget({ team_id: 11, actor: { name: "Kartallar FK" } })).toEqual({ kind: "team", teamId: 11, label: "Kartallar FK" });
    expect(actorTarget({ actor_user_id: 53, actor: { name: "Seda" } })).toEqual({ kind: "member", path: "/yonetim/admin/kullanicilar?uye=53", label: "Seda" });
    expect(actorTarget({})).toBeNull();
  });
});
