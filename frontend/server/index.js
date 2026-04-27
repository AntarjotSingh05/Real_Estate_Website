require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { initDb } = require("./database");

const brokersRouter = require("./routes/brokers");
const leadsRouter = require("./routes/leads");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/brokers", brokersRouter);
app.use("/api/leads", leadsRouter);

// Serve frontend
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "form.html"));
});

const port = Number(process.env.PORT || 3000);

initDb()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`AI Lead Response Bot running on http://localhost:${port}`);
    });
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error("Failed to init DB:", e);
    process.exit(1);
  });

