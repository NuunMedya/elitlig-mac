import React, { useEffect, useState } from "react";
import { Icon, ViewHeader, useConfirm } from "../components/ui";
import { formatDate } from "../lib/helpers";

export default function Account({ auth }) {
  const confirm = useConfirm();
  const [info, setInfo] = useState(null);
  const [sync, setSync] = useState(null);
  useEffect(() => {
    window.elitlig.app.info().then(setInfo);
    window.elitlig.sync.status().then(setSync);
  }, []);
  const user = auth.user || {};
  const daysLeft = auth.endsAt ? Math.max(0, Math.ceil((auth.endsAt - Date.now()) / 86400000)) : null;

  const logout = async () => {
    const ok = await confirm({ title: "Oturumu kapat", message: "Bu Mac'teki oturum ve çevrimdışı veriler silinir. Yeniden kullanmak için giriş yapmanız gerekir.", confirmLabel: "Oturumu kapat", danger: true });
    if (ok) window.elitlig.auth.logout();
  };

  return (
    <div className="view view--narrow">
      <ViewHeader icon="user" title="Hesap ve oturum" />
      <section className="card profile-card">
        <span className="avatar avatar--lg">{(user.fullName || user.username || "?")[0].toLocaleUpperCase("tr-TR")}</span>
        <div>
          <h2>{user.fullName || user.username}</h2>
          <p className="muted">@{user.username}{user.roleLabel ? ` · ${user.roleLabel}` : user.role ? ` · ${user.role}` : ""}{user.city ? ` · ${user.city}` : ""}</p>
        </div>
      </section>
      <section className="card">
        <h3 className="card__title"><Icon name="lock" /> Oturum</h3>
        <dl className="kv">
          <dt>Giriş tarihi</dt><dd>{auth.loginAt ? formatDate(auth.loginAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</dd>
          <dt>Oturum bitişi</dt><dd>{auth.endsAt ? `${formatDate(auth.endsAt, { day: "numeric", month: "long", year: "numeric" })} (${daysLeft} gün kaldı)` : "—"}</dd>
          <dt>Eşitleme</dt><dd>{sync ? (sync.online ? "Çevrimiçi" : "Çevrimdışı") + (sync.pending ? ` · ${sync.pending} değişiklik bekliyor` : "") : "—"}</dd>
          <dt>Hızlı kayıt</dt><dd>{info?.shortcut?.replace("Control", "⌃").replace("Alt", "⌥").replace(/\+/g, "") || "⌃⌥N"} — uygulama arka plandayken de açılır</dd>
          <dt>Sürüm</dt><dd>{info?.version || "—"}</dd>
        </dl>
        <div className="row-gap">
          <button type="button" className="btn" onClick={() => window.elitlig.sync.flush()}><Icon name="refresh" /> Şimdi eşitle</button>
          <button type="button" className="btn" onClick={() => window.elitlig.app.openWeb("/yonetim/hesabim")}><Icon name="external" /> Hesap ayarları (web)</button>
          <button type="button" className="btn btn--danger-ghost" onClick={logout}><Icon name="logout" /> Oturumu kapat</button>
        </div>
      </section>
    </div>
  );
}
