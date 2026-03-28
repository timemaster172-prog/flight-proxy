/**
 * FlightRadar Proxy Server for Roblox
 * ------------------------------------
 * Fetches real-time flight data from the OpenSky Network (free, no key needed)
 * and serves it in a format the Roblox script expects.
 *
 * SETUP:
 *   npm install express cors node-fetch
 *   node proxy-server.js
 *
 * Then deploy to any Node host (Railway, Render, Fly.io, etc.)
 * and set CONFIG.PROXY_URL in the Roblox script to your deployed URL + /flights
 *
 * ENDPOINT:
 *   GET /flights?lat=59.65&lon=17.92&radius=300
 *
 * Optional env vars:
 *   PORT          - listening port (default 3000)
 *   OPENSKY_USER  - OpenSky username (doubles rate limit to 10 req/min)
 *   OPENSKY_PASS  - OpenSky password
 */

const express = require("express");
const cors    = require("cors");
// node-fetch v2 for CommonJS compatibility
const fetch   = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ── in-memory cache so we don't hammer OpenSky ──────────────────────────────
const CACHE_TTL_MS = 10_000; // cache results for 10 seconds
let cache = { ts: 0, key: "", data: null };

// ── Haversine (degrees → km) ─────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Convert nautical miles to degrees (rough bounding box) ───────────────────
function nmToDeg(nm) {
  return nm / 60; // 1 NM ≈ 1 arcminute
}

// ── Fetch from OpenSky Network ───────────────────────────────────────────────
async function fetchOpenSky(latMin, latMax, lonMin, lonMax) {
  const base = "https://opensky-network.org/api/states/all";
  const url  = `${base}?lamin=${latMin}&lomin=${lonMin}&lamax=${latMax}&lomax=${lonMax}`;

  const headers = { "Content-Type": "application/json" };
  if (process.env.OPENSKY_USER && process.env.OPENSKY_PASS) {
    const creds = Buffer.from(
      `${process.env.OPENSKY_USER}:${process.env.OPENSKY_PASS}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  }

  const res = await fetch(url, { headers, timeout: 10_000 });
  if (!res.ok) throw new Error(`OpenSky returned ${res.status}`);

  const json = await res.json();
  return json.states || []; // array of state vectors
}

// ── Parse a state vector into a readable object ──────────────────────────────
// OpenSky state vector indices:
// 0  icao24        1  callsign       2  origin_country
// 3  time_position 4  last_contact   5  longitude
// 6  latitude      7  baro_altitude  8  on_ground
// 9  velocity      10 true_track     11 vertical_rate
// 12 sensors       13 geo_altitude   14 squawk
// 15 spi           16 position_source
function parseState(s) {
  const altMeters  = s[7] ?? s[13] ?? 0;
  const speedMs    = s[9] ?? 0;
  return {
    icao24    : s[0]  ?? "????",
    callsign  : (s[1] ?? "UNKNOWN").trim(),
    origin    : s[2]  ?? "",
    longitude : s[5]  ?? 0,
    latitude  : s[6]  ?? 0,
    altitude  : Math.round((altMeters ?? 0) * 3.28084), // metres → feet
    speed     : Math.round((speedMs   ?? 0) * 1.94384), // m/s   → knots
    heading   : Math.round(s[10] ?? 0),
    vertical  : Math.round((s[11] ?? 0) * 196.85),      // m/s   → ft/min
    on_ground : s[8]  ?? false,
    squawk    : s[14] ?? "",
    last_seen : s[4]  ?? 0,
  };
}

// ── Main route ───────────────────────────────────────────────────────────────
app.get("/flights", async (req, res) => {
  const lat    = parseFloat(req.query.lat)    || 59.65;
  const lon    = parseFloat(req.query.lon)    || 17.92;
  const radius = parseFloat(req.query.radius) || 300;   // nautical miles

  // Bounding box
  const deg    = nmToDeg(radius);
  const latMin = lat - deg;
  const latMax = lat + deg;
  const lonMin = lon - deg;
  const lonMax = lon + deg;

  const cacheKey = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lonMin.toFixed(2)},${lonMax.toFixed(2)}`;
  const now      = Date.now();

  // Serve from cache if fresh
  if (cache.key === cacheKey && now - cache.ts < CACHE_TTL_MS && cache.data) {
    console.log(`[cache hit] ${cacheKey}`);
    return res.json(cache.data);
  }

  try {
    console.log(`[fetch] lat=${lat} lon=${lon} radius=${radius}nm`);
    const states = await fetchOpenSky(latMin, latMax, lonMin, lonMax);

    const flights = states
      .map(parseState)
      .filter(f => !f.on_ground) // optional: remove ground traffic
      .map(f => ({
        ...f,
        distance_nm: +(haversineKm(lat, lon, f.latitude, f.longitude) / 1.852).toFixed(1),
      }))
      .sort((a, b) => a.distance_nm - b.distance_nm);

    cache = { ts: now, key: cacheKey, data: flights };
    res.json(flights);

    console.log(`[ok] returned ${flights.length} flights`);
  } catch (err) {
    console.error("[error]", err.message);
    // Return stale cache rather than an empty error if available
    if (cache.data) return res.json(cache.data);
    res.status(502).json({ error: "Failed to fetch flight data", detail: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Flight proxy listening on port ${PORT}`));