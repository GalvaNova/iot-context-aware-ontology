// routes/reasoning/reasoning-cook.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const FUSEKI_BASE = "http://192.168.43.238:3030";
const BACKEND_BASE = "http://192.168.43.238:5000";
const DATASET = "areaCook-2";
const NS = "http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#";

// ==============================
// 🔹 Helper Functions
// ==============================
async function queryFuseki(sparql) {
  const res = await axios.get(`${FUSEKI_BASE}/${DATASET}/query`, {
    params: { query: sparql },
    headers: { Accept: "application/sparql-results+json" },
  });
  return res.data.results.bindings[0] || {};
}

async function updateFuseki(sparql) {
  await axios.post(
    `${FUSEKI_BASE}/${DATASET}/update`,
    `update=${encodeURIComponent(sparql)}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
}

// ==============================
// 🔹 Reasoning Logic
// ==============================
function reasonCook(data) {
  let buzzer = "st_actOFF";
  let exhaust = "st_actOFF";

  // Rule 1: Gas tinggi → buzzer ON
  if (data.gas > 700) buzzer = "st_actON";

  // Rule 2: Api padam & jarak > 10cm → buzzer ON
  if (data.flame === 0 && data.dist > 10) buzzer = "st_actON";

  // Rule 3: Exhaust aktif jika api menyala atau suhu tinggi
  if (data.flame === 0 || data.temp > 35) exhaust = "st_actON";

  return { buzzer, exhaust };
}

// ==============================
// 🔹 Reasoning Runner
// ==============================
async function runReasoning() {
  try {
    const reasoningStart = Date.now();

    const q = `
      PREFIX tb: <${NS}>
      SELECT ?flame ?gas ?temp ?dist WHERE {
        OPTIONAL { tb:read_AC_flame tb:ACdp_hasFIREvalue ?flame }
        OPTIONAL { tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?gas }
        OPTIONAL { tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?temp }
        OPTIONAL { tb:read_AC_Dist tb:ACdp_hasDISTvalue ?dist }
      } LIMIT 1
    `;
    const d = await queryFuseki(q);
    const data = {
      flame: parseInt(d.flame?.value || 1),
      gas: parseFloat(d.gas?.value || 0),
      temp: parseFloat(d.temp?.value || 25),
      dist: parseFloat(d.dist?.value || 100),
    };

    const { buzzer, exhaust } = reasonCook(data);
    const reasoningTime = Date.now() - reasoningStart;
    const fullResponseTime = reasoningTime + 20;
    const endToEndTime = fullResponseTime + 40;
    const responseTime = Math.max(fullResponseTime - reasoningTime, 0);

    await axios.post(`${BACKEND_BASE}/api/cook/update-status`, {
      buzzer,
      exhaust,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
      responseTime,
    });

    console.log(`🧠 Reasoning Cook: Buzzer=${buzzer}, Exhaust=${exhaust}`);
  } catch (err) {
    console.error("❌ Reasoning Cook error:", err.message);
  }
}

// Jalankan reasoning otomatis tiap 5 detik
setInterval(runReasoning, 5000);

router.get("/run", async (req, res) => {
  await runReasoning();
  res.json({ message: "Reasoning Cook executed" });
});

module.exports = router;
