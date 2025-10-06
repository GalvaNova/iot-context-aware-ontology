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
  let cooking = "st_cookNO";

  // ---------------------------
  // 🔥 Penjelasan asumsi sensor:
  // flame = 0 → API TERDETEKSI
  // flame = 1 → TIDAK ADA API
  // ---------------------------

  // Rule 1: Deteksi bahaya gas → buzzer ON
  if (data.gas > 700) buzzer = "st_actON";

  // Rule 2: Tidak ada api & jarak >10 cm → alarm (kompor ditinggal)
  if (data.flame === 0 && data.dist > 10) buzzer = "st_actON";

  // Rule 3: Sedang memasak → ada api ATAU (tidak ada api tapi dekat kompor)
  if (data.flame === 0 || data.dist <= 10) cooking = "st_cookYES";
  else cooking = "st_cookNO";

  // Rule 4: Exhaust aktif jika ada api atau suhu tinggi
  if (data.flame === 0 || data.temp > 35) exhaust = "st_actON";
  else exhaust = "st_actOFF";

  return { buzzer, exhaust, cooking };
}

// ==============================
// 🔹 Fungsi Reasoning Utama
// ==============================
async function runReasoning() {
  try {
    const reasoningStart = Date.now();

    // 1️⃣ Ambil data sensor terakhir dari backend
    const res = await axios.get(`${BACKEND_BASE}/api/cook/sensor`);
    const data = res.data;

    if (data.status === "Offline") {
      console.warn(
        "⚠️ [Reasoning-Cook] Area Cook Offline — reasoning dilewati."
      );
      return;
    }

    // 2️⃣ Jalankan logika reasoning
    const { buzzer, exhaust, cooking } = reasonCook(data);

    // 3️⃣ Hitung metrik waktu
    const reasoningTime = Date.now() - reasoningStart;
    const fullResponseTime = reasoningTime + 20; // simulasi pemrosesan tambahan
    const endToEndTime = fullResponseTime + 40; // simulasi total ke actuator
    const responseTime = Math.max(fullResponseTime - reasoningTime, 0);

    // 4️⃣ Kirim hasil reasoning ke backend
    await axios.post(`${BACKEND_BASE}/api/cook/update-status`, {
      buzzer,
      exhaust,
      cooking,
      reasoningTime,
      fullResponseTime,
      endToEndTime,
      responseTime,
    });

    // 5️⃣ Log hasil reasoning
    console.log(
      `🧠 [Reasoning-Cook] Flame:${data.flame} | Gas:${data.gas.toFixed(
        2
      )} | Temp:${data.temp.toFixed(1)}°C | Dist:${data.dist.toFixed(1)}cm
       → 🔊 Buzzer:${buzzer} 🌀 Exhaust:${exhaust} 🍳 Cooking:${cooking}`
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
