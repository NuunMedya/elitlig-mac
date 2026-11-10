// Pencere yerleştirme (Magnet benzeri) — işletim sistemi arka uçları.
//
//   macOS   : osascript + System Events (Erişilebilirlik izni gerekir). Betiklere YALNIZ
//             doğrulanmış tam sayılar yazılır (süreç kimliği, x, y, genişlik, yükseklik):
//             komut enjeksiyonu olamaz. Pencere başlığı yalnız okunur, betiğe geri yazılmaz.
//   Windows : bir kez başlatılan uzun ömürlü PowerShell süreci (Add-Type ile user32 / dwmapi);
//             satır satır komut alır ("<kimlik> GET <hwnd>", "<kimlik> SET <hwnd> x y w h 0|1").
//             Süreç DPI farkındadır (fiziksel piksel); Electron DIP'e screen.screenToDipRect
//             ile çevrilir. DWM'nin görünmez kenar payı (DWMWA_EXTENDED_FRAME_BOUNDS) hesaba
//             katılır: görünen çerçeve hedefe oturur.
//   Bu uygulamanın kendi pencereleri Electron ile doğrudan taşınır (izin gerekmez).
//
// Konum hesapları app/windowLayouts.js'te (saf, sınanmış).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const L = require("./windowLayouts");

const isInt = (v, lo = -100000, hi = 100000) => Number.isInteger(v) && v >= lo && v <= hi;
const intRect = (r) => ({ x: Math.round(Number(r.x)), y: Math.round(Number(r.y)), width: Math.round(Number(r.width)), height: Math.round(Number(r.height)) });
const validRect = (r) => Boolean(r) && isInt(r.x) && isInt(r.y) && isInt(r.width, 1) && isInt(r.height, 1);

/* -------------------------------- macOS -------------------------------- */

// Ön plandaki pencere: önce AXMain (asıl pencere), olmazsa ilk pencere.
const MAC_PICK_WINDOW = [
  "set w to missing value",
  "try",
  "set w to (first window of p whose value of attribute \"AXMain\" is true)",
  "end try",
  "if w is missing value then set w to window 1 of p",
];

/** Okuma betiği (satır dizisi; her satır ayrı -e). pid: tam sayı ya da null (ön plandaki uygulama). */
function macReadScript(pid = null) {
  if (pid != null && !isInt(pid, 1, 10_000_000)) throw new Error("Geçersiz süreç kimliği.");
  return [
    "tell application \"System Events\"",
    pid == null ? "set p to first application process whose frontmost is true" : `set p to first application process whose unix id is ${pid}`,
    "set procId to unix id of p",
    "if (count of windows of p) is 0 then return (procId as text) & tab & \"NOWIN\"",
    ...MAC_PICK_WINDOW,
    "set fs to false",
    "try",
    "set fs to value of attribute \"AXFullScreen\" of w",
    "end try",
    "if fs then return (procId as text) & tab & \"FULLSCREEN\"",
    "set {px, py} to position of w",
    "set {sx, sy} to size of w",
    "set t to \"\"",
    "try",
    "set t to name of w",
    "end try",
    "return (procId as text) & tab & px & tab & py & tab & sx & tab & sy & tab & t",
    "end tell",
  ];
}

/** Yerleştirme betiği: konum → boyut → konum (ekran kenarında boyut kısıtına karşı Magnet de böyle yapar). */
function macSetScript(pid, rect, front = false) {
  if (!isInt(pid, 1, 10_000_000)) throw new Error("Geçersiz süreç kimliği.");
  const r = intRect(rect);
  if (!validRect(r)) throw new Error("Geçersiz konum.");
  return [
    "tell application \"System Events\"",
    `set p to first application process whose unix id is ${pid}`,
    ...MAC_PICK_WINDOW,
    `set position of w to {${r.x}, ${r.y}}`,
    `set size of w to {${r.width}, ${r.height}}`,
    `set position of w to {${r.x}, ${r.y}}`,
    ...(front ? ["set frontmost of p to true"] : []),
    "end tell",
  ];
}

/** "pid\tx\ty\tw\th\tbaşlık" → { pid, rect, title } | { pid, error } */
function parseMacRead(out) {
  const parts = String(out || "").replace(/\r?\n$/, "").split("\t");
  const pid = Number(parts[0]);
  if (!Number.isInteger(pid) || pid <= 0) return { error: "read" };
  if (parts[1] === "NOWIN") return { pid, error: "nowindow" };
  if (parts[1] === "FULLSCREEN") return { pid, error: "fullscreen" };
  const [x, y, w, h] = parts.slice(1, 5).map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return { pid, error: "read" };
  return { pid, rect: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) }, title: parts.slice(5).join("\t") };
}

/** osascript hata metni → kod. */
function macErrorCode(stderr) {
  const s = String(stderr || "");
  if (/-1719|-25211|assistive access|yardımcı erişim|erişilebilirlik/i.test(s)) return "permission";
  if (/-1743|not authori[sz]ed to send Apple events|Apple olayları/i.test(s)) return "automation";
  if (/-1728|Can.t get window|pencere/i.test(s)) return "nowindow";
  return "failed";
}

/* ------------------------------- Windows ------------------------------- */

/** Uzun ömürlü yardımcı betik (geçici dosyaya yazılıp -File ile çalıştırılır). */
const WIN_HELPER = String.raw`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ElitligWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
}
"@
try { [void][ElitligWin]::SetThreadDpiAwarenessContext([IntPtr](-4)) } catch { }
function Info([IntPtr]$h) {
  $r = New-Object ElitligWin+RECT
  [void][ElitligWin]::GetWindowRect($h, [ref]$r)
  $f = New-Object ElitligWin+RECT
  $hr = [ElitligWin]::DwmGetWindowAttribute($h, 9, [ref]$f, 16)
  if ($hr -ne 0) { $f = $r }
  $sb = New-Object System.Text.StringBuilder 256
  [void][ElitligWin]::GetClassName($h, $sb, 256)
  [uint32]$procId = 0
  [void][ElitligWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $z = 0
  if ([ElitligWin]::IsZoomed($h)) { $z = 1 }
  if ([ElitligWin]::IsIconic($h)) { $z = 2 }
  $ow = $r.Right - $r.Left; $oh = $r.Bottom - $r.Top
  $fw = $f.Right - $f.Left; $fh = $f.Bottom - $f.Top
  return "OK $([int64]$h) $($r.Left) $($r.Top) $ow $oh $($f.Left) $($f.Top) $fw $fh $z $procId $($sb.ToString())"
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim().Split(' ')
  $id = $p[0]
  $out = 'ERR bos'
  try {
    switch ($p[1]) {
      'PING' { $out = 'OK' }
      'FG' {
        $h = [ElitligWin]::GetForegroundWindow()
        if ($h -eq [IntPtr]::Zero) { $out = 'ERR nowindow' } else { $out = Info ([ElitligWin]::GetAncestor($h, 2)) }
      }
      'GET' {
        $h = [IntPtr][int64]$p[2]
        if (-not [ElitligWin]::IsWindow($h)) { $out = 'ERR nowindow' } else { $out = Info $h }
      }
      'RESTORE' {
        $h = [IntPtr][int64]$p[2]
        [void][ElitligWin]::ShowWindow($h, 9)
        $out = 'OK'
      }
      'SET' {
        $h = [IntPtr][int64]$p[2]
        if (-not [ElitligWin]::IsWindow($h)) { $out = 'ERR nowindow' } else {
          [void][ElitligWin]::SetWindowPos($h, [IntPtr]::Zero, [int]$p[3], [int]$p[4], [int]$p[5], [int]$p[6], 0x0014)
          if ($p[7] -eq '1') { [void][ElitligWin]::SetForegroundWindow($h) }
          $out = 'OK'
        }
      }
      default { $out = 'ERR unknown' }
    }
  } catch { $out = 'ERR ' + ($_.Exception.Message -replace '\s+', ' ') }
  [Console]::Out.WriteLine("$id $out")
  [Console]::Out.Flush()
}
`;

/** Yardımcıya gidecek komut satırı (yalnız tam sayılar). */
function winCommand(id, op, args = []) {
  if (!isInt(id, 1, 1e9)) throw new Error("Geçersiz istek.");
  if (!["PING", "FG", "GET", "SET", "RESTORE"].includes(op)) throw new Error("Geçersiz komut.");
  for (const a of args) if (!Number.isSafeInteger(a)) throw new Error("Geçersiz değer.");
  return `${[id, op, ...args].join(" ")}\n`;
}

/** "OK hwnd ox oy ow oh fx fy fw fh z pid sınıf" → bilgi | { error } */
function parseWinInfo(text) {
  const p = String(text || "").trim().split(" ");
  if (p[0] !== "OK") return { error: p[1] === "nowindow" ? "nowindow" : "failed", message: p.slice(1).join(" ") };
  const n = p.slice(1, 12).map(Number);
  if (n.length < 11 || !n.every(Number.isFinite)) return { error: "failed" };
  const [hwnd, ox, oy, ow, oh, fx, fy, fw, fh, state, pid] = n;
  return {
    hwnd, pid,
    outer: { x: ox, y: oy, width: ow, height: oh },
    frame: { x: fx, y: fy, width: fw, height: fh },
    maximized: state === 1, minimized: state === 2,
    className: p.slice(12).join(" "),
  };
}

// Masaüstü, görev çubuğu ve başlat menüsü taşınmaz.
const WIN_SHELL_CLASSES = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow", "NotifyIconOverflowWindow"]);

function createWinHelper({ spawn, tmpDir, log = () => {} }) {
  let child = null;
  let buf = "";
  let seq = 0;
  const pending = new Map();
  let failures = 0;

  const start = () => {
    if (child) return child;
    if (failures >= 3) throw new Error("Pencere yardımcısı başlatılamadı (PowerShell).");
    const file = path.join(tmpDir, "elitlig-window-helper.ps1");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(file, `﻿${WIN_HELPER}`, "utf8");
    child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        const sp = line.indexOf(" ");
        const id = Number(line.slice(0, sp));
        const p = pending.get(id);
        if (p) { pending.delete(id); clearTimeout(p.timer); p.resolve(line.slice(sp + 1)); }
      }
    });
    child.stderr.on("data", (d) => log("[pencere] powershell:", String(d).slice(0, 300)));
    const dead = (why) => {
      if (!child) return;
      child = null;
      buf = "";
      failures += 1;
      for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(`ERR ${why}`); }
      pending.clear();
    };
    child.on("exit", () => dead("exit"));
    child.on("error", () => dead("spawn"));
    return child;
  };

  const send = (op, args = [], timeoutMs = 8000) => new Promise((resolve) => {
    let c;
    try { c = start(); } catch (e) { resolve(`ERR ${e.message}`); return; }
    seq += 1;
    const id = seq;
    const timer = setTimeout(() => { pending.delete(id); resolve("ERR timeout"); }, timeoutMs);
    pending.set(id, { resolve: (v) => { failures = 0; resolve(v); }, timer });
    try { c.stdin.write(winCommand(id, op, args)); } catch { clearTimeout(timer); pending.delete(id); resolve("ERR write"); }
  });

  const dispose = () => { try { child?.stdin.end(); child?.kill(); } catch { /* yoksay */ } child = null; };
  return { send, dispose, warm: () => send("PING", [], 15000) };
}

/* ------------------------------ yönetici ------------------------------ */

const ERRORS = {
  permission: "Erişilebilirlik izni gerekiyor: Sistem Ayarları › Gizlilik ve Güvenlik › Erişilebilirlik'te Elitlig Araçlar'ı açın.",
  automation: "System Events'i denetleme izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Otomasyon'da Elitlig Araçlar › System Events'i açın.",
  nowindow: "Taşınacak pencere bulunamadı.",
  fullscreen: "Pencere tam ekran alanında; önce tam ekrandan çıkın.",
  shell: "Masaüstü ve görev çubuğu taşınamaz.",
  unsupported: "Pencere yerleştirme bu işletim sisteminde desteklenmiyor.",
  failed: "Pencere taşınamadı.",
};

/**
 * deps: { platform, screen, BrowserWindow, systemPreferences, shell, execFile, spawn, tmpDir, getGap, isOwnPanel, log }
 */
function createWindowManager(deps) {
  const { platform = process.platform, screen, BrowserWindow, systemPreferences, shell, execFile, spawn, tmpDir, getGap = () => 0, isOwnPanel = () => false, log = () => {} } = deps;
  const mac = platform === "darwin";
  const win = platform === "win32";
  let history = {};
  const winHelper = win ? createWinHelper({ spawn, tmpDir, log }) : null;

  const displays = () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }));
  const fail = (code, extra = {}) => ({ ok: false, code, error: ERRORS[code] || ERRORS.failed, ...extra });

  const osascript = (lines) => new Promise((resolve) => {
    const args = [];
    for (const l of lines) args.push("-e", l);
    execFile("osascript", args, { timeout: 6000 }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ""), stderr: String(stderr || err?.message || "") }));
  });

  const permission = () => {
    if (mac) return { platform, needed: true, granted: Boolean(systemPreferences?.isTrustedAccessibilityClient?.(false)) };
    return { platform, needed: false, granted: win };
  };
  const requestPermission = () => {
    if (!mac) return permission();
    try { systemPreferences.isTrustedAccessibilityClient(true); } catch { /* yoksay */ }
    return permission();
  };
  const openPermissionSettings = (kind = "accessibility") => {
    if (!mac) return false;
    const pane = kind === "automation" ? "Privacy_Automation" : "Privacy_Accessibility";
    shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`).catch(() => {});
    return true;
  };

  /** Bu uygulamanın odaktaki penceresi (araç takımı paneli hariç). */
  const ownFocused = () => {
    const w = BrowserWindow.getFocusedWindow();
    return w && !w.isDestroyed() && !isOwnPanel(w) ? w : null;
  };

  /**
   * Hedef pencere. Araç takımı paneli açılmadan ÖNCE çağrılır (panel odak alınca ön plandaki
   * uygulama biz oluruz): { kind: "own", id } | { kind: "mac", pid } | { kind: "win", hwnd } | null
   */
  const captureTarget = async () => {
    const own = ownFocused();
    if (own) return { kind: "own", id: own.id };
    if (mac) {
      if (!permission().granted) return null;
      const r = await osascript(macReadScript(null));
      const info = parseMacRead(r.stdout);
      if (info.pid === process.pid) return null;
      return info.pid ? { kind: "mac", pid: info.pid } : null;
    }
    if (win) {
      const info = parseWinInfo(await winHelper.send("FG"));
      if (info.error || WIN_SHELL_CLASSES.has(info.className) || info.pid === process.pid) return null;
      return { kind: "win", hwnd: info.hwnd };
    }
    return null;
  };

  const plan = (key, id, current) => {
    const res = L.computeLayout(key, current, displays(), { gap: getGap(), previous: history[id]?.original || null });
    if (res.error) return res;
    return res;
  };
  const remember = (key, id, current, rect) => {
    if (key === "restore") { delete history[id]; return; }
    history = L.rememberBefore(history, id, current, rect);
  };

  async function applyOwn(key, bw) {
    if (bw.isFullScreen()) return fail("fullscreen");
    if (bw.isMaximized()) bw.unmaximize();
    const current = bw.getBounds();
    const id = `own:${bw.id}`;
    const res = plan(key, id, current);
    if (res.error) return { ok: false, code: "layout", error: res.error };
    bw.setBounds(res.rect);
    remember(key, id, current, res.rect);
    return { ok: true, rect: res.rect };
  }

  async function applyMac(key, pid, front) {
    if (!permission().granted) { requestPermission(); return fail("permission", { needsPermission: true }); }
    const read = await osascript(macReadScript(pid));
    if (read.err) { const code = macErrorCode(read.stderr); return fail(code, { needsPermission: code === "permission" || code === "automation" }); }
    const info = parseMacRead(read.stdout);
    if (info.error) return fail(info.error === "read" ? "failed" : info.error);
    if (info.pid === process.pid) {
      const bw = ownFocused() || BrowserWindow.getAllWindows().find((w) => w.isVisible() && !isOwnPanel(w));
      return bw ? applyOwn(key, bw) : fail("nowindow");
    }
    const id = `mac:${info.pid}:${info.title}`;
    const res = plan(key, id, info.rect);
    if (res.error) return { ok: false, code: "layout", error: res.error };
    const set = await osascript(macSetScript(info.pid, res.rect, front));
    if (set.err) { const code = macErrorCode(set.stderr); return fail(code, { needsPermission: code === "permission" || code === "automation" }); }
    remember(key, id, info.rect, res.rect);
    return { ok: true, rect: res.rect };
  }

  const toDip = (r) => (screen.screenToDipRect ? screen.screenToDipRect(null, r) : L.physicalToDip(r, L.displayForRect(displays(), r)));
  const toPhys = (r) => (screen.dipToScreenRect ? screen.dipToScreenRect(null, r) : L.dipToPhysical(r, L.displayForRect(displays(), r)));

  async function applyWin(key, hwnd, front) {
    let info = parseWinInfo(await winHelper.send(hwnd ? "GET" : "FG", hwnd ? [hwnd] : []));
    if (info.error) return fail(info.error);
    if (WIN_SHELL_CLASSES.has(info.className)) return fail("shell");
    if (info.pid === process.pid) {
      const bw = ownFocused();
      return bw ? applyOwn(key, bw) : fail("nowindow");
    }
    const id = `win:${info.hwnd}`;
    const current = toDip(info.frame);
    const res = plan(key, id, current);
    if (res.error) return { ok: false, code: "layout", error: res.error };
    if (info.maximized || info.minimized) {
      await winHelper.send("RESTORE", [info.hwnd]);
      info = parseWinInfo(await winHelper.send("GET", [info.hwnd]));
      if (info.error) return fail(info.error);
    }
    const target = intRect(toPhys(res.rect));
    // İki tur: farklı DPI'lı ekrana geçince uygulama kendini yeniden boyutlandırabilir,
    // kenar payı da değişebilir; ikinci turda ölçülüp düzeltilir.
    for (let pass = 0; pass < 2; pass += 1) {
      const outer = L.expandByBorders(target, L.invisibleBorders(info.outer, info.frame));
      const r = await winHelper.send("SET", [info.hwnd, outer.x, outer.y, outer.width, outer.height, 0]);
      if (!r.startsWith("OK")) return fail("failed", { message: r });
      info = parseWinInfo(await winHelper.send("GET", [info.hwnd]));
      if (info.error || L.sameRect(info.frame, target, 1)) break;
    }
    if (front) await winHelper.send("SET", [info.hwnd, info.outer.x, info.outer.y, info.outer.width, info.outer.height, 1]);
    remember(key, id, current, res.rect);
    return { ok: true, rect: res.rect };
  }

  /**
   * Düzeni uygula. target: captureTarget() sonucu (araç takımından) ya da yok (kısayol:
   * ön plandaki pencere). front: işlemden sonra hedef uygulamayı öne getir.
   */
  async function apply(key, { target = null, front = false } = {}) {
    if (!L.LAYOUT_KEYS.has(key)) return { ok: false, code: "layout", error: "Bilinmeyen düzen." };
    try {
      if (target?.kind === "own") {
        const bw = BrowserWindow.fromId(target.id);
        if (bw && !bw.isDestroyed()) { const r = await applyOwn(key, bw); if (front) bw.focus(); return r; }
        return fail("nowindow");
      }
      if (!target) { const own = ownFocused(); if (own) return applyOwn(key, own); }
      if (mac) return applyMac(key, target?.kind === "mac" ? target.pid : null, front);
      if (win) return applyWin(key, target?.kind === "win" ? target.hwnd : null, front);
      return fail("unsupported");
    } catch (e) {
      log("[pencere]", e);
      return fail("failed", { message: e?.message });
    }
  }

  return {
    apply, captureTarget, permission, requestPermission, openPermissionSettings,
    supported: mac || win,
    warm: () => (winHelper ? winHelper.warm() : Promise.resolve("OK")),
    dispose: () => winHelper?.dispose(),
    _history: () => history,
  };
}

module.exports = { createWindowManager, macReadScript, macSetScript, parseMacRead, macErrorCode, winCommand, parseWinInfo, WIN_HELPER, WIN_SHELL_CLASSES, ERRORS };
