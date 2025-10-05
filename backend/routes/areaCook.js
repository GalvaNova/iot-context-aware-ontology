// routes/area/areaCook.js
const express = require("express");
const router = express.Router();

// ===========================
// 🔹 Variabel Realtime Status
// ===========================
let lastSensorData = {
  flame: 1,
  gas: 0,
  temp: 0,
  dist: 0,
};
let lastStatusData = {
  buzzer: "st_actOFF",
  exhaust: "st_actOFF",
  reasoningTime: 0,
  fullResponseTime: 0,
  endToEndTime: 0,
  responseTime: 0,
  timestamp: Date.now(),
};
let lastUpdateTime = 0;
let connectionStatus = "Offline";

// ===========================
// 🔹 Endpoint dari IoT
// ===========================
router.post("/update-sensor", (req, res) => {
  const { flame, gas, temp, dist } = req.body;
  if ([flame, gas, temp, dist].some((v) => v === undefined)) {
    return res.status(400).json({ error: "Missing sensor values" });
  }
  lastSensorData = { flame, gas, temp, dist };
  lastUpdateTime = Date.now();
  connectionStatus = "Online";
  res.json({ message: "✅ Sensor data updated", timestamp: lastUpdateTime });
});

// ===========================
// 🔹 Update dari reasoning
// ===========================
router.post("/update-status", (req, res) => {
  const {
    buzzer,
    exhaust,
    reasoningTime,
    fullResponseTime,
    endToEndTime,
    responseTime,
  } = req.body;

  lastStatusData = {
    buzzer: buzzer ?? lastStatusData.buzzer,
    exhaust: exhaust ?? lastStatusData.exhaust,
    reasoningTime: reasoningTime ?? 0,
    fullResponseTime: fullResponseTime ?? 0,
    endToEndTime: endToEndTime ?? 0,
    responseTime: responseTime ?? 0,
    timestamp: Date.now(),
  };
  res.json({ message: "✅ Status updated", ...lastStatusData });
});

// ===========================
// 🔹 Get Sensor Data
// ===========================
router.get("/sensor", (req, res) => {
  if (Date.now() - lastUpdateTime > 10000) connectionStatus = "Offline";
  res.json({
    ...lastSensorData,
    status: connectionStatus,
  });
});

// ===========================
// 🔹 Get Status Aktuator
// ===========================
router.get("/status", (req, res) => {
  if (Date.now() - lastUpdateTime > 10000) connectionStatus = "Offline";
  res.json({
    ...lastStatusData,
    status: connectionStatus,
  });
});

// ===========================
// 🔹 Get Koneksi
// ===========================
router.get("/connection", (req, res) => {
  if (Date.now() - lastUpdateTime > 10000) connectionStatus = "Offline";
  res.json({
    status: connectionStatus,
    lastUpdate: new Date(lastUpdateTime).toLocaleTimeString(),
  });
});

module.exports = router;
