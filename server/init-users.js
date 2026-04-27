const { run, get } = require("./database");
const { hashPassword } = require("./services/auth");

async function initDefaultUsers() {
  try {
    console.log("Initializing default users...");

    // Create default admin user
    const adminEmail = "admin@propertyhub.com";
    const adminPassword = "Anshu@7172";
    const hashedPassword = await hashPassword(adminPassword);

    // Check if admin user exists
    const existingAdmin = await get("SELECT * FROM users WHERE email = ?", [adminEmail]);
    
    if (!existingAdmin) {
      await run(
        "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)",
        [adminEmail, hashedPassword, "Admin User", "master"]
      );
      console.log("Created admin user:", adminEmail);
    } else {
      console.log("Admin user already exists");
    }

    // Create demo buyer user
    const buyerEmail = "buyer@propertyhub.com";
    const existingBuyer = await get("SELECT * FROM users WHERE email = ?", [buyerEmail]);
    
    if (!existingBuyer) {
      await run(
        "INSERT INTO users (email, name, role) VALUES (?, ?, ?)",
        [buyerEmail, "Demo Buyer", "buyer"]
      );
      console.log("Created demo buyer user:", buyerEmail);
    } else {
      console.log("Demo buyer user already exists");
    }

    console.log("Default users initialized successfully");
  } catch (error) {
    console.error("Error initializing default users:", error);
  }
}

module.exports = { initDefaultUsers };
