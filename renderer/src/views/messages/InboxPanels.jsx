// Mesajlar · Kayıtlar: yönetimle yapılan aramaların listesi (messages.calls_view)
// ve Ayarlar (2.8): kimden mesaj kabul edilir, engellenenler, kısayollar.
// Ses kaydı bağlantısı yalnız messages.listen yetkisiyle gelir; kayıt
// masaüstünde ana süreç üzerinden (elitlig-media://) çalınır.
import React, { useState } from "react";
import { Empty, Icon, Kbd, Spinner, useResult } from "../../components/ui";
import { request, useResource } from "../../api";
import { Avatar } from "./common";
import { A, callRow } from "../../lib/inboxUtils";
import { listTime, mediaUrl } from "../../lib/chatUtils";

export function CallsPanel({ onClose, onOpenChat }) {
  const [recorded, setRecorded] = useState(false);
  const res = useResource(`${A}/calls`, { limit: 60, recorded: recorded ? "1" : undefined });
  const calls = res.data?.calls || [];
  const denied = res.error?.status === 403;
  return (
    <div className="ms-slide ms-calls">
      <header className="ms-slide__head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Geri"><Icon name="chevronLeft" size={18} /></button>
        <h3>Kayıtlar</h3>
        <label className="toggle small"><input type="checkbox" checked={recorded} onChange={(e) => setRecorded(e.target.checked)} /> Ses kaydı olanlar</label>
      </header>
      <p className="ms-note">Üyelerle ElitLig Yönetimi arasındaki aramalar.{res.data && !res.data.can_listen ? " Ses kayıtlarını dinleme yetkiniz yok (messages.listen)." : ""}</p>
      <div className="ms-slide__body">
        {res.loading && !res.data ? <Spinner /> : denied ? <Empty icon="lock" title="Yetki yok" text="Arama kayıtlarını görmek için messages.calls_view yetkisi gerekir." />
          : !calls.length ? <Empty icon="phone" title="Kayıt yok" text={recorded ? "Ses kaydı olan arama yok." : "Yönetimle yapılmış arama yok."} />
            : calls.map((c) => {
              const r = callRow(c);
              return (
                <div key={c.id} className="ms-call-row">
                  <Avatar name={r.from} id={c.caller?.user_id} url={c.caller?.avatar} size={40} />
                  <span className="ms-call-row__main">
                    <strong>{r.from} <Icon name="chevronRight" size={11} /> {r.to}</strong>
                    <small className={r.missed ? "text-red" : ""}><Icon name="phone" size={11} /> {r.label} · {listTime(c.started_at)}</small>
                    {r.url ? <audio controls preload="none" src={mediaUrl(r.url)} /> : r.recording ? <small className="muted"><Icon name="lock" size={10} /> Ses kaydı var</small> : null}
                  </span>
                  {c.conversation_id ? <button type="button" className="icon-btn" title="Sohbeti aç" onClick={() => onOpenChat(c.conversation_id)}><Icon name="message" size={16} /></button> : null}
                </div>
              );
            })}
      </div>
    </div>
  );
}

/** Sol bölmede açılan Ayarlar paneli. */
export function ChatSettingsPanel({ onClose, me, link }) {
  const result = useResult();
  const prefs = useResource("/api/chat/preferences");
  const blocks = useResource("/api/chat/blocks");
  const p = prefs.data;
  const accept = new Set(p?.accept_from || []);
  const toggle = async (key) => {
    const next = accept.has(key) ? [...accept].filter((k) => k !== key) : [...accept, key];
    const r = await request({ method: "PATCH", path: "/api/chat/preferences", body: { accept_from: next.length ? next : ["everyone"] }, queue: false });
    if (result(r)) prefs.setData((d) => ({ ...d, accept_from: r.data.accept_from }));
  };
  const unblock = async (u) => {
    const r = await request({ method: "DELETE", path: `/api/chat/blocks/${u.user_id}`, queue: false });
    if (result(r, `${u.name} engeli kaldırıldı.`)) blocks.reload({ quiet: true });
  };
  return (
    <div className="ms-slide ms-settings">
      <header className="ms-slide__head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Geri"><Icon name="chevronLeft" size={18} /></button>
        <h3>Ayarlar</h3>
      </header>
      <div className="ms-slide__body">
        <div className="ms-settings__me">
          <Avatar name={me.name} id={me.id} size={56} />
          <span><strong>{me.name}</strong><small><i className={`ms-live ${link === "connected" ? "is-on" : ""}`} /> {link === "connected" ? "Canlı bağlantı açık" : "Bağlantı kuruluyor"}</small></span>
        </div>
        <section className="ms-settings__sect">
          <h5>Kimler size yazabilir?</h5>
          {!p ? <Spinner /> : (p.options || []).map((o) => (
            <label key={o.key} className="ms-switch"><input type="checkbox" checked={accept.has(o.key)} onChange={() => toggle(o.key)} /><span><strong>{o.label}</strong></span></label>
          ))}
          {p?.management_always && <p className="ms-note">Yönetim hesapları size her zaman yazabilir.</p>}
        </section>
        <section className="ms-settings__sect">
          <h5>Engellenenler</h5>
          {blocks.loading && !blocks.data ? <Spinner /> : !(blocks.data?.blocks || []).length ? <p className="ms-note">Engellediğiniz kimse yok.</p>
            : blocks.data.blocks.map((u) => (
              <div key={u.user_id} className="ms-person ms-person--static">
                <Avatar name={u.name} id={u.user_id} url={u.avatar} size={36} />
                <span className="ms-person__text"><strong>{u.name}</strong><small>{u.subtitle}</small></span>
                <button type="button" className="btn btn--sm" onClick={() => unblock(u)}>Engeli kaldır</button>
              </div>
            ))}
        </section>
        <section className="ms-settings__sect">
          <h5>Kısayollar</h5>
          <div className="ms-settings__keys">
            <span><Kbd>⌘N</Kbd> Yeni sohbet</span><span><Kbd>⇧⌘N</Kbd> Yeni grup</span><span><Kbd>⌘F</Kbd> Sohbette ara</span>
            <span><Kbd>⌥⌘↓</Kbd> Sonraki sohbet</span><span><Kbd>⌥⌘↑</Kbd> Önceki sohbet</span><span><Kbd>Esc</Kbd> Paneli kapat</span>
          </div>
        </section>
        <button type="button" className="ms-archived-link" onClick={() => window.elitlig.app.openWeb("/yonetim/araclar/mesajlar")}><Icon name="external" size={15} /> Mesajları sitede aç</button>
      </div>
    </div>
  );
}
