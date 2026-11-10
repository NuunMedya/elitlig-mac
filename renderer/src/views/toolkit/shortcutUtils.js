// Kısayol kaydetme — klavye olayından Electron hızlandırıcısı ve okunur etiket (saf).

const CODE_KEYS = {
  ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down",
  Enter: "Return", NumpadEnter: "Return", Backspace: "Backspace", Delete: "Delete", Space: "Space", Tab: "Tab",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`",
};

/**
 * keydown olayı → { accelerator } | { pending: true } (yalnız değiştirici) | { error }.
 * e.code kullanılır: ⌥ ile harfler Mac'te başka karaktere dönüşür (⌥U → ¨); fiziksel tuş esas.
 */
export function acceleratorFromEvent(e, mac = true) {
  const mods = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push(mac ? "Command" : "Super");
  const code = String(e.code || "");
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code) || ["Control", "Alt", "Shift", "Meta"].includes(e.key)) return { pending: true };
  let key = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) key = code.slice(6);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (CODE_KEYS[code]) key = CODE_KEYS[code];
  if (!key) return { error: "Bu tuş kısayol olamaz." };
  if (!mods.length && !/^F\d+$/.test(key)) return { error: "En az bir değiştirici tuş (⌃ ⌥ ⇧ ⌘) gerekir." };
  if (mods.length === 1 && mods[0] === "Shift" && !/^F\d+$/.test(key)) return { error: "Yalnız ⇧ yetmez; ⌃, ⌥ ya da ⌘ ekleyin." };
  return { accelerator: [...mods, key].join("+") };
}

const MAC = { Control: "⌃", Alt: "⌥", Shift: "⇧", Command: "⌘", Super: "⌘", CommandOrControl: "⌘", CmdOrCtrl: "⌘" };
const WIN = { Control: "Ctrl", Alt: "Alt", Shift: "Shift", Command: "Win", Super: "Win", CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl" };
const KEYS = { Left: "←", Right: "→", Up: "↑", Down: "↓", Space: "Boşluk", Escape: "Esc", Plus: "+" };
/** "Control+Alt+Left" → "⌃⌥←" (Mac) / "Ctrl+Alt+←" (Windows). */
export function acceleratorLabel(acc, mac = true) {
  if (!acc) return "";
  const parts = String(acc).split("+");
  const key = parts.pop();
  const k = key === "Return" || key === "Enter" ? (mac ? "↩" : "Enter") : key === "Backspace" ? (mac ? "⌫" : "Backspace") : key === "Delete" ? (mac ? "⌦" : "Del") : KEYS[key] || key;
  const m = parts.map((x) => (mac ? MAC : WIN)[x] || x);
  return mac ? `${m.join("")}${k}` : [...m, k].join("+");
}
