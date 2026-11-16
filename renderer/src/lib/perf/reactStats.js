// ARAYÜZ ÖLÇÜMÜ (2.35.0): React çizim sayacı + etkin zamanlayıcı / kaydedici sayımı.
//
// main.jsx'te React'ten ÖNCE içe aktarılır: React DevTools'un kullandığı genel kanca
// (__REACT_DEVTOOLS_GLOBAL_HOOK__) kurulur; React her commit'te onCommitFiberRoot çağırır.
//   - Her zaman: yalnız commit sayısı (bir sayaç artışı; maliyet yok denecek kadar az).
//   - Örnekleme açıkken (Performans raporu, birkaç saniye): o commit'te çizilen bileşenler
//     sayılır (ad başına ve stüdyo paneli başına) — kök ağacın kaç kez yeniden çizildiği görünür.
// Ayrıca setInterval / MediaRecorder sayılır (raporda "etkin zamanlayıcı / kaydedici").
// Gerçek React DevTools kancası varsa (geliştirme) onun üstüne eklenir, onu bozmaz.

const S = {
  commits: 0,
  sampling: null, // { until, commits, rendered, byName: Map, byPanel: Map, bigCommits }
  intervals: new Set(),
  recorders: new Set(),
  installed: false,
};

const nameOf = (f) => {
  const t = f?.type;
  if (!t || typeof t === "string") return null;
  return t.displayName || t.name || t.render?.displayName || t.render?.name || t.type?.displayName || t.type?.name || null;
};
const PANEL_NAMES = new Set(["StudioPanel"]);

/** Bu commit'te çizilen bileşenler (PerformedWork bayrağı; çizilmeyen alt ağaçlara inilmez). */
function walk(rootFiber, smp) {
  let n = 0;
  const stack = [[rootFiber, null]];
  while (stack.length) {
    const [x, panel] = stack.pop();
    if (!x) continue;
    let p = panel;
    const tag = x.tag;
    const isComp = tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15;
    if (isComp) {
      const nm = nameOf(x);
      if (nm && PANEL_NAMES.has(nm)) p = String(x.memoizedProps?.params?.kind || x.memoizedProps?.kind || nm);
      if (x.flags & 1) { // PerformedWork
        n += 1;
        if (nm) smp.byName.set(nm, (smp.byName.get(nm) || 0) + 1);
        if (p) smp.byPanel.set(p, (smp.byPanel.get(p) || 0) + 1);
      }
    }
    const alt = x.alternate;
    if (x.child && !(alt && alt.child === x.child)) stack.push([x.child, p]);
    if (x.sibling) stack.push([x.sibling, panel]);
  }
  return n;
}

function onCommit(root) {
  S.commits += 1;
  const smp = S.sampling;
  if (!smp) return;
  if (performance.now() > smp.until) return;
  smp.commits += 1;
  try {
    const n = walk(root?.current, smp);
    smp.rendered += n;
    if (n > 100) smp.bigCommits += 1;
  } catch { /* yoksay */ }
}

function install() {
  if (S.installed || typeof window === "undefined") return;
  S.installed = true;
  try {
    const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (existing && typeof existing === "object") {
      const prev = existing.onCommitFiberRoot;
      existing.onCommitFiberRoot = function (id, root, ...rest) { onCommit(root); return typeof prev === "function" ? prev.call(this, id, root, ...rest) : undefined; };
    } else {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true, isDisabled: false, renderers: new Map(),
        inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
        onCommitFiberRoot(_id, root) { onCommit(root); },
      };
    }
  } catch { /* yoksay */ }
  // Etkin setInterval sayısı (raporda: arka planda kalan zamanlayıcılar).
  try {
    const si = window.setInterval.bind(window);
    const ci = window.clearInterval.bind(window);
    window.setInterval = (...a) => { const id = si(...a); S.intervals.add(id); return id; };
    window.clearInterval = (id) => { S.intervals.delete(id); return ci(id); };
  } catch { /* yoksay */ }
  // Etkin MediaRecorder (açı kayıtları, eski kodlama yolu).
  try {
    const MR = window.MediaRecorder;
    if (MR?.prototype) {
      const start = MR.prototype.start;
      const stop = MR.prototype.stop;
      MR.prototype.start = function (...a) { S.recorders.add(this); const done = () => S.recorders.delete(this); this.addEventListener?.("stop", done, { once: true }); this.addEventListener?.("error", done, { once: true }); return start.apply(this, a); };
      MR.prototype.stop = function (...a) { S.recorders.delete(this); return stop.apply(this, a); };
    }
  } catch { /* yoksay */ }
}
install();

/** ms boyunca React çizimlerini örnekler → { seconds, commitsPerSec, componentRendersPerSec, bigCommits, topComponents, panels }. */
export function sampleReact(ms = 5000) {
  return new Promise((resolve) => {
    const smp = { until: performance.now() + ms, commits: 0, rendered: 0, bigCommits: 0, byName: new Map(), byPanel: new Map() };
    S.sampling = smp;
    setTimeout(() => {
      if (S.sampling === smp) S.sampling = null;
      const sec = ms / 1000;
      const per = (v) => Math.round((v / sec) * 10) / 10;
      resolve({
        seconds: sec,
        commitsPerSec: per(smp.commits),
        componentRendersPerSec: per(smp.rendered),
        bigCommits: smp.bigCommits,
        topComponents: [...smp.byName].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, n]) => ({ name, perSec: per(n) })),
        panels: [...smp.byPanel].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([panel, n]) => ({ panel, rendersPerSec: per(n) })),
      });
    }, ms);
  });
}

/** Anlık sayaçlar. */
export function runtimeCounts() {
  return { reactCommitsTotal: S.commits, intervals: S.intervals.size, mediaRecorders: [...S.recorders].filter((r) => r.state === "recording" || r.state === "paused").length };
}

export const reactStatsInstalled = () => S.installed;
