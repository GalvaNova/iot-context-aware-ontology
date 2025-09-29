// routes/areaWash.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// 🔹 Endpoint Fuseki
const FUSEKI_UPDATE_WASH = "http://192.168.43.238:3030/areaWash-2/update";
const FUSEKI_QUERY_WASH = "http://192.168.43.238:3030/areaWash-2/query";

// 🔹 Variabel realtime
let lastWashData = {
  jarak1: null,
  jarak2: null,
  timestamp: null,
  reasoningTime: null,
  fullResponseTime: null,
  endToEndResponseTime: null,
};

let lastValveStatus = {
  status: "st_actOFF",
  reasoningTime: null,
  fullResponseTime: null,
};

let valveStatus = "OFF";
let lastEndToEnd = null;

// =============================
// 🚰 POST sensor (raw ultrasonic wash)
// =============================
router.post("/sensorWash", async (req, res) => {
  const { jarak1, jarak2 } = req.body;
  const start = Date.now();

  if (jarak1 === undefined || jarak2 === undefined) {
    return res.status(400).json({ error: "Missing jarak values" });
  }

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

  try {
    // ⬅️ Update Fuseki
    await axios.post(
      FUSEKI_UPDATE_WASH,
      `update=${encodeURIComponent(updateQuery)}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 6000,
      }
    );

    const responseTime = Date.now() - start;

    // simpan data terakhir
    lastWashData = {
      ...lastWashData,
      jarak1: Number(jarak1),
      jarak2: Number(jarak2),
      timestamp: Date.now(),
      fullResponseTime: responseTime, // isi agar dashboard tidak null
    };

    // 🚀 Jalankan reasoning otomatis
    try {
      await axios.get("http://192.168.43.238:5000/api/reasoning/run");
      console.log("✅ Reasoning otomatis dijalankan setelah sensor masuk");
    } catch (err) {
      console.error("❌ Gagal jalankan reasoning otomatis:", err.message);
    }

    res.json({
      message: "Wash sensor data stored + reasoning triggered",
      responseTime,
      data: lastWashData,
    });
  } catch (err) {
    console.error("❌ areaWash error:", err.message);
    res.status(500).json({ error: "Failed to update Fuseki" });
  }
});

// =============================
// 🚰 GET raw sensor data dari Fuseki
// =============================
router.get("/rawWash", async (req, res) => {
  const start = Date.now();
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
      { headers: { Accept: "application/sparql-results+json" }, timeout: 6000 }
    );

    const b = result.data.results.bindings[0] || {};
    const responseTime = Date.now() - start;

    res.json({
      jarak1: parseFloat(b.dist1?.value || 0),
      jarak2: parseFloat(b.dist2?.value || 0),
      responseTime,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("❌ /rawWash error:", err.message);
    res.status(500).json({ error: "Failed to fetch raw sensor" });
  }
});

// =============================
// 🚰 GET realtime last sensor (tanpa query Fuseki)
// =============================
router.get("/wash/realtime", (req, res) => {
  res.json(lastWashData);
});

// =============================
// 🚰 GET status valve
// =============================
router.get("/wash/valve-status", async (req, res) => {
  const start = Date.now();
  try {
    const selectQuery = `
      PREFIX tb: <http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#>
      SELECT ?status WHERE {
        OPTIONAL { tb:act_AS_Valve tb:M_hasActionStatus ?status }
      } LIMIT 1
    `;

    const result = await axios.get(
      `${FUSEKI_QUERY_WASH}?query=${encodeURIComponent(selectQuery)}`,
      { headers: { Accept: "application/sparql-results+json" }, timeout: 6000 }
    );

    const b = result.data.results.bindings[0] || {};
    const valveState = b.status?.value?.split("#")[1] || "st_actOFF";
    const responseTime = Date.now() - start;

    // update cache
    lastValveStatus.status = valveState;

    res.json({
      status: valveState,
      responseTime,
      reasoningTime: lastWashData.reasoningTime ?? null,
      fullResponseTime: lastWashData.fullResponseTime ?? null,
      endToEndResponseTime: lastWashData.endToEndResponseTime ?? null,
    });
  } catch (err) {
    console.error("❌ /wash/valve-status error:", err.message);
    res.status(500).json({ error: "Failed to fetch valve status" });
  }
});

// =============================
// 🚰 POST update valve (dipanggil reasoning.js)
// =============================
router.post("/wash/update-valve", (req, res) => {
  console.log("🔔 [DEBUG] Update valve diterima:", req.body);
  valveStatus = req.body.status || "OFF";

  if (req.body.fullResponseTime !== undefined) {
    lastWashData.fullResponseTime = req.body.fullResponseTime;
  }
  if (req.body.reasoningTime !== undefined) {
    lastWashData.reasoningTime = req.body.reasoningTime;
  }

  lastValveStatus = {
    status: valveStatus,
    fullResponseTime: lastWashData.fullResponseTime,
    reasoningTime: lastWashData.reasoningTime,
  };

  res.json({
    message: "Valve status updated",
    status: valveStatus,
    fullResponseTime: lastWashData.fullResponseTime || null,
    reasoningTime: lastWashData.reasoningTime || null,
    timestamp: Date.now(),
  });
});

// =============================
// 🚰 POST End-to-End Response Time (dari NodeMCU)
// =============================
router.post("/wash/endtoend-log", (req, res) => {
  const { endToEndResponseTime } = req.body;

  if (endToEndResponseTime !== undefined) {
    lastWashData.endToEndResponseTime = endToEndResponseTime;
    lastEndToEnd = { endToEndResponseTime, timestamp: Date.now() };
  }

  res.json({
    message: "End-to-End response time updated",
    endToEndResponseTime: lastWashData.endToEndResponseTime,
  });
});

router.get("/wash/endtoend-log", (req, res) => {
  res.json(
    lastEndToEnd || { endToEndResponseTime: null, timestamp: Date.now() }
  );
});

module.exports = router;
