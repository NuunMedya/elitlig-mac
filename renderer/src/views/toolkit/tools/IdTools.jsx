// Kimlik ve iletişim: IBAN doğrula / biçimle (toplu), T.C. kimlik no doğrula, telefon biçimle (toplu).
import React, { useMemo } from "react";
import { Icon } from "../../../components/ui";
import { useCopy, useStored } from "../toolkitUi";
import { formatPhoneTr, validateIbans, validateTckn } from "../lib/validate";
import { ExportBar, Table } from "./common";

const Badge = ({ ok, children }) => <span className={`tt-badge ${ok ? "is-ok" : "is-bad"}`}>{ok ? "✓" : "✕"} {children}</span>;

export function IbanTool() {
  const copy = useCopy();
  const [text, setText] = useStored("tt.iban.text", "TR33 0006 1005 1978 6457 8413 26");
  const list = useMemo(() => validateIbans(text), [text]);
  const okList = list.filter((x) => x.ok);
  return (
    <div className="tt">
      <textarea className="is-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="Her satıra bir IBAN (boşluklu ya da bitişik)" aria-label="IBAN'lar" style={{ minHeight: 80 }} />
      <Table rows={[["IBAN", "Durum", "Banka / not"], ...list.map((v) => [<code key="i">{v.formatted || v.iban}</code>, <Badge key="b" ok={v.ok}>{v.ok ? "Geçerli" : "Geçersiz"}</Badge>, v.ok ? v.bank || v.country : v.error])]} />
      <div className="tt-row">
        <button type="button" className="btn btn--sm btn--primary" disabled={!okList.length} onClick={() => copy(okList.map((v) => v.formatted).join("\n"), "Biçimli IBAN kopyalandı")}><Icon name="copy" size={12} /> Geçerlileri biçimli kopyala</button>
        <button type="button" className="btn btn--sm" disabled={!okList.length} onClick={() => copy(okList.map((v) => v.iban).join("\n"), "IBAN kopyalandı")}>Bitişik kopyala</button>
        <ExportBar title="IBAN listesi" rows={() => [["IBAN", "Durum", "Banka / not"], ...list.map((v) => [v.formatted, v.ok ? "Geçerli" : "Geçersiz", v.ok ? v.bank || v.country : v.error])]} disabled={!list.length} />
      </div>
      <p className="tt-muted">ISO 13616 mod-97 kontrolü; TR'de 26 karakter ve banka kodu (5–9. haneler). Hesabın gerçekten açık olduğunu doğrulamaz.</p>
    </div>
  );
}

export function TcknTool() {
  const [text, setText] = useStored("tt.tckn.text", "10000000146");
  const rows = useMemo(() => String(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ value: l, ...validateTckn(l) })), [text]);
  return (
    <div className="tt">
      <textarea className="is-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="Her satıra bir T.C. kimlik numarası" aria-label="T.C. kimlik numaraları" style={{ minHeight: 70 }} />
      <Table rows={[["Numara", "Sonuç"], ...rows.map((r) => [<code key="c">{r.value}</code>, <Badge key="b" ok={r.ok}>{r.ok ? "Algoritmaya uygun" : r.error}</Badge>])]} />
      <p className="tt-muted">Yalnız resmî hane algoritmasını denetler (10. ve 11. hane); numaranın bir kişiye ait olduğunu göstermez. Hiçbir veri dışarı gönderilmez.</p>
    </div>
  );
}

export function PhoneTool() {
  const copy = useCopy();
  const [text, setText] = useStored("tt.phone.text", "0532 123 45 67\n+90 (212) 555 11 22\n5051234567");
  const [fmt, setFmt] = useStored("tt.phone.fmt", "intl");
  const rows = useMemo(() => String(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ input: l, ...formatPhoneTr(l) })), [text]);
  const out = rows.filter((r) => r.ok).map((r) => r[fmt]).join("\n");
  return (
    <div className="tt">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Her satıra bir numara (Excel'den yapıştırabilirsiniz)" aria-label="Telefon numaraları" style={{ minHeight: 80 }} />
      <div className="tt-row">
        <select value={fmt} onChange={(e) => setFmt(e.target.value)} aria-label="Biçim" style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="intl">+90 532 123 45 67</option><option value="national">0532 123 45 67</option><option value="e164">+905321234567</option><option value="digits">5321234567</option><option value="wa">WhatsApp bağlantısı</option>
        </select>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(out, "Numaralar kopyalandı")} disabled={!out}><Icon name="copy" size={12} /> Geçerlileri kopyala</button>
      </div>
      <Table rows={[["Girilen", "Sonuç", "Tür"], ...rows.map((r) => [r.input, r.ok ? <code key="c">{r[fmt]}</code> : <Badge key="b" ok={false}>{r.error}</Badge>, r.ok ? (r.type === "mobile" ? "Cep" : "Sabit") : ""])]} />
    </div>
  );
}
