const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, "data.sqlite");

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function tableExists(name) {
  const row = await get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]);
  return !!row;
}

async function getColumns(table) {
  const rows = await all(`PRAGMA table_info(${table});`);
  return new Set(rows.map((r) => r.name));
}

async function addColumnIfMissing(table, colName, colDef) {
  const cols = await getColumns(table);
  if (cols.has(colName)) return;
  await run(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON;");

  // --- Terminology migration: clients -> brokers (idempotent) ---
  const hasClients = await tableExists("clients");
  const hasBrokers = await tableExists("brokers");
  if (hasClients && !hasBrokers) {
    await run("ALTER TABLE clients RENAME TO brokers;");
  }

  // Add users table with authentication fields
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT, -- hashed password
      name TEXT NOT NULL,
      role TEXT DEFAULT 'buyer' CHECK (role IN ('buyer', 'owner', 'master')),
      isActive BOOLEAN DEFAULT 1,
      otp TEXT, -- 6-digit OTP
      otpExpiresAt DATETIME, -- OTP expiry time
      loginAttempts INTEGER DEFAULT 0, -- failed login attempts
      lockUntil DATETIME, -- account lock time
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS brokers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      trialEndsAt TEXT NOT NULL DEFAULT (datetime('now', '+14 day')),
      isActive INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'broker',
      password TEXT, -- hashed password
      otp TEXT, -- 6-digit OTP
      otpExpiresAt DATETIME, -- OTP expiry time
      loginAttempts INTEGER DEFAULT 0, -- failed login attempts
      lockUntil DATETIME -- account lock time
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brokerId INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      city TEXT,
      propertyType TEXT,
      budget TEXT,
      preferences TEXT,
      status TEXT,
      assignedBrokerId INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT,
      FOREIGN KEY (brokerId) REFERENCES brokers(id) ON DELETE CASCADE,
      FOREIGN KEY (assignedBrokerId) REFERENCES brokers(id) ON DELETE SET NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leadId INTEGER NOT NULL,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE
    );
  `);

  // If an older DB exists, it may still have leads.clientId. Attempt a rename for consistency.
  try {
    const leadCols = await getColumns("leads");
    if (leadCols.has("clientId") && !leadCols.has("brokerId")) {
      await run("ALTER TABLE leads RENAME COLUMN clientId TO brokerId;");
    }
  } catch {
    // ignore: table may not exist yet / sqlite version constraints
  }

  // Ensure newer lead columns exist even if table existed previously.
  await addColumnIfMissing("leads", "email", "email TEXT");
  await addColumnIfMissing("leads", "preferences", "preferences TEXT");
  await addColumnIfMissing("leads", "assignedBrokerId", "assignedBrokerId INTEGER");
  await addColumnIfMissing("leads", "updatedAt", "updatedAt TEXT");

  // Ensure broker role column exists for existing tables
  await addColumnIfMissing("brokers", "role", "role TEXT NOT NULL DEFAULT 'broker'");

  // Ensure users table exists and has proper columns
  await addColumnIfMissing("users", "role", "role TEXT NOT NULL DEFAULT 'buyer'");

  await run("CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);");
  await run("CREATE INDEX IF NOT EXISTS idx_leads_broker_created ON leads(brokerId, createdAt);");
  await run("CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assignedBrokerId, status);");
  await run("CREATE INDEX IF NOT EXISTS idx_messages_lead_time ON messages(leadId, timestamp);");
}

module.exports = { DB_PATH, getDb, run, get, all, initDb };

