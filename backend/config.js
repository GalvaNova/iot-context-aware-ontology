const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
    console.log(`✅ Loaded: ${filePath}`);
  } else {
    console.warn(`⚠️ File not found: ${filePath}`);
  }
}

// Lokasi file .env
const envMain = path.resolve(__dirname, ".env");
const envTelegram = path.resolve(__dirname, ".env.telegram");
const envEmail = path.resolve(__dirname, ".env.email");

// Load file sesuai prioritas
loadEnvFile(envMain);
loadEnvFile(envTelegram);
loadEnvFile(envEmail);

// Export variabel agar bisa dipakai di seluruh backend
module.exports = {
  backend: {
    host: process.env.BACKEND_HOST || "0.0.0.0",
    port: process.env.BACKEND_PORT || 5000,
  },

  // Fuseki
  fuseki: {
    queryWash: process.env.FUSEKI_QUERY_WASH,
    updateWash: process.env.FUSEKI_UPDATE_WASH,
    queryInout: process.env.FUSEKI_QUERY_INOUT,
    updateInout: process.env.FUSEKI_UPDATE_INOUT,
    queryCook: process.env.FUSEKI_QUERY_COOK,
    updateCook: process.env.FUSEKI_UPDATE_COOK,
  },
  thresholds: {
    WASH_ULTRASONIC_OBJ: 15, // cm
    WASH_ULTRASONIC_PER: 15, // cm
  },

  // Backend
  BACKEND_HOST: process.env.BACKEND_HOST,
  BACKEND_PORT: process.env.BACKEND_PORT,

  // Telegram
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  POLL_INTERVAL: process.env.POLL_INTERVAL || 5000,

  // Email
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,

  // Threshold AreaCook
  TEMP_THRESHOLD: process.env.TEMP_THRESHOLD,
  FLAME_THRESHOLD: process.env.FLAME_THRESHOLD,
  GAS_THRESHOLD: process.env.GAS_THRESHOLD,
  ULS_COOK_THRESHOLD: process.env.ULS_COOK_THRESHOLD,

  // Threshold AreaWash
  ULS_WASH1_THRESHOLD: process.env.ULS_WASH1_THRESHOLD,
  ULS_WASH2_THRESHOLD: process.env.ULS_WASH2_THRESHOLD,

  // Threshold AreaInout
  PIR_THRESHOLD: process.env.PIR_THRESHOLD,
};
