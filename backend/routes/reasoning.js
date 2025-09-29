// routes/reasoning.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const FUSEKI_BASE = "http://192.168.43.238:3030";
const DATASET = {
  cook: "areaCook-2",
  wash: "areaWash-2",
  inout: "areaInout-2",
};

const NS = "http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#";

// 🔹 Helper untuk query Fuseki
async function queryFuseki(dataset, sparql) {
  const url = `${FUSEKI_BASE}/${dataset}/query?query=${encodeURIComponent(
    sparql
  )}`;
  const res = await axios.get(url, {
    headers: { Accept: "application/sparql-results+json" },
  });
  return res.data.results.bindings;
}

// 🔹 Helper untuk update Fuseki
async function updateFuseki(dataset, sparql) {
  const url = `${FUSEKI_BASE}/${dataset}/update`;
  await axios.post(url, `update=${encodeURIComponent(sparql)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

// 🔹 Fungsi reasoning
async function runReasoning() {
  const start = Date.now();
  const reasoningStart = Date.now();

  // 1. Ambil data dari Fuseki
  const qCook = `
    PREFIX tb: <${NS}>
    SELECT ?flame ?gas ?temp ?dist WHERE {
      OPTIONAL { tb:sensor_flame tb:ACdp_hasFIREvalue ?flame }
      OPTIONAL { tb:sensor_gas tb:ACdp_hasPPMvalue ?gas }
      OPTIONAL { tb:sensor_temp tb:ACdp_hasTEMPvalue ?temp }
      OPTIONAL { tb:sensor_dist tb:ACdp_hasDISTvalue ?dist }
    } LIMIT 1
  `;
  const qWash = `
    PREFIX tb: <${NS}>
    SELECT ?obj ?pers ?washStatus WHERE {
      OPTIONAL { tb:param_objek tb:ASdp_hasDISTOBJvalue ?obj }
      OPTIONAL { tb:param_orang tb:ASdp_hasDISTPERvalue ?pers }
      OPTIONAL { tb:fnc_washAct tb:M_hasActivityStatus ?washStatus }
    } LIMIT 1
  `;
  const qInout = `
    PREFIX tb: <${NS}>
    SELECT ?count ?lampStatus WHERE {
      OPTIONAL { tb:read_AE_CountPers tb:AEdp_hasCOUNTvalue ?count }
      OPTIONAL { tb:act_AE_Lamp tb:M_hasActionStatus ?lampStatus }
    } LIMIT 1
  `;

  const [cook, wash, inout] = await Promise.all([
    queryFuseki(DATASET.cook, qCook),
    queryFuseki(DATASET.wash, qWash),
    queryFuseki(DATASET.inout, qInout),
  ]);

  const data = {
    flame: parseInt(cook[0]?.flame?.value ?? 1),
    gas: parseInt(cook[0]?.gas?.value ?? 0),
    temp: parseFloat(cook[0]?.temp?.value ?? 25),
    dist: parseFloat(cook[0]?.dist?.value ?? 100),
    obj: parseFloat(wash[0]?.obj?.value ?? 100),
    pers: parseFloat(wash[0]?.pers?.value ?? 100),
    washStatus: wash[0]?.washStatus?.value?.split("#")[1] ?? "st_washNO",
    count: parseInt(inout[0]?.count?.value ?? 0),
  };

  // 2. Evaluasi rules
  let buzzer = "st_actOFF";
  let exhaust = "st_actOFF";
  let cooking = "st_cookNO";
  let washing = "st_washNO";
  let lamp = "st_actOFF";
  let valve = "st_actOFF";

  // Rule Buzzer-1
  if (data.gas > 700) buzzer = "st_actON";

  // Rule Buzzer-2
  if (data.flame === 0 && data.dist > 10) buzzer = "st_actON";

  // Rule Cooking
  if (data.flame === 0 && data.dist <= 10) cooking = "st_cookYES";
  if (data.flame === 1) cooking = "st_cookNO";

  // Rule Exhaust
  if (data.flame === 0) exhaust = "st_actON";
  else if (data.flame === 1 && data.temp > 35) exhaust = "st_actON";
  else exhaust = "st_actOFF";

  // Rule Wash
  if (data.obj < 20 && data.pers < 20) washing = "st_washYES";
  else washing = "st_washNO";

  // Rule Lamp
  if (data.count > 0) lamp = "st_actON";
  if (data.count === 0 && cooking === "st_cookNO" && washing === "st_washNO")
    lamp = "st_actOFF";

  // Rule Valve
  valve = washing === "st_washYES" ? "st_actON" : "st_actOFF";

  const reasoningTime = Date.now() - reasoningStart;

  // 3. Update Fuseki
  const updates = [
    { dataset: DATASET.cook, action: "act_AC_Buzzer", status: buzzer },
    { dataset: DATASET.cook, action: "act_AC_Exhaust", status: exhaust },
    { dataset: DATASET.cook, action: "fnc_cookAct", status: cooking },
    { dataset: DATASET.wash, action: "fnc_washAct", status: washing },
    { dataset: DATASET.wash, action: "act_AS_Valve", status: valve },
    { dataset: DATASET.inout, action: "act_AE_Lamp", status: lamp },
  ];

  for (const u of updates) {
    const sparql = `
      PREFIX tb: <${NS}>
      DELETE { tb:${u.action} tb:M_hasActionStatus ?old }
      INSERT { tb:${u.action} tb:M_hasActionStatus tb:${u.status} }
      WHERE { OPTIONAL { tb:${u.action} tb:M_hasActionStatus ?old } }
    `;
    await updateFuseki(u.dataset, sparql);
  }

  // 4. Hitung total response time reasoning
  const fullResponseTime = Date.now() - start;

  // 5. Sinkronkan valve + response time ke backend
  try {
    await axios.post("http://192.168.43.238:5000/api/wash/update-valve", {
      status: valve, // ⬅️ sekarang konsisten: "st_actON"/"st_actOFF"
      reasoningTime,
      fullResponseTime,
    });
  } catch (err) {
    console.error("Gagal sinkronkan valve ke backend:", err.message);
  }

  return {
    ...data,
    buzzer,
    exhaust,
    cooking,
    washing,
    lamp,
    valve,
    reasoningTime,
    fullResponseTime,
  };
}

// ✅ API: jalankan reasoning sekarang
router.get("/reasoning/run", async (req, res) => {
  try {
    const result = await runReasoning();
    res.json({ message: "Reasoning executed", result });
  } catch (err) {
    console.error("❌ reasoning error:", err.message);
    res.status(500).json({ error: "Reasoning failed" });
  }
});

// ✅ API: ambil status terakhir
router.get("/reasoning/status", async (req, res) => {
  try {
    const result = await runReasoning();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reasoning status" });
  }
});

module.exports = router;
