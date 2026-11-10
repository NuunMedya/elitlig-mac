// Muhasebe: altı bölüm tek yerde.
//   Hesaplar ve Virman  — kasa/banka hesapları, bakiyeler, hesaplar arası aktarma
//   Ön Muhasebe         — kişisel gelir-gider defteri
//   Düzenli Ödemeler    — fatura, maaş, kira, abonelik, taksit; vadesi gelince Ön Muhasebe'ye işlenir
//   Bütçe               — kategori başına aylık limit, gerçekleşen ve kalan
//   Proje maliyetleri   — proje bazında planlanan / gerçekleşen / fark
//   Maç Muhasebesi      — il defteri (maç maç gelir/gider, personel, takımlar)
//   Türkiye Geneli      — illerden alınacak maç başı ücretler ve tahsilatlar
// Her bölüm ayrı düzenlenir; hesaplar arasında (bölümler arası da) virman yapılır.
import React, { useEffect, useMemo, useState } from "react";
import { Icon, ViewHeader } from "../../components/ui";
import { useResource } from "../../api";
import Accounts from "./Accounts";
import Personal from "./Personal";
import MatchBook from "./MatchBook";
import National from "./National";
import Recurring from "./Recurring";
import Budget from "./Budget";
import ProjectCosts from "./ProjectCosts";
import { TransferDialog, money } from "./common";

// Dışarıdan (bildirim, tepsi menüsü, komut paleti) bölüm açmak için: ledger:duzenli, ledger:butce
const ARG_SECTIONS = { duzenli: "recurring", butce: "budget" };

export default function Accounting({ arg, go }) {
  const [section, setSection] = useState(() => ARG_SECTIONS[arg] || localStorage.getItem("acc:section") || "accounts");
  useEffect(() => { if (ARG_SECTIONS[arg]) setSection(ARG_SECTIONS[arg]); }, [arg]);
  const [transfer, setTransfer] = useState(false);
  const accountsRes = useResource("/api/finance/accounts");
  const matchMeta = useResource("/api/admin/accounting/meta");
  const d = accountsRes.data;
  const accounts = useMemo(() => (d?.items || []).filter((a) => !a.archived), [d]);

  const sections = [
    { key: "accounts", label: "Hesaplar ve Virman", icon: "bank", hint: d ? money(d.totals?.all || 0, 0) : "Kasa · banka", show: true },
    { key: "personal", label: "Ön Muhasebe", icon: "receipt", hint: "Kişisel defter", show: true },
    { key: "recurring", label: "Düzenli Ödemeler", icon: "repeat", hint: "Fatura · maaş · kira", show: true },
    { key: "budget", label: "Bütçe", icon: "target", hint: "Kategori limitleri", show: true },
    { key: "projects", label: "Proje maliyetleri", icon: "layers", hint: "Planlanan · gerçekleşen · fark", show: true },
    { key: "match", label: "Maç Muhasebesi", icon: "ball", hint: matchMeta.data?.book?.cityName || "İl defteri", show: !matchMeta.error || matchMeta.error.status !== 403 },
    { key: "national", label: "Türkiye Geneli", icon: "globe", hint: "İl tahsilatları", show: Boolean(d?.access?.national?.view) },
  ].filter((s) => s.show);
  const current = sections.some((s) => s.key === section) ? section : "accounts";
  const choose = (key) => { setSection(key); try { localStorage.setItem("acc:section", key); } catch { /* yoksay */ } };
  const reloadAll = () => { accountsRes.reload({ quiet: true }); window.dispatchEvent(new Event("elitlig:refresh")); };
  const shared = { accounts, onTransfer: () => setTransfer(true), onManageAccounts: () => choose("accounts") };
  const personalBalance = d ? accounts.filter((a) => a.scope === "personal").reduce((n, a) => n + (Number(a.balance) || 0), 0) : null;

  return (
    <div className="view view--accounting">
      <ViewHeader icon="wallet" title="Muhasebe" subtitle="Hesaplar, ön muhasebe, düzenli ödemeler, bütçe, maç muhasebesi ve Türkiye geneli — ayrı ayrı yönetin, aralarında virman yapın.">
        <button type="button" className="btn btn--primary" disabled={accounts.filter((a) => a.can_manage).length < 2} onClick={() => setTransfer(true)} title={accounts.length < 2 ? "Virman için en az iki hesap açın" : ""}><Icon name="swap" /> Virman</button>
      </ViewHeader>
      <nav className="acc-tabs" aria-label="Muhasebe bölümleri">
        {sections.map((s) => (
          <button key={s.key} type="button" className={current === s.key ? "is-active" : ""} onClick={() => choose(s.key)}>
            <span className="acc-tabs__icon"><Icon name={s.icon} size={17} strokeWidth={2} /></span>
            <span><strong>{s.label}</strong><small>{s.hint}</small></span>
          </button>
        ))}
      </nav>
      {current === "accounts" && <Accounts accountsRes={accountsRes} />}
      {current === "personal" && <Personal arg={ARG_SECTIONS[arg] ? undefined : arg} {...shared} />}
      {current === "recurring" && <Recurring {...shared} startBalance={personalBalance} onBalanceChange={() => accountsRes.reload({ quiet: true })} />}
      {current === "budget" && <Budget />}
      {current === "projects" && <ProjectCosts go={go} />}
      {current === "match" && <MatchBook {...shared} cities={d?.cities || []} nationwide={Boolean(d?.access?.city?.nationwide)} />}
      {current === "national" && <National {...shared} />}
      {transfer && <TransferDialog accounts={accounts} onClose={() => setTransfer(false)} onSaved={() => { setTransfer(false); reloadAll(); }} />}
    </div>
  );
}
