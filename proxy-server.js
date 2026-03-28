const express = require("express");
const cors = require("cors");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Accept-Encoding": "identity"
      }
    }, (res) => {
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      res.on("error", reject);
    }).on("error", reject);
  });
}

app.get("/flights", async (req, res) => {
  const lat = parseFloat(req.query.lat) || 59.65;
  const lon = parseFloat(req.query.lon) || 17.92;

  try {
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/100`;
    console.log("Fetching:", url);

    const text = await fetchUrl(url);
    console.log("Length:", text.length);

    const json = JSON.parse(text);
    const flights = (json.ac || []).map(a => ({
      icao24:    a.hex       || "????",
      callsign:  (a.flight   || "UNKNOWN").trim(),
      latitude:  a.lat       || 0,
      longitude: a.lon       || 0,
      altitude:  a.alt_baro  || 0,
      speed:     a.gs        || 0,
      heading:   a.track     || 0,
      vertical:  a.baro_rate || 0,
      squawk:    a.squawk    || "",
      aircraft:  a.t         || "",
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