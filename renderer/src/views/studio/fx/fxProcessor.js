// Yayın Stüdyosu — GÖRÜNTÜ AYARI işlemcisi (kaynak karesini efektle işler).
//
// TEK paylaşılan WebGL2 bağlamı (OffscreenCanvas; yoksa gizli <canvas>) her kaynağın
// karesini tek geçişte işler: gürültü azaltma (kenar koruyan 5×5; renk gürültüsü tam,
// parlaklık gürültüsü ayara göre), kroma anahtarı, pozlama / sıcaklık / renk tonu, gama,
// gölgeler, kontrast / parlaklık / doygunluk / ton / tek renk (3×3 dönüşüm), canlılık
// (cilt korumalı), parlak alanlar (yumuşak omuz), mat, negatif, kenar karartma, rengi koruyan
// yumuşak kırpma, keskinlik, çevir / döndür. Bulanıklık yarım çözünürlükte iki geçişli
// (yatay + dikey) Gauss. Sonuç transferToImageBitmap ile kopyasız alınır (DOM tuvalinde
// kaynağa özel 2D tuvale kopyalanır).
//
// Yalnız ÇİZİLEN ve etkin ayarı olan kaynak işlenir (draw.js çağırır). Aynı kare bir
// kez işlenir: program, önizleme, küçük resimler, LED ve açı kaydı aynı sonucu kullanır
// — kamera yeni kare verdiyse (requestVideoFrameCallback sayacı) ya da süre dolduysa
// yeniden işlenir. Kaynak 1920×1080'den büyükse bu boyuta küçültülerek işlenir.
//
// WebGL2 yoksa / bağlam kaybolursa yedek yol: CanvasRenderingContext2D.filter
// (parlaklık, kontrast, doygunluk, ton, siyah-beyaz, sepya, negatif, bulanıklık) +
// sıcaklık / renk tonu yumuşak ışık katmanı + kenar karartma gradyanı. Keskinlik ve
// yeşil perde yedek yolda yoktur (arayüz uyarır).
import { cssFilterOf, fxKey, fxOutputSize, fxUniforms, resolveFx } from "../../../lib/studio/videoFx";

const MAX_W = 1920;
const MAX_H = 1080;
// Performans koruması: bir saniyelik ortalama işleme süresi bütçeyi aşarsa işleme
// çözünürlüğü kademeli düşer (en az %35), rahatlayınca geri çıkar. Güçlü GPU'da 1.
const BUDGET_MS = 6;
let quality = 1;
const maxW = () => Math.round(MAX_W * quality);
const maxH = () => Math.round(MAX_H * quality);

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_mem;
out vec2 v_out;
void main() {
  v_mem = a_pos * 0.5 + 0.5;
  v_out = vec2(v_mem.x, 1.0 - v_mem.y);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS_MAIN = `#version 300 es
precision highp float;
in vec2 v_out;
uniform sampler2D u_src;
uniform sampler2D u_blur;
uniform bool u_useBlur;
uniform vec2 u_texel;
uniform int u_rot;
uniform bool u_flipH;
uniform bool u_flipV;
uniform vec3 u_gains;
uniform float u_invGamma;
uniform mat3 u_M;
uniform vec3 u_off;
uniform bool u_invert;
uniform float u_vig;
uniform float u_sharp;
uniform bool u_chroma;
uniform vec2 u_key;
uniform float u_sim;
uniform float u_smooth;
uniform float u_spill;
uniform bool u_tone;
uniform float u_sh;
uniform float u_hl;
uniform float u_vib;
uniform float u_fade;
uniform float u_dn;
out vec4 o;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec2 mapUv(vec2 p) {
  float x = u_flipH ? 1.0 - p.x : p.x;
  float y = u_flipV ? 1.0 - p.y : p.y;
  if (u_rot == 90) return vec2(y, 1.0 - x);
  if (u_rot == 180) return vec2(1.0 - x, 1.0 - y);
  if (u_rot == 270) return vec2(1.0 - y, x);
  return vec2(x, y);
}
// videoFx.js toneShadowsHighlights / vibranceOf / softClip ile aynı formüller.
vec3 shadowsT(vec3 c) {
  if (u_sh != 0.0) {
    float l = max(0.0, dot(c, LUMA));
    float ws = 1.0 - smoothstep(0.0, 0.55, l); ws *= ws;
    float p = u_sh >= 0.0 ? 1.0 / (1.0 + 0.8 * u_sh) : 1.0 - 0.8 * u_sh;
    c += vec3((pow(l, p) - l) * ws);
  }
  return c;
}
vec3 highlightsT(vec3 c) {
  if (u_hl != 0.0) {
    float l = max(1e-5, dot(c, LUMA));
    float lt = l;
    if (u_hl < 0.0) {
      float s = -u_hl;
      float k = 0.78 - 0.2 * s;
      if (l > k) { float x = (l - k) / (1.0 - k); lt = k + (1.0 - k) * (x / (1.0 + 0.6 * s * x)); }
    } else {
      lt = l + u_hl * 0.3 * smoothstep(0.4, 1.0, l) * max(0.0, 1.0 - l);
    }
    c *= lt / l;
  }
  return c;
}
vec3 vibrance(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = mx > 1e-5 ? (mx - mn) / mx : 0.0;
  float skin = 0.0;
  if (c.r > c.g && c.g > c.b) {
    float h = (c.g - c.b) / max(1e-5, c.r - c.b);
    skin = clamp(1.0 - abs(h - 0.45) / 0.35, 0.0, 1.0) * (1.0 - smoothstep(0.55, 0.85, sat));
  }
  float k = 1.0 + u_vib * (1.0 - smoothstep(0.0, 0.7, sat)) * (1.0 - 0.75 * skin);
  float l = dot(c, LUMA);
  return vec3(l) + (c - vec3(l)) * k;
}
vec3 softClip(vec3 c) {
  const float KNEE = 0.92;
  float mx = max(c.r, max(c.g, c.b));
  if (mx <= KNEE) return c;
  float x = (mx - KNEE) / (1.0 - KNEE);
  float target = KNEE + (1.0 - KNEE) * (x / (1.0 + x));
  float l = min(target, max(0.0, dot(c, LUMA)));
  float t = mx - l > 1e-6 ? (target - l) / (mx - l) : 0.0;
  return vec3(l) + (c - vec3(l)) * t;
}
// Kenar koruyan (iki taraflı) 5×5 yumuşatma: renk gürültüsü tamamen, parlaklık gürültüsü u_dn oranında.
vec3 denoise(vec2 uv, vec3 c) {
  float sig = 0.025 + 0.085 * u_dn;
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec3 n = texture(u_src, uv + vec2(float(i), float(j)) * u_texel).rgb;
      vec3 d = n - c;
      float w = exp(-float(i * i + j * j) / 5.12) * exp(-dot(d, d) / (2.0 * sig * sig));
      acc += n * w;
      ws += w;
    }
  }
  vec3 den = acc / ws;
  float lc = dot(c, LUMA);
  float ld = dot(den, LUMA);
  float L = mix(lc, ld, clamp(0.35 + 0.65 * u_dn, 0.0, 1.0));
  return vec3(L) + (den - vec3(ld));
}
vec2 cbcr(vec3 c) { return vec2(-0.1146 * c.r - 0.3854 * c.g + 0.5 * c.b + 0.5, 0.5 * c.r - 0.4542 * c.g - 0.0458 * c.b + 0.5); }
void main() {
  vec2 uv = mapUv(v_out);
  vec4 s = texture(u_src, uv);
  vec3 c = u_useBlur ? texture(u_blur, uv).rgb : s.rgb;
  if (!u_useBlur && u_dn > 0.0) c = denoise(uv, c);
  if (!u_useBlur && u_sharp > 0.0) {
    vec3 n = texture(u_src, uv + vec2(u_texel.x, 0.0)).rgb + texture(u_src, uv - vec2(u_texel.x, 0.0)).rgb
           + texture(u_src, uv + vec2(0.0, u_texel.y)).rgb + texture(u_src, uv - vec2(0.0, u_texel.y)).rgb;
    c = c + u_sharp * (c - n * 0.25);
  }
  float a = 1.0;
  if (u_chroma) {
    float base = distance(cbcr(s.rgb), u_key) - u_sim;
    a = pow(clamp(base / max(u_smooth, 0.0001), 0.0, 1.0), 1.5);
    float sp = pow(clamp(base / max(u_spill, 0.0001), 0.0, 1.0), 1.5);
    float l = dot(c, LUMA);
    c = mix(vec3(l), c, sp);
  }
  c *= u_gains;
  c = pow(max(c, vec3(0.0)), vec3(u_invGamma));
  if (u_sh != 0.0) c = shadowsT(c);
  c = u_M * c + u_off;
  if (u_vib != 0.0) c = vibrance(c);
  if (u_hl != 0.0) c = highlightsT(c);
  if (u_fade > 0.0) c = max(c, vec3(0.0)) * (1.0 - 0.1 * u_fade) + 0.075 * u_fade;
  if (u_invert) c = 1.0 - c;
  if (u_vig > 0.0) {
    float d = distance(v_out, vec2(0.5)) * 1.4142;
    c *= 1.0 - u_vig * smoothstep(0.35, 1.05, d);
  }
  if (u_tone) c = softClip(c);
  c = clamp(c, 0.0, 1.0);
  float A = a * s.a;
  o = vec4(c * A, A);
}`;

// Ayrılabilir Gauss: 13 dokunuş (σ = 3 dokunuş), u_dir dokunuş aralığı (doku birimi).
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 v_mem;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 o;
void main() {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i * i) / 18.0);
    acc += texture(u_tex, v_mem + u_dir * float(i)) * w;
    wsum += w;
  }
  o = acc / wsum;
}`;

/* ───────────────────────── WebGL2 durumu ───────────────────────── */

let G = null; // { gl, canvas, offscreen, main, blur, buf, src, fbo: [{tex, fb, w, h}] }
let glFailed = false;
let glLost = false;

function compile(gl, vs, fs) {
  const mk = (type, code) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, code);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "gölgelendirici derlenemedi");
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program bağlanamadı");
  const loc = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i += 1) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
  return { p, loc };
}

function mkTex(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function initGL() {
  if (G || glFailed) return G;
  const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "high-performance", desynchronized: true };
  let canvas = null; let gl = null; let offscreen = false;
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(16, 16);
      gl = canvas.getContext("webgl2", attrs);
      offscreen = Boolean(gl && typeof canvas.transferToImageBitmap === "function");
      if (gl && !offscreen) gl = null;
    }
    if (!gl && typeof document !== "undefined") {
      canvas = document.createElement("canvas");
      canvas.width = 16; canvas.height = 16;
      gl = canvas.getContext("webgl2", attrs);
    }
  } catch { gl = null; }
  if (!gl) { glFailed = true; return null; }
  try {
    const main = compile(gl, VS, FS_MAIN);
    const blur = compile(gl, VS, FS_BLUR);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.disable(gl.BLEND);
    // Yazılım GL (SwiftShader / llvmpipe — GPU yok): basit ayarlarda 2D filtre daha hızlı.
    let renderer = "";
    try { const dbg = gl.getExtension("WEBGL_debug_renderer_info"); renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ""); } catch { /* yoksay */ }
    G = { gl, canvas, offscreen, main, blur, vao, src: mkTex(gl), fbo: [null, null], renderer, software: /swiftshader|llvmpipe|software|softpipe/i.test(renderer) };
    canvas.addEventListener?.("webglcontextlost", (e) => { e.preventDefault(); glLost = true; });
    canvas.addEventListener?.("webglcontextrestored", () => { G = null; glLost = false; glFailed = false; clearCache(); });
  } catch (e) {
    console.warn("[görüntü ayarı] WebGL2 hazırlanamadı, 2D yedek yol:", e?.message || e);
    glFailed = true;
    G = null;
  }
  return G;
}

function fboOf(i, w, h) {
  const { gl } = G;
  let f = G.fbo[i];
  if (f && f.w === w && f.h === h) return f;
  if (!f) { f = { tex: mkTex(gl), fb: gl.createFramebuffer(), w: 0, h: 0 }; G.fbo[i] = f; }
  gl.bindTexture(gl.TEXTURE_2D, f.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
  f.w = w; f.h = h;
  return f;
}

/** WebGL ile işler; sonuç { el, w, h } (el: ImageBitmap ya da girdinin 2D tuvali). */
function renderGL(entry, d, fx) {
  const { gl, canvas, main, blur } = G;
  const U = fxUniforms(fx);
  const { w, h } = fxOutputSize(d.w, d.h, U.rotate, maxW(), maxH());
  if (canvas.width < w || canvas.height < h) {
    canvas.width = Math.min(4096, Math.max(canvas.width, w));
    canvas.height = Math.min(4096, Math.max(canvas.height, h));
  }
  gl.bindVertexArray(G.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, G.src);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d.el);

  let useBlur = false;
  if (U.blur > 0.05) {
    // Yarım çözünürlük, yarıçap 1080p'ye göre px → kaynak pikseli.
    const ds = 2;
    const bw = Math.max(1, Math.ceil(d.w / ds));
    const bh = Math.max(1, Math.ceil(d.h / ds));
    const rSrc = U.blur * (Math.max(d.w, d.h) === d.w ? d.h : d.w) / 1080;
    const step = Math.max(0.5, rSrc / ds / 6);
    const a = fboOf(0, bw, bh);
    const b = fboOf(1, bw, bh);
    gl.useProgram(blur.p);
    gl.uniform1i(blur.loc.u_tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.viewport(0, 0, bw, bh);
    gl.bindTexture(gl.TEXTURE_2D, G.src);
    gl.uniform2f(blur.loc.u_dir, step / d.w * ds, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform2f(blur.loc.u_dir, 0, step / bh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, G.src);
    useBlur = true;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, canvas.height - h, w, h); // sol üst köşe: bit eşleminde (0,0,w,h)
  gl.useProgram(main.p);
  const L = main.loc;
  gl.uniform1i(L.u_src, 0);
  gl.uniform1i(L.u_blur, 1);
  gl.uniform1i(L.u_useBlur, useBlur ? 1 : 0);
  gl.uniform2f(L.u_texel, 1 / d.w, 1 / d.h);
  gl.uniform1i(L.u_rot, U.rotate);
  gl.uniform1i(L.u_flipH, U.flipH ? 1 : 0);
  gl.uniform1i(L.u_flipV, U.flipV ? 1 : 0);
  gl.uniform3fv(L.u_gains, U.gains);
  gl.uniform1f(L.u_invGamma, U.invGamma);
  gl.uniformMatrix3fv(L.u_M, true, U.matrix);
  gl.uniform3fv(L.u_off, U.offset);
  gl.uniform1i(L.u_invert, U.invert ? 1 : 0);
  gl.uniform1f(L.u_vig, U.vignette);
  gl.uniform1f(L.u_sharp, U.sharpen);
  gl.uniform1i(L.u_tone, U.tone ? 1 : 0);
  gl.uniform1f(L.u_sh, U.shadows);
  gl.uniform1f(L.u_hl, U.highlights);
  gl.uniform1f(L.u_vib, U.vibrance);
  gl.uniform1f(L.u_fade, U.fade);
  gl.uniform1f(L.u_dn, U.denoise);
  gl.uniform1i(L.u_chroma, U.chroma ? 1 : 0);
  if (U.chroma) {
    gl.uniform2fv(L.u_key, U.chroma.keyCbCr);
    gl.uniform1f(L.u_sim, U.chroma.similarity);
    gl.uniform1f(L.u_smooth, U.chroma.smoothness);
    gl.uniform1f(L.u_spill, U.chroma.spill);
  }
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  if (G.offscreen) {
    const bmp = canvas.transferToImageBitmap();
    if (entry.bitmap) entry.bitmap.close?.();
    entry.bitmap = bmp;
    return { el: bmp, w, h };
  }
  const out = entry.canvas || (entry.canvas = document.createElement("canvas"));
  if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
  const x = out.getContext("2d");
  x.clearRect(0, 0, w, h);
  x.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
  return { el: out, w, h };
}

/* ───────────────────────── 2D yedek yol ───────────────────────── */

function render2D(entry, d, fxIn) {
  const f = resolveFx(fxIn);
  const { w, h } = fxOutputSize(d.w, d.h, f.rotate, maxW(), maxH());
  let out = entry.canvas;
  if (!out) {
    out = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
    entry.canvas = out;
  }
  if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
  const x = out.getContext("2d");
  x.save();
  x.clearRect(0, 0, w, h);
  x.filter = cssFilterOf(f);
  x.translate(w / 2, h / 2);
  x.scale(f.flipH ? -1 : 1, f.flipV ? -1 : 1);
  if (f.rotate) x.rotate((f.rotate * Math.PI) / 180);
  const sw = f.rotate === 90 || f.rotate === 270;
  const iw = sw ? h : w; const ih = sw ? w : h;
  x.drawImage(d.el, 0, 0, d.w, d.h, -iw / 2, -ih / 2, iw, ih);
  x.restore();
  x.save();
  const t = f.temperature / 100;
  if (Math.abs(t) > 0.01) {
    x.globalCompositeOperation = "soft-light";
    x.globalAlpha = Math.min(1, Math.abs(t) * 0.6);
    x.fillStyle = t > 0 ? "#ff9a2e" : "#2e7bff";
    x.fillRect(0, 0, w, h);
  }
  const g = f.tint / 100;
  if (Math.abs(g) > 0.01) {
    x.globalCompositeOperation = "soft-light";
    x.globalAlpha = Math.min(1, Math.abs(g) * 0.5);
    x.fillStyle = g > 0 ? "#ff2ee0" : "#2eff5a";
    x.fillRect(0, 0, w, h);
  }
  if (f.vignette > 0) {
    x.globalCompositeOperation = "source-atop";
    x.globalAlpha = 1;
    const r = Math.hypot(w, h) / 2;
    const gr = x.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r * 1.05);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, `rgba(0,0,0,${(f.vignette / 100).toFixed(3)})`);
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
  }
  x.restore();
  return { el: out, w, h };
}

/* ───────────────────────── kare önbelleği ───────────────────────── */

const cache = new Map(); // anahtar → { fk, el, at, used, frame, out, bitmap, canvas, failed }
const stats = { processed: 0, ms: 0, backend: null, since: 0 };
let lastSweep = 0;

function clearCache() {
  for (const e of cache.values()) e.bitmap?.close?.();
  cache.clear();
}

// Videonun yeni kare sayacı (requestVideoFrameCallback): aynı kare bir kez işlenir.
const frames = new WeakMap();
function frameInfo(el) {
  if (typeof HTMLVideoElement === "undefined" || !(el instanceof HTMLVideoElement) || typeof el.requestVideoFrameCallback !== "function") return null;
  let st = frames.get(el);
  if (!st) {
    st = { n: 0, at: 0 };
    frames.set(el, st);
    const tick = () => { st.n += 1; st.at = performance.now(); try { el.requestVideoFrameCallback(tick); } catch { /* yoksay */ } };
    try { el.requestVideoFrameCallback(tick); } catch { /* yoksay */ }
  }
  return st;
}

const isStatic = (el) => (typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement) || (typeof ImageBitmap !== "undefined" && el instanceof ImageBitmap);

/** 2D yedek yolun yapamadığı ayar var mı (keskinlik, yeşil perde, gürültü azaltma, ton, canlılık, mat). */
function needsGL(fx) {
  const f = resolveFx(fx);
  return f.sharpen > 0 || f.chroma.on || f.denoise > 0 || f.shadows !== 0 || f.highlights !== 0 || f.vibrance !== 0 || f.fade > 0;
}

/** Etkin arka uç: "webgl2" | "webgl2-yazılım" | "2d". */
export function fxBackend() {
  if (initGL() && !glLost) return G.software ? "webgl2-yazılım" : "webgl2";
  return "2d";
}

/** Arayüz: WebGL2 (donanım ya da yazılım) var mı — yoksa keskinlik / yeşil perde çalışmaz. */
export const fxHasGL = () => Boolean(initGL() && !glLost);

/** Son saniyenin işleme istatistiği (sağlık / ölçüm). */
export function fxStats() {
  return { ...stats, entries: cache.size };
}

/** Yalnız ölçüm için: arka ucu zorla ("2d" | "webgl2" | null = kendiliğinden). */
let forced = null;
export function forceFxBackend(kind, { fixedQuality = null } = {}) { forced = kind || null; clearCache(); if (fixedQuality) { quality = fixedQuality; lockQuality = true; } else lockQuality = false; }
let lockQuality = false;

/**
 * Kaynağın karesini ayarla işler. key: kaynak (+ katman) kimliği; d: drawableOf sonucu;
 * fx: effectiveFx sonucu (null değil). maxAge (ms): aynı sonucu en çok bu kadar eski
 * kullan (küçük resimler daha toleranslı). Dönüş { el, w, h } ya da null (işlenemedi:
 * çağıran işlenmemiş kareyi çizer).
 */
export function processFrame(key, d, fx, { now = performance.now(), maxAge = 12 } = {}) {
  if (!d || !fx) return null;
  const fk = fxKey(fx);
  let e = cache.get(key);
  if (!e) { e = { fk: null, el: null, at: -1e9, used: now, frame: -1, out: null, bitmap: null, canvas: null, failed: null }; cache.set(key, e); }
  e.used = now;
  if (e.failed === d.el) return null;
  const fi = frameInfo(d.el);
  if (e.out && e.fk === fk && e.el === d.el && e.srcW === d.w && e.srcH === d.h) {
    const age = now - e.at;
    if (isStatic(d.el) && age < 5000) return e.out;
    // Kamera yeni kare vermediyse (sayacı canlı ve aynı) bekletme, eskisini kullan.
    if (fi && fi.n === e.frame && now - fi.at < 250 && age < 200) return e.out;
    if (age >= 0 && age < maxAge) return e.out;
  }
  // Aynı kare + aynı ayar başka anahtarla (önizleme penceresi, katman) az önce işlendiyse onu kullan.
  for (const o of cache.values()) {
    if (o !== e && o.out && o.el === d.el && o.fk === fk && now - o.at >= 0 && now - o.at < Math.max(maxAge, 8) && (!fi || o.frame === fi.n)) return o.out;
  }
  const t0 = performance.now();
  let out = null;
  try {
    const g = forced !== "2d" && initGL() && !glLost;
    const useGL = Boolean(g) && (forced === "webgl2" || !G.software || needsGL(fx));
    out = useGL ? renderGL(e, d, fx) : render2D(e, d, fx);
    stats.backend = useGL ? "webgl2" : "2d";
  } catch (err) {
    // Çapraz köken / bozuk kare: bu öğe işlenmeden çizilir.
    if (err?.name === "SecurityError") e.failed = d.el;
    return null;
  }
  const dt = performance.now() - t0;
  e.fk = fk; e.el = d.el; e.srcW = d.w; e.srcH = d.h; e.at = now; e.out = out; e.frame = fi ? fi.n : -1;
  if (now - stats.since > 1000) {
    stats.since = now;
    stats.lastProcessed = stats.processed;
    stats.lastMs = stats.processed ? stats.ms / stats.processed : 0;
    // Saniyedeki toplam işleme süresi kare başına bütçeyi aşıyorsa çözünürlüğü düşür.
    const perFrame = stats.ms / 60;
    if (lockQuality) { /* ölçüm */ } else if (perFrame > BUDGET_MS && quality > 0.35) quality = Math.max(0.35, quality * 0.75);
    else if (perFrame < BUDGET_MS / 3 && quality < 1) quality = Math.min(1, quality * 1.15);
    stats.quality = quality;
    stats.processed = 0; stats.ms = 0;
  }
  stats.processed += 1;
  stats.ms += dt;
  if (now - lastSweep > 2000) {
    lastSweep = now;
    for (const [k, v] of cache) if (now - v.used > 4000) { v.bitmap?.close?.(); cache.delete(k); }
  }
  return out;
}

/** Bir kaynağın önbelleğini bırakır (kaynak silindi). */
export function releaseFx(keyPrefix) {
  for (const [k, v] of cache) if (k === keyPrefix || k.startsWith(`${keyPrefix}|`)) { v.bitmap?.close?.(); cache.delete(k); }
}

// Tanı: geliştirici konsolundan __elitligFx.stats() (işlenen kare / sn, ortalama ms, kalite).
try { globalThis.__elitligFx = { stats: fxStats, backend: fxBackend }; } catch { /* yoksay */ }
