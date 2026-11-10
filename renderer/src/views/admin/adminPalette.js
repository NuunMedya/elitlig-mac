// Komut paleti (⌘K) için Yönetim kaynakları: web yönetim panelinin tüm
// sayfaları ve işlemleri (yetkiye göre) ile içerik araması — maç, oyuncu,
// takım. Arama masaüstü oturumuyla API'den yapılır; sonuç tek tıkla gömülü
// panelde ilgili kaydın yönetim sayfasını açar.
import { useEffect, useMemo, useRef, useState } from "react";
import { get, useDebounced } from "../../api";
import { includesTr } from "../../lib/helpers";
import { paletteEntries } from "./adminNavUi";

const hasPage = (nav, path) => Boolean(nav?.groups?.some((g) => g.items.some((i) => i.path === path)));
const hasPermission = (user, perm) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!Array.isArray(user.permissions)) return user.isManagement !== false;
  return user.permissions.includes(perm) || user.permissions.includes("*");
};
const nationwide = (user) => user?.role === "admin" || /turkiye|türkiye|genel/i.test(String(user?.city || "")) || Boolean(user?.isNationwide);

const matchLabel = (m) => `${m.first_team_name || "?"} – ${m.second_team_name || "?"}`;
const matchHint = (m) => {
  const score = m.first_team_score != null && m.second_team_score != null && !m.is_it_fixture ? ` · ${m.first_team_score}-${m.second_team_score}` : "";
  const date = m.date ? new Date(m.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "";
  return `Maç${score}${date ? ` · ${date}` : ""}${m.league_name ? ` · ${m.league_name}` : ""}`;
};

/** Saf eşleme (test edilir): API yanıtlarından palet satırları. */
export function contentResults({ query, nav, user, players = [], teams = [], matches = [] }) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const out = [];
  if (hasPage(nav, "/editor/maclar")) {
    matches.filter((m) => includesTr(`${matchLabel(m)} ${m.league_name || ""} ${m.match_field || ""}`, q)).slice(0, 6)
      .forEach((m) => out.push({ label: matchLabel(m), icon: "ball", hint: matchHint(m), path: `/editor/maclar/${m.id}/oncesi` }));
  }
  if (hasPage(nav, "/editor/oyuncular")) {
    const canEdit = hasPermission(user, "players.update");
    players.slice(0, 6).forEach((p) => out.push({ label: p.player_name || p.name || `Oyuncu #${p.id}`, icon: "user", hint: `Oyuncu${p.team_name ? ` · ${p.team_name}` : ""}${p.player_position ? ` · ${p.player_position}` : ""}`, path: canEdit ? `/editor/oyuncular/${p.id}` : "/editor/oyuncular" }));
  }
  if (hasPage(nav, "/editor/takimlar")) {
    const canEdit = hasPermission(user, "teams.update");
    teams.filter((t) => includesTr(`${t.team_name} ${t.city || ""}`, q)).slice(0, 6)
      .forEach((t) => out.push({ label: t.team_name, icon: "shield", hint: `Takım${t.city ? ` · ${t.city}` : ""}`, path: canEdit ? `/editor/takimlar/${t.id}` : "/editor/takimlar" }));
  }
  // Son satır: maç listesinde serbest arama (web'in ?q= süzgeci).
  if (hasPage(nav, "/editor/maclar")) out.push({ label: `Maç listesinde ara: “${q}”`, icon: "search", hint: "Yönetim · Maçlar", path: `/editor/maclar?q=${encodeURIComponent(q)}` });
  return out;
}

/** Palet açıkken: yönetim menüsü (yetkiye göre) ve içerik araması. */
export function useAdminPalette(query) {
  const [nav, setNav] = useState(null);
  const [user, setUser] = useState(null);
  const [players, setPlayers] = useState([]);
  const lists = useRef({ teams: null, matches: null });
  const [, bump] = useState(0);
  const q = useDebounced(query, 220);

  useEffect(() => {
    let alive = true;
    window.elitlig.admin?.nav().then((n) => { if (alive) setNav(n); }).catch(() => {});
    window.elitlig.auth.state().then((a) => { if (alive) setUser(a?.user || null); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Takım ve maç listeleri bir kez (önbellekli) okunur, aramada yerelde süzülür.
  useEffect(() => {
    if (!nav || String(q || "").trim().length < 2) return;
    let alive = true;
    const city = !nationwide(user) && user?.city ? user.city : null;
    if (!lists.current.teams && hasPage(nav, "/editor/takimlar")) {
      lists.current.teams = [];
      get(city ? `/takimlar/by-city/${encodeURIComponent(city)}` : "/takimlar").then((r) => { if (r.ok && Array.isArray(r.data)) { lists.current.teams = r.data; if (alive) bump((n) => n + 1); } });
    }
    if (!lists.current.matches && hasPage(nav, "/editor/maclar")) {
      lists.current.matches = [];
      get("/maclar", { compact: 1, limit: 400, ...(city ? { city } : {}) }).then((r) => { if (r.ok && Array.isArray(r.data)) { lists.current.matches = r.data; if (alive) bump((n) => n + 1); } });
    }
    if (hasPage(nav, "/editor/oyuncular")) {
      get("/api/players/admin-list", { q, pageSize: 6, ...(city ? { scopeCity: city } : {}) }).then((r) => { if (alive) setPlayers(r.ok && Array.isArray(r.data?.items) ? r.data.items : []); });
    }
    return () => { alive = false; };
  }, [nav, q, user]);

  return useMemo(() => {
    const pages = paletteEntries(nav, query).map((e) => ({ ...e, group: "Yönetim" }));
    const content = contentResults({ query: q, nav, user, players, teams: lists.current.teams || [], matches: lists.current.matches || [] })
      .map((e) => ({ ...e, group: "Yönetim · Sonuçlar" }));
    return { pages: query.trim() ? pages : [], content };
  }, [nav, query, q, user, players]); // eslint-disable-line react-hooks/exhaustive-deps
}
