// Yayın Stüdyosu · KİP TABANI VİDEO DELİKLERİ (2.36.0) — saf parça (workerHost.js kullanır).
//
// Tekrar / VAR / röportaj / özet tabanı ana iş parçacığında çizilir; içindeki video kareleri
// işçide. Bu bağlam sarmalayıcısı drawImage(video) çağrısını yakalar:
//   - video hazırsa ve beslemesi işçide ilk karesini verdiyse (feedFor(el) → { id, ready }),
//     yer bildirimi { id, vw, vh, s, d, m, a } placements'a eklenir ve tabanda o dikdörtgen
//     videonun saydamlığı oranında delinir (destination-out);
//   - aksi halde (kırpma / süzgeç / başka birleştirme kipi / besleme hazır değil) gerçek çizim.
// İşçi videoları sırayla, taban (delikli) üstte çizer: sonuç ana yolla aynıdır (videodan önce
// aynı bölgeye çizilen içerik yalnız saydam geçişte farklı harmanlanır).

/**
 * ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
 * opts: { placements: [], isVideo(el) → boolean, feedFor(el) → { id, ready } | null }
 */
export function createHoleCtx(ctx, { placements, isVideo, feedFor }) {
  let clips = 0;
  const stack = [];
  const bound = new Map();
  const drawImage = (src, ...args) => {
    if (isVideo(src) && src.readyState >= 2 && src.videoWidth && clips === 0 && (!ctx.filter || ctx.filter === "none") && ctx.globalCompositeOperation === "source-over"
      && (args.length === 2 || args.length === 4 || args.length === 8)) {
      const v = feedFor(src);
      if (v?.ready) {
        const vw = src.videoWidth; const vh = src.videoHeight;
        let s4 = [0, 0, vw, vh]; let d4;
        if (args.length === 2) d4 = [args[0], args[1], vw, vh];
        else if (args.length === 4) d4 = args.slice(0, 4);
        else { s4 = args.slice(0, 4); d4 = args.slice(4, 8); }
        if ([...s4, ...d4].every(Number.isFinite)) {
          const m = ctx.getTransform();
          placements.push({ id: v.id, vw, vh, s: s4, d: d4, m: [m.a, m.b, m.c, m.d, m.e, m.f], a: ctx.globalAlpha });
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = "#000";
          ctx.fillRect(d4[0], d4[1], d4[2], d4[3]);
          ctx.restore();
          return undefined;
        }
      }
    }
    return ctx.drawImage(src, ...args);
  };
  return new Proxy(ctx, {
    get(t, p) {
      if (p === "drawImage") return drawImage;
      if (p === "save") return () => { stack.push(clips); t.save(); };
      if (p === "restore") return () => { clips = stack.length ? stack.pop() : 0; t.restore(); };
      if (p === "clip") return (...a) => { clips += 1; t.clip(...a); };
      const val = Reflect.get(t, p, t);
      if (typeof val !== "function") return val;
      let b = bound.get(p);
      if (!b) { b = val.bind(t); bound.set(p, b); }
      return b;
    },
    set(t, p, val) { t[p] = val; return true; },
  });
}
