-- AI Lead Response Bot - SQLite schema
-- Tables: brokers, leads, messages

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS brokers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  trialEndsAt TEXT NOT NULL DEFAULT (datetime('now', '+14 day')),
  isActive INTEGER NOT NULL DEFAULT 1
);

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

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leadId INTEGER NOT NULL,
  sender TEXT NOT NULL,          -- e.g. 'lead' | 'bot' | 'broker'
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
CREATE INDEX IF NOT EXISTS idx_leads_broker_created ON leads(brokerId, createdAt);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assignedBrokerId, status);
CREATE INDEX IF NOT EXISTS idx_messages_lead_time ON messages(leadId, timestamp);

