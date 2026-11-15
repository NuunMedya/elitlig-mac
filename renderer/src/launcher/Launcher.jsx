// Hızlı geçiş penceresi (#launcher, varsayılan ⌃⌥O): Spotlight benzeri küçük pencere.
// Araç adı yaz → Enter: uygulamada o görünüm açılır. "Yeni …" eylemleri Hızlı kayıt penceresini
// (⌃⌥N) ilgili türle açar. 2+ harfte görev, not, kişi, proje, sohbet… araması (komut paletiyle
// aynı mantık: lib/paletteSearch.js). Ana süreç: app/launcher.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { get } from "../api";
import { includesTr } from "../lib/helpers";
import { loadSearchSources, searchSources } from "../lib/paletteSearch";
import { rankTools } from "./launcherModel";
import "./launcher.css";

const W = () => window.elitlig;
const keyLabel = (acc, mac) => String(acc || "").replace("Control", mac ? "⌃" : "Ctrl").replace("Alt", mac ? "⌥" : "Alt").replace("Shift", mac ? "⇧" : "Shift").replace("CommandOrControl", mac ? "⌘" : "Ctrl").replace(/\+/g, mac ? "" : "+");

export default function Launcher() {
  const [st, setSt] = useState(null);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [signed, setSigned] = useState(false);
  const [content, setContent] = useState([]);
  const sources = useRef(null);
  const loadedAt = useRef(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const mac = (W().platform || "darwin") === "darwin";

  const loadSources = useCallback(async (force = false) => {
    const auth = await W().auth.state().catch(() => null);
    setSigned(Boolean(auth?.signedIn));
    if (!auth?.signedIn) { sources.current = null; return; }
    if (!force && sources.current && Date.now() - loadedAt.current < 60000) return;
    sources.current = await loadSearchSources(get);
    loadedAt.current = Date.now();
    setContent((c) => [...c]);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.window = "launcher";
    W().launcher.state().then(setSt);
    loadSources(true);
    const off = W().launcher.onOpen((p) => {
      setQ(p?.query || "");
      setIndex(0);
      W().launcher.state().then(setSt);
      loadSources();
      setTimeout(() => inputRef.current?.focus(), 20);
    });
    const offAuth = W().auth.onChange(() => loadSources(true));
    return () => { off(); offAuth(); };
  }, [loadSources]);

  useEffect(() => { setContent(searchSources(sources.current, q)); setIndex(0); }, [q]);

  const items = useMemo(() => {
    if (!st) return [];
    const tools = rankTools(st.tools, q).map((t) => ({ kind: "tool", id: `t:${t.key}`, label: t.label, icon: t.icon, hint: t.group, run: () => W().launcher.open(t.key), group: "Araçlar" }));
    const actions = st.actions.filter((a) => !q.trim() || includesTr(`${a.label} yeni kayıt ekle`, q)).map((a) => ({ kind: "action", id: `a:${a.id}`, label: a.label, icon: a.icon, hint: "Yeni kayıt", run: () => W().launcher.action(a.id), group: "Yeni kayıt" }));
    const results = content.map((c, i) => ({ kind: "result", id: `r:${i}`, label: c.label, icon: c.icon, hint: c.hint, run: () => W().launcher.open(c.route, c.arg || null), group: "Kayıtlar" }));
    return q.trim() ? [...tools, ...results, ...actions] : [...tools, ...actions];
  }, [st, q, content]);

  useEffect(() => { listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" }); }, [index]);

  const run = (it) => { if (!it) return; setQ(""); it.run(); };
  const cols = !q.trim() ? 5 : 1;
  const onKey = (e) => {
    const last = items.length - 1;
    const step = (n) => { e.preventDefault(); setIndex((i) => Math.max(0, Math.min(last, i + n))); };
    if (e.key === "ArrowDown") step(cols);
    else if (e.key === "ArrowUp") step(-cols);
    else if (e.key === "ArrowRight" && cols > 1 && !q) step(1);
    else if (e.key === "ArrowLeft" && cols > 1 && !q) step(-1);
    else if (e.key === "Tab") { e.preventDefault(); setIndex((i) => (e.shiftKey ? (i <= 0 ? last : i - 1) : i >= last ? 0 : i + 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[index]); }
    else if (e.key === "Escape") { e.preventDefault(); if (q) setQ(""); else W().launcher.hide(); }
  };

  const groups = [];
  items.forEach((it, i) => {
    const g = groups.find((x) => x.name === it.group) || (groups.push({ name: it.group, items: [] }), groups[groups.length - 1]);
    g.items.push({ ...it, i });
  });

  return (
    <div className="ln" onKeyDown={onKey}>
      <div className="ln__bar">
        <Icon name="search" size={18} />
        <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Araç aç ya da ara: projeler, gider, kişi adı…" aria-label="Hızlı geçiş araması" spellCheck={false}
          role="combobox" aria-expanded="true" aria-controls="ln-list" aria-activedescendant={items[index] ? `ln-opt-${index}` : undefined} />
        {st?.shortcut && <kbd className="ln__kbd">{keyLabel(st.shortcut, mac)}</kbd>}
      </div>
      <div className="ln__list" id="ln-list" ref={listRef} role="listbox" aria-label="Sonuçlar">
        {groups.map((g) => (
          <section key={g.name} className={`ln__group${g.name === "Araçlar" && !q.trim() ? " is-grid" : ""}`}>
            <h6>{g.name}</h6>
            <div className="ln__items">
              {g.items.map((it) => (
                <button key={it.id} id={`ln-opt-${it.i}`} data-index={it.i} data-kind={it.kind} type="button" role="option" aria-selected={it.i === index}
                  className={`ln__item${it.i === index ? " is-active" : ""}`} onMouseMove={() => it.i !== index && setIndex(it.i)} onClick={() => run(it)}>
                  <span className="ln__ic"><Icon name={it.icon || "circle"} size={g.name === "Araçlar" && !q.trim() ? 20 : 15} /></span>
                  <span className="ln__label">{it.label}</span>
                  {it.hint && <small>{it.hint}</small>}
                </button>
              ))}
            </div>
          </section>
        ))}
        {q.trim().length >= 2 && signed && !content.length && <p className="ln__muted">Kayıtlarda “{q}” bulunamadı.</p>}
        {!signed && q.trim().length >= 2 && <p className="ln__muted">Kayıt araması için uygulamada oturum açın.</p>}
      </div>
      <footer className="ln__foot">
        <span><kbd>↵</kbd> aç</span><span><kbd>↑↓</kbd> seç</span><span><kbd>esc</kbd> kapat</span>
        <span className="ln__grow" />
        {st?.quickShortcut && <span>Hızlı kayıt <kbd>{keyLabel(st.quickShortcut, mac)}</kbd></span>}
      </footer>
    </div>
  );
}
