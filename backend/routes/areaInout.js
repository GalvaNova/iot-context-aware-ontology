// routes/areaInout.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// 🔹 Endpoint Fuseki (ganti dengan IP / dataset Anda)
const FUSEKI_UPDATE_INOUT = "http://192.168.43.238:3030/areaInout-2/update";
const FUSEKI_QUERY_INOUT = "http://192.168.43.238:3030/areaInout-2/query";

// ==================================================
// 🟢 POST /dataInout → simpan hasil counting orang
// ==================================================
router.post("/dataInout", async (req, res) => {
  const { personCount } = req.body;

  if (personCount === undefined) {
    return res.status(400).json({ error: "Missing personCount" });
  }

  // 🔹 Query hanya menyimpan raw sensor (personCount)
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

    res.json({ message: "Person count stored", personCount });
  } catch (err) {
    console.error("❌ areaInout error:", err.message);
    res.status(500).json({ error: "Failed to update Fuseki" });
  }
});

// ==================================================
// 🟡 GET /person-count → baca jumlah orang
// ==================================================
router.get("/person-count", async (req, res) => {
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
    res.json({
      personCount: parseInt(b.count?.value || 0),
    });
  } catch (err) {
    console.error("❌ /person-count error:", err.message);
    res.status(500).json({ error: "Failed to fetch person count" });
  }
});

module.exports = router;
