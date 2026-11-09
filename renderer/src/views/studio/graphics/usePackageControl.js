// Yayın grafikleri · GRAFİK PAKETİ UYGULAMA (Studio düzeyinde; Studio.jsx kurar).
//
//   const pk = usePackageControl({ g, live, setPref, toast });
//   pk.apply(id, { mode })     "fade" (hemen, yumuşak) | "next" (sonraki GEÇİŞ'te) | "instant"
//   pk.flushPending()          GEÇİŞ başında çağrılır (bekleyen paket uygulanır)
//   pk.list, pk.activeId, pk.pending, pk.store, pk.setStore, pk.league, pk.setLeagueDefault(id)
//
// Paketin tamamı tek dokunuşta: maçın marka kaydı (web kaplamaları dahil, isteğe
// bağlı), masaüstü çizim ekleri (anlık görüntü → ana çizim + program işçisi),
// skorbord çeşidi (skorbord yayındaysa), röportaj bandı stili, geçiş türü, VAR
// teması, YouTube kapak şablonu / rengi. Lig varsayılanı: o ligin maçı açılınca
// (maçta henüz paket seçilmediyse) kendiliğinden uygulanır.
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  allPackages, autoPackageFor, findPackage, isScoreVariant, leagueKeyOf, materializePackage, packageServerBranding, withActive, withLeagueDefault,
} from "../../../lib/studio/graphics/packages";
import { getImage } from "../../../lib/studio/graphics/images";
import { withVarTheme } from "../../../lib/studio/varThemes";
import { logoColor } from "../../../lib/studio/cover/render";
import { setCoverSettings } from "../youtube/cover/coverStore";
import { getPendingPackage, setPendingPackage, usePackageStore, usePendingPackage } from "./packageStore";

/** İki takımın rengi: armadan baskın renk, yoksa maçın elle seçilmiş takım renkleri. */
export function teamColorsFor(g, live) {
  const ex = g?.brandingDraft?.extras || {};
  const fromLogo = (url) => { try { const img = url ? getImage(url) : null; return img ? logoColor(img) : null; } catch { return null; } };
  return {
    home: fromLogo(live?.logos?.home) || ex.homeColor || null,
    away: fromLogo(live?.logos?.away) || ex.awayColor || null,
  };
}

export function usePackageControl({ g, live, setPref, toast } = {}) {
  const [store, setStore] = usePackageStore();
  const pending = usePendingPackage();
  const matchId = g?.matchId || null;
  const list = useMemo(() => allPackages(store), [store]);
  const league = useMemo(() => leagueKeyOf(live?.match || null), [live?.match]);
  const ctxRef = useRef(null);
  ctxRef.current = { g, live, setPref, toast, store };

  const applyNow = useCallback(async (id, { fade = true, quiet = false, auto = false } = {}) => {
    const { g: gr, live: lv, setPref: sp, toast: t, store: st } = ctxRef.current;
    const base = findPackage(st, id);
    if (!base) { t?.("Paket bulunamadı.", { tone: "warn" }); return false; }
    const teams = base.auto === "teams" ? teamColorsFor(gr, lv) : null;
    const pkg = materializePackage(base, { teams });
    if (fade && gr?.beginFade) gr.beginFade();
    setStore((s) => withActive(s, gr?.matchId, pkg.id, { teams }));
    // Stüdyo tercihleri: geçiş türü, VAR teması.
    sp?.("transition", pkg.transition.kind);
    sp?.("modes", (m) => withVarTheme(m, pkg.var.theme));
    // YouTube kapağı.
    setCoverSettings({ template: pkg.cover.template, accentMode: pkg.cover.accentMode, ...(pkg.cover.color ? { customColor: pkg.cover.color } : {}) });
    const jobs = [];
    if (gr?.matchId) {
      // Skorbord çeşidi: yalnız skorbord türlerinden biri yayındayken (maç öncesi / ara ekranına dokunulmaz).
      if (isScoreVariant(gr.scorebugVariant) && gr.scorebugVariant !== pkg.scorebug.variant) jobs.push(gr.setScorebugVariant?.(pkg.scorebug.variant));
      if (gr.interview?.style !== pkg.interview.style && gr.setInterviewStyle) jobs.push(gr.setInterviewStyle(pkg.interview.style));
      // Marka kaydı: taslak anında (program), istenirse maçın kaydına da (web kaplamaları).
      if (gr.brand?.setBranding) {
        const next = packageServerBranding(pkg, gr.brandingDraft);
        gr.brand.setBranding(next);
        if (st.writeWeb !== false && gr.brand.save) jobs.push(gr.brand.save(next, { quiet: true }));
      }
    }
    await Promise.all(jobs.map((j) => Promise.resolve(j).catch(() => false)));
    if (!quiet) t?.(auto ? `Lig varsayılanı: “${pkg.name}” grafik paketi uygulandı.` : `“${pkg.name}” grafik paketi uygulandı.`, { tone: "success", timeout: 2600 });
    return true;
  }, [setStore]);

  /** mode: "fade" (varsayılan: deponun applyMode'u) | "next" | "instant". */
  const apply = useCallback((id, { mode = null, quiet = false } = {}) => {
    const m = mode || ctxRef.current.store.applyMode || "fade";
    if (m === "next") {
      const p = findPackage(ctxRef.current.store, id);
      setPendingPackage({ id, matchId: ctxRef.current.g?.matchId || null });
      if (!quiet) ctxRef.current.toast?.(`“${p?.name || "Paket"}” sonraki geçişte uygulanacak.`, { tone: "info", timeout: 2600 });
      return Promise.resolve(true);
    }
    if (getPendingPackage()) setPendingPackage(null);
    return applyNow(id, { fade: m !== "instant", quiet });
  }, [applyNow]);

  const flushPending = useCallback(() => {
    const p = getPendingPackage();
    if (!p) return false;
    setPendingPackage(null);
    if (p.matchId && p.matchId !== ctxRef.current.g?.matchId) return false; // maç değişti: bekleyen paket düşer
    applyNow(p.id, { fade: true, quiet: true });
    return true;
  }, [applyNow]);
  const cancelPending = useCallback(() => setPendingPackage(null), []);

  // Lig / turnuva varsayılanı: maç açılınca (bu maçta henüz paket seçilmediyse) uygulanır.
  const autoDone = useRef(null);
  useEffect(() => {
    if (!matchId || !live?.match || Number(live.match.id) !== matchId || autoDone.current === matchId) return;
    if (!g?.brand || g.brand.loading) return;
    autoDone.current = matchId;
    const id = autoPackageFor(store, matchId, live.match);
    if (id) applyNow(id, { fade: false, auto: true });
  }, [matchId, live?.match, g?.brand?.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLeagueDefault = useCallback((id) => {
    if (!league) return false;
    setStore((s) => withLeagueDefault(s, league, id));
    return true;
  }, [league, setStore]);

  const activeId = g?.packageId || store.active[String(matchId || 0)]?.id || null;
  return {
    store, setStore, list, activeId, active: activeId ? list.find((p) => p.id === activeId) || null : null,
    pending, apply, applyNow, flushPending, cancelPending,
    league, leagueDefault: league ? store.leagueDefaults[league.key]?.id || null : null, setLeagueDefault,
    matchId,
  };
}
