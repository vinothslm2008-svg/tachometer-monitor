// ═══════════════════════════════════════════════════════════════
// Tachometer Monitor — Vercel Serverless API
// Route: /api/rpm
//
//  POST /api/rpm   ← ESP32 sends {"rpm": 1234}  every ~1 second
//  GET  /api/rpm   ← Browser polls to get latest RPM
//  GET  /api/rpm?history=1  ← returns last 300 readings
//
// ESP32 Arduino example:
//   HTTPClient http;
//   http.begin("https://YOUR-VERCEL-URL/api/rpm");
//   http.addHeader("Content-Type","application/json");
//   http.POST("{\"rpm\":" + String(readRPM()) + "}");
//   http.end();
// ═══════════════════════════════════════════════════════════════

// Module-level store (persists within the same warm Lambda instance)
// ESP32 posts every 1s, so data stays fresh.
let store = {
  rpm:       0,
  ts:        Date.now(),
  history:   [],   // last 300 readings  {rpm, ts}
  deviceId:  '',
};

const MAX_HIST = 300;

export default function handler(req, res) {
  // ── CORS — allow browser + ESP32 to call this ──
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-device-id');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // ── POST  (ESP32 → Vercel) ──────────────────────
  if (req.method === 'POST') {
    try {
      const body     = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const rpm      = Math.max(0, Math.round(Number(body.rpm ?? body.RPM ?? 0)));
      const deviceId = req.headers['x-device-id'] || body.deviceId || 'esp32';
      const now      = Date.now();

      store.rpm      = rpm;
      store.ts       = now;
      store.deviceId = deviceId;

      // append to rolling history
      store.history.push({ rpm, ts: now });
      if (store.history.length > MAX_HIST) store.history.shift();

      res.status(200).json({ ok: true, rpm, ts: now });
    } catch (e) {
      res.status(400).json({ error: 'Bad JSON body', detail: e.message });
    }
    return;
  }

  // ── GET  (Browser → Vercel) ────────────────────
  if (req.method === 'GET') {
    const staleSec = Math.round((Date.now() - store.ts) / 1000);
    const isStale  = staleSec > 10;   // no data for >10s = offline

    if (req.query.history === '1') {
      // Full history array for chart
      res.status(200).json({ history: store.history, stale: isStale });
      return;
    }

    res.status(200).json({
      rpm:      store.rpm,
      ts:       store.ts,
      stale:    isStale,
      staleSec,
      deviceId: store.deviceId,
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
