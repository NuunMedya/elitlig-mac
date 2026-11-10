// Projeler → Teklifler / Sponsorluk / Sunumlar: ortak parçalar.
//   - useSales: projenin satış verisi (paketler, haklar, anlaşmalar, teklifler,
//     sunumlar, paylaşım bağlantıları). Çevrimdışıyken önbellekten okunur.
//   - DocPreview: sunucunun ürettiği A4 yatay sunum / teklif HTML'i; PDF olarak
//     diske kaydet (window.elitlig.pdf), yazdır, herkese açık bağlantı.
//   - SaleDialog: kabul / satıldı → kazanıldı + gelir kaydı + portföy.
import React, { useCallback, useEffect, useState } from "react";
import { Field, Icon, Modal, useToast } from "../../../components/ui";
import { del, get, request, useResource } from "../../../api";
import { AccountSelectField } from "../../../components/finance";
import { fileSafe, money } from "../../../lib/salesUtils";
import { useProjectFinance } from "../Budget";
import { FINANCE_EVENT } from "../common";

export const SALES = "/api/tools/proposals";
export const salesPath = (pid) => `${SALES}/projects/${pid}`;
/** Satış verisi değişti: açık sekmeler ve paneller yeniden okur. */
export const SALES_EVENT = "elitlig:project-sales";
export const refreshSales = () => window.dispatchEvent(new Event(SALES_EVENT));

export function useSales(pid) {
  const res = useResource(salesPath(pid));
  const { reload } = res;
  useEffect(() => {
    const fn = () => reload({ quiet: true });
    window.addEventListener(SALES_EVENT, fn);
    return () => window.removeEventListener(SALES_EVENT, fn);
  }, [reload]);
  return res;
}

let metaCache = null;
export function useSalesMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return undefined;
    let alive = true;
    get(`${SALES}/meta`).then((r) => { if (r.ok) { metaCache = r.data; if (alive) setMeta(r.data); } });
    return () => { alive = false; };
  }, []);
  return meta;
}

/** İstek: bağlantı ister (kuyruğa alınmaz). Hata ve çevrimdışı durumunu bildirir. */
export function useCall() {
  const toast = useToast();
  return useCallback(async (opts, okMessage) => {
    const r = await request({ queue: false, ...opts });
    if (!r?.ok) {
      toast(r?.offline ? "Çevrimdışısınız: bu işlem için internet bağlantısı gerekir." : r?.error?.message || "İşlem yapılamadı.", { tone: "error", timeout: 5000 });
      return null;
    }
    if (okMessage) toast(okMessage, { tone: "success" });
    return r.data || {};
  }, [toast]);
}

export const StatusPill = ({ color, children, icon }) => (
  <span className="sl-pill" style={{ "--sc": color }}>{icon && <Icon name={icon} size={11} />}{children}</span>
);

export async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
}

export function ShareRow({ share, onRevoke }) {
  const toast = useToast();
  return (
    <div className={`sl-share ${share.active ? "" : "is-off"}`}>
      <Icon name="link" size={13} />
      <input readOnly value={share.url} onFocus={(e) => e.target.select()} aria-label="Paylaşım bağlantısı" />
      <span className="muted small" title="Görüntülenme"><Icon name="eye" size={11} /> {share.view_count}</span>
      {share.active ? (
        <>
          <button type="button" className="btn btn--sm" onClick={async () => toast((await copyText(share.url)) ? "Bağlantı kopyalandı." : "Kopyalanamadı.", { tone: "success" })}><Icon name="copy" size={12} /> Kopyala</button>
          <button type="button" className="icon-btn" title="Tarayıcıda aç" onClick={() => window.elitlig.app.openExternal(share.url)}><Icon name="external" size={13} /></button>
          {onRevoke && <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => onRevoke(share)}>İptal et</button>}
        </>
      ) : <span className="small text-red">İptal edildi</span>}
    </div>
  );
}

/** Sunum / teklif önizlemesi: PDF (A4 yatay) diske, yazdır, paylaş. */
export function DocPreview({ title, path, pid, shareRef = null, shares = [], canEdit = false, onClose }) {
  const toast = useToast();
  const call = useCall();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [revoked, setRevoked] = useState(() => new Set());
  useEffect(() => {
    let alive = true;
    get(path).then((r) => { if (!alive) return; if (r.ok) setDoc({ ...r.data, offline: r.offline }); else setError(r.error?.message || "Önizleme hazırlanamadı."); });
    return () => { alive = false; };
  }, [path]);
  const pdf = async () => {
    const r = await window.elitlig.pdf(doc.html, fileSafe(doc.title || title), { landscape: true });
    if (r?.ok) toast("PDF kaydedildi.", { tone: "success", action: r.path ? { label: "Göster", run: () => window.elitlig.file?.reveal?.(r.path) } : null });
  };
  const share = async () => {
    const res = await call({ method: "POST", path: `${salesPath(pid)}/shares`, body: shareRef });
    if (!res) return;
    setCreated(res.item);
    await copyText(res.item.url);
    toast("Bağlantı oluşturuldu ve kopyalandı.", { tone: "success" });
    refreshSales();
  };
  const revoke = async (s) => {
    if (await call({ method: "DELETE", path: `${salesPath(pid)}/shares/${s.id}` }, "Bağlantı iptal edildi.")) { setRevoked((x) => new Set([...x, s.id])); refreshSales(); }
  };
  const live = [created, ...shares.filter((s) => s.active && (!created || s.id !== created.id))].filter(Boolean).map((s) => (revoked.has(s.id) ? { ...s, active: false } : s));
  return (
    <Modal title={title || doc?.title || "Önizleme"} onClose={onClose} width={1180} className="modal--tool sl-preview"
      footer={<>
        <span className="muted small spacer">{doc?.offline ? "Çevrimdışı: son kaydedilen hâli gösteriliyor." : "PDF A4 yatay olarak kaydedilir."}</span>
        {shareRef && canEdit && <button type="button" className="btn" onClick={share}><Icon name="link" size={13} /> {live.length ? "Yeni bağlantı" : "Paylaşım bağlantısı"}</button>}
        <button type="button" className="btn" disabled={!doc} onClick={() => window.elitlig.print(doc.html, doc.title)}><Icon name="printer" size={13} /> Yazdır</button>
        <button type="button" className="btn btn--primary" disabled={!doc} onClick={pdf}><Icon name="download" size={13} /> PDF olarak kaydet</button>
      </>}>
      {live.slice(0, 3).map((s) => <ShareRow key={s.id} share={s} onRevoke={canEdit ? revoke : null} />)}
      {error ? <div className="error-note"><span>{error}</span></div> : !doc ? <div className="sl-preview__frame sl-skeleton" /> : (
        <iframe className="sl-preview__frame" title={`Önizleme: ${doc.title}`} srcDoc={doc.html} sandbox="allow-same-origin" />
      )}
    </Modal>
  );
}

/** Satış onayı: kazanıldı, gelir kaydı (hesap, durum, vade), portföy. */
export function SaleDialog({ pid, title, amount, lead, confirmLabel = "Onayla", noteField = false, onConfirm, onClose }) {
  const fin = useProjectFinance(pid);
  const accounts = fin.data?.accounts || [];
  const defaultAccountId = fin.data?.default_account_id || null;
  const [winLead, setWinLead] = useState(Boolean(lead));
  const [income, setIncome] = useState(amount > 0);
  const [portfolio, setPortfolio] = useState(false);
  const [accountId, setAccountId] = useState("");
  useEffect(() => { if (defaultAccountId) setAccountId((v) => v || String(defaultAccountId)); }, [defaultAccountId]);
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await onConfirm({
      win_lead: winLead, record_income: income && amount > 0, add_portfolio: winLead && portfolio && !lead?.portfolio_id,
      ...(income ? { account_id: accountId ? Number(accountId) : null, entry_status: status, ...(status !== "paid" && dueDate ? { due_date: dueDate } : {}) } : {}),
      ...(noteField && note.trim() ? { note: note.trim() } : {}),
    });
    if (!ok) setBusy(false);
    else window.dispatchEvent(new Event(FINANCE_EVENT));
  };
  return (
    <Modal title={title} onClose={onClose} width={500} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--green" disabled={busy} onClick={submit}><Icon name="trophy" size={13} /> {busy ? "Kaydediliyor…" : confirmLabel}</button>
    </>}>
      <div className="sl-salehead"><small>Tutar</small><strong>{money(amount)}</strong>{lead && <span className="muted small">{lead.name}{lead.company ? ` · ${lead.company}` : ""}</span>}</div>
      {lead && <label className="sl-toggle"><input type="checkbox" checked={winLead} onChange={(e) => setWinLead(e.target.checked)} /> Görüşmeyi “kazanıldı” yap</label>}
      {lead && winLead && !lead.portfolio_id && <label className="sl-toggle"><input type="checkbox" checked={portfolio} onChange={(e) => setPortfolio(e.target.checked)} /> Portföye ekle</label>}
      <label className="sl-toggle"><input type="checkbox" checked={income} disabled={!(amount > 0)} onChange={(e) => setIncome(e.target.checked)} /> Gelir kaydı aç <span className="muted small">proje bütçesine ve hesaba</span></label>
      {income && (
        <div className="form-grid">
          <AccountSelectField accounts={accounts} value={accountId} onChange={setAccountId} emptyLabel="Hesap seçilmedi" hint="tahsil edilince bakiyeye işlenir" />
          <Field label="Durum">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="planned">Tahmin / planlandı</option><option value="pending">Bekliyor</option><option value="paid">Tahsil edildi</option>
            </select>
          </Field>
          {status !== "paid" && <Field label="Tahsil vadesi"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
        </div>
      )}
      {noteField && <Field label="Not (isteğe bağlı)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. sözleşme imzalandı" /></Field>}
    </Modal>
  );
}

export const removeShare = (pid, id) => del(`${salesPath(pid)}/shares/${id}`);
