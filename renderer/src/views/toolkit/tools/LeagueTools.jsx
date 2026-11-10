// Lig ve organizasyon araçları: fikstür, eleme ağacı, puan durumu, skorbord / maç sayacı, kura,
// dengeli takım, ödeme bölüştürme, kadro listesi, oylama. Mantık: ../lib/league.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Segmented } from "../../../components/ui";
import { useCopy, useStored } from "../toolkitUi";
import {
  BYE, ROSTER_FORMATS, balanceTeams, buildBracket, drawGroups, fixtureRows, formatRoster, parseNames, parsePlayers, parseResults, parseRoster,
  perPerson, pickRandom, pickWinner, roundDates, roundName, roundRobin, shuffle, splitByWeight, standings, standingsRows, tally,
} from "../lib/league";
import { ExportBar, Field, Results, Table, fmtNum, fmtTl, num } from "./common";

const SAMPLE_TEAMS = "Kartallar\nAslanlar\nKurtlar\nŞahinler\nBoğalar\nYıldızlar";

/* ------------------------------- fikstür ------------------------------- */

export function FixtureTool() {
  const [text, setText] = useStored("tt.fixture.teams", SAMPLE_TEAMS);
  const [double, setDouble] = useStored("tt.fixture.double", false);
  const [start, setStart] = useStored("tt.fixture.start", "");
  const [every, setEvery] = useStored("tt.fixture.every", 7);
  const [order, setOrder] = useState(null);
  const names = useMemo(() => parseNames(text), [text]);
  const teams = order && order.length === names.length && order.every((n) => names.includes(n)) ? order : names;
  const rounds = useMemo(() => roundRobin(teams, { double }), [teams, double]);
  const dates = start ? roundDates(start, rounds.length, Number(every) || 7) : null;
  const total = rounds.reduce((s, r) => s + r.matches.length, 0);
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label={`Takımlar (${names.length}) — her satıra bir takım ya da virgülle`}>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setOrder(null); }} aria-label="Takımlar" />
        </Field>
        <div className="tt">
          <label className="tk-check"><input type="checkbox" checked={double} onChange={(e) => setDouble(e.target.checked)} /> Rövanşlı (çift devre)</label>
          <Field label="İlk hafta tarihi (isteğe bağlı)"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Başlangıç tarihi" /></Field>
          <Field label="Haftalar arası gün"><input type="number" min="1" max="60" value={every} onChange={(e) => setEvery(e.target.value)} aria-label="Gün aralığı" /></Field>
          <button type="button" className="btn btn--sm" onClick={() => setOrder(shuffle(names))} disabled={names.length < 3}><Icon name="refresh" size={12} /> Kura ile karıştır</button>
          <p className="tt-muted">{names.length < 2 ? "En az iki takım yazın." : `${rounds.length} hafta · ${total} maç${names.length % 2 ? " · her hafta bir takım BAY" : ""}`}</p>
        </div>
      </div>
      {rounds.length > 0 && (<>
        <ExportBar title="Fikstür" rows={() => fixtureRows(rounds, { dates })} />
        <div className="tt-rounds" aria-label="Fikstür">
          {rounds.map((rd, i) => (
            <section key={rd.round} className="tt-round">
              <h5>{rd.round}. hafta {dates ? <small>{dates[i]}</small> : null}</h5>
              <ol>
                {rd.matches.map((m) => <li key={`${m.home}-${m.away}`}><span>{m.home}</span><em>–</em><span>{m.away}</span></li>)}
                {rd.bye && <li className="is-bye"><span>{rd.bye}</span><em /><span>{BYE}</span></li>}
              </ol>
            </section>
          ))}
        </div>
      </>)}
    </div>
  );
}

/* ------------------------------- eleme ağacı ------------------------------- */

export function BracketTool() {
  const [text, setText] = useStored("tt.bracket.teams", "Kartallar\nAslanlar\nKurtlar\nŞahinler\nBoğalar\nYıldızlar");
  const [seeded, setSeeded] = useStored("tt.bracket.seeded", true);
  const names = useMemo(() => parseNames(text), [text]);
  const [bracket, setBracket] = useState(() => buildBracket(names, { seeded }));
  useEffect(() => { setBracket(buildBracket(names, { seeded })); }, [names.join("|"), seeded]); // eslint-disable-line react-hooks/exhaustive-deps
  const rounds = bracket.rounds;
  const champion = rounds.length ? rounds[rounds.length - 1][0].winner : undefined;
  const label = (t) => (t === null ? BYE : t === undefined ? "…" : t);
  const rows = () => [["Tur", "Maç", "Taraf 1", "Taraf 2", "Kazanan"], ...rounds.flatMap((r, ri) => r.map((m, mi) => [roundName(ri, rounds.length), mi + 1, label(m.a), label(m.b), m.winner == null ? "" : m.winner]))];
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label={`Takımlar (${names.length}) — sıra seribaşı sırasıdır`}><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Takımlar" style={{ minHeight: 90 }} /></Field>
        <div className="tt">
          <label className="tk-check"><input type="checkbox" checked={seeded} onChange={(e) => setSeeded(e.target.checked)} /> Seribaşı yerleşimi (1 ile son sıradaki eşleşir)</label>
          <div className="tt-row">
            <button type="button" className="btn btn--sm" onClick={() => setText(shuffle(names).join("\n"))}><Icon name="refresh" size={12} /> Kura</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setBracket(buildBracket(names, { seeded }))}>Sonuçları sıfırla</button>
          </div>
          <p className="tt-muted">Kazanana tıklayın; bir üst tura geçer. BAY'lar en üst seribaşlarına verilir.</p>
          {champion ? <p className="tt-champion"><Icon name="trophy" size={16} /> Şampiyon: {champion}</p> : null}
        </div>
      </div>
      {rounds.length > 0 && (<>
        <ExportBar title="Eleme ağacı" rows={rows} />
        <div className="tt-bracket" aria-label="Eleme ağacı">
          {rounds.map((r, ri) => (
            <div key={ri} className="tt-bracket__col">
              <h5>{roundName(ri, rounds.length)}</h5>
              {r.map((m, mi) => (
                <div key={mi} className="tt-match">
                  {["a", "b"].map((side) => (
                    <button key={side} type="button" disabled={m[side] == null} className={m.winner != null && m.winner === m[side] ? "is-win" : ""} onClick={() => setBracket((b) => pickWinner(b, ri, mi, m[side]))}>{label(m[side])}</button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

/* ------------------------------- puan durumu ------------------------------- */

export function StandingsTool() {
  const [text, setText] = useStored("tt.standings.results", "Kartallar 2-1 Aslanlar\nKurtlar 0-0 Şahinler\nAslanlar 3-1 Kurtlar\nŞahinler 1-2 Kartallar");
  const [teamsText, setTeamsText] = useStored("tt.standings.teams", "");
  const [pts, setPts] = useStored("tt.standings.points", { win: 3, draw: 1, loss: 0 });
  const [promote, setPromote] = useStored("tt.standings.promote", 1);
  const [relegate, setRelegate] = useStored("tt.standings.relegate", 0);
  const { results, errors } = useMemo(() => parseResults(text), [text]);
  const table = useMemo(() => standings(results, { teams: parseNames(teamsText), points: pts }), [results, teamsText, pts]);
  const view = [["#", "Takım", "O", "G", "B", "M", "AG", "YG", "AV", "P", "Form"], ...table.map((r) => [r.rank, r.team, r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd > 0 ? `+${r.gd}` : r.gd, <strong key="p">{r.pts}</strong>, r.form.join(" ")])];
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label={`Sonuçlar (${results.length} maç) — "Ev 2-1 Deplasman"`} hint="Excel'den yapıştırırken sütunlar: Ev · Gol · Gol · Deplasman"><textarea className="is-mono" value={text} onChange={(e) => setText(e.target.value)} aria-label="Sonuçlar" /></Field>
        <div className="tt">
          <Field label="Henüz oynamamış takımlar (isteğe bağlı)"><input value={teamsText} onChange={(e) => setTeamsText(e.target.value)} placeholder="Boğalar, Yıldızlar" /></Field>
          <div className="tt-cols3">
            <Field label="Galibiyet"><input type="number" value={pts.win} onChange={(e) => setPts({ ...pts, win: Number(e.target.value) || 0 })} aria-label="Galibiyet puanı" /></Field>
            <Field label="Beraberlik"><input type="number" value={pts.draw} onChange={(e) => setPts({ ...pts, draw: Number(e.target.value) || 0 })} aria-label="Beraberlik puanı" /></Field>
            <Field label="Mağlubiyet"><input type="number" value={pts.loss} onChange={(e) => setPts({ ...pts, loss: Number(e.target.value) || 0 })} aria-label="Mağlubiyet puanı" /></Field>
          </div>
          <div className="tt-cols3">
            <Field label="Üst sıra (yeşil)"><input type="number" min="0" value={promote} onChange={(e) => setPromote(Number(e.target.value) || 0)} /></Field>
            <Field label="Alt sıra (kırmızı)"><input type="number" min="0" value={relegate} onChange={(e) => setRelegate(Number(e.target.value) || 0)} /></Field>
          </div>
          {errors.length > 0 && <p className="tt-warn">Okunamayan satır: {errors.map((e) => `${e.line}. “${e.text}”`).join(", ")}</p>}
        </div>
      </div>
      <ExportBar title="Puan durumu" rows={() => standingsRows(table)} disabled={!table.length} />
      <Table rows={view} highlight={(r, i) => (i < promote ? "is-top" : i >= table.length - relegate ? "is-bottom" : "")} />
      <p className="tt-muted">Sıralama: puan → averaj → atılan gol → aralarındaki maç → ad.</p>
    </div>
  );
}

/* ------------------------------- skorbord / maç sayacı ------------------------------- */

const clockText = (sec) => `${String(Math.floor(Math.abs(sec) / 60)).padStart(2, "0")}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, "0")}`;

export function ScoreboardTool() {
  const [cfg, setCfg] = useStored("tt.board.cfg", { home: "Ev sahibi", away: "Deplasman", periodMin: 25, periods: 2, countDown: false });
  const [score, setScore] = useStored("tt.board.score", { home: 0, away: 0, period: 1 });
  const [run, setRun] = useState({ running: false, startedAt: 0, base: 0 });
  const [now, setNow] = useState(Date.now());
  const boardRef = useRef(null);
  useEffect(() => { if (!run.running) return undefined; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [run.running]);
  const elapsed = run.base + (run.running ? (now - run.startedAt) / 1000 : 0);
  const periodSec = (Number(cfg.periodMin) || 1) * 60;
  const shown = cfg.countDown ? periodSec - elapsed : elapsed;
  const over = elapsed >= periodSec;
  const extra = over ? Math.floor((elapsed - periodSec) / 60) + 1 : 0;
  const toggle = () => setRun((r) => (r.running ? { running: false, startedAt: 0, base: r.base + (Date.now() - r.startedAt) / 1000 } : { running: true, startedAt: Date.now(), base: r.base }));
  const nextPeriod = () => { setRun({ running: false, startedAt: 0, base: 0 }); setScore((s) => ({ ...s, period: Math.min(Number(cfg.periods) || 2, s.period + 1) })); };
  const reset = () => { setRun({ running: false, startedAt: 0, base: 0 }); setScore({ home: 0, away: 0, period: 1 }); };
  const goal = (side, d) => setScore((s) => ({ ...s, [side]: Math.max(0, s[side] + d) }));
  const full = () => { const el = boardRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };
  useEffect(() => {
    const onKey = (e) => {
      if (!boardRef.current?.isConnected || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      if (e.key === " " && document.fullscreenElement === boardRef.current) { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const periodLabel = Number(cfg.periods) === 2 ? (score.period === 1 ? "1. devre" : "2. devre") : `${score.period}. periyot`;
  return (
    <div className="tt">
      <div className="tt-board" ref={boardRef} aria-label="Skorbord">
        <div className="tt-board__teams">
          {["home", "away"].map((side, i) => (
            <React.Fragment key={side}>
              {i === 1 && <div className="tt-board__score" aria-hidden="true">:</div>}
              <div className="tt-board__team">
                <input value={cfg[side]} onChange={(e) => setCfg({ ...cfg, [side]: e.target.value })} aria-label={side === "home" ? "Ev sahibi" : "Deplasman"} />
                <div className="tt-board__score" aria-label={`${cfg[side]} skoru`}>{score[side]}</div>
                <div className="tt-board__btns"><button type="button" onClick={() => goal(side, -1)} aria-label={`${cfg[side]} gol geri al`}>−</button><button type="button" onClick={() => goal(side, 1)} aria-label={`${cfg[side]} gol`}>+</button></div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className={`tt-board__clock${over ? " is-over" : ""}`} aria-label="Süre">{cfg.countDown && over ? `+${clockText(elapsed - periodSec)}` : clockText(shown)}</div>
        <div className="tt-board__period">{periodLabel}{over ? ` · uzatma +${extra}` : ""}</div>
        <div className="tt-board__ctl">
          <button type="button" className="btn btn--sm btn--primary" onClick={toggle}><Icon name={run.running ? "pause" : "play"} size={12} /> {run.running ? "Durdur" : elapsed ? "Devam" : "Başlat"}</button>
          <button type="button" className="btn btn--sm" onClick={nextPeriod} disabled={score.period >= (Number(cfg.periods) || 2)}>Sonraki devre</button>
          <button type="button" className="btn btn--sm" onClick={reset}>Sıfırla</button>
          <button type="button" className="btn btn--sm" onClick={full}><Icon name="monitor" size={12} /> Tam ekran</button>
        </div>
      </div>
      <div className="tt-cols3">
        <Field label="Devre süresi (dk)"><input type="number" min="1" max="120" value={cfg.periodMin} onChange={(e) => setCfg({ ...cfg, periodMin: e.target.value })} aria-label="Devre süresi" /></Field>
        <Field label="Devre sayısı"><input type="number" min="1" max="8" value={cfg.periods} onChange={(e) => setCfg({ ...cfg, periods: e.target.value })} aria-label="Devre sayısı" /></Field>
        <label className="tk-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={cfg.countDown} onChange={(e) => setCfg({ ...cfg, countDown: e.target.checked })} /> Geri say</label>
      </div>
      <p className="tt-muted">Tam ekranda Boşluk: başlat / durdur. Süre dolunca uzatma dakikası sarıyla gösterilir.</p>
    </div>
  );
}

/* ------------------------------- kura / rastgele seçici ------------------------------- */

export function DrawTool() {
  const copy = useCopy();
  const [text, setText] = useStored("tt.draw.names", "Ahmet\nMehmet\nAli\nAyşe\nZeynep\nCan\nDeniz\nEce");
  const [mode, setMode] = useStored("tt.draw.mode", "pick");
  const [count, setCount] = useStored("tt.draw.count", 1);
  const [groups, setGroups] = useStored("tt.draw.groups", 2);
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(null);
  const names = useMemo(() => parseNames(text), [text]);
  const run = () => {
    if (names.length < 2) return;
    let ticks = 0;
    const t = setInterval(() => {
      ticks += 1;
      setRolling(names[Math.floor(Math.random() * names.length)]);
      if (ticks >= 10) {
        clearInterval(t);
        setRolling(null);
        if (mode === "pick") setResult({ kind: "pick", items: pickRandom(names, Number(count) || 1) });
        else if (mode === "order") setResult({ kind: "order", items: shuffle(names) });
        else setResult({ kind: "groups", groups: drawGroups(names, Number(groups) || 2) });
      }
    }, 60);
  };
  const asText = () => (!result ? "" : result.kind === "groups" ? result.groups.map((g, i) => `${String.fromCharCode(65 + i)} grubu: ${g.join(", ")}`).join("\n") : result.items.map((n, i) => `${i + 1}. ${n}`).join("\n"));
  return (
    <div className="tt">
      <Segmented value={mode} onChange={(v) => { setMode(v); setResult(null); }} size="sm" ariaLabel="Kura türü" options={[{ value: "pick", label: "Kişi seç" }, { value: "order", label: "Sırala" }, { value: "groups", label: "Gruplara böl" }]} />
      <div className="tt-cols">
        <Field label={`İsimler (${names.length})`}><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="İsimler" /></Field>
        <div className="tt">
          {mode === "pick" && <Field label="Kaç kişi?"><input type="number" min="1" max={names.length || 1} value={count} onChange={(e) => setCount(e.target.value)} aria-label="Seçilecek kişi" /></Field>}
          {mode === "groups" && <Field label="Grup sayısı"><input type="number" min="2" max={Math.max(2, names.length)} value={groups} onChange={(e) => setGroups(e.target.value)} aria-label="Grup sayısı" /></Field>}
          <button type="button" className="btn btn--primary" onClick={run} disabled={names.length < 2 || !!rolling}><Icon name="sparkles" size={14} /> Kurayı çek</button>
          {result && <button type="button" className="btn btn--sm" onClick={() => copy(asText(), "Kura sonucu kopyalandı")}><Icon name="copy" size={12} /> Sonucu kopyala</button>}
        </div>
      </div>
      {rolling && <div className="tt-pick" aria-live="polite">{rolling}</div>}
      {!rolling && result?.kind === "pick" && <div className="tt-pick" aria-live="polite" data-testid="draw-result">{result.items.join(" · ")}</div>}
      {!rolling && result?.kind === "order" && <ol className="tt-group" data-testid="draw-result">{result.items.map((n) => <li key={n}>{n}</li>)}</ol>}
      {!rolling && result?.kind === "groups" && (
        <div className="tt-groups" data-testid="draw-result">
          {result.groups.map((g, i) => <section key={i} className="tt-group"><h5>{String.fromCharCode(65 + i)} grubu <small>{g.length}</small></h5><ol>{g.map((n) => <li key={n}>{n}</li>)}</ol></section>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- dengeli takımlar ------------------------------- */

export function TeamsTool() {
  const copy = useCopy();
  const [text, setText] = useStored("tt.teams.players", "Ali 8\nVeli 6\nCan 9\nDeniz 5\nEmre 7\nFatih 4\nGökhan 6\nHakan 7\nİlker 5\nKemal 8");
  const [k, setK] = useStored("tt.teams.count", 2);
  const [seed, setSeed] = useState(0);
  const players = useMemo(() => parsePlayers(text), [text]);
  const teams = useMemo(() => (players.length >= 2 ? balanceTeams(players, Number(k) || 2) : []), [players, k, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const spread = teams.length ? Math.max(...teams.map((t) => t.total)) - Math.min(...teams.map((t) => t.total)) : 0;
  const asText = teams.map((t) => `${t.name} (${fmtNum(t.total)}): ${t.players.map((p) => p.name).join(", ")}`).join("\n");
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label={`Oyuncular (${players.length}) — "Ad güç" (güç yoksa 5)`}><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Oyuncular" /></Field>
        <div className="tt">
          <Field label="Takım sayısı"><input type="number" min="2" max="12" value={k} onChange={(e) => setK(e.target.value)} aria-label="Takım sayısı" /></Field>
          <div className="tt-row">
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setSeed((s) => s + 1)}><Icon name="refresh" size={12} /> Yeniden böl</button>
            <button type="button" className="btn btn--sm" onClick={() => copy(asText, "Takımlar kopyalandı")} disabled={!teams.length}><Icon name="copy" size={12} /> Kopyala</button>
          </div>
          {teams.length > 0 && <p className="tt-muted">Güç farkı: {fmtNum(spread)} (her basışta farklı ama dengeli dağılım)</p>}
        </div>
      </div>
      <div className="tt-groups" data-testid="teams-result">
        {teams.map((t) => <section key={t.name} className="tt-group"><h5>{t.name} <small>Σ {fmtNum(t.total)}</small></h5><ol>{t.players.map((p) => <li key={p.name}>{p.name} <span className="tt-muted">{fmtNum(p.rating)}</span></li>)}</ol></section>)}
      </div>
    </div>
  );
}

/* ------------------------------- ödeme bölüştürme ------------------------------- */

export function SplitTool() {
  const copy = useCopy();
  const [mode, setMode] = useStored("tt.split.mode", "weights");
  const [total, setTotal] = useStored("tt.split.total", "7500");
  const [rows, setRows] = useStored("tt.split.rows", [{ name: "Orta hakem", weight: 3 }, { name: "Yardımcı hakem 1", weight: 2 }, { name: "Yardımcı hakem 2", weight: 2 }, { name: "Gözlemci", weight: 1 }]);
  const [people, setPeople] = useStored("tt.split.people", 14);
  const [round, setRound] = useStored("tt.split.round", 0.01);
  const [roundUp, setRoundUp] = useStored("tt.split.roundUp", 10);
  const res = useMemo(() => splitByWeight(num(total), rows, { round: Number(round) }), [total, rows, round]);
  const pp = perPerson(num(total), people, Number(roundUp));
  const valid = (r) => r.name && Number(r.weight) > 0;
  const shareOf = (i) => (valid(rows[i]) ? res.items[rows.slice(0, i).filter(valid).length]?.share ?? 0 : 0);
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const exportRows = () => [["Kişi", "Pay (ağırlık)", "Tutar (₺)"], ...res.items.map((r) => [r.name, r.weight, r.share.toFixed(2).replace(".", ",")]), ["Toplam", rows.reduce((s, r) => s + (Number(r.weight) || 0), 0), num(total).toFixed(2).replace(".", ",")]];
  return (
    <div className="tt">
      <Segmented value={mode} onChange={setMode} size="sm" ariaLabel="Bölüştürme" options={[{ value: "weights", label: "Paylara göre (hakem, görevli)" }, { value: "people", label: "Kişi başı (saha, bütçe)" }]} />
      <Field label="Toplam tutar (₺)"><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} aria-label="Toplam tutar" /></Field>
      {mode === "people" ? (<>
        <div className="tt-cols3">
          <Field label="Kişi sayısı"><input type="number" min="1" value={people} onChange={(e) => setPeople(e.target.value)} aria-label="Kişi sayısı" /></Field>
          <Field label="Yukarı yuvarla">
            <select value={roundUp} onChange={(e) => setRoundUp(Number(e.target.value))} aria-label="Yuvarlama"><option value={0}>Kuruşa</option><option value={1}>1 ₺</option><option value={5}>5 ₺</option><option value={10}>10 ₺</option><option value={50}>50 ₺</option></select>
          </Field>
        </div>
        {pp && <Results onCopy={copy} items={[{ label: "Kişi başı", value: fmtTl(pp.each), copy: pp.each, strong: true }, { label: "Tam bölüm", value: fmtTl(pp.exact) }, { label: "Toplanan", value: fmtTl(pp.collected) }, { label: "Artan (kasa)", value: fmtTl(pp.surplus) }]} />}
      </>) : (<>
        <div className="tt-table-edit">
          <Table rows={[["Kişi / görev", "Pay", "Tutar", ""], ...rows.map((r, i) => [
            <input key="n" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} aria-label={`${i + 1}. kişi`} />,
            <input key="w" type="number" min="0" step="0.5" value={r.weight} onChange={(e) => setRow(i, { weight: e.target.value })} aria-label={`${i + 1}. pay`} style={{ width: 70 }} />,
            <strong key="s">{fmtTl(shareOf(i))}</strong>,
            <button key="x" type="button" className="icon-btn icon-btn--xs" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Satırı sil"><Icon name="x" size={12} /></button>,
          ])]} />
        </div>
        <div className="tt-row">
          <button type="button" className="btn btn--sm" onClick={() => setRows([...rows, { name: `Kişi ${rows.length + 1}`, weight: 1 }])}><Icon name="plus" size={12} /> Satır ekle</button>
          <select value={round} onChange={(e) => setRound(Number(e.target.value))} aria-label="Yuvarlama" style={{ flex: "0 0 auto", width: "auto" }}><option value={0.01}>Kuruşa (toplam tam)</option><option value={1}>1 ₺'ye</option><option value={10}>10 ₺'ye</option></select>
          <span className="tt-muted">Bir pay = {fmtTl(res.perUnit)}{res.diff ? ` · yuvarlama farkı ${fmtTl(res.diff)}` : ""}</span>
        </div>
        <ExportBar title="Ödeme dağılımı" rows={exportRows} />
      </>)}
    </div>
  );
}

/* ------------------------------- kadro listesi ------------------------------- */

export function RosterTool() {
  const copy = useCopy();
  const [text, setText] = useStored("tt.roster.text", "1 Emre Kaya\n10 ahmet yılmaz (K)\nMehmet Demir 7\n4 - Can Öztürk; Defans\nBurak Şahin 23");
  const [format, setFormat] = useStored("tt.roster.format", "list");
  const [sort, setSort] = useStored("tt.roster.sort", "no");
  const parsed = useMemo(() => parseRoster(text), [text]);
  const out = useMemo(() => formatRoster(parsed.players, { format, sort }), [parsed, format, sort]);
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label={`Kadro (${parsed.players.length} oyuncu) — numara önde ya da sonda, (K) kaptan`}><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Kadro" /></Field>
        <div className="tt">
          <Field label="Biçim"><select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Biçim">{ROSTER_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
          <Field label="Sıralama"><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama"><option value="no">Forma numarası</option><option value="name">Ad</option><option value="none">Girildiği gibi</option></select></Field>
          {parsed.duplicates.length > 0 && <p className="tt-warn">Aynı forma numarası: {parsed.duplicates.join(", ")}</p>}
          {parsed.missing.length > 0 && <p className="tt-warn">Numarası olmayan: {parsed.missing.join(", ")}</p>}
        </div>
      </div>
      <Field label="Sonuç"><textarea readOnly value={out} className="is-mono" aria-label="Biçimlenmiş kadro" /></Field>
      <div className="tt-row">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(out, "Kadro kopyalandı")}><Icon name="copy" size={12} /> Kopyala</button>
        <ExportBar title="Kadro" rows={() => [["No", "Ad Soyad", "Görev", "Kaptan"], ...parsed.players.map((p) => [p.no ?? "", p.name, p.role, p.captain ? "K" : ""])]} />
      </div>
    </div>
  );
}

/* ------------------------------- oylama sayacı ------------------------------- */

export function PollTool() {
  const copy = useCopy();
  const [title, setTitle] = useStored("tt.poll.title", "Haftanın oyuncusu");
  const [options, setOptions] = useStored("tt.poll.options", [{ label: "Seçenek A", votes: 0 }, { label: "Seçenek B", votes: 0 }, { label: "Seçenek C", votes: 0 }]);
  const t = tally(options);
  const vote = (i, d) => setOptions(options.map((o, j) => (j === i ? { ...o, votes: Math.max(0, (Number(o.votes) || 0) + d) } : o)));
  const summary = `${title}\n${t.rows.map((r) => `${r.label}: ${r.votes} oy (%${fmtNum(r.pct, 1)})`).join("\n")}\nToplam: ${t.total}`;
  return (
    <div className="tt">
      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Oylama başlığı" style={{ fontWeight: 700 }} />
      <div className="tt-poll">
        {t.rows.map((o, i) => (
          <div key={i} className="tt-poll__row">
            <button type="button" className={`tt-poll__bar${o.leader ? " is-lead" : ""}`} onClick={() => vote(i, 1)} title="Tıkla: +1 oy" aria-label={`${o.label}: oy ver`}>
              <i style={{ width: `${o.pct}%` }} /><span>{o.label}</span><b>{o.votes} · %{fmtNum(o.pct, 1)}</b>
            </button>
            <span className="tt-row">
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => vote(i, -1)} aria-label={`${o.label}: oy geri al`}>−</button>
              <input value={o.label} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`${i + 1}. seçenek adı`} style={{ width: 120 }} />
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Seçeneği sil"><Icon name="x" size={12} /></button>
            </span>
          </div>
        ))}
      </div>
      <div className="tt-row">
        <button type="button" className="btn btn--sm" onClick={() => setOptions([...options, { label: `Seçenek ${String.fromCharCode(65 + options.length)}`, votes: 0 }])}><Icon name="plus" size={12} /> Seçenek</button>
        <button type="button" className="btn btn--sm" onClick={() => setOptions(options.map((o) => ({ ...o, votes: 0 })))}>Oyları sıfırla</button>
        <button type="button" className="btn btn--sm" onClick={() => copy(summary, "Sonuç kopyalandı")}><Icon name="copy" size={12} /> Sonucu kopyala</button>
        <span className="tt-muted">Toplam {t.total} oy</span>
      </div>
    </div>
  );
}
