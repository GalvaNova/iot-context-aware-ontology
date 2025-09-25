const express = require("express");
const cors = require("cors");
const app = express();

//Middleware
app.use(cors());
app.use(express.json());

//routes
app.use("/api", require("./routes/areaWash"));
app.use("/api", require("./routes/areaInout"));

//API for reasoning
app.use("/api", require("./routes/reasoning"));

//root
app.get("/", (req, res) => {
  req.json({ message: "Backend Running" });
});

//running server
const HOST = "0.0.0.0";
const PORT = 5000;

app.listen(PORT, HOST, () => {
  console.log("Backend running at http://${HOST}:${PORT}");
});
