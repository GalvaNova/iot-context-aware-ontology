// routes/reasoning/reasoning-inout.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const FUSEKI_BASE = "http://192.168.43.238:3030";
const BACKEND_BASE = "http://192.168.43.238:5000";
const DATASET = "areaInout-2";
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
// 🔹 Reasoning Logic (Inout Area)
// ======================================================
function reasonInout(data, cooking, washing) {
  let lamp = "st_actOFF";

  // Rule 1️⃣ : Jika ada orang di area masuk/keluar → nyalakan lampu
  if (data.count > 0) lamp = "st_actON";

  // Rule 2️⃣ : Jika tidak ada orang & semua area lain tidak aktif → matikan lampu
  if (data.count === 0 && cooking === "st_cookNO" && washing === "st_washNO") {
    lamp = "st_actOFF";
  }

  return { lamp };
}

// ======================================================
// 🔹 Main Reasoning Runner
// ======================================================
async function runReasoning(requestStart = null) {
  const start = Date.now();
  const reasoningStart = Date.now();

  // Ambil data dari Fuseki (area Inout, Cook, dan Wash untuk konteks)
  const qInout = `
    PREFIX tb: <${NS}>
    SELECT ?count ?lampStatus WHERE {
      OPTIONAL { tb:read_AE_CountPers tb:AEdp_hasCOUNTvalue ?count }
      OPTIONAL { tb:act_AE_Lamp tb:M_hasActionStatus ?lampStatus }
    } LIMIT 1
  `;
  const qCook = `
    PREFIX tb: <${NS}>
    SELECT ?cookStatus WHERE {
      OPTIONAL { tb:fnc_cookAct tb:M_hasActivityStatus ?cookStatus }
    } LIMIT 1
  `;
  const qWash = `
    PREFIX tb: <${NS}>
    SELECT ?washStatus WHERE {
      OPTIONAL { tb:fnc_washAct tb:M_hasActivityStatus ?washStatus }
    } LIMIT 1
  `;

  const [inout, cook, wash] = await Promise.all([
    queryFuseki(qInout),
    queryFuseki(qCook.replace(DATASET, "areaCook-2")),
    queryFuseki(qWash.replace(DATASET, "areaWash-2")),
  ]);

  // Normalisasi data
  const data = {
    count: normalize(inout[0]?.count?.value, 0, (v) => parseInt(v)),
    cooking: cook[0]?.cookStatus?.value?.split("#")[1] ?? "st_cookNO",
    washing: wash[0]?.washStatus?.value?.split("#")[1] ?? "st_washNO",
  };

  // Jalankan reasoning
  const { lamp } = reasonInout(data, data.cooking, data.washing);
  const reasoningTime = Date.now() - reasoningStart;

  // Update Fuseki
  try {
    const sparql = `
      PREFIX tb: <${NS}>
      DELETE { tb:act_AE_Lamp tb:M_hasActionStatus ?old }
      INSERT { tb:act_AE_Lamp tb:M_hasActionStatus tb:${lamp} }
      WHERE { OPTIONAL { tb:act_AE_Lamp tb:M_hasActionStatus ?old } }
    `;
    await updateFuseki(sparql);
  } catch (err) {
    console.error("❌ Gagal update Fuseki (Inout):", err.message);
  }

  const fullResponseTime = Date.now() - start;
  const endToEndTime = requestStart
    ? Date.now() - requestStart
    : fullResponseTime;

  // Kirim hasil reasoning ke backend (update status lamp)
  try {
    await axios.post(`${BACKEND_BASE}/api/inout/update-lamp`, {
      status: lamp,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
    });
  } catch (err) {
    console.error("❌ Gagal sinkronkan ke backend (Inout):", err.message);
  }

  console.table({
    count: data.count,
    cooking: data.cooking,
    washing: data.washing,
    lamp,
    reasoningTime,
    fullResponseTime,
    endToEndTime,
  });
}

// ======================================================
// ✅ API Manual Trigger
// ======================================================
router.get("/reasoning-inout/run", async (req, res) => {
  const requestStart = Date.now();
  try {
    await runReasoning(requestStart);
    res.json({ message: "Reasoning Inout executed" });
  } catch (err) {
    console.error("❌ reasoning inout error:", err.message);
    res.status(500).json({ error: "Reasoning Inout failed" });
  }
});

// ======================================================
// 🔁 Auto Reasoning (setiap 5 detik)
// ======================================================
setInterval(async () => {
  try {
    await runReasoning();
  } catch (err) {
    console.error("⚠️ Loop error Inout:", err.message);
  }
}, 5000);

module.exports = router;
