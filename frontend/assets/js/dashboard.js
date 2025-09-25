const BASE = "http://192.168.43.238:5000/api";

async function fetchCuci() {
  const r = await fetch(`${BASE}/valve-status`);
  const d = await r.json();
  document.getElementById("cuci-distance1").textContent =
    d.distance1?.toFixed(1) + " cm";
  document.getElementById("cuci-distance2").textContent =
    d.distance2?.toFixed(1) + " cm";
  const v = document.getElementById("cuci-valve");
  v.textContent = d.valStatus === "ON" ? "ON 🔓" : "OFF 🔒";
  v.className = `status-box ${
    d.valStatus === "ON" ? "text-success" : "text-danger"
  }`;
}

async function fetchInOut() {
  const r = await fetch(`${BASE}/statusInout`);
  const d = await r.json();
  document.getElementById("inout-count").textContent = d.personCount ?? "--";
  const l = document.getElementById("inout-lamp");
  l.textContent = d.lampState === "ON" ? "ON 💡" : "OFF";
  l.className = `status-box ${
    d.lampState === "ON" ? "text-success" : "text-danger"
  }`;
  document.getElementById("inout-iot-status").textContent = d.espConnected
    ? "Online ✅"
    : "Offline ❌";
  document.getElementById("inout-iot-status").className = d.espConnected
    ? "text-success"
    : "text-danger";
}

async function fetchCook() {
  const [statusRes, sensorRes] = await Promise.all([
    fetch(`${BASE}/statusCook`).then((r) => r.json()),
    fetch(`${BASE}/latest`).then((r) => r.json()),
  ]);
  document.getElementById("fanStatus").textContent = statusRes.FAN.includes(
    "ON"
  )
    ? "ON"
    : "OFF";
  document.getElementById("fanStatus").className = `status-box ${
    statusRes.FAN.includes("ON") ? "text-success" : "text-danger"
  }`;
  document.getElementById("buzzerStatus").textContent =
    statusRes.BUZZER.includes("ON") ? "ON" : "OFF";
  document.getElementById("buzzerStatus").className = `status-box ${
    statusRes.BUZZER.includes("ON") ? "text-success" : "text-danger"
  }`;

  const activity = statusRes.ACTIVITY.includes("YES")
    ? "COOKING"
    : "NOT COOKING";
  const timer = statusRes.TIMER.includes("ON") ? "ON" : "OFF";
  document.getElementById("activityStatus").textContent = activity;
  document.getElementById("timerStatus").textContent = timer;

  if (statusRes.BUZZER.includes("ON") && sensorRes.ppm >= 700)
    showToast("🚨 Gas Leak Area Masak!", "danger");
  if (activity === "COOKING") showToast("🍳 Memasak aktif!", "warning");
}

async function fetchConn() {
  try {
    const r = await fetch(`${BASE}/cuci/status`);
    const d = await r.json();
    document.getElementById("backend-status").textContent = "Online ✅";
    document.getElementById("fuseki-status").textContent = d.fuseki
      ? "Online ✅"
      : "Offline ❌";
    document.getElementById("fuseki-status").className = d.fuseki
      ? "text-success"
      : "text-danger";
    document.getElementById("cuci-iot-status").textContent = d.iot
      ? "Online ✅"
      : "Offline ❌";
    document.getElementById("cuci-iot-status").className = d.iot
      ? "text-success"
      : "text-danger";
  } catch {
    document.getElementById("backend-status").textContent = "Offline ❌";
    document.getElementById("fuseki-status").textContent = "Offline ❌";
    document.getElementById("cuci-iot-status").textContent = "Offline ❌";
  }
}

async function fetchCookConn() {
  try {
    const r = await fetch(`${BASE}/latest`);
    const d = await r.json();
    const isOnline = Date.now() - d.lastUpdate < 10000;
    document.getElementById("cook-iot-status").textContent = isOnline
      ? "Online ✅"
      : "Offline ❌";
    document.getElementById("cook-iot-status").className = isOnline
      ? "text-success"
      : "text-danger";
  } catch {
    document.getElementById("cook-iot-status").textContent = "Offline ❌";
  }
}

async function resetInOut() {
  const res = await fetch(`${BASE}/resetInout`, { method: "POST" });
  alert(res.ok ? "Reset berhasil" : "Reset gagal");
  fetchInOut();
}

async function exportLog() {
  window.open(`${BASE}/export-log`, "_blank");
}

async function sendLogEmail() {
  const res = await fetch(`${BASE}/send-log-email`, { method: "POST" });
  alert(
    res.ok ? "📧 Email terkirim ke semua penerima" : "❌ Gagal kirim email"
  );
}

function showToast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast align-items-center show text-white bg-${type}`;
  el.role = "alert";
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button></div>`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Initial load & polling
fetchCuci();
fetchInOut();
fetchCook();
fetchConn();
fetchCookConn();
setInterval(fetchCuci, 3000);
setInterval(fetchInOut, 3000);
setInterval(fetchCook, 4000);
setInterval(fetchConn, 5000);
setInterval(fetchCookConn, 5000);
