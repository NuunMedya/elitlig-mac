// Mesajlar · Kayıtlar: yönetimle yapılan aramaların listesi (messages.calls_view).
// Ses kaydı bağlantısı yalnız messages.listen yetkisiyle gelir; kayıt
// masaüstünde ana süreç üzerinden (elitlig-media://) çalınır.
import React, { useState } from "react";
import { Empty, Icon, Spinner } from "../../components/ui";
import { useResource } from "../../api";
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
