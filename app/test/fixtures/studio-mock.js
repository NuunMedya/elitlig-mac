// Yayın Stüdyosu — tarayıcıda (Playwright) stüdyoyu açmak için sahte window.elitlig köprüsü,
// örnek maç / kaynak / sahne / tekrar verisi. page.addInitScript(studioMock, { YT: false, scale, layout }).
// scale: arayüz ölçeği (%; Ayarlar › Görünüm) · layout: studio.layout.v1 kaydı (nesne).
"use strict";

module.exports = function studioMock({ YT = false, scale = null, layout = null } = {}) {
    localStorage.setItem('route', 'studio');
    localStorage.setItem('studio.match', '7');
    localStorage.removeItem('studio.v3');
    localStorage.setItem('studio.prefs.v1', JSON.stringify({ tab: 'sahne', dockH: 270, workspace: 'classic' }));
    localStorage.setItem('studio.v1', JSON.stringify({
      version: 2,
      sources: [
        { id: 'src_cam1', kind: 'camera', name: 'Kale arkası', deviceIndex: 0, resolution: '1080p' },
        { id: 'src_trib', kind: 'color', name: 'Tribün', color: '#2a0d4a', text: 'TRİBÜN KAMERASI', textColor: '#d8bfff' },
        { id: 'src_sp', kind: 'color', name: 'Sponsor plakası', color: '#54009c', text: 'ELİTLİG\nSPONSOR', textColor: '#ffffff' },
      ],
      scenes: [
        { id: 'sc_pip', name: 'Resim içinde resim', preset: { kind: 'pip', a: 'src_cam1', b: 'src_trib', corner: 'br', size: 30 }, layers: [{ id: 'l1', sourceId: 'src_cam1', layout: { type: 'full' }, fit: 'cover', visible: true }, { id: 'l2', sourceId: 'src_trib', layout: { type: 'pip', corner: 'br', size: 30 }, fit: 'cover', visible: true }] },
        { id: 'sc_sbs', name: 'Yan yana', preset: { kind: 'sbs', a: 'src_cam1', b: 'src_trib' }, layers: [{ id: 'l3', sourceId: 'src_cam1', layout: { type: 'left' }, fit: 'contain', visible: true }, { id: 'l4', sourceId: 'src_trib', layout: { type: 'right' }, fit: 'contain', visible: true }] },
      ],
      overlay: { scorebug: true, variant: 'small' },
      previewSceneId: 'src:src_trib', programSceneId: 'src:src_cam1',
    }));
    const now = Date.now();
    const noop = () => () => {};
    const ok = (data) => Promise.resolve({ ok: true, data });
    const today = new Date().toISOString().slice(0, 10);
    const match = { id: 7, first_team_name: 'Ankara Gençlikspor', second_team_name: 'Karadeniz FK', home_team_id: 3, away_team_id: 8, mac_durumu: 'canli', first_team_score: 2, second_team_score: 1, match_date: today, match_time: '21:00' };
    const ev = (id, t, c, dk, o, devre) => ({ id, mac_id: 7, takim_id: t, olay_kodu: c, dakika: dk, devre: devre || 1, oyuncu_id: o });
    const row = (id, name, num, role = 'starter') => ({ playerId: id, playerName: name, number: num, position: 'OS', role });
    const fixtures = [
      [/olaylar/, [ev(1, 3, 'GOAL_RIGHT_FOOT', 6, 101), ev(2, 8, 'GOAL_HEADER', 14, 201), ev(3, 8, 'YELLOW_CARD', 19, 202), ev(4, 3, 'GOAL_PENALTY', 6, 102, 2)]],
      [/timer/, { match_id: 7, running: true, base_ms: 33 * 60000, base_at: new Date(now).toISOString(), seq: 1, period: 2 }],
      [/kadro/, { home: [row(101, 'Can Aydın', 10), row(102, 'Mert Kılıç', 9), row(103, 'Burak Şahin', 7)], away: [row(201, 'Selim Kara', 9), row(202, 'Hakan Öz', 5)] }],
      [/live-streams\/config/, YT ? { configured: true, connected: true, channel: { title: 'ElitLig TV', thumbnail: null }, privacy: 'public' } : { configured: false, connected: false, oauth_ready: true, privacy: 'public' }],
      [/live-streams\/matches/, { match_id: 7, configured: YT, live_stream: null }],
      [/match-highlights/, { items: [{ id: 3, url: 'https://cdn.elitlig.com/h/7.mp4', poster_url: null, duration_ms: 84000, created_at: new Date(now - 3600e3).toISOString() }] }],
      [/\/api\/maclar\/7/, match],
      [/snapshot/, {}],
    ];
    window.__unmatched = [];
    // Gerçek oynatılabilir kısa klipler (tuval → MediaRecorder → blob).
    const makeClip = (bg, label, ms = 1600) => new Promise((resolve) => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 360;
      const x = c.getContext('2d');
      const st = c.captureStream(30);
      const rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8' });
      const parts = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = () => resolve(URL.createObjectURL(new Blob(parts, { type: 'video/webm' })));
      const t0 = performance.now();
      const draw = () => {
        const t = performance.now() - t0;
        const g = x.createLinearGradient(0, 0, 640, 360); g.addColorStop(0, bg); g.addColorStop(1, '#000');
        x.fillStyle = g; x.fillRect(0, 0, 640, 360);
        x.fillStyle = '#2e7d32'; x.fillRect(0, 250, 640, 110);
        x.fillStyle = '#fff'; x.beginPath(); x.arc(80 + (t / ms) * 480, 270 - Math.sin((t / ms) * Math.PI) * 120, 14, 0, 7); x.fill();
        x.font = '800 34px sans-serif'; x.fillText(label, 24, 52);
        if (t < ms) requestAnimationFrame(draw); else rec.stop();
      };
      rec.start(100); draw();
    });
    let clipsP = null;
    const clips = () => (clipsP ||= Promise.all([makeClip('#3949ab', 'PROGRAM'), makeClip('#00897b', 'KALE ARKASI'), makeClip('#6d4c41', 'TRİBÜN')]));
    const replayList = async () => {
      const [p, k, t] = await clips();
      const A = (angle, name, url) => ({ angle, name, url, path: `/tmp/${angle}.mp4`, durationMs: 1600, width: 1280, height: 720 });
      return [
        { id: 'r3', createdAt: new Date(now - 60e3).toISOString(), label: 'Kaleci kurtarışı', kind: 'moment', eventId: null, minute: 32, inSummary: true, durationMs: 1600, angles: [A('program', 'Program', p), A('src_cam1', 'Kale arkası', k)] },
        { id: 'r2', createdAt: new Date(now - 300e3).toISOString(), label: 'GOL', kind: 'goal', eventId: 4, playerName: 'Mert Kılıç', minute: 31, inSummary: true, uploaded: true, durationMs: 1600, angles: [A('program', 'Program', p), A('src_cam1', 'Kale arkası', k), A('src_trib', 'Tribün', t)] },
        { id: 'r1', createdAt: new Date(now - 1200e3).toISOString(), label: 'GOL', kind: 'goal', eventId: 1, playerName: 'Can Aydın', minute: 6, inSummary: true, uploaded: true, durationMs: 1600, angles: [A('program', 'Program', p), A('src_cam1', 'Kale arkası', k)] },
      ];
    };
    localStorage.setItem('studio.replayMeta.v1', JSON.stringify({ r1: { matchId: 7, minute: 6, period: 1, side: 'home', code: 'GOAL_RIGHT_FOOT', uploaded: true }, r2: { matchId: 7, minute: 6, period: 2, side: 'home', code: 'GOAL_PENALTY', uploaded: true }, r3: { matchId: 7, minute: 32, period: 2 } }));
    let statusCb = null;
    window.elitlig = {
      platform: 'darwin',
      auth: { state: () => Promise.resolve({ signedIn: true, user: { id: 1, fullName: 'Reji Sorumlusu', roleLabel: 'Yönetici', permissions: ['matches.live'] }, access: { known: true, requests: true, live: true } }), onChange: noop, logout: () => Promise.resolve() },
      request: (opts) => { const p = String(opts.path || ''); if (/content\/matches/.test(p)) return ok({ items: [{ id: 7, home: 'Ankara Gençlikspor', away: 'Karadeniz FK', time: '21:00', status: 'canli' }] }); if (p === '/maclar') return ok([Object.assign({}, match, { match_time: '21:00:00' })]); const hit = fixtures.find(([re]) => re.test(p)); if (!hit) window.__unmatched.push(p); return ok(hit ? hit[1] : (p.includes('summary') ? {} : [])); },
      onDataChanged: noop,
      sync: { status: () => Promise.resolve({ online: true, pending: 0 }), flush: () => Promise.resolve(), onStatus: noop, onDone: noop },
      focus: { state: () => Promise.resolve(null), command: () => Promise.resolve(), onState: noop },
      files: { save: () => Promise.resolve(), open: () => Promise.resolve(), reveal: () => Promise.resolve() },
      chat: { status: () => Promise.resolve({ unread: 0 }), onUnread: noop, onEvent: noop, onStatus: noop },
      requests: { summary: () => Promise.resolve({ total: 0 }), onSummary: noop, onChange: noop },
      app: { info: () => Promise.resolve({}), openExternal: () => Promise.resolve(), openWeb: () => Promise.resolve(), notify: () => Promise.resolve(), focused: () => Promise.resolve(true) },
      quick: {}, onNavigate: noop, onCommand: noop, onTheme: noop,
      studio: {
        info: () => Promise.resolve({ ffmpeg: { available: true, version: '7.1.1', encoders: { videotoolbox: true, libx264: true } }, platform: 'darwin', arch: 'arm64' }),
        mediaAccess: () => Promise.resolve({ camera: 'granted', microphone: 'granted', screen: 'granted' }),
        requestMediaAccess: () => Promise.resolve(true), listScreens: () => Promise.resolve([]), selectScreen: () => Promise.resolve(true),
        start: (o) => { window.__startOpts = o; setTimeout(() => statusCb && statusCb({ state: 'recording', fps: 30, bitrateKbps: 2480, droppedFrames: 3, speed: 0.93, localRecord: o.localRecord ? { path: '/Users/reji/Movies/ElitLig/mac-7-2026-11-05.mp4', sizeBytes: 412e6 } : undefined }), 100); return Promise.resolve({ ok: true, sessionId: 's1', encoder: 'h264_videotoolbox', localPath: o.localRecord ? '/Users/reji/Movies/ElitLig/mac-7-2026-11-05.mp4' : undefined }); }, pushChunk: () => {}, stop: () => Promise.resolve(true),
        onStatus: (cb) => { statusCb = cb; return () => {}; }, onRestartRecorder: noop,
        saveClip: () => Promise.resolve({ ok: false }), listClips: () => Promise.resolve([]), deleteClip: () => Promise.resolve(true), uploadClip: () => Promise.resolve({ ok: true }), revealClip: () => Promise.resolve(true),
        angles: { start: (o) => { window.__anglesStarted = o; return Promise.resolve({ ok: true, started: o.sources.map((s) => s.id) }); }, pushChunk: (id) => { window.__angleChunks = (window.__angleChunks || 0) + 1; }, stop: () => Promise.resolve(true), status: () => Promise.resolve((window.__anglesStarted?.sources || []).map((s) => ({ id: s.id, name: s.name, state: 'recording', bufferedMs: 38000 }))), onStatus: noop, onRestartRecorder: noop },
        saveReplay: (o) => { window.__saved = o; return replayList().then((l) => ({ ok: true, replay: { ...l[0], id: 'r4', createdAt: new Date().toISOString() } })); },
        listReplays: replayList, updateReplay: (id, p) => Promise.resolve({ ok: true }), deleteReplay: () => Promise.resolve(true), revealReplay: () => Promise.resolve(true), revealDiagnostics: () => Promise.resolve(true),
        render: { start: (o) => { window.__render = o; return Promise.resolve({ ok: true, renderId: 'h1' }); }, pushChunk: () => { window.__renderChunks = (window.__renderChunks || 0) + 1; }, finish: async () => { const [p] = await clips(); return { ok: true, file: { name: 'highlight-1.mp4', url: p, path: '/tmp/h.mp4', durationMs: 11800, sizeBytes: 9.4e6, width: 1920, height: 1080 } }; }, cancel: () => Promise.resolve(true), onProgress: noop },
        uploadHighlight: () => Promise.resolve({ ok: true }), deleteHighlight: () => Promise.resolve({ ok: true }), onUploadProgress: noop,
        chooseRecordDir: () => Promise.resolve({ path: '/Users/reji/Movies/ElitLig' }),
        displays: () => Promise.resolve([{ id: 1, label: 'Dahili Retina Ekran', bounds: { x: 0, y: 0, width: 1512, height: 982 }, primary: true, scaleFactor: 2 }, { id: 2, label: 'LED Duvar (HDMI)', bounds: { x: 1512, y: 0, width: 1920, height: 1080 }, primary: false, scaleFactor: 1 }]),
        led: { open: (o) => { window.__ledOpen = o; return Promise.resolve({ ok: true }); }, close: () => Promise.resolve({ ok: true }), status: () => Promise.resolve(window.__ledOpen ? { open: true, displayId: window.__ledOpen.displayId, mode: window.__ledOpen.mode } : { open: false }), sendState: (st) => { window.__ledStates = (window.__ledStates || 0) + 1; } },
        interview: { start: (o) => { window.__ivStart = o; return Promise.resolve({ ok: true, id: 'iv1' }); }, stop: () => Promise.resolve({ ok: true, file: { name: 'roportaj-7.mp4', path: '/tmp/r.mp4', url: '', durationMs: 42000 } }), upload: () => new Promise((r) => setTimeout(() => r({ ok: true, data: { url: 'https://cdn.elitlig.com/r/7.mp4' } }), 600)) },
      },
    };
  if (scale) localStorage.setItem('studio.settings.v1', JSON.stringify({ view: { scale, hints: true, tooltips: true, theme: 'gece' } }));
  if (layout) localStorage.setItem('studio.layout.v1', JSON.stringify(layout));
};
