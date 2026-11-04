import {
  assignChoices, attachOptions, awardProgress, awardRecipients, awardRole, contentPreview, deadlineInfo, groupMatches,
  matchDayLabel, matchesSummary, signupGroups, toggleVolunteer,
} from "../src/lib/chatContent";

const NOW = new Date(2026, 10, 4, 15, 0); // 4 Kasım 2026 Çarşamba 15:00

describe("günün maçları", () => {
  const items = [
    { id: 3, time: "21:30", home: "Etimesgut", away: "Keçiören", league: "Ankara 1. Lig", field: "Merkez Arena", crew: { spiker: { name: "Ece" } } },
    { id: 1, time: "18:00", home: "Yıldızspor", away: "Atletik", league: "Ankara Süper Lig", field: "Yıldız Halı Saha", crew: {} },
    { id: 2, time: "19:00", home: "Çankaya", away: "Batıkent", league: "Ankara 1. Lig", field: "Merkez Arena", crew: { hakem: { name: "Kerem" }, reji: { name: "Onur" } } },
    { id: 4, time: null, home: "Mamak", away: "Gölbaşı", league: null, field: null },
  ];
  test("lige göre gruplar, lig sırası ilk maçın saatine göre, grup içi saate göre", () => {
    const g = groupMatches(items);
    expect(g.map((x) => x.key)).toEqual(["Ankara Süper Lig", "Ankara 1. Lig", "Diğer"]);
    expect(g[1].items.map((m) => m.id)).toEqual([2, 3]);
    expect(g[1].first).toBe("19:00");
    expect(g[2].league).toBe(null);
    expect(groupMatches(null)).toEqual([]);
  });
  test("özet: sayı, saha, saat aralığı, görevli", () => {
    expect(matchesSummary(items)).toEqual({ count: 4, fields: 2, from: "18:00", to: "21:30", crew: 3 });
    expect(matchesSummary([])).toEqual({ count: 0, fields: 0, from: null, to: null, crew: 0 });
  });
  test("gün etiketi", () => {
    expect(matchDayLabel("2026-11-04", NOW)).toBe("Bugün");
    expect(matchDayLabel("2026-11-05", NOW)).toBe("Yarın");
    expect(matchDayLabel("2026-11-03", NOW)).toBe("Dün");
    expect(matchDayLabel("2026-11-08", NOW)).toMatch(/8 Kasım/);
  });
});

describe("ben talibim", () => {
  const slot = (mid, duty, extra = {}) => ({ id: `${mid}:${duty}`, match_id: mid, duty, duty_label: duty, match: { home: `Ev${mid}`, away: `Dep${mid}`, time: mid === 41 ? "21:00" : "20:00" }, assigned: null, ...extra });
  const signup = {
    duties: ["spiker", "reji"],
    slots: [slot(41, "reji"), slot(41, "spiker", { assigned: { user_id: 12, name: "Selin" } }), slot(42, "spiker"), slot(42, "reji")],
    volunteers: { "41:spiker": [{ user_id: 12, name: "Selin" }, { user_id: 7, name: "Ahmet" }], "42:reji": [{ user_id: 13, name: "Onur" }] },
  };
  test("maça göre gruplar (saat sırası), satırlar görev sırasında; benim talibim, görevli", () => {
    const r = signupGroups(signup, 7);
    expect(r.groups.map((g) => g.match_id)).toEqual([42, 41]);
    expect(r.groups[1].rows.map((x) => x.slot.duty)).toEqual(["spiker", "reji"]);
    const sp = r.groups[1].rows[0];
    expect(sp.mine).toBe(true);
    expect(sp.assigned.name).toBe("Selin");
    expect(sp.assignedMe).toBe(false);
    expect(r).toMatchObject({ total: 4, filled: 1, open: 3, mine: 1, volunteers: 3 });
    expect(signupGroups(signup, 12).groups[1].rows[0].assignedMe).toBe(true);
    expect(signupGroups(null, 7)).toMatchObject({ groups: [], total: 0 });
  });
  test("talip ol / vazgeç: aynı kişi bir kez, diğerlerine dokunmaz", () => {
    const on = toggleVolunteer(signup, "42:reji", { id: 7, name: "Ahmet" }, true);
    expect(on.volunteers["42:reji"].map((v) => v.user_id)).toEqual([13, 7]);
    const again = toggleVolunteer(on, "42:reji", { id: 7, name: "Ahmet" }, true);
    expect(again.volunteers["42:reji"]).toHaveLength(2);
    const off = toggleVolunteer(again, "41:spiker", { id: 7, name: "Ahmet" }, false);
    expect(off.volunteers["41:spiker"].map((v) => v.user_id)).toEqual([12]);
    expect(signup.volunteers["42:reji"]).toHaveLength(1);
  });
  test("görevlendirme seçenekleri talip olanlardır; mevcut görevli işaretli", () => {
    const row = signupGroups(signup, 7).groups[1].rows[0];
    expect(assignChoices(row)).toEqual([{ user_id: 12, name: "Selin", current: true }, { user_id: 7, name: "Ahmet", current: false }]);
    expect(assignChoices({ volunteers: [] })).toEqual([]);
  });
  test("son tarih: yalnız gün → gün sonuna kadar geçerli; saatli; süresi dolmuş", () => {
    expect(deadlineInfo(null)).toBe(null);
    expect(deadlineInfo("2026-11-04", NOW)).toEqual({ label: "Son: bugün", late: false });
    expect(deadlineInfo("2026-11-04T18:00", NOW)).toEqual({ label: "Son: bugün 18:00", late: false });
    expect(deadlineInfo("2026-11-04T12:30", NOW)).toEqual({ label: "Süre doldu · bugün 12:30", late: true });
    expect(deadlineInfo("2026-11-05T09:00", NOW).label).toBe("Son: yarın 09:00");
  });
});

describe("haftanın enleri", () => {
  const status = { my_task_id: 4, coordination_task_id: null, people: [{ user_id: 8, name: "Zeynep", submitted: true }, { user_id: 9, name: "Can", submitted: false }, { user_id: 7, name: "Ahmet", submitted: true }], submitted: 2, total: 3 };
  test("ilerleme: 2/3, yüzde, bekleyenler; hepsi geldi; boş", () => {
    expect(awardProgress(status)).toMatchObject({ submitted: 2, total: 3, pct: 67, done: false, label: "2/3 öneri geldi" });
    expect(awardProgress(status).waiting.map((p) => p.name)).toEqual(["Can"]);
    expect(awardProgress({ people: [{ submitted: true }, { submitted: true }] })).toMatchObject({ submitted: 2, total: 2, pct: 100, done: true, label: "2/2 öneri geldi · hepsi tamam" });
    expect(awardProgress(null)).toMatchObject({ total: 0, pct: 0, done: false, label: "Öneri bekleniyor" });
  });
  test("rol: öneren kartı, koordinatör kartı, gönderdim mi", () => {
    const award = { coordinator_id: 5, coordination_task_id: 10, tasks: { 7: 4, 8: 3 } };
    expect(awardRole(award, status, 7)).toEqual({ coordinator: false, myTask: 4, coordinationTask: null, mineSubmitted: true });
    expect(awardRole(award, { ...status, my_task_id: null, coordination_task_id: 10 }, 5)).toEqual({ coordinator: true, myTask: null, coordinationTask: 10, mineSubmitted: false });
    expect(awardRole(award, null, 8).myTask).toBe(3);
  });
  test("aday öneri kartı alacaklar: sohbetteki yönetim hesapları (gönderen ve üyeler hariç)", () => {
    const ps = [{ user_id: 7, subtitle: "İl Yöneticisi · Ankara" }, { user_id: 8, subtitle: "Editör · Ankara" }, { user_id: 40, subtitle: "Takım Yöneticisi" }, { user_id: 21, subtitle: "Oyuncu · Kartallar FK" }, { user_id: 22, subtitle: "Üye" }, { user_id: 9 }];
    expect(awardRecipients(ps, 7).map((p) => p.user_id)).toEqual([8]);
  });
});

describe("ek menüsü (rol / sohbet türüne göre)", () => {
  test("yönetim hesabı normal sohbette üç hazır içeriği görür", () => {
    const o = attachOptions({ management: true, canAward: true });
    expect(o.base.map((x) => x.key)).toEqual(["images", "files", "poll", "location", "voice"]);
    expect(o.content.map((x) => x.key)).toEqual(["matches", "signup", "award"]);
  });
  test("haftanın enleri görev atama yetkisi ister", () => {
    expect(attachOptions({ management: true, canAward: false }).content.map((x) => x.key)).toEqual(["matches", "signup"]);
  });
  test("üye hesabı ve üye mesajları ortak kutusu: hazır içerik yok; ortak kutuda anket / konum da yok", () => {
    expect(attachOptions({ management: false }).content).toEqual([]);
    const inbox = attachOptions({ management: true, inbox: true });
    expect(inbox.content).toEqual([]);
    expect(inbox.base.map((x) => x.key)).toEqual(["images", "files", "voice"]);
  });
});

test("liste önizlemesi", () => {
  expect(contentPreview({ kind: "matches", meta: { matches: { date: "2099-01-01", items: [{}, {}] } } })).toMatch(/⚽ .* 2 maç$/);
  expect(contentPreview({ kind: "signup", body: "🙋 x", meta: { signup: { title: "Yayın ekibi" } } })).toBe("🙋 Yayın ekibi");
  expect(contentPreview({ kind: "award_poll", meta: { award: { week: "45. hafta" } } })).toBe("🏆 Haftanın Enleri · 45. hafta");
  expect(contentPreview({ kind: "text", body: "selam" })).toBe("selam");
});
