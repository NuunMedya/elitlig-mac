// Sağ panel: kişi / grup bilgisi, medya-belgeler-bağlantılar, yıldızlı
// mesajlar ve sohbette arama.
import React, { useEffect, useMemo, useState } from "react";
import { Icon, MenuButton, Spinner, useConfirm, useResult } from "../../components/ui";
import { del, get, patch, post, request, useDebounced } from "../../api";
import { Avatar, C, chatApi } from "./common";
import { AddMembersModal } from "./Pickers";
import { RichText } from "./Bubble";
import { clockTime, dayLabel, formatBytes, isGroupChat, listTime, mediaUrl, quoteText } from "../../lib/chatUtils";
import { prettyPhone, waNumber } from "../../lib/helpers";

const openUrl = (url) => window.elitlig.app.openExternal(url);

function PanelHead({ title, onClose, onBack }) {
  return (
    <header className="ms-panel__head">
      {onBack && <button type="button" className="icon-btn" onClick={onBack} aria-label="Geri"><Icon name="chevronLeft" size={18} /></button>}
      <h3>{title}</h3>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
    </header>
  );
}

/* --------------------------------- medya --------------------------------- */
export function MediaPanel({ conv, onClose, onBack, onOpenImage, onJump }) {
  const [tab, setTab] = useState("images");
  const [data, setData] = useState(null);
  useEffect(() => { get(`${C}/conversations/${conv.id}/media`).then((r) => setData(r.ok ? r.data : { images: [], files: [], links: [], error: r.error })); }, [conv.id]);
  return (
    <aside className="ms-panel">
      <PanelHead title="Medya, bağlantılar ve belgeler" onClose={onClose} onBack={onBack} />
      <div className="ms-tabs ms-tabs--full">
        {[["images", "Medya"], ["files", "Belgeler"], ["links", "Bağlantılar"]].map(([k, l]) => <button key={k} type="button" className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>{l}{data ? ` ${data[k]?.length || 0}` : ""}</button>)}
      </div>
      <div className="ms-panel__body">
        {!data ? <Spinner /> : tab === "images" ? (
          <div className="ms-mediagrid">
            {data.images.map((m, i) => <button key={m.id} type="button" onClick={() => onOpenImage(data.images, i)}><img src={mediaUrl(m.url)} alt="" loading="lazy" /></button>)}
            {!data.images.length && <p className="ms-note">Bu sohbette fotoğraf yok.</p>}
          </div>
        ) : tab === "files" ? (
          <div className="ms-filelist">
            {data.files.map((f) => (
              <div key={f.id} className="ms-file ms-file--row" onClick={() => chatApi().openFile(f.url, f.name)}>
                <span className="ms-file__ic" data-ext={String(f.name || "").split(".").pop().toUpperCase().slice(0, 4)}><Icon name="file" size={20} /></span>
                <span className="ms-file__text"><strong>{f.name}</strong><small>{[formatBytes(f.size), listTime(f.created_at)].join(" · ")}</small></span>
                <button type="button" className="icon-btn" title="İndir" onClick={(e) => { e.stopPropagation(); chatApi().download(f.url, f.name).then((r) => r.ok && window.elitlig.files.reveal(r.path)); }}><Icon name="download" /></button>
              </div>
            ))}
            {!data.files.length && <p className="ms-note">Bu sohbette belge yok.</p>}
          </div>
        ) : (
          <div className="ms-linklist">
            {data.links.map((l) => (
              <div key={l.id} className="ms-linkrow">
                <span className="ms-linkrow__ic"><Icon name="link" size={16} /></span>
                <span>{l.urls.map((u) => <a key={u} href={u} onClick={(e) => { e.preventDefault(); openUrl(u); }}>{u}</a>)}<small onClick={() => onJump(l.id)}>{listTime(l.created_at)} · mesaja git</small></span>
              </div>
            ))}
            {!data.links.length && <p className="ms-note">Bu sohbette bağlantı yok.</p>}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ----------------------------- yıldızlı ve arama ----------------------------- */
function MessageHit({ m, onClick, showChat }) {
  return (
    <button type="button" className="ms-hit" onClick={onClick}>
      <span className="ms-hit__top"><strong>{m.sender?.is_me ? "Siz" : m.sender?.name}</strong>{showChat && m.conversation_title && <em> · {m.conversation_title}</em>}<small>{listTime(m.created_at)}</small></span>
      <span className="ms-hit__body">{quoteText(m)}</span>
    </button>
  );
}

export function StarredPanel({ conv, onClose, onBack, onJump }) {
  const [items, setItems] = useState(null);
  useEffect(() => { get(`${C}/starred`).then((r) => setItems(r.ok ? (r.data.items || []).filter((m) => !conv || Number(m.conversation_id) === Number(conv.id)) : [])); }, [conv?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="ms-panel">
      <PanelHead title="Yıldızlı mesajlar" onClose={onClose} onBack={onBack} />
      <div className="ms-panel__body">
        {!items ? <Spinner /> : items.map((m) => <MessageHit key={m.id} m={m} onClick={() => onJump(m.id, m.conversation_id)} />)}
        {items && !items.length && <div className="ms-panel__empty"><Icon name="star" size={28} /><p>Yıldızlı mesaj yok. Bir mesajın menüsünden <strong>Yıldızla</strong>'yı seçin.</p></div>}
      </div>
    </aside>
  );
}

export function SearchPanel({ conv, onClose, onJump }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q, 300);
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (query.trim().length < 2) { setItems(null); return; }
    get(`${C}/search`, { q: query.trim(), conversation_id: conv.id }).then((r) => setItems(r.ok ? r.data.items || [] : []));
  }, [query, conv.id]);
  return (
    <aside className="ms-panel">
      <PanelHead title="Mesajlarda ara" onClose={onClose} />
      <div className="ms-search ms-search--panel"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" onKeyDown={(e) => e.key === "Escape" && onClose()} /></div>
      <div className="ms-panel__body">
        {items === null ? <p className="ms-note">{conv.title} sohbetinde mesaj arayın.</p> : items.map((m) => <MessageHit key={m.id} m={m} onClick={() => onJump(m.id)} />)}
        {items && !items.length && <p className="ms-note">Sonuç yok.</p>}
      </div>
    </aside>
  );
}

/* --------------------------------- kişi bilgisi --------------------------------- */
export function ContactPanel({ conv, conversations, onClose, onOpenMedia, onOpenStarred, onOpenChat, onBlock, onReport, onMute, onImage }) {
  const u = conv.other_user || {};
  const [card, setCard] = useState(null);
  const [media, setMedia] = useState(null);
  useEffect(() => {
    if (u.user_id) get(`/api/tools/contacts/directory/${u.user_id}`).then((r) => setCard(r.ok ? r.data.item : null));
    get(`${C}/conversations/${conv.id}/media`).then((r) => setMedia(r.ok ? r.data : null));
  }, [u.user_id, conv.id]);
  const common = useMemo(() => conversations.filter((c) => isGroupChat(c) && c.participants?.some((p) => Number(p.user_id) === Number(u.user_id))), [conversations, u.user_id]);
  const phone = card?.phone;
  const isStaff = u.kind === "staff";
  return (
    <aside className="ms-panel">
      <PanelHead title="Kişi bilgisi" onClose={onClose} />
      <div className="ms-panel__body">
        <div className="ms-profile">
          <Avatar name={u.name || conv.title} id={u.user_id} url={u.avatar} size={96} />
          <h2>{u.name || conv.title}</h2>
          {u.team_name && u.team_name !== (u.name || conv.title) && <span className="ms-team ms-team--lg">{u.team_name}</span>}
          <p className="muted">{u.managed_team_id && u.manager_name && u.manager_name !== u.name ? `${u.manager_name} · Takım başkanı` : u.subtitle}{u.username ? ` · @${u.username}` : ""}</p>
          <div className="ms-profile__actions">
            <button type="button" disabled={!phone} onClick={() => openUrl(`tel:${String(phone).replace(/\s/g, "")}`)}><Icon name="phone" size={18} /><span>Ara</span></button>
            <button type="button" className="is-wa" disabled={!phone} onClick={() => openUrl(`https://wa.me/${waNumber(phone)}`)}><Icon name="message" size={18} /><span>WhatsApp</span></button>
            <button type="button" disabled={!card?.email} onClick={() => openUrl(`mailto:${card.email}`)}><Icon name="mail" size={18} /><span>E-posta</span></button>
            <button type="button" onClick={onOpenStarred}><Icon name="star" size={18} /><span>Yıldızlı</span></button>
          </div>
        </div>
        {(phone || card?.email || card?.city) && (
          <dl className="ms-kv">
            {phone && <><dt>Telefon</dt><dd className="selectable">{prettyPhone(phone)}</dd></>}
            {card?.email && <><dt>E-posta</dt><dd className="selectable">{card.email}</dd></>}
            {card?.city && <><dt>İl</dt><dd>{card.city}</dd></>}
            {card?.createdAt && <><dt>Üyelik</dt><dd>{dayLabel(card.createdAt)}</dd></>}
          </dl>
        )}
        <section className="ms-sect">
          <button type="button" className="ms-sect__head" onClick={onOpenMedia}><span>Medya, bağlantılar ve belgeler</span><small>{media ? media.images.length + media.files.length + media.links.length : ""}</small><Icon name="chevronRight" size={14} /></button>
          {media?.images?.length > 0 && <div className="ms-mediastrip">{media.images.slice(0, 4).map((m, i) => <button key={m.id} type="button" onClick={() => onImage(media.images, i)}><img src={mediaUrl(m.url)} alt="" /></button>)}</div>}
        </section>
        {common.length > 0 && (
          <section className="ms-sect">
            <h5 className="ms-h5">{common.length} ortak grup</h5>
            {common.map((c) => <button key={c.id} type="button" className="ms-person" onClick={() => onOpenChat(c.id)}><Avatar name={c.title} id={c.id} url={c.avatar} size={34} group /><span className="ms-person__text"><strong>{c.title}</strong><small>{c.participants.map((p) => (p.is_me ? "Siz" : p.name)).slice(0, 5).join(", ")}</small></span></button>)}
          </section>
        )}
        <section className="ms-sect ms-sect--actions">
          <button type="button" onClick={onMute}><Icon name={conv.muted ? "bell" : "bellOff"} /> {conv.muted ? "Bildirimleri aç" : "Sessize al"}</button>
          {!isStaff && <button type="button" className="is-danger" onClick={onBlock}><Icon name="ban" /> {conv.blocked_by_me ? `${u.name} engelini kaldır` : `${u.name} engelle`}</button>}
          {!isStaff && <button type="button" className="is-danger" onClick={onReport}><Icon name="flag" /> {u.name} şikayet et</button>}
        </section>
      </div>
    </aside>
  );
}

/* --------------------------------- grup bilgisi --------------------------------- */
export function GroupPanel({ conv, meId, onClose, onOpenMedia, onOpenStarred, onOpenDirect, onLeft, onChanged, onImage, onMute }) {
  const result = useResult();
  const confirm = useConfirm();
  const [info, setInfo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [media, setMedia] = useState(null);
  const load = () => get(`${C}/conversations/${conv.id}/group`).then((r) => setInfo(r.ok ? r.data : { error: r.error }));
  useEffect(() => { load(); get(`${C}/conversations/${conv.id}/media`).then((r) => setMedia(r.ok ? r.data : null)); }, [conv.id, conv.title, conv.description]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return <aside className="ms-panel"><PanelHead title="Grup bilgisi" onClose={onClose} /><Spinner /></aside>;
  if (info.error) return <aside className="ms-panel"><PanelHead title="Grup bilgisi" onClose={onClose} /><p className="ms-note">{info.error.message}</p></aside>;
  const canEdit = info.is_admin || !info.only_admins_edit;
  const save = async (body) => {
    const res = await patch(`${C}/conversations/${conv.id}/group`, body);
    if (result(res)) { setInfo(res.data); setEditing(null); onChanged(); }
  };
  const photo = async () => {
    const [f] = await chatApi().pick({ images: true });
    if (!f?.data) return;
    const up = await chatApi().upload("file", f);
    if (result(up)) save({ avatar_url: up.data.url });
  };
  const memberMenu = (m) => [
    !m.is_me && { label: `${m.name} ile mesajlaş`, icon: "message", onClick: () => onOpenDirect(m.user_id) },
    info.is_admin && !m.is_me && (m.role === "admin"
      ? { label: "Yöneticilikten çıkar", icon: "shield", onClick: async () => { if (result(await patch(`${C}/conversations/${conv.id}/members/${m.user_id}`, { role: "member" }), "Yöneticilik kaldırıldı.")) load(); } }
      : { label: "Grup yöneticisi yap", icon: "shield", onClick: async () => { if (result(await patch(`${C}/conversations/${conv.id}/members/${m.user_id}`, { role: "admin" }), `${m.name} yönetici yapıldı.`)) load(); } }),
    info.is_admin && !m.is_me && "-",
    info.is_admin && !m.is_me && { label: "Gruptan çıkar", icon: "logout", danger: true, onClick: async () => {
      if (await confirm({ title: "Gruptan çıkar", message: `${m.name} gruptan çıkarılsın mı?`, danger: true, confirmLabel: "Çıkar" }) && result(await del(`${C}/conversations/${conv.id}/members/${m.user_id}`), "Çıkarıldı.")) { load(); onChanged(); }
    } },
  ];
  return (
    <aside className="ms-panel">
      <PanelHead title="Grup bilgisi" onClose={onClose} />
      <div className="ms-panel__body">
        <div className="ms-profile">
          <button type="button" className="ms-profile__photo" disabled={!canEdit} onClick={photo} title={canEdit ? "Grup fotoğrafını değiştir" : undefined}>
            <Avatar name={info.conversation?.title} id={conv.id} url={info.conversation?.avatar} size={96} group />
            {canEdit && <span className="ms-profile__cam"><Icon name="camera" size={16} /></span>}
          </button>
          {editing === "title" ? (
            <form className="ms-inline-edit" onSubmit={(e) => { e.preventDefault(); save({ title: e.target.title.value }); }}><input name="title" autoFocus defaultValue={info.conversation?.title} maxLength={120} /><button type="submit" className="icon-btn"><Icon name="check" /></button></form>
          ) : <h2>{info.conversation?.title} {canEdit && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setEditing("title")} aria-label="Adı düzenle"><Icon name="pencil" size={12} /></button>}</h2>}
          <p className="muted">Grup · {info.members.length} üye</p>
          <div className="ms-profile__actions">
            <button type="button" onClick={() => setAdding(true)} disabled={!canEdit}><Icon name="userPlus" size={18} /><span>Ekle</span></button>
            <button type="button" onClick={onOpenStarred}><Icon name="star" size={18} /><span>Yıldızlı</span></button>
            <button type="button" onClick={onMute}><Icon name={conv.muted ? "bell" : "bellOff"} size={18} /><span>{conv.muted ? "Sesi aç" : "Sessize al"}</span></button>
          </div>
        </div>
        <section className="ms-sect">
          {editing === "description" ? (
            <form className="ms-inline-edit ms-inline-edit--col" onSubmit={(e) => { e.preventDefault(); save({ description: e.target.d.value }); }}>
              <textarea name="d" rows={3} autoFocus defaultValue={info.description || ""} maxLength={2000} placeholder="Grup açıklaması" />
              <div className="row-gap"><button type="button" className="btn btn--sm" onClick={() => setEditing(null)}>Vazgeç</button><button type="submit" className="btn btn--sm btn--primary">Kaydet</button></div>
            </form>
          ) : (
            <button type="button" className="ms-desc" disabled={!canEdit} onClick={() => setEditing("description")}>
              {info.description ? <span className="selectable">{info.description}</span> : <span className="muted">{canEdit ? "Grup açıklaması ekleyin" : "Açıklama yok"}</span>}
              {canEdit && <Icon name="pencil" size={12} />}
            </button>
          )}
        </section>
        <section className="ms-sect">
          <button type="button" className="ms-sect__head" onClick={onOpenMedia}><span>Medya, bağlantılar ve belgeler</span><small>{media ? media.images.length + media.files.length + media.links.length : ""}</small><Icon name="chevronRight" size={14} /></button>
          {media?.images?.length > 0 && <div className="ms-mediastrip">{media.images.slice(0, 4).map((m, i) => <button key={m.id} type="button" onClick={() => onImage(media.images, i)}><img src={mediaUrl(m.url)} alt="" /></button>)}</div>}
        </section>
        {info.is_admin && (
          <section className="ms-sect">
            <h5 className="ms-h5">Grup ayarları</h5>
            <label className="ms-switch"><input type="checkbox" checked={info.only_admins_send} onChange={(e) => save({ only_admins_send: e.target.checked })} /><span><strong>Yalnız yöneticiler mesaj gönderir</strong><small>Üyeler okur ve tepki verir.</small></span></label>
            <label className="ms-switch"><input type="checkbox" checked={info.only_admins_edit} onChange={(e) => save({ only_admins_edit: e.target.checked })} /><span><strong>Grup bilgisini yalnız yöneticiler düzenler</strong><small>Ad, fotoğraf, açıklama, üye ekleme, sabitleme.</small></span></label>
          </section>
        )}
        <section className="ms-sect">
          <h5 className="ms-h5">{info.members.length} üye</h5>
          {canEdit && <button type="button" className="ms-person ms-person--action" onClick={() => setAdding(true)}><span className="ms-av ms-av--action"><Icon name="userPlus" size={17} /></span><span className="ms-person__text"><strong>Üye ekle</strong></span></button>}
          {info.members.map((m) => (
            <div key={m.user_id} className="ms-person ms-person--member">
              <Avatar name={m.name} id={m.user_id} url={m.avatar} size={36} />
              <span className="ms-person__text"><strong>{m.is_me ? "Siz" : m.name}</strong><small>{m.subtitle}</small></span>
              {m.role === "admin" && <span className="ms-admin">Grup yöneticisi</span>}
              {!m.is_me && <MenuButton items={memberMenu(m)} label="Üye işlemleri" icon="chevronDown" size={14} />}
            </div>
          ))}
        </section>
        <section className="ms-sect ms-sect--actions">
          <button type="button" className="is-danger" onClick={async () => {
            if (await confirm({ title: "Gruptan çık", message: `${info.conversation?.title} grubundan çıkmak istiyor musunuz?`, danger: true, confirmLabel: "Gruptan çık" }) && result(await post(`${C}/conversations/${conv.id}/leave`, {}, { queue: false }), "Gruptan çıktınız.")) onLeft();
          }}><Icon name="logout" /> Gruptan çık</button>
        </section>
      </div>
      {adding && <AddMembersModal exclude={[...info.members.map((m) => m.user_id), meId]} onClose={() => setAdding(false)} onAdd={async (ids) => {
        const res = await request({ method: "POST", path: `${C}/conversations/${conv.id}/members`, body: { user_ids: ids }, queue: false });
        if (result(res, `${res.data?.added?.length || 0} kişi eklendi.${res.data?.skipped?.length ? ` ${res.data.skipped.length} kişi eklenemedi.` : ""}`)) { setAdding(false); load(); onChanged(); }
      }} />}
    </aside>
  );
}

export { RichText, clockTime };
