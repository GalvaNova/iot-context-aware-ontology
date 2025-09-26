const express = require("express");
const cors = require("cors");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", require("./routes/areaWash"));
app.use("/api", require("./routes/areaInout"));
app.use("/api", require("./routes/areaCook"));
app.use("/api", require("./routes/reasoning")); // reasoning API

// Root
app.get("/", (req, res) => {
  res.json({ message: "Backend Running" });
});

// Running server
const HOST = "0.0.0.0";
const PORT = 5000;

app.listen(PORT, HOST, () => {
  console.log(`Backend running at http://${HOST}:${PORT}`);
});
