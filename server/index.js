require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { initDb } = require("./database");
const methodOverride = require("method-override");

const brokersRouter = require("./routes/brokers");
const leadsRouter = require("./routes/leads");
const authRouter = require("./routes/auth");

const app = express();
app.use(cors());

app.use(express.json({ limit: "1mb" }));

// Add request logging for debugging
app.use((req, res, next) => {
  console.log("Incoming Request:", {
    method: req.method,
    path: req.path,
    body: req.body
  });
  next();
});

// Add method override to support PATCH requests
app.use(methodOverride('_method'));
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(methodOverride('X-HTTP-Method'));
app.use(methodOverride('X-Method-Override'));

// Add cache control headers to prevent old UI caching
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// API routes
app.use("/api/auth", authRouter);

// Unprotected API routes
app.use("/api/brokers", brokersRouter);
app.use("/api/leads", leadsRouter);

// Serve frontend with cache-busting headers
const frontendDir = path.join(__dirname, "..", "frontend");

// Serve static files with no caching
app.use(express.static(frontendDir, {
  maxAge: 0,
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
}));

// Serve index.html for specific routes
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get('/query', (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(frontendDir, "landing.html"));
});

const port = Number(process.env.PORT || 3000);

initDb()
  .then(async () => {
    // Initialize default users
    const { initDefaultUsers } = require("./init-users");
    await initDefaultUsers();
    
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

