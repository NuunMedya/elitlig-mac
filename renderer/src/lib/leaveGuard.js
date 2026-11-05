// Görünümden çıkış koruması: bir görünüm (ör. yayın sürerken Yayın Stüdyosu)
// başka araca geçişi onaya bağlayabilir. Kabuk (App.go) geçmeden önce sorar.
let guard = null;

/** fn: () => boolean | Promise<boolean> (true → çıkılabilir). null → koruma yok. */
export function setLeaveGuard(fn) {
  guard = typeof fn === "function" ? fn : null;
  return () => { if (guard === fn) guard = null; };
}

export async function canLeave() {
  if (!guard) return true;
  try { return Boolean(await guard()); } catch { return true; }
}
