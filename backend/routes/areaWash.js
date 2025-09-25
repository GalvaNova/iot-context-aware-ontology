// routes/areaWash.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// 🔹 Endpoint Fuseki (langsung, tanpa .env & config.js)
const FUSEKI_UPDATE_WASH = "http://192.168.43.238:3030/areaWash-2/update";
const FUSEKI_QUERY_WASH = "http://192.168.43.238:3030/areaWash-2/query";

// =============================
// 🚰 POST sensor (raw ultrasonic wash)
// =============================
router.post("/sensorWash", async (req, res) => {
  const { jarak1, jarak2 } = req.body;

  if (jarak1 === undefined || jarak2 === undefined) {
    return res.status(400).json({ error: "Missing jarak values" });
  }

  // 🔹 SPARQL hanya simpan nilai sensor, tanpa reasoning
  const updateQuery = `
    PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    DELETE {
      tb:param_objek tb:ASdp_hasDISTOBJvalue ?oldObj .
      tb:param_orang tb:ASdp_hasDISTPERvalue ?oldPer .
    }
    INSERT {
      tb:param_objek a tb:parameter ;
        tb:ASdp_hasDISTOBJvalue "${jarak1}"^^xsd:float .

      tb:param_orang a tb:parameter ;
        tb:ASdp_hasDISTPERvalue "${jarak2}"^^xsd:float .
    }
    WHERE {
      OPTIONAL { tb:param_objek tb:ASdp_hasDISTOBJvalue ?oldObj . }
      OPTIONAL { tb:param_orang tb:ASdp_hasDISTPERvalue ?oldPer . }
    }
  `;

  console.log("🔥 SPARQL Update (raw sensor wash):\n", updateQuery);

  try {
    await axios.post(
      FUSEKI_UPDATE_WASH,
      `update=${encodeURIComponent(updateQuery)}`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    res.json({ message: "Wash sensor data stored" });
  } catch (err) {
    console.error("❌ areaWash error:", err.message);
    res.status(500).json({ error: "Failed to update Fuseki" });
  }
});

// =============================
// 🚰 GET raw sensor data
// =============================
// GET /api/rawWash
router.get("/rawWash", async (req, res) => {
  const selectQuery = `
    PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
    SELECT ?dist1 ?dist2 WHERE {
      OPTIONAL { tb:param_objek tb:ASdp_hasDISTOBJvalue ?dist1 . }
      OPTIONAL { tb:param_orang tb:ASdp_hasDISTPERvalue ?dist2 . }
    }
    LIMIT 1
  `;

  try {
    const result = await axios.get(
      `${FUSEKI_QUERY_WASH}?query=${encodeURIComponent(selectQuery)}`,
      { headers: { Accept: "application/sparql-results+json" } }
    );

    const b = result.data.results.bindings[0] || {};
    res.json({
      jarak1: parseFloat(b.dist1?.value || 0),
      jarak2: parseFloat(b.dist2?.value || 0),
    });
  } catch (err) {
    console.error("❌ /rawWash error:", err.message);
    res.status(500).json({ error: "Failed to fetch raw sensor" });
  }
});

module.exports = router;
