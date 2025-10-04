// routes/reasoning/reasoning-cook.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const FUSEKI_BASE = "http://192.168.43.238:3030";
const BACKEND_BASE = "http://192.168.43.238:5000";
const DATASET = "areaCook-2";
const NS = "http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#";

// ======================================================
// 🔹 Helper Functions
// ======================================================
async function queryFuseki(sparql) {
  const url = `${FUSEKI_BASE}/${DATASET}/query?query=${encodeURIComponent(
    sparql
  )}`;
  const res = await axios.get(url, {
    headers: { Accept: "application/sparql-results+json" },
  });
  return res.data.results.bindings;
}

async function updateFuseki(sparql) {
  const url = `${FUSEKI_BASE}/${DATASET}/update`;
  await axios.post(url, `update=${encodeURIComponent(sparql)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

function normalize(val, def, parse = (v) => v) {
  return val !== undefined ? parse(val) : def;
}

// ======================================================
// 🔹 Reasoning Logic (Cook Area)
// ======================================================
function reasonCook(data) {
  let buzzer = "st_actOFF";
  let exhaust = "st_actOFF";
  let cooking = "st_cookNO";

  // Rule 1: Gas tinggi → buzzer ON
  if (data.gas > 700) buzzer = "st_actON";

  // Rule 2: Tidak ada api dan tidak ada orang → buzzer ON
  if (data.flame === 0 && data.dist > 10) buzzer = "st_actON";

  // Rule 3: Sedang memasak jika api menyala & orang dekat
  if (data.flame === 0 && data.dist <= 10) cooking = "st_cookYES";
  if (data.flame === 1) cooking = "st_cookNO";

  // Rule 4: Exhaust fan aktif jika api menyala / suhu tinggi
  if (data.flame === 0) exhaust = "st_actON";
  else if (data.flame === 1 && data.temp > 35) exhaust = "st_actON";
  else exhaust = "st_actOFF";

  return { buzzer, exhaust, cooking };
}

// ======================================================
// 🔹 Main Reasoning Runner
// ======================================================
async function runReasoning(requestStart = null) {
  const start = Date.now();
  const reasoningStart = Date.now();

  // Ambil data sensor dari Fuseki
  const qCook = `
    PREFIX tb: <${NS}>
    SELECT ?flame ?gas ?temp ?dist WHERE {
      OPTIONAL { tb:read_AC_flame tb:ACdp_hasFIREvalue ?flame }
      OPTIONAL { tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?gas }
      OPTIONAL { tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?temp }
      OPTIONAL { tb:read_AC_Dist tb:ACdp_hasDISTvalue ?dist }
    } LIMIT 1
  `;

  const result = await queryFuseki(qCook);
  const data = {
    flame: normalize(result[0]?.flame?.value, 1, (v) => parseInt(v)),
    gas: normalize(result[0]?.gas?.value, 0, (v) => parseInt(v)),
    temp: normalize(result[0]?.temp?.value, 25, (v) => parseFloat(v)),
    dist: normalize(result[0]?.dist?.value, 100, (v) => parseFloat(v)),
  };

  // Jalankan rule reasoning
  const { buzzer, exhaust, cooking } = reasonCook(data);
  const reasoningTime = Date.now() - reasoningStart;

  // Update Fuseki
  try {
    const updates = [
      { action: "act_AC_Buzzer", status: buzzer, prop: "M_hasActionStatus" },
      { action: "act_AC_Exhaust", status: exhaust, prop: "M_hasActionStatus" },
      { action: "fnc_cookAct", status: cooking, prop: "M_hasActivityStatus" },
    ];

    for (const u of updates) {
      const sparql = `
        PREFIX tb: <${NS}>
        DELETE { tb:${u.action} tb:${u.prop} ?old }
        INSERT { tb:${u.action} tb:${u.prop} tb:${u.status} }
        WHERE { OPTIONAL { tb:${u.action} tb:${u.prop} ?old } }
      `;
      await updateFuseki(sparql);
    }
  } catch (err) {
    console.error("❌ Gagal update Fuseki:", err.message);
  }

  const fullResponseTime = Date.now() - start;
  const endToEndTime = requestStart
    ? Date.now() - requestStart
    : fullResponseTime;

  // Kirim ke backend Cook
  try {
    await axios.post(`${BACKEND_BASE}/api/cook/update-buzzer`, {
      status: buzzer,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
    });
    await axios.post(`${BACKEND_BASE}/api/cook/update-exhaust`, {
      status: exhaust,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
    });
  } catch (err) {
    console.error("❌ Gagal sinkronkan ke backend:", err.message);
  }

  console.table({
    flame: data.flame,
    gas: data.gas,
    temp: data.temp,
    dist: data.dist,
    buzzer,
    exhaust,
    cooking,
    reasoningTime,
    fullResponseTime,
    endToEndTime,
  });
}

// ======================================================
// ✅ API Manual Trigger
// ======================================================
router.get("/reasoning-cook/run", async (req, res) => {
  const requestStart = Date.now();
  try {
    await runReasoning(requestStart);
    res.json({ message: "Reasoning Cook executed" });
  } catch (err) {
    console.error("❌ reasoning cook error:", err.message);
    res.status(500).json({ error: "Reasoning Cook failed" });
  }
});

// ======================================================
// 🔁 Auto Reasoning (setiap 5 detik)
// ======================================================
setInterval(async () => {
  try {
    await runReasoning();
  } catch (err) {
    console.error("⚠️ Loop error Cook:", err.message);
  }
}, 5000);

module.exports = router;
