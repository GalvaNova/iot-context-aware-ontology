// routes/reasoning/reasoning-wash.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const FUSEKI_BASE = "http://192.168.43.238:3030";
const BACKEND_BASE = "http://192.168.43.238:5000";
const DATASET = "areaWash-2";
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
// 🔹 Reasoning Logic (Wash Area)
// ======================================================
function reasonWash(data) {
  let washing = "st_washNO";
  let valve = "st_actOFF";

  // Rule 1: Jika objek & orang terdeteksi dekat → sedang mencuci
  if (data.obj < 20 && data.pers < 20) washing = "st_washYES";

  // Rule 2: Valve ON jika mencuci, OFF jika tidak
  valve = washing === "st_washYES" ? "st_actON" : "st_actOFF";

  return { washing, valve };
}

// ======================================================
// 🔹 Main Reasoning Runner
// ======================================================
async function runReasoning(requestStart = null) {
  const start = Date.now();
  const reasoningStart = Date.now();

  // Ambil data sensor dari Fuseki
  const qWash = `
    PREFIX tb: <${NS}>
    SELECT ?obj ?pers WHERE {
      OPTIONAL { tb:param_objek tb:ASdp_hasDISTOBJvalue ?obj }
      OPTIONAL { tb:param_orang tb:ASdp_hasDISTPERvalue ?pers }
    } LIMIT 1
  `;

  const result = await queryFuseki(qWash);
  const data = {
    obj: normalize(result[0]?.obj?.value, 100, (v) => parseFloat(v)),
    pers: normalize(result[0]?.pers?.value, 100, (v) => parseFloat(v)),
  };

  // Jalankan rule reasoning
  const { washing, valve } = reasonWash(data);
  const reasoningTime = Date.now() - reasoningStart;

  // Update Fuseki
  try {
    const updates = [
      { action: "fnc_washAct", status: washing, prop: "M_hasActivityStatus" },
      { action: "act_AS_Valve", status: valve, prop: "M_hasActionStatus" },
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
    console.error("❌ Gagal update Fuseki (Wash):", err.message);
  }

  const fullResponseTime = Date.now() - start;
  const endToEndTime = requestStart
    ? Date.now() - requestStart
    : fullResponseTime;

  // Kirim hasil reasoning ke backend
  try {
    await axios.post(`${BACKEND_BASE}/api/wash/update-valve`, {
      status: valve,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
    });
  } catch (err) {
    console.error("❌ Gagal sinkronkan ke backend (Wash):", err.message);
  }

  console.table({
    obj: data.obj,
    pers: data.pers,
    washing,
    valve,
    reasoningTime,
    fullResponseTime,
    endToEndTime,
  });
}

// ======================================================
// ✅ API Manual Trigger
// ======================================================
router.get("/reasoning-wash/run", async (req, res) => {
  const requestStart = Date.now();
  try {
    await runReasoning(requestStart);
    res.json({ message: "Reasoning Wash executed" });
  } catch (err) {
    console.error("❌ reasoning wash error:", err.message);
    res.status(500).json({ error: "Reasoning Wash failed" });
  }
});

// ======================================================
// 🔁 Auto Reasoning (setiap 5 detik)
// ======================================================
setInterval(async () => {
  try {
    await runReasoning();
  } catch (err) {
    console.error("⚠️ Loop error Wash:", err.message);
  }
}, 5000);

module.exports = router;
