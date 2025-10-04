// routes/areaCook.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// ===========================
// 🔹 Konfigurasi Fuseki
// ===========================
const FUSEKI_BASE = "http://192.168.43.238:3030";
const DATASET = "areaCook-2";
const FUSEKI_UPDATE_COOK = `${FUSEKI_BASE}/${DATASET}/update`;
const FUSEKI_QUERY_COOK = `${FUSEKI_BASE}/${DATASET}/query`;
const NS = "http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#";

// ===========================
// 🔹 Variabel Realtime Status
// ===========================
let lastCookData = {
  flame: 1,
  gas: 0,
  temp: 0,
  dist: 0,
  buzzer: "st_actOFF",
  exhaust: "st_actOFF",
  reasoningTime: 0,
  fullResponseTime: 0,
  endToEndTime: 0,
  responseTime: 0, // ✅ tambahkan ini
  timestamp: Date.now(),
};

function getConnectionStatus() {
  const now = Date.now();
  const diff = now - lastCookData.timestamp;
  return diff < 10000 ? "Online" : "Offline"; // 10 detik batas waktu
}

// endpoint baru
router.get("/cook/connection", (req, res) => {
  res.json({
    status: getConnectionStatus(),
    lastUpdate: new Date(lastCookData.timestamp).toLocaleString(),
  });
});

// ==================================================
// 🟢 POST /api/dataCook → Simpan data sensor dari NodeMCU
// ==================================================
router.post("/dataCook", async (req, res) => {
  const { flame, gas, temp, dist } = req.body;
  if ([flame, gas, temp, dist].some((v) => v === undefined)) {
    return res.status(400).json({ error: "Missing sensor values" });
  }

  const updateQuery = `
    PREFIX tb: <${NS}>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    DELETE {
      tb:read_AC_flame tb:ACdp_hasFIREvalue ?oldFlame .
      tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?oldGas .
      tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?oldTemp .
      tb:read_AC_Dist tb:ACdp_hasDISTvalue ?oldDist .
    }
    INSERT {
      tb:read_AC_flame a tb:parameter ; tb:ACdp_hasFIREvalue "${flame}"^^xsd:integer .
      tb:read_AC_Ppm a tb:parameter ; tb:ACdp_hasPPMvalue "${gas}"^^xsd:float .
      tb:read_AC_Temp a tb:parameter ; tb:ACdp_hasTEMPvalue "${temp}"^^xsd:float .
      tb:read_AC_Dist a tb:parameter ; tb:ACdp_hasDISTvalue "${dist}"^^xsd:float .
    }
    WHERE {
      OPTIONAL { tb:read_AC_flame tb:ACdp_hasFIREvalue ?oldFlame . }
      OPTIONAL { tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?oldGas . }
      OPTIONAL { tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?oldTemp . }
      OPTIONAL { tb:read_AC_Dist tb:ACdp_hasDISTvalue ?oldDist . }
    }
  `;

  try {
    const start = Date.now();
    await axios.post(
      FUSEKI_UPDATE_COOK,
      `update=${encodeURIComponent(updateQuery)}`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const responseTime = Date.now() - start;
    lastCookData = {
      ...lastCookData,
      flame: parseInt(flame),
      gas: parseFloat(gas),
      temp: parseFloat(temp),
      dist: parseFloat(dist),
      timestamp: Date.now(),
      responseTime,
    };

    console.log("✅ [Cook] Data sensor diperbarui:", {
      flame,
      gas,
      temp,
      dist,
    });
    res.json({ message: "✅ Sensor data stored", responseTime });
  } catch (err) {
    console.error("❌ [Cook] Gagal update Fuseki:", err.message);
    res.status(500).json({ error: "Failed to update Fuseki" });
  }
});

// ==================================================
// 🟡 GET /api/cook/sensor → Ambil data sensor terakhir
// ==================================================
router.get("/cook/sensor", async (req, res) => {
  const query = `
    PREFIX tb: <${NS}>
    SELECT ?flame ?gas ?temp ?dist WHERE {
      OPTIONAL { tb:read_AC_flame tb:ACdp_hasFIREvalue ?flame . }
      OPTIONAL { tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?gas . }
      OPTIONAL { tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?temp . }
      OPTIONAL { tb:read_AC_Dist tb:ACdp_hasDISTvalue ?dist . }
    } LIMIT 1
  `;
  try {
    const result = await axios.get(
      `${FUSEKI_QUERY_COOK}?query=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/sparql-results+json" } }
    );

    const d = result.data.results.bindings[0] || {};
    const data = {
      flame: parseInt(d.flame?.value || lastCookData.flame),
      gas: parseFloat(d.gas?.value || lastCookData.gas),
      temp: parseFloat(d.temp?.value || lastCookData.temp),
      dist: parseFloat(d.dist?.value || lastCookData.dist),
      timestamp: Date.now(),
    };
    res.json(data);
  } catch (err) {
    console.error("❌ [Cook] Gagal ambil data sensor:", err.message);
    res.status(500).json({ error: "Gagal ambil data sensor" });
  }
});

// ==================================================
// 🟡 GET /api/cook/status → Ambil status aktuator + waktu reasoning
// ==================================================
router.get("/cook/status", (req, res) => {
  res.json(lastCookData); // ✅ jangan hitung ulang, gunakan data sebenarnya
});

// ==================================================
// 🟡 GET /api/cook/actuator → NodeMCU ambil status buzzer & exhaust
// ==================================================
router.get("/cook/actuator", (req, res) => {
  res.json({
    buzzer: lastCookData.buzzer,
    exhaust: lastCookData.exhaust,
  });
});

// ==================================================
// 🟡 POST /api/cook/update-buzzer → dipanggil reasoning.js
// ==================================================
router.post("/cook/update-buzzer", (req, res) => {
  const { status, reasoningTime, fullResponseTime, endToEndTime } = req.body;

  lastCookData.buzzer = status || "st_actOFF";
  lastCookData.reasoningTime = reasoningTime || 0;
  lastCookData.fullResponseTime = fullResponseTime || 0;

  // ✅ hitung responseTime = fullResponse - reasoning
  lastCookData.responseTime = Math.max(
    (fullResponseTime || 0) - (reasoningTime || 0),
    0
  );

  if (endToEndTime !== undefined) lastCookData.endToEndTime = endToEndTime;
  lastCookData.timestamp = Date.now();

  console.log("🔊 Buzzer updated:", lastCookData.buzzer);
  res.json({ message: "Buzzer updated", ...lastCookData });
});

// ==================================================
// 🟡 POST /api/cook/update-exhaust → dipanggil reasoning.js
// ==================================================
router.post("/cook/update-exhaust", (req, res) => {
  const { status, reasoningTime, fullResponseTime, endToEndTime } = req.body;

  lastCookData.exhaust = status || "st_actOFF";
  lastCookData.reasoningTime = reasoningTime || 0;
  lastCookData.fullResponseTime = fullResponseTime || 0;

  // ✅ hitung responseTime juga di sini
  lastCookData.responseTime = Math.max(
    (fullResponseTime || 0) - (reasoningTime || 0),
    0
  );

  if (endToEndTime !== undefined) lastCookData.endToEndTime = endToEndTime;
  lastCookData.timestamp = Date.now();

  console.log("🌀 Exhaust updated:", lastCookData.exhaust);
  res.json({ message: "Exhaust updated", ...lastCookData });
});

// ==================================================
// 🟢 POST /api/cook/endtoend → NodeMCU kirim waktu total
// ==================================================
router.post("/cook/endtoend", (req, res) => {
  const { endToEndTime } = req.body;
  if (endToEndTime !== undefined) {
    lastCookData.endToEndTime = endToEndTime;
    lastCookData.timestamp = Date.now();
  }
  res.json({ message: "End-to-End stored", ...lastCookData });
});

module.exports = router;
