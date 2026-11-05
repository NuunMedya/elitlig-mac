// Yayın grafikleri — sunucu uçları ({ ok, data, error } döner).
//
//   GET/PUT  /api/maclar/:id/overlay-branding              maçın logo + tema ayarı (web kaplamaları da okur)
//   PUT      /api/maclar/:id/overlay-status { status }     web skorboard modu
//   PUT      /api/maclar/:id/led-status { status }         LED ekran içeriği
//   GET/PUT  /api/maclar/:id/broadcast-state               altyazı, röportaj, sponsor (useDesk)
//   Ön ayarlar (SUNUCU ajanının eklediği uçlar; yoksa 404 → yerel yedek):
//   GET      /api/overlay-branding/presets
//   POST     /api/overlay-branding/presets                 { name, branding }
//   PUT      /api/overlay-branding/presets/:id             { name?, branding?, is_default? }
//   DELETE   /api/overlay-branding/presets/:id
//   POST     /api/maclar/:id/overlay-branding/apply-preset { preset_id }
//   Logo yükleme: masaüstü köprüsü chat.pick + chat.upload → herkese açık adres.
import { request } from "../../../api";

const live = (method, path, body) => request({ method, path, body, cache: false, queue: false });

export const getBranding = (matchId) => live("GET", `/api/maclar/${matchId}/overlay-branding`);
export const saveBranding = (matchId, body) => live("PUT", `/api/maclar/${matchId}/overlay-branding`, body);

export const setOverlayStatus = (matchId, status) => live("PUT", `/api/maclar/${matchId}/overlay-status`, { status });
export const setLedStatus = (matchId, status) => live("PUT", `/api/maclar/${matchId}/led-status`, { status });

export const listPresets = () => live("GET", "/api/overlay-branding/presets");
export const createPreset = (body) => live("POST", "/api/overlay-branding/presets", body);
export const updatePreset = (id, body) => live("PUT", `/api/overlay-branding/presets/${encodeURIComponent(id)}`, body);
export const deletePreset = (id) => live("DELETE", `/api/overlay-branding/presets/${encodeURIComponent(id)}`);
export const applyPreset = (matchId, presetId) => live("POST", `/api/maclar/${matchId}/overlay-branding/apply-preset`, { preset_id: presetId });

/** Uç yok mu (sunucu henüz güncellenmedi): 404 / 405 / 501. */
export const isMissing = (res) => [404, 405, 501].includes(Number(res?.error?.status));

/**
 * Bilgisayardan görsel seçip yükler (sohbet yükleme ucu üzerinden) → adres.
 * Köprü yoksa ya da iptal edilirse null.
 */
export async function pickAndUploadImage() {
  const chat = window.elitlig?.chat;
  if (!chat?.pick || !chat?.upload) return { ok: false, error: { message: "Bu sürümde dosya yükleme yok; görsel adresi yapıştır." } };
  const files = await chat.pick({ images: true });
  const file = Array.isArray(files) ? files[0] : null;
  if (!file) return { ok: false, cancelled: true };
  if (file.tooLarge) return { ok: false, error: { message: "Görsel 25 MB'tan büyük olamaz." } };
  const res = await chat.upload("file", file);
  const url = res?.data?.url || res?.data?.file_url || res?.data?.path || null;
  if (!res?.ok || !url) return { ok: false, error: res?.error || { message: "Görsel yüklenemedi." } };
  return { ok: true, url };
}
