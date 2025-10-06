╔════════════════════════════════════════════════════════════════════════╗
║                           AREA COOK FLOW                               ║
╚════════════════════════════════════════════════════════════════════════╝

[IoT NodeMCU]                    [Backend Server]               [Reasoning Engine]
│                                        │                               │
│                                        │                               │
│                                        │                               │
(1)  Read Sensors                        │                               │
 ├─ Flame, Gas, Temp, Dist               │                               │
 │                                       │                               │
 │--- POST /api/cook/update-sensor ----> │                               │
 │                                       │                               │
 │     Backend records                   │                               │
 │     └─ "Last Backend Response" time   │                               │
 │                                       │                               │
 │                                       │                               │
 │                                       │<-- SPARQL Query to Fuseki ----│
 │                                       │                               │
 │                                       │<-- Read Sensor Values --------│
 │                                       │                               │
 │                                       │--- Reasoning Logic ---------->│
 │                                       │    Apply Rules (Flame, Gas)   │
 │                                       │                               │
 │                                       │<-- Decision: Buzzer, Exhaust--│
 │                                       │                               │
 │<-- POST /api/cook/update-status ------│                               │
 │                                       │                               │
 │     Measure:                          │                               │
 │     ├─ Reasoning Time                 │                               │
 │     ├─ Full Response Time             │                               │
 │     └─ Stored to backend              │                               │
 │                                       │                               │
 │--- GET /api/cook/actuator ----------> │                               │
 │                                       │                               │
 │     Backend returns:                  │                               │
 │     ├─ buzzer: st_actON / st_actOFF   │                               │
 │     └─ exhaust: st_actON / st_actOFF  │                               │
 │                                       │                               │
 │  Apply actuator output                │                               │
 │  ├─ digitalWrite(BUZZER, ON/OFF)      │                               │
 │  └─ digitalWrite(FAN, ON/OFF)         │                               │
 │                                       │                               │
 │--- POST /api/cook/endtoend ---------->│                               │
 │   { endToEndTime = (millis diff) }    │                               │
 │                                       │                               │
 │     Backend stores "End-to-End Time"  │                               │
 │                                       │                               │
 │───────────────────────────────────────────────────────────────────────│
 │    Dashboard (cook.html) menampilkan:                                 │
 │    ├─ Last Backend Response (IoT)                                     │
 │    ├─ Reasoning Time (Engine)                                         │
 │    ├─ Full Response Time (Engine → Backend)                           │
 │    └─ End-to-End Response (IoT → Actuator)                            │
 │───────────────────────────────────────────────────────────────────────│
