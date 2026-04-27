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
    "INSERT INTO brokers (name, email, trialEndsAt, isActive, role) VALUES (?, ?, ?, ?, ?)",
    ["Demo Broker", "demo.broker@example.com", daysFromNowIso(14), 1, "broker"]
  );

  const created = await get("SELECT id FROM brokers WHERE email = ?", ["demo.broker@example.com"]);
  return created.id;
}

async function seedBrokers() {
  // Check if master broker already exists
  const masterExists = await get("SELECT id FROM brokers WHERE id = 1");
  if (!masterExists) {
    await run(
      "INSERT INTO brokers (id, name, email, trialEndsAt, isActive, role) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "Master Broker", "master@realestate.com", daysFromNowIso(365), 1, "master"]
    );
  }

  // Create regular brokers
  const brokers = [
    { id: 2, name: "Sarah Johnson", email: "sarah.j@realestate.com" },
    { id: 3, name: "Michael Chen", email: "michael.c@realestate.com" },
    { id: 4, name: "Emily Rodriguez", email: "emily.r@realestate.com" },
    { id: 5, name: "David Kim", email: "david.k@realestate.com" },
    { id: 6, name: "Jessica Taylor", email: "jessica.t@realestate.com" },
    { id: 7, name: "Robert Wilson", email: "robert.w@realestate.com" }
  ];

  for (const broker of brokers) {
    const existing = await get("SELECT id FROM brokers WHERE id = ?", [broker.id]);
    if (!existing) {
      await run(
        "INSERT INTO brokers (id, name, email, trialEndsAt, isActive, role) VALUES (?, ?, ?, ?, ?, ?)",
        [broker.id, broker.name, broker.email, daysFromNowIso(14), 1, "broker"]
      );
    }
  }
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
    },
    {
      name: "Olivia Wilson",
      phone: "555-0255",
      city: "Miami",
      propertyType: "House",
      budget: "$850k",
      status: "new"
    },
    {
      name: "Ethan Davis",
      phone: "555-0288",
      city: "Boston",
      propertyType: "Apartment",
      budget: "$650k",
      status: "in_conversation"
    },
    {
      name: "Sophia Brown",
      phone: "555-0311",
      city: "Portland",
      propertyType: "Townhouse",
      budget: "$550k",
      status: "qualified"
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
  await seedBrokers();
  const clientId = await ensureDemoClient();
  await seedLeads(clientId);

  const brokerRows = await all("SELECT id, name, email, role FROM brokers ORDER BY id ASC");
  const leadRows = await all("SELECT id, name, city, status FROM leads WHERE brokerId = ? ORDER BY id ASC", [clientId]);
  
  // eslint-disable-next-line no-console
  console.log("Seed complete. Available brokers:");
  // eslint-disable-next-line no-console
  console.table(brokerRows);
  
  // eslint-disable-next-line no-console
  console.log("\nDemo brokerId:", clientId, "leads:");
  // eslint-disable-next-line no-console
  console.table(leadRows);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", e);
  process.exit(1);
});

