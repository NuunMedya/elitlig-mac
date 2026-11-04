import React, { useState } from "react";
import { Icon } from "../components/ui";
import logo from "../assets/logo-white.png";

const FEATURES = [
  ["checkSquare", "Yapılacaklar ve maç görevleri"],
  ["calendar", "Ajanda, hatırlatmalar Mac bildirimiyle"],
  ["receipt", "Ön muhasebe, cari ve KDV"],
  ["grid", "Formüllü tablolar, Excel içe/dışa aktarma"],
  ["cloudOff", "İnternet yokken de çalışır"],
  ["bank", "Kasa, banka ve virman"],
];

export default function Login({ expired, onSignedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    const res = await window.elitlig.auth.login(username, password);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onSignedIn();
  };

  return (
    <div className="login">
      <div className="login__drag" />
      <section className="login__brand">
        <img src={logo} alt="Elitlig" />
        <h1>Lig yönetiminin günlük işleri, Mac'inizde.</h1>
        <p>Yapılacaklar, maç masası, ajanda, muhasebe, tablolar ve rehber — internet yokken bile.</p>
        <ul>
          {FEATURES.map(([icon, text]) => <li key={text}><Icon name={icon} size={16} />{text}</li>)}
        </ul>
      </section>
      <form className="login__form" onSubmit={submit}>
        <h2>Giriş yapın</h2>
        <p className="muted">Elitlig yönetim hesabınızla bir kez giriş yapın; bu Mac'te 3 ay boyunca oturumunuz açık kalır.</p>
        {expired && <div className="notice notice--warn">Oturum süreniz doldu. Lütfen yeniden giriş yapın.</div>}
        <label className="field">
          <span className="field__label">Kullanıcı adı</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" spellCheck={false} placeholder="kullanici_adi" />
        </label>
        <label className="field">
          <span className="field__label">Şifre</span>
          <span className="input-with-btn">
            <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Şifreniz" />
            <button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>{show ? "Gizle" : "Göster"}</button>
          </span>
        </label>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !username.trim() || !password}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}</button>
        <p className="login__fine"><Icon name="lock" size={12} /> Oturum bilgisi Mac'in Anahtar Zinciri ile şifrelenir.</p>
        <button type="button" className="link-btn" onClick={() => window.elitlig.app.openWeb("/sifremi-unuttum")}>Şifremi unuttum</button>
      </form>
    </div>
  );
}
