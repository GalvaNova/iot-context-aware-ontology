// routes/areaInout.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// Endpoint Fuseki
const FUSEKI_UPDATE_INOUT = "http://192.168.43.238:3030/areaInout-2/update";
const FUSEKI_QUERY_INOUT = "http://192.168.43.238:3030/areaInout-2/query";

// 🔹 Variabel realtime
let lastInoutData = {
  status: "st_actOFF",
  personCount: 0,
  reasoningTime: 0,
  fullResponseTime: 0,
  endToEndTime: 0,
  timestamp: null,
};

// ==================================================
// 🟢 POST /dataInout → simpan hasil counting orang
// ==================================================
router.post("/dataInout", async (req, res) => {
  const { personCount } = req.body;
  const start = Date.now();

  if (personCount === undefined) {
    return res.status(400).json({ error: "Missing personCount" });
  }

  const updateQuery = `
    PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    DELETE {
      tb:read_AE_CountPers tb:AEdp_hasCOUNTvalue ?oldCount .
    }
    INSERT {
      tb:read_AE_CountPers a tb:parameter ;
        tb:AEdp_hasCOUNTvalue "${personCount}"^^xsd:integer .
    }
    WHERE {
      OPTIONAL { tb:read_AE_CountPers tb:AEdp_hasCOUNTvalue ?oldCount . }
    }
  `;

  try {
    await axios.post(
      FUSEKI_UPDATE_INOUT,
      `update=${encodeURIComponent(updateQuery)}`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const responseTime = Date.now() - start;

    // Simpan count ke lastInoutData
    lastInoutData.personCount = personCount;
    lastInoutData.timestamp = Date.now();

    res.json({
      message: "Person count stored",
      personCount,
      responseTime,
    });
  } catch (err) {
    console.error("❌ areaInout error:", err.message);
    res.status(500).json({ error: "Failed to update Fuseki" });
  }
});

// ==================================================
// 🟡 GET /person-count → baca jumlah orang
// ==================================================
router.get("/person-count", async (req, res) => {
  const start = Date.now();
  const query = `
    PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
    SELECT ?count WHERE {
      tb:read_AE_CountPers tb:AEdp_hasCOUNTvalue ?count .
    }
    LIMIT 1
  `;

  try {
    const result = await axios.get(
      `${FUSEKI_QUERY_INOUT}?query=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/sparql-results+json" } }
    );

    const b = result.data.results.bindings[0] || {};
    const responseTime = Date.now() - start;
    const count = parseInt(b.count?.value || 0);

    // Update realtime data
    lastInoutData.personCount = count;
    lastInoutData.timestamp = Date.now();

    res.json({
      personCount: count,
      responseTime,
      timestamp: lastInoutData.timestamp,
    });
  } catch (err) {
    console.error("❌ /person-count error:", err.message);
    res.status(500).json({ error: "Failed to fetch person count" });
  }
});

// ==================================================
// 🟢 GET Lampu Status (Realtime + Metrics)
// ==================================================
router.get("/inout/lamp-status", (req, res) => {
  res.json(lastInoutData);
});

// ==================================================
// 🟡 POST update lampu (dipanggil reasoning.js)
// ==================================================
router.post("/inout/update-lamp", (req, res) => {
  const { status, reasoningTime, fullResponseTime, endToEndTime } = req.body;

  lastInoutData.status = status || "st_actOFF";
  lastInoutData.reasoningTime = reasoningTime || 0;
  lastInoutData.fullResponseTime = fullResponseTime || 0;
  if (endToEndTime !== undefined) {
    lastInoutData.endToEndTime = endToEndTime;
  }
  lastInoutData.timestamp = Date.now();

  res.json({ message: "Lamp status updated", ...lastInoutData });
});

// ==================================================
// 🟡 POST End-to-End time (dipanggil NodeMCU)
// ==================================================
router.post("/inout/endtoend", (req, res) => {
  const { endToEndTime } = req.body;
  if (endToEndTime !== undefined) {
    lastInoutData.endToEndTime = endToEndTime;
    lastInoutData.timestamp = Date.now();
  }
  res.json({ message: "End-to-End time stored", endToEndTime });
});

module.exports = router;
