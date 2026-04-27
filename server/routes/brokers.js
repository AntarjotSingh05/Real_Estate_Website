const express = require("express");
const { all, get, run } = require("../database");
const { isTrialActive, trialExpiresAt, checkTrial } = require("../services/trialManager");

const router = express.Router();

// GET /api/brokers
router.get("/", async (req, res) => {
  try {
    const rows = await all(
      "SELECT id, name, email, trialEndsAt, isActive, role FROM brokers ORDER BY id ASC LIMIT 500",
      []
    );
    return res.json({
      brokers: rows.map((b) => ({
        id: b.id,
        name: b.name,
        email: b.email,
        role: b.role,
        trialActive: isTrialActive(b),
        trialExpiresAt: trialExpiresAt(b)
      }))
    });
  } catch {
    return res.status(500).json({ error: "server error" });
  }
});

// POST /api/brokers
// Minimal broker creation for demo/admin use.
router.post("/", async (req, res) => {
  try {
    const { name, email, role } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: "name and email required" });

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanRole = String(role || "broker").trim();
    await run("INSERT INTO brokers (name, email, role) VALUES (?, ?, ?)", [cleanName, cleanEmail, cleanRole]);

    const broker = await get("SELECT id, name, email, trialEndsAt, isActive, role FROM brokers WHERE email = ?", [cleanEmail]);
    return res.status(201).json({
      broker: {
        id: broker.id,
        name: broker.name,
        email: broker.email,
        role: broker.role,
        trialActive: isTrialActive(broker),
        trialExpiresAt: trialExpiresAt(broker)
      }
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (msg.includes("UNIQUE")) return res.status(409).json({ error: "email already exists" });
    return res.status(500).json({ error: "server error" });
  }
});

// POST /api/brokers/:id/refresh-trial (dev helper)
router.post("/:id/refresh-trial", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid id" });

    const broker = await get("SELECT id, trialEndsAt, isActive FROM brokers WHERE id = ?", [id]);
    if (!broker) return res.status(404).json({ error: "not found" });

    // Leverage existing trial check semantics.
    await checkTrial(id, { get, run });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "server error" });
  }
});

module.exports = router;

