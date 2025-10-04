// routes/reasoning.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const FUSEKI_BASE = "http://192.168.43.238:3030";
const BACKEND_BASE = "http://192.168.43.238:5000";
const DATASET = {
  cook: "areaCook-2",
  wash: "areaWash-2",
  inout: "areaInout-2",
};
const NS = "http://www.semanticweb.org/msi/ontologies/2025/5/thesis-1#";

// 🔹 Helper functions
async function queryFuseki(dataset, sparql) {
  const url = `${FUSEKI_BASE}/${dataset}/query?query=${encodeURIComponent(
    sparql
  )}`;
  const res = await axios.get(url, {
    headers: { Accept: "application/sparql-results+json" },
  });
  return res.data.results.bindings;
}

async function updateFuseki(dataset, sparql) {
  const url = `${FUSEKI_BASE}/${dataset}/update`;
  await axios.post(url, `update=${encodeURIComponent(sparql)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

function normalize(val, def, parse = (v) => v) {
  return val !== undefined ? parse(val) : def;
}

// ======================================================
// 🔹 Reasoning Cook
// ======================================================
function reasonCook(data) {
  let buzzer = "st_actOFF";
  let exhaust = "st_actOFF";
  let cooking = "st_cookNO";

  // Rule: deteksi bahaya gas
  if (data.gas > 700) buzzer = "st_actON";

  // Rule: jika tidak ada api dan tidak ada orang dekat → alarm
  if (data.flame === 0 && data.dist > 10) buzzer = "st_actON";

  // Rule: sedang memasak
  if (data.flame === 0 && data.dist <= 10) cooking = "st_cookYES";
  if (data.flame === 1) cooking = "st_cookNO";

  // Rule: Exhaust fan aktif jika ada api atau suhu tinggi
  if (data.flame === 0) exhaust = "st_actON";
  else if (data.flame === 1 && data.temp > 35) exhaust = "st_actON";
  else exhaust = "st_actOFF";

  return { buzzer, exhaust, cooking };
}

// ======================================================
// 🔹 Reasoning Wash
// ======================================================
function reasonWash(data) {
  let washing = "st_washNO";
  let valve = "st_actOFF";

  if (data.obj < 20 && data.pers < 20) washing = "st_washYES";
  valve = washing === "st_washYES" ? "st_actON" : "st_actOFF";

  return { washing, valve };
}

// ======================================================
// 🔹 Reasoning Inout
// ======================================================
function reasonInout(data, cooking, washing) {
  let lamp = "st_actOFF";

  if (data.count > 0) lamp = "st_actON";
  if (data.count === 0 && cooking === "st_cookNO" && washing === "st_washNO") {
    lamp = "st_actOFF";
  }

  return { lamp };
}

// ======================================================
// 🔹 Main Reasoning Flow
// ======================================================
async function runReasoning(requestStart = null) {
  const start = Date.now();
  const reasoningStart = Date.now();

  // 1️⃣ Ambil data sensor dari semua area
  const qCook = `
    PREFIX tb: <${NS}>
    SELECT ?flame ?gas ?temp ?dist WHERE {
      OPTIONAL { tb:read_AC_flame tb:ACdp_hasFIREvalue ?flame }
      OPTIONAL { tb:read_AC_Ppm tb:ACdp_hasPPMvalue ?gas }
      OPTIONAL { tb:read_AC_Temp tb:ACdp_hasTEMPvalue ?temp }
      OPTIONAL { tb:read_AC_Dist tb:ACdp_hasDISTvalue ?dist }
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
    flame: normalize(cook[0]?.flame?.value, 1, (v) => parseInt(v)),
    gas: normalize(cook[0]?.gas?.value, 0, (v) => parseInt(v)),
    temp: normalize(cook[0]?.temp?.value, 25, (v) => parseFloat(v)),
    dist: normalize(cook[0]?.dist?.value, 100, (v) => parseFloat(v)),
    obj: normalize(wash[0]?.obj?.value, 100, (v) => parseFloat(v)),
    pers: normalize(wash[0]?.pers?.value, 100, (v) => parseFloat(v)),
    washStatus: wash[0]?.washStatus?.value?.split("#")[1] ?? "st_washNO",
    count: normalize(inout[0]?.count?.value, 0, (v) => parseInt(v)),
  };

  // 2️⃣ Evaluasi rule masing-masing area
  const { buzzer, exhaust, cooking } = reasonCook(data);
  const { washing, valve } = reasonWash(data);
  const { lamp } = reasonInout(data, cooking, washing);

  const reasoningTime = Date.now() - reasoningStart;

  // 3️⃣ Update status ke Fuseki
  const updates = [
    {
      dataset: DATASET.cook,
      action: "act_AC_Buzzer",
      status: buzzer,
      prop: "M_hasActionStatus",
    },
    {
      dataset: DATASET.cook,
      action: "act_AC_Exhaust",
      status: exhaust,
      prop: "M_hasActionStatus",
    },
    {
      dataset: DATASET.cook,
      action: "fnc_cookAct",
      status: cooking,
      prop: "M_hasActivityStatus",
    },
    {
      dataset: DATASET.wash,
      action: "fnc_washAct",
      status: washing,
      prop: "M_hasActivityStatus",
    },
    {
      dataset: DATASET.wash,
      action: "act_AS_Valve",
      status: valve,
      prop: "M_hasActionStatus",
    },
    {
      dataset: DATASET.inout,
      action: "act_AE_Lamp",
      status: lamp,
      prop: "M_hasActionStatus",
    },
  ];

  for (const u of updates) {
    try {
      const sparql = `
        PREFIX tb: <${NS}>
        DELETE { tb:${u.action} tb:${u.prop} ?old }
        INSERT { tb:${u.action} tb:${u.prop} tb:${u.status} }
        WHERE { OPTIONAL { tb:${u.action} tb:${u.prop} ?old } }
      `;
      await updateFuseki(u.dataset, sparql);
    } catch (err) {
      console.error(`❌ Gagal update ${u.action}:`, err.message);
    }
  }

  const fullResponseTime = Date.now() - start;
  const endToEndTime = requestStart
    ? Date.now() - requestStart
    : fullResponseTime;

  // 4️⃣ Kirim hasil reasoning ke backend tiap area
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
    await axios.post(`${BACKEND_BASE}/api/wash/update-valve`, {
      status: valve,
      reasoningTime,
      fullResponseTime,
    });
    await axios.post(`${BACKEND_BASE}/api/inout/update-lamp`, {
      status: lamp,
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
    obj: data.obj,
    pers: data.pers,
    count: data.count,
    buzzer,
    exhaust,
    cooking,
    washing,
    valve,
    lamp,
    reasoningTime,
    fullResponseTime,
    endToEndTime,
  });

  return {
    ...data,
    buzzer,
    exhaust,
    cooking,
    washing,
    valve,
    lamp,
    reasoningTime,
    fullResponseTime,
    endToEndTime,
  };
}

// ======================================================
// ✅ API
// ======================================================
router.get("/reasoning/run", async (req, res) => {
  const requestStart = Date.now();
  try {
    const result = await runReasoning(requestStart);
    res.json({ message: "Reasoning executed", result });
  } catch (err) {
    console.error("❌ reasoning error:", err.message);
    res.status(500).json({ error: "Reasoning failed" });
  }
});

router.get("/reasoning/status", async (req, res) => {
  try {
    const result = await runReasoning();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reasoning status" });
  }
});

module.exports = router;
