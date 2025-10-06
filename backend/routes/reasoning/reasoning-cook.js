// routes/reasoning/reasoning-cook.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// ==============================
// 🔹 Konfigurasi
// ==============================
const BACKEND_BASE = "http://192.168.43.238:5000"; // ubah jika IP backend berbeda

// ==============================
// 🔹 Fungsi Logika Reasoning
// ==============================
function reasonCook(data) {
  let buzzer = "st_actOFF";
  let exhaust = "st_actOFF";

  // ✅ Rule 1: Gas tinggi → buzzer ON
  if (data.gas > 700) buzzer = "st_actON";

  // ✅ Rule 2: Api padam & jarak jauh → buzzer ON
  if (data.flame === 0 && data.dist > 10) buzzer = "st_actON";

  // ✅ Rule 3: Exhaust ON jika api padam atau suhu tinggi
  if (data.flame === 0 || data.temp > 35) exhaust = "st_actON";

  return { buzzer, exhaust };
}

// ==============================
// 🔹 Fungsi Reasoning Utama
// ==============================
async function runReasoning() {
  try {
    const reasoningStart = Date.now();

    // 🔹 1. Ambil data sensor terakhir dari backend
    const res = await axios.get(`${BACKEND_BASE}/api/cook/sensor`);
    const data = res.data;

    if (data.status === "Offline") {
      console.warn(
        "⚠️ [Reasoning-Cook] Area Cook Offline — reasoning dilewati."
      );
      return;
    }

    const { buzzer, exhaust } = reasonCook(data);

    // 🔹 2. Hitung metrik waktu
    const reasoningTime = Date.now() - reasoningStart;
    const fullResponseTime = reasoningTime + 20; // simulasi pemrosesan tambahan
    const endToEndTime = fullResponseTime + 40; // simulasi total ke actuator
    const responseTime = Math.max(fullResponseTime - reasoningTime, 0);

    // 🔹 3. Kirim hasil reasoning ke backend
    await axios.post(`${BACKEND_BASE}/api/cook/update-status`, {
      buzzer,
      exhaust,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
      responseTime,
    });

    // 🔹 4. Log hasil reasoning
    console.log(
      `🧠 [Reasoning-Cook] Flame:${data.flame} | Gas:${data.gas.toFixed(
        2
      )} | Temp:${data.temp.toFixed(1)}°C | Dist:${data.dist.toFixed(
        1
      )}cm → 🔊Buzzer:${buzzer} 🌀Exhaust:${exhaust}`
    );
    console.log(
      `⏱️ Times → Reasoning:${reasoningTime}ms | Full:${fullResponseTime}ms | End-to-End:${endToEndTime}ms\n`
    );
  } catch (err) {
    console.error("❌ [Reasoning-Cook] Error:", err.message);
  }
}

// ==============================
// 🔹 Interval Reasoning Otomatis
// ==============================
setInterval(runReasoning, 5000); // setiap 5 detik reasoning dijalankan

// ==============================
// 🔹 Endpoint Manual
// ==============================
router.get("/run", async (req, res) => {
  await runReasoning();
  res.json({ message: "✅ Reasoning Cook executed manually" });
});

module.exports = router;
