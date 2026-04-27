require("dotenv").config();

const { initDb, get, run, all } = require("./database");

function daysFromNowIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function ensureDemoClient() {
  const existing = await get("SELECT id FROM brokers WHERE email = ?", ["demo.broker@example.com"]);
  if (existing) {
    // Refresh demo trial window in case an old DB already exists
    await run("UPDATE brokers SET trialEndsAt = ?, isActive = 1 WHERE id = ?", [daysFromNowIso(14), existing.id]);
    return existing.id;
  }

  await run(
    "INSERT INTO brokers (name, email, trialEndsAt, isActive) VALUES (?, ?, ?, ?)",
    ["Demo Broker", "demo.broker@example.com", daysFromNowIso(14), 1]
  );

  const created = await get("SELECT id FROM brokers WHERE email = ?", ["demo.broker@example.com"]);
  return created.id;
}

async function seedLeads(clientId) {
  const existingCount = await get("SELECT COUNT(*) as c FROM leads WHERE brokerId = ?", [clientId]);
  if (existingCount && existingCount.c > 0) return;

  const leads = [
    { name: "Ava Thompson", phone: "555-0101", city: "Austin", propertyType: "Condo", budget: "$450k", status: "new" },
    {
      name: "Noah Martinez",
      phone: "555-0133",
      city: "Denver",
      propertyType: "Townhouse",
      budget: "$600k–$700k",
      status: "in_conversation",
      messages: [
        { sender: "lead", message: "Hi! I'm looking to move in 2 months. What neighborhoods should I consider?" },
        { sender: "broker", message: "Great timing — do you prefer walkable areas or more space / quieter streets?" }
      ]
    },
    {
      name: "Mia Chen",
      phone: "555-0188",
      city: "San Diego",
      propertyType: "Single-family",
      budget: "$950k",
      status: "qualified",
      messages: [{ sender: "broker", message: "Sounds good — I can line up a couple options that match your criteria." }]
    },
    {
      name: "Liam Patel",
      phone: "555-0222",
      city: "Seattle",
      propertyType: "Condo",
      budget: "$750k",
      status: "appointment_booked",
      messages: [
        { sender: "bot", message: "Great! You qualify for a property viewing.\nChoose a time here: https://your-calendly-link" }
      ]
    }
  ];

  for (const l of leads) {
    const inserted = await run(
      "INSERT INTO leads (brokerId, name, phone, city, propertyType, budget, status, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
      [clientId, l.name, l.phone, l.city, l.propertyType, l.budget, l.status]
    );
    if (l.messages && l.messages.length) {
      for (const m of l.messages) {
        await run("INSERT INTO messages (leadId, sender, message) VALUES (?, ?, ?)", [inserted.lastID, m.sender, m.message]);
      }
    }
  }
}

async function main() {
  await initDb();
  const clientId = await ensureDemoClient();
  await seedLeads(clientId);

  const leadRows = await all("SELECT id, name, city, status FROM leads WHERE brokerId = ? ORDER BY id ASC", [clientId]);
  // eslint-disable-next-line no-console
  console.log("Seed complete. Demo brokerId:", clientId);
  // eslint-disable-next-line no-console
  console.table(leadRows);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", e);
  process.exit(1);
});

