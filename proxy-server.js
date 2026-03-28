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
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/250`;
    const response = await fetch(url);
    const json = await response.json();
    res.json(json.ac || []);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));