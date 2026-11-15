// Komut satırı sonucu kartı (birleşik menü araması ve panel #toolkit ortak).
import React from "react";
import { Icon, Kbd, useToast } from "../../../components/ui";
import { TOOL_BY_KEY } from "./catalog";
import "./hub.css";

export default function CommandCard({ cmd, go, compact = false, onCopy }) {
  const toast = useToast();
  const copy = async () => { if (!cmd.copy) return; try { await navigator.clipboard.writeText(String(cmd.copy)); toast("Kopyalandı.", { tone: "success", timeout: 1400 }); } catch { /* yoksay */ } onCopy?.(); };
  const tool = cmd.tool && TOOL_BY_KEY.get(cmd.tool);
  return (
    <section className={`hub-cmd${cmd.error ? " is-error" : ""}${compact ? " is-compact" : ""}`} aria-label="Hızlı sonuç" data-testid="command-result">
      <header><Icon name="zap" size={14} /><strong>{cmd.title}</strong></header>
      <dl>{cmd.lines.map((l) => <React.Fragment key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></React.Fragment>)}</dl>
      <div className="hub-cmd__acts">
        {cmd.copy && <button type="button" className="btn btn--sm btn--primary" onClick={copy}><Icon name="copy" size={12} /> Kopyala <Kbd>↩</Kbd></button>}
        {tool && go && <button type="button" className="btn btn--sm" onClick={() => go(`toolkit:${tool.key}`)}><Icon name={tool.icon} size={12} /> {tool.title}</button>}
      </div>
    </section>
  );
}

