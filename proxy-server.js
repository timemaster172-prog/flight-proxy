const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

app.get("/flights", async (req, res) => {
  const lat = parseFloat(req.query.lat) || 59.65;
  const lon = parseFloat(req.query.lon) || 17.92;

  try {
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/100`;
    console.log("Fetching:", url);

    const response = await fetch(url, {
      headers: { "Accept-Encoding": "identity" },
      size: 10 * 1024 * 1024,
    });

    const text = await response.text();
    console.log("Response length:", text.length);
    console.log("First 200 chars:", text.substring(0, 200));

    const json = JSON.parse(text);
    const aircraft = json.ac || [];
    console.log("Aircraft count:", aircraft.length);

    const flights = aircraft.map(a => ({
      icao24:      a.hex      || "????",
      callsign:    (a.flight  || "UNKNOWN").trim(),
      latitude:    a.lat      || 0,
      longitude:   a.lon      || 0,
      altitude:    a.alt_baro || 0,
      speed:       a.gs       || 0,
      heading:     a.track    || 0,
      vertical:    a.baro_rate || 0,
      squawk:      a.squawk   || "",
      aircraft:    a.t        || "",
      origin:      a.r        || "",
      distance_nm: a.dst      || 0,
    }));

    res.json(flights);
  } catch (err) {
    console.error("Error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));