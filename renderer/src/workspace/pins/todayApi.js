// Bugün panosu bileşen kütüphanesine tek bağlantı noktası (yalnız dışa açık API; views/today/*
// dosyaları burada DEĞİŞTİRİLMEZ). Kütüphane büyüdükçe yeni bileşenler sabit katmanda da çıkar.
export { metaOf, isAllowed, defaultOptions, REGISTRY, TIER_LABELS } from "../../views/today/registry";
export { sizeForTier } from "../../views/today/dashModel";
export { default as Tile } from "../../views/today/Tile";
export { default as TileSettings } from "../../views/today/TileSettings";
export { default as Library } from "../../views/today/Library";
export { libDrag } from "../../views/today/Library";
