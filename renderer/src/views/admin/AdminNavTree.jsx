// Kenar çubuğundaki "Yönetim" listesi: web yönetim panelinin bölümleri (Maçlar,
// Ligler, Takımlar, Oyuncular, Disiplin, İçerik, Üyeler, Yönetim ve ayarlar…)
// ve sayfaları. Liste web'in kendi menüsünden gelir ve kullanıcının yetkisine
// göre süzülüdür (app/adminPanel/nav.js); izin verilmeyen bölüm görünmez.
// Bölümler açılıp kapanır (tercih hatırlanır); dar kenar çubuğunda yalnız
// bölüm simgeleri durur, tıklanınca bölümün ilk sayfası açılır.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { activePath, adminIcon, sidebarSections } from "./adminNavUi";
import "./admin.css";

const OPEN_KEY = "admin.openSections";
const readOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"); } catch { return []; } };

export default function AdminNavTree({ go, route, collapsed, railTip }) {
  const [nav, setNav] = useState(null);
  const [path, setPath] = useState(null);
  const [open, setOpen] = useState(readOpen);

  useEffect(() => {
    const admin = window.elitlig.admin;
    if (!admin) return undefined;
    admin.nav().then(setNav).catch(() => {});
    admin.state().then((s) => setPath(s?.path || null)).catch(() => {});
    const offNav = admin.onNav(setNav);
    const offState = admin.onState((s) => setPath(s?.path || null));
    return () => { offNav(); offState(); };
  }, []);

  const sections = sidebarSections(nav?.groups || []);
  if (!sections.length) return null;
  const current = route === "admin" ? activePath(path, sections) : null;

  const toggle = (key) => setOpen((list) => {
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
    return next;
  });

  return (
    <div className="admin-tree" role="group" aria-label="Yönetim bölümleri">
      {sections.map((g) => {
        const isOpen = open.includes(g.key) || g.items.some((i) => i.path === current);
        const hasActive = g.items.some((i) => i.path === current);
        const label = g.short || g.label;
        if (collapsed) {
          return (
            <button key={g.key} type="button" className={`nav-item admin-tree__section ${hasActive ? "is-active" : ""}`} data-tool="admin"
              onClick={() => go("admin", { path: g.items[0].path })} aria-label={`Yönetim: ${g.label}`} {...railTip(collapsed, g.label, null, `${g.items.length} sayfa`)}>
              <span className="nav-item__icon"><Icon name={adminIcon(g.icon)} size={15} strokeWidth={2} /></span>
              <span className="nav-item__label">{label}</span>
            </button>
          );
        }
        return (
          <React.Fragment key={g.key}>
            <button type="button" className={`nav-item admin-tree__section ${hasActive && !isOpen ? "is-active" : ""}`} data-tool="admin" onClick={() => toggle(g.key)}
              aria-expanded={isOpen} title={g.label}>
              <span className="nav-item__icon"><Icon name={adminIcon(g.icon)} size={15} strokeWidth={2} /></span>
              <span className="nav-item__label">{g.label}</span>
              <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={12} className="admin-tree__chev" />
            </button>
            {isOpen && g.items.map((i) => (
              <button key={i.path} type="button" className={`nav-item admin-tree__item ${current === i.path ? "is-active" : ""}`} data-tool="admin"
                onClick={() => go("admin", { path: i.path })} aria-current={current === i.path ? "page" : undefined} title={i.name}>
                <span className="nav-item__label">{i.name}</span>
              </button>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}
