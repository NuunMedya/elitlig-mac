// Rehber (masaüstü): kişi ayrıntısı. Büyük avatar, hızlı eylemler (ara,
// WhatsApp, SMS, e-posta, mesaj, vCard), etiketli telefon / e-posta, adres,
// web, sosyal, doğum günü, hedef kitleler, not; ilgili notlar ve projeler.
import React, { useEffect, useState } from "react";
import { Icon, MenuButton } from "../../components/ui";
import { get } from "../../api";
import { formatDate } from "../../lib/helpers";
import { EMAIL_LABELS, PHONE_LABELS, SOCIAL_NETWORKS, digitsOf, formatBirthday, labelText, prettyPhone, socialUrl, upcomingBirthdays, waNumber } from "../../lib/contactCore";
import { CAT_LABEL, rowContact } from "../../lib/contactRows";
import { Avatar } from "./Avatar";

const open = (url) => window.elitlig.app.openExternal(url);
const copy = (text) => navigator.clipboard.writeText(text);

function QuickAction({ icon, label, onClick, tone }) {
  return (
    <button type="button" className={`rb-qa${tone ? ` rb-qa--${tone}` : ""}`} onClick={onClick} disabled={!onClick}>
      <span className="rb-qa__icon"><Icon name={icon} size={17} /></span><span>{label}</span>
    </button>
  );
}

export default function ContactPanel({ row, audiences, rowAudienceIds, go, onTeam, onEdit, onFav, onSaveMember, onDelete, onAudience, onVcard }) {
  const [related, setRelated] = useState(null);
  const cardId = row.source === "manual" ? row.id : row.card?.id;
  useEffect(() => {
    setRelated(null);
    if (!cardId || String(cardId).startsWith("tmp_")) return;
    get(`/api/tools/contacts/${cardId}/related`).then((r) => setRelated(r.ok ? r.data : null));
  }, [cardId]);
  const full = rowContact(row);
  const card = row.card;
  const phone = full.phones[0]?.value;
  const email = full.emails[0]?.value;
  const soon = card?.birthday ? upcomingBirthdays([card], { days: 366 })[0] : null;
  const auds = audiences.filter((a) => rowAudienceIds.includes(String(a.id)));
  const m = row.member;

  return (
    <div className="rb-panel">
      <header className="rb-hero">
        <Avatar name={row.name} src={row.avatar} size="xl" />
        <h2>{row.name} {row.favorite && <Icon name="star" size={14} className="rb-hero__fav" />}</h2>
        <p className="muted">{row.source === "member" ? [m?.username ? `@${m.username}` : null, row.categories.map((c) => CAT_LABEL[c] || c).join(", ")].filter(Boolean).join(" · ") : [card?.title, card?.company].filter(Boolean).join(" · ") || "Kişi"}</p>
        {row.team && <button type="button" className="team-badge team-badge--lg" onClick={() => onTeam(m?.team?.id || null, row.team.name)} title="Takım kartını aç"><Icon name="team" size={13} /> {row.team.name}{row.team.captain ? " · Başkan" : ""}</button>}
        {auds.length > 0 && <div className="rb-hero__auds">{auds.map((a) => <span key={a.id} className="rb-audtag" style={{ "--aud": a.color || "#64748b" }}><span className="rb-dot" />{a.name}</span>)}</div>}
        <div className="rb-qas">
          <QuickAction icon="phone" label="Ara" onClick={phone ? () => open(`tel:${digitsOf(phone)}`) : null} />
          <QuickAction icon="message" label="WhatsApp" tone="wa" onClick={phone ? () => open(`https://wa.me/${waNumber(phone)}`) : null} />
          <QuickAction icon="mail" label="E-posta" onClick={email ? () => open(`mailto:${email}`) : null} />
          {row.source === "member" && <QuickAction icon="send" label="Mesaj" onClick={() => go("messages", { userId: row.id })} />}
          <QuickAction icon="download" label="vCard" onClick={onVcard} />
        </div>
      </header>
      <dl className="rb-facts">
        {full.phones.map((p, i) => (
          <div key={`p${i}`} className="rb-fact"><dt>{labelText(PHONE_LABELS, p.label) || "telefon"}</dt><dd><button type="button" className="link" onClick={() => open(`tel:${digitsOf(p.value)}`)}>{prettyPhone(p.value)}</button><button type="button" className="icon-btn icon-btn--xs" title="WhatsApp" onClick={() => open(`https://wa.me/${waNumber(p.value)}`)}><Icon name="message" size={12} /></button><button type="button" className="icon-btn icon-btn--xs" title="Kopyala" onClick={() => copy(p.value)}><Icon name="copy" size={12} /></button></dd></div>
        ))}
        {full.emails.map((e, i) => (
          <div key={`e${i}`} className="rb-fact"><dt>{labelText(EMAIL_LABELS, e.label) || "e-posta"}</dt><dd><button type="button" className="link" onClick={() => open(`mailto:${e.value}`)}>{e.value}</button><button type="button" className="icon-btn icon-btn--xs" title="Kopyala" onClick={() => copy(e.value)}><Icon name="copy" size={12} /></button></dd></div>
        ))}
        {(full.address || full.city) && <div className="rb-fact"><dt>adres</dt><dd>{[full.address, full.city].filter(Boolean).join(", ")} <button type="button" className="link small" onClick={() => open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([full.address, full.city].filter(Boolean).join(", "))}`)}>Haritada aç</button></dd></div>}
        {card?.website && <div className="rb-fact"><dt>web</dt><dd><button type="button" className="link" onClick={() => open(card.website)}>{card.website.replace(/^https?:\/\//, "")}</button></dd></div>}
        {(card?.socials || []).length > 0 && <div className="rb-fact"><dt>sosyal</dt><dd className="rb-socials">{card.socials.map((s, i) => <button key={i} type="button" className="link" onClick={() => open(socialUrl(s.network, s.value))}>{SOCIAL_NETWORKS.find((n) => n.key === s.network)?.label}: {s.value}</button>)}</dd></div>}
        {card?.birthday && <div className="rb-fact"><dt>doğum günü</dt><dd>{formatBirthday(card.birthday)}{soon && <span className={`rb-bdaytag${soon.inDays <= 7 ? " is-soon" : ""}`}>{soon.inDays === 0 ? "Bugün 🎂" : `${soon.inDays} gün sonra${soon.age ? ` · ${soon.age} yaş` : ""}`}</span>}</dd></div>}
        {m?.player && <div className="rb-fact"><dt>oyuncu</dt><dd>{m.player.name}{m.player.team ? ` · ${m.player.team}` : ""}</dd></div>}
        {row.createdAt && <div className="rb-fact"><dt>{row.source === "member" ? "katıldı" : "eklendi"}</dt><dd>{formatDate(row.createdAt)}</dd></div>}
        {row.tags?.length > 0 && <div className="rb-fact"><dt>etiketler</dt><dd>{row.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</dd></div>}
      </dl>
      {card?.note && <div className="note-box"><strong className="small muted">{row.source === "member" ? "Kişisel notunuz" : "Not"}</strong><br />{card.note}</div>}
      {related && (related.notes.length > 0 || related.projects.length > 0) && (
        <div className="rb-related">
          {related.projects.length > 0 && <div><h4>Projeler</h4>{related.projects.map((p) => <button key={`${p.project_id}-${p.lead_id}`} type="button" className="rb-related__item" onClick={() => go("projects", { id: p.project_id, tab: "leads", lead: p.lead_id })}>{p.project_name}<small>{p.stage}</small></button>)}</div>}
          {related.notes.length > 0 && <div><h4>Notlar</h4>{related.notes.map((n) => <button key={n.id} type="button" className="rb-related__item" onClick={() => go("notes", String(n.id))}>{n.emoji ? `${n.emoji} ` : ""}{n.title || "Başlıksız not"}<small>{formatDate(n.updatedAt)}</small></button>)}</div>}
        </div>
      )}
      <footer className="rb-panel__foot">
        <button type="button" className="btn btn--sm" onClick={onAudience}><Icon name="target" size={13} /> Hedef kitle</button>
        <button type="button" className={`icon-btn ${row.favorite ? "is-on" : ""}`} title={row.favorite ? "Favorilerden çıkar" : "Favorilere ekle"} onClick={onFav}><Icon name="star" /></button>
        <span className="rb-spacer" />
        {row.source === "member" && !row.card ? <button type="button" className="btn btn--sm btn--primary" onClick={onSaveMember}><Icon name="userPlus" size={13} /> Kişilerime kaydet</button> : <button type="button" className="btn btn--sm btn--primary" onClick={onEdit}><Icon name="pencil" size={13} /> Düzenle</button>}
        {row.card && <MenuButton items={[{ label: row.source === "member" ? "Kişisel kartı sil" : "Sil", icon: "trash", danger: true, onClick: onDelete }]} />}
      </footer>
    </div>
  );
}
