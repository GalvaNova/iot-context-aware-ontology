// server.js
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// ==============================
// ✅ ROUTES
// ==============================
const areaCook = require("./routes/areaCook");
const reasoningCook = require("./routes/reasoning/reasoning-cook");

app.use("/api/cook", areaCook); // endpoint untuk sensor dan status Cook
app.use("/api/reasoning-cook", reasoningCook); // reasoning otomatis Cook

// Root
app.get("/", (req, res) => {
  res.json({ message: "Backend Running ✅" });
});

// ==============================
// ✅ SERVER RUNNING
// ==============================
const HOST = "0.0.0.0";
const PORT = 5000;

app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend running at http://${HOST}:${PORT}`);
});
