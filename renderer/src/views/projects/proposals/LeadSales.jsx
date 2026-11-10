// Kişi panelinde: Teklif hazırla / Şablonla e-posta / Sunum gönder ve kişinin
// teklifleri; kişi listesinde çoklu seçim çubuğu (toplu e-posta, teklif).
import React, { useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import { DEAL_STATUS, PROPOSAL_STATUS, isValidEmail, money } from "../../../lib/salesUtils";
import { StatusPill, useSales } from "./salesCommon";
import ProposalEditor from "./ProposalEditor";
import MailComposer from "./MailComposer";
import "./proposals.css";

export function LeadSalesActions({ ctx, lead }) {
  const toast = useToast();
  const { data: sales } = useSales(ctx.project.id);
  const [proposal, setProposal] = useState(null);
  const [mail, setMail] = useState(null);
  const proposals = (sales?.proposals || []).filter((p) => Number(p.lead_id) === Number(lead.id));
  const deals = (sales?.deals || []).filter((d) => Number(d.lead_id) === Number(lead.id) && !proposals.some((p) => p.id === d.proposal_id));
  const presentation = sales?.presentations?.[0] || null;
  const noMail = !lead.email;
  return (
    <section className="drawer__section sl-leadsales" aria-label="Teklif ve e-posta">
      {ctx.canEdit && (
        <div className="sl-leadsales__acts">
          <button type="button" className="sl-bigbtn" onClick={() => setProposal({ new: true })}><Icon name="file" size={14} /> Teklif hazırla</button>
          <button type="button" className="sl-bigbtn" disabled={noMail} title={noMail ? "Kişinin e-posta adresi yok" : ""} onClick={() => setMail({ templateKey: "toplanti_talebi" })}><Icon name="mail" size={14} /> Şablonla e-posta</button>
          <button type="button" className="sl-bigbtn" disabled={noMail} title={noMail ? "Kişinin e-posta adresi yok" : ""} onClick={() => (presentation ? setMail({ templateKey: "sponsorluk_davet", presentationId: presentation.id }) : toast("Önce Sponsorluk sekmesinden bir sunum oluşturun.", { tone: "warn" }))}><Icon name="image" size={14} /> Sunum gönder</button>
        </div>
      )}
      {(proposals.length > 0 || deals.length > 0) && (
        <ul className="sl-leadsales__list">
          {proposals.map((p) => <li key={`p${p.id}`}><button type="button" onClick={() => setProposal({ id: p.id })}><Icon name="file" size={12} /><span><b>{p.display_number}</b> · {p.title}</span><span>{money(p.total, { round: true })}</span><StatusPill color={PROPOSAL_STATUS[p.status].color}>{PROPOSAL_STATUS[p.status].label}</StatusPill></button></li>)}
          {deals.map((d) => <li key={`d${d.id}`} className="is-deal"><span><Icon name="award" size={12} /><span>{d.package_name}</span><span>{money(d.price, { round: true })}</span><StatusPill color={DEAL_STATUS[d.status].color}>{DEAL_STATUS[d.status].label}</StatusPill></span></li>)}
        </ul>
      )}
      {proposal && <ProposalEditor ctx={ctx} proposalId={proposal.id || null} leadIds={proposal.new ? [lead.id] : []} onClose={() => setProposal(null)} />}
      {mail && <MailComposer ctx={ctx} leadIds={[lead.id]} presentationId={mail.presentationId || null} templateKey={mail.templateKey} onClose={() => setMail(null)} />}
    </section>
  );
}

/** Kişi tablosunda çoklu seçim çubuğu. */
export function LeadBulkBar({ ctx, visible, selected, setSelected, onExit }) {
  const [mail, setMail] = useState(false);
  const [proposal, setProposal] = useState(false);
  const ids = [...selected];
  const withEmail = visible.filter((l) => isValidEmail(l.email));
  const allOn = visible.length > 0 && visible.every((l) => selected.has(l.id));
  return (
    <>
    <div className="sl-selectbar" role="region" aria-label="Seçili kişiler">
      <strong>{selected.size} kişi seçildi</strong>
      <button type="button" className="btn btn--sm btn--glass" onClick={() => setSelected(new Set(allOn ? [] : visible.map((l) => l.id)))}>{allOn ? "Seçimi temizle" : `Listedekilerin tümü (${visible.length})`}</button>
      {withEmail.length > 0 && withEmail.length !== visible.length && <button type="button" className="btn btn--sm btn--glass" onClick={() => setSelected(new Set(withEmail.map((l) => l.id)))}>E-postası olanlar ({withEmail.length})</button>}
      <span className="spacer" />
      {ctx.canEdit && <button type="button" className="btn btn--sm" disabled={!selected.size} onClick={() => setMail(true)}><Icon name="mail" size={12} /> Toplu e-posta</button>}
      {ctx.canEdit && <button type="button" className="btn btn--sm" disabled={!selected.size} onClick={() => setProposal(true)}><Icon name="file" size={12} /> Teklif hazırla</button>}
      <button type="button" className="icon-btn sl-selectbar__x" onClick={onExit} aria-label="Seçimden çık"><Icon name="x" size={13} /></button>
    </div>
    {mail && <MailComposer ctx={ctx} leadIds={ids} templateKey="sponsorluk_davet" onClose={() => setMail(false)} />}
    {proposal && <ProposalEditor ctx={ctx} leadIds={ids} onClose={() => setProposal(false)} />}
    </>
  );
}
