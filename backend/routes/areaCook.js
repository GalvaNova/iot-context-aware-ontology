const express = require("express");
const axios = require("axios");
const router = express.Router();

// 🔹 Endpoint Fuseki (hardcode, tanpa .env & config.js)
const FUSEKI_UPDATE_COOK = "http://192.168.43.238:3030/areaCook-2/update";
const FUSEKI_QUERY_COOK = "http://192.168.43.238:3030/areaCook-2/query";

// ✅ POST /sensorCook → terima data sensor dari ESP
router.post("/sensorCook", async (req, res) => {
  const { distance, flame, gas, temp } = req.body;
  if ([distance, flame, gas, temp].some((v) => v === undefined)) {
    return res.status(400).json({ error: "Missing sensor values" });
  }

  const updateQuery = `
    PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    DELETE {
      tb:read_AC_Dist tb:ACdp_hasDISTvalue ?oldDist .
      tb:read_AC_flame tb:ACdp_hasFIREvalue ?oldFlame .
      tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?oldPPM .
      tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?oldTemp .
    }
    INSERT {
      tb:read_AC_Dist a tb:parameter ;
        tb:ACdp_hasDISTvalue "${distance}"^^xsd:float .

      tb:read_AC_flame a tb:parameter ;
        tb:ACdp_hasFIREvalue "${flame}"^^xsd:float .

      tb:read_AC_Ppm a tb:parameter ;
        tb:ACdp_hasPPMvalue "${gas}"^^xsd:float .

      tb:read_AC_Temp a tb:parameter ;
        tb:ACdp_hasTEMPvalue "${temp}"^^xsd:float .
    }
    WHERE {
      OPTIONAL { tb:read_AC_Dist tb:ACdp_hasDISTvalue ?oldDist . }
      OPTIONAL { tb:read_AC_flame tb:ACdp_hasFIREvalue ?oldFlame . }
      OPTIONAL { tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?oldPPM . }
      OPTIONAL { tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?oldTemp . }
    }
  `;

  try {
    await axios.post(
      FUSEKI_UPDATE_COOK,
      `update=${encodeURIComponent(updateQuery)}`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    res.json({ message: "Cook sensor data stored" });
  } catch (err) {
    console.error("❌ areaCook error:", err.message);
    res.status(500).json({ error: "Failed to update Fuseki" });
  }
});

// ✅ GET /statusCook → baca nilai sensor dari Fuseki
router.get("/statusCook", async (req, res) => {
  const query = `
    PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
    SELECT ?dist ?flame ?gas ?temp WHERE {
      tb:read_AC_Dist tb:ACdp_hasDISTvalue ?dist .
      tb:read_AC_flame tb:ACdp_hasFIREvalue ?flame .
      tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?gas .
      tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?temp .
    }
    LIMIT 1
  `;

  try {
    const result = await axios.get(
      `${FUSEKI_QUERY_COOK}?query=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/sparql-results+json" } }
    );

    const b = result.data.results.bindings[0] || {};
    res.json({
      distance: parseFloat(b.dist?.value || 0),
      flame: parseFloat(b.flame?.value || 0),
      gas: parseFloat(b.gas?.value || 0),
      temp: parseFloat(b.temp?.value || 0),
    });
  } catch (err) {
    console.error("❌ /statusCook error:", err.message);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

module.exports = router;
