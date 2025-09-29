#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>


// ==========================
// 🔹 Pin Setup
// ==========================
// Sensor Ultrasonik 1 (Objek / Sink)
#define TRIG_PIN_1 D2
#define ECHO_PIN_1 D1

// Sensor Ultrasonik 2 (Orang)
#define TRIG_PIN_2 D7
#define ECHO_PIN_2 D6

// Relay Valve
#define RELAY_PIN D5
#define RELAY_ACTIVE HIGH   // ubah ke LOW jika relay aktif LOW

// ==========================
// 🔹 WiFi Setup
// ==========================
const char* ssid = "Sitanggang";
const char* password = "qwertyuiop";

unsigned long startTime; // global

// ==========================
// 🔹 Backend API
// ==========================
const char* backendHost = "192.168.43.238";  // IP laptop/server backend
const int backendPort = 5000;

String postURL   = "http://" + String(backendHost) + ":" + String(backendPort) + "/api/sensorWash";
String statusURL = "http://" + String(backendHost) + ":" + String(backendPort) + "/reasoning/status";

// ==========================
// 🔹 Setup
// ==========================
void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  pinMode(TRIG_PIN_1, OUTPUT);
  pinMode(ECHO_PIN_1, INPUT);

  pinMode(TRIG_PIN_2, OUTPUT);
  pinMode(ECHO_PIN_2, INPUT);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, !RELAY_ACTIVE); // relay OFF saat awal

  Serial.print("🔌 Menghubungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi terkoneksi");
}

// ==========================
// 🔹 Fungsi Baca Ultrasonik
// ==========================
float bacaJarak(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long durasi = pulseIn(echo, HIGH, 30000); // timeout 30ms
  if (durasi == 0) return 400; // default max jarak
  return durasi * 0.034 / 2.0;
}

// ==========================
// 🔹 Loop utama
// ==========================
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    startTime = millis(); // 🟢 mulai timer

    float jarak1 = bacaJarak(TRIG_PIN_1, ECHO_PIN_1);
    float jarak2 = bacaJarak(TRIG_PIN_2, ECHO_PIN_2);

    WiFiClient client;
    HTTPClient http;

    // --- POST sensor ---
    StaticJsonDocument<200> jsonData;
    jsonData["jarak1"] = jarak1;
    jsonData["jarak2"] = jarak2;

    String postBody;
    serializeJson(jsonData, postBody);

    http.begin(client, postURL);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(postBody);
    String response = http.getString();
    http.end();

    Serial.printf("📤 POST sensor → code: %d | resp: %s\n", httpCode, response.c_str());

    delay(500); // beri waktu reasoning jalan

    // --- GET status dari reasoning ---
    http.begin(client, statusURL);
    int statCode = http.GET();

    if (statCode == 200) {
      String statRes = http.getString();
      StaticJsonDocument<300> statJson;
      DeserializationError err = deserializeJson(statJson, statRes);
      
      if (!err) {
        String valve = statJson["valve"].as<String>();

        unsigned long endToEnd = millis() - startTime; // 🟢 hitung End-to-End RT
        Serial.printf("🔁 Valve dari server: %s\n", valve.c_str());
        Serial.printf("⏱ End-to-End Response Time: %lu ms\n", endToEnd);

        http.end(); // ✅ tutup sebelum request baru

        // 🔹 Kirim End-to-End ke backend
        http.begin(client, "http://192.168.43.238:5000/api/wash/endtoend-log");
        http.addHeader("Content-Type", "application/json");
        String payload = "{\"endToEndResponseTime\": " + String(endToEnd) + "}";
        int logCode = http.POST(payload);
        String logResp = http.getString();
        http.end();

        Serial.printf("📡 End-to-End log → code: %d | resp: %s\n", logCode, logResp.c_str());

        // 🔹 Kontrol relay
        if (valve == "st_actON") {
          digitalWrite(RELAY_PIN, RELAY_ACTIVE);
          Serial.println("🚰 Valve AKTIF");
        } else {
          digitalWrite(RELAY_PIN, !RELAY_ACTIVE);
          Serial.println("🛑 Valve NONAKTIF");
        }
      }
    } else {
      Serial.printf("⚠️ GET status gagal, code: %d\n", statCode);
      }
      http.end();
  }

  delay(2000);
}
