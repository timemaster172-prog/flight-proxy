const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

app.get("/flights", async (req, res) => {
  try {
    const url = "https://api.adsb.lol/v2/lat/59.65/lon/17.92/dist/100";
    console.log("Fetching:", url);

    const response = await fetch(url);
    const text = await response.text();
    console.log("Length:", text.length);

    const json = JSON.parse(text);
    const flights = (json.ac || []).map(a => ({
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
    }));

    console.log("Flights:", flights.length);
    res.json(flights);
  } catch (err) {
    console.error("Error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));