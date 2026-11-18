// Elitlig Stüdyo kabuğu (2.36.0): oturum → Yayın Stüdyosu. Kenar çubuğu / çalışma alanı yok.
import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Spinner, useToast } from "../components/ui";
import { canLeave } from "../lib/leaveGuard";
import Login from "../views/Login";
import { useProcessGoneToasts } from "./useProcessGoneToasts";

const Studio = lazy(() => import("../views/studio/Studio"));

export default function StudioApp({ migration = null }) {
  const [auth, setAuth] = useState(null);
  const toast = useToast();
  const loadAuth = useCallback(() => window.elitlig.auth.state().then(setAuth), []);
  useEffect(() => {
    loadAuth();
    return window.elitlig.auth.onChange(() => loadAuth());
  }, [loadAuth]);
  useEffect(() => {
    if (migration?.imported > 0) toast(`Elitlig Araçlar'daki stüdyo ayarları aktarıldı (${migration.imported} ayar).`, { tone: "success", timeout: 6000 });
  }, [migration, toast]);
  useProcessGoneToasts();
  // "Programdan çık": yayın sürüyorsa stüdyo sorar (leaveGuard); onaylanırsa uygulama kapanır.
  const go = useCallback(async (route) => {
    if (route === "studio") return;
    if (await canLeave()) window.elitlig.studioApp?.quit?.();
  }, []);
  if (!auth) return <div className="boot"><Spinner label="Elitlig Stüdyo açılıyor…" /></div>;
  if (!auth.signedIn) return <Login expired={auth.expired} onSignedIn={loadAuth} product="studio" />;
  return (
    <main className="content studio-app" data-tool="studio">
      <Suspense fallback={<div className="boot"><Spinner label="Stüdyo yükleniyor…" /></div>}>
        <Studio route="studio" go={go} auth={auth} arg={null} argSeq={0} standalone />
      </Suspense>
    </main>
  );
}
