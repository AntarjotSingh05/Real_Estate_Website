function parseIso(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // SQLite datetime('now') format: "YYYY-MM-DD HH:MM:SS"
  // JS Date parsing of this format is inconsistent across environments,
  // so normalize to an ISO-ish form.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)
    ? `${s.replace(" ", "T")}Z`
    : s;

  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isTrialActive(client) {
  // Backwards-compatible wrapper name: checks new schema fields.
  const activeFlag = client?.isActive;
  if (activeFlag === 0 || activeFlag === false) return false;

  const endsAt = parseIso(client?.trialEndsAt);
  if (!endsAt) return false;
  return Date.now() < endsAt.getTime();
}

function trialExpiresAt(client) {
  const endsAt = parseIso(client?.trialEndsAt);
  return endsAt ? endsAt.toISOString() : null;
}

async function checkTrial(clientId, { get, run }) {
  const id = Number(clientId);
  if (!Number.isFinite(id) || id <= 0) return false;

  let client = null;
  try {
    client = await get("SELECT id, trialEndsAt, isActive FROM brokers WHERE id = ?", [id]);
  } catch {
    client = null;
  }
  if (!client) {
    // Back-compat: older DBs may still have `clients`
    try {
      client = await get("SELECT id, trialEndsAt, isActive FROM clients WHERE id = ?", [id]);
    } catch {
      client = null;
    }
  }
  if (!client) return false;

  const endsAt = parseIso(client.trialEndsAt);
  const currentlyActive = client.isActive === 1 || client.isActive === true;
  if (!currentlyActive) return false;

  if (!endsAt || Date.now() > endsAt.getTime()) {
    try {
      await run("UPDATE brokers SET isActive = 0 WHERE id = ?", [id]);
    } catch {
      await run("UPDATE clients SET isActive = 0 WHERE id = ?", [id]);
    }
    return false;
  }

  return true;
}

module.exports = { isTrialActive, trialExpiresAt, checkTrial };

