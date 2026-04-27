const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { get, run } = require("../database");
const { isTrialActive, trialExpiresAt } = require("../services/trialManager");

const router = express.Router();

function mustEnv(name, fallback = null) {
  return process.env[name] || fallback;
}

const JWT_SECRET = mustEnv("JWT_SECRET", "dev-only-secret-change-me");
const TRIAL_DAYS_DEFAULT = Number(mustEnv("TRIAL_DAYS", "7"));
const APPOINTMENT_LINK_DEFAULT = mustEnv("APPOINTMENT_LINK_DEFAULT", "https://calendly.com/");

function makeApiKey() {
  return crypto.randomBytes(24).toString("hex");
}

function signToken(client) {
  return jwt.sign({ sub: client.id, email: client.email }, JWT_SECRET, { expiresIn: "12h" });
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, companyName, appointmentLink } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const password_hash = await bcrypt.hash(String(password), 10);
    const now = new Date().toISOString();
    const api_key = makeApiKey();
    const trial_days = Number.isFinite(TRIAL_DAYS_DEFAULT) && TRIAL_DAYS_DEFAULT > 0 ? TRIAL_DAYS_DEFAULT : 7;

    await run(
      `
      INSERT INTO clients (email, password_hash, company_name, appointment_link, api_key, trial_started_at, trial_days, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(email).toLowerCase().trim(),
        password_hash,
        companyName ? String(companyName).trim() : null,
        appointmentLink ? String(appointmentLink).trim() : APPOINTMENT_LINK_DEFAULT,
        api_key,
        now,
        trial_days,
        now
      ]
    );

    const client = await get("SELECT id, email, api_key, trial_started_at, trial_days FROM clients WHERE email = ?", [
      String(email).toLowerCase().trim()
    ]);

    const token = signToken(client);
    return res.json({
      token,
      client: {
        id: client.id,
        email: client.email,
        apiKey: client.api_key,
        trialActive: isTrialActive(client),
        trialExpiresAt: trialExpiresAt(client)
      }
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (msg.includes("UNIQUE")) return res.status(409).json({ error: "email already registered" });
    return res.status(500).json({ error: "server error", detail: msg });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const client = await get(
      "SELECT id, email, password_hash, api_key, trial_started_at, trial_days, appointment_link FROM clients WHERE email = ?",
      [String(email).toLowerCase().trim()]
    );
    if (!client) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(String(password), client.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = signToken(client);
    return res.json({
      token,
      client: {
        id: client.id,
        email: client.email,
        apiKey: client.api_key,
        appointmentLink: client.appointment_link,
        trialActive: isTrialActive(client),
        trialExpiresAt: trialExpiresAt(client)
      }
    });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
});

module.exports = router;

