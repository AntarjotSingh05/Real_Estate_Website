const express = require("express");
const { all, get, run } = require("../database");
const { generateLeadResponse } = require("../services/openai");

const router = express.Router();

function serviceUnavailable(res) {
  return res.status(503).json({ message: "Service temporarily unavailable" });
}

// POST /api/leads - Enhanced for query form and validation
router.post("/", async (req, res) => {
  try {
    const { name, phone, email, city, propertyType, budget, message, source, brokerId } = req.body || {};
    
    // Enhanced validation - more lenient for chat leads
    const errors = {};
    
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters long';
    }
    
    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      errors.phone = 'Phone number is required';
    } else {
      const cleanPhone = phone.replace(/\D/g, '');
      // More lenient validation for chat leads - accept 6-15 digits
      if (cleanPhone.length < 6) {
        errors.phone = 'Phone number must be at least 6 digits';
      } else if (cleanPhone.length > 15) {
        errors.phone = 'Phone number is too long';
      }
    }
    
    // Email validation - more lenient for chat leads
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      errors.email = 'Email is required';
    } else {
      const emailStr = email.trim();
      // Very basic validation - just check for @ and some characters before/after
      if (!emailStr.includes('@') || emailStr.length < 5) {
        errors.email = 'Please enter a valid email address';
      }
    }
    
    // City validation - more lenient
    if (!city || typeof city !== 'string' || city.trim().length < 2) {
      errors.city = 'City must be at least 2 characters long';
    }
    
    // Log validation errors for debugging
    if (Object.keys(errors).length > 0) {
      console.log('Lead validation errors:', errors);
      console.log('Received data:', { name, phone, email, city, propertyType, budget, source });
      return res.status(400).json({ 
        error: "Validation failed", 
        details: errors 
      });
    }

    // For query form, assign to master broker by default
    let brokerIdValue = brokerId || 1; // Default to master broker
    let assignedBrokerIdValue = brokerId || 1; // Also assign to master broker

    const createdStatus = "New Lead";

    const leadInsert = await run(
      `INSERT INTO leads (brokerId, assignedBrokerId, name, phone, email, city, propertyType, budget, preferences, status, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        brokerIdValue,
        assignedBrokerIdValue,
        String(name).trim(),
        phone ? String(phone).trim() : null,
        email ? String(email).trim() : null,
        city ? String(city).trim() : null,
        propertyType ? String(propertyType).trim() : null,
        budget ? String(budget).trim() : null,
        message ? String(message).trim() : null,
        createdStatus
      ]
    );

    let aiMessage = null;
    try {
      const ai = await generateLeadResponse({
        name: String(name).trim(),
        city: city ? String(city).trim() : "",
        budget: budget ? String(budget).trim() : ""
      });
      aiMessage = ai.response || null;
    } catch {
      aiMessage = null;
    }

    if (aiMessage) {
      await run("INSERT INTO messages (leadId, sender, message) VALUES (?, ?, ?)", [leadInsert.lastID, "bot", aiMessage]);
    }

    return res.json({
      leadId: leadInsert.lastID,
      aiMessage,
      message: "Query submitted successfully"
    });
  } catch (e) {
    console.error('Lead creation error:', e);
    return res.status(500).json({ error: "server error" });
  }
});

// GET /api/leads - Get all leads with filtering
router.get("/", async (req, res) => {
  try {
    // No authentication required - public access
    const statusFilter = (req.query?.status ?? "").toString().trim();
    const query = `
      SELECT 
        l.id,
        l.name,
        l.phone,
        l.email,
        l.city,
        l.propertyType,
        l.budget,
        l.preferences,
        l.status,
        l.createdAt,
        l.updatedAt,
        l.assignedBrokerId,
        b2.name AS assignedBrokerName,
        (
          SELECT m.message
          FROM messages m
          WHERE m.leadId = l.id
          ORDER BY datetime(m.timestamp) DESC
          LIMIT 1
        ) AS lastMessage
      FROM leads l
      LEFT JOIN brokers b2 ON b2.id = l.assignedBrokerId
      ${statusFilter ? `WHERE l.status = '${statusFilter}'` : ''}
      ORDER BY l.id ASC
    `;
    const rows = await all(query);
    return res.json({ leads: rows });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: "server error" });
  }
});

// PATCH /api/leads/:id - Update lead status or assignment
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    const { status, assignedBrokerId } = req.body || {};
    console.log(`PATCH request for lead ${id}:`, { status, assignedBrokerId });
    
    // Check if lead exists
    const lead = await get("SELECT id, status, assignedBrokerId FROM leads WHERE id = ?", [id]);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    console.log(`Current lead status: ${lead.status}, assignedBrokerId: ${lead.assignedBrokerId}`);

    // If assigning to a broker, check if broker exists
    if (assignedBrokerId !== undefined && assignedBrokerId !== null) {
      const brokerId = Number(assignedBrokerId);
      if (brokerId > 0) {
        const broker = await get("SELECT id, name FROM brokers WHERE id = ?", [brokerId]);
        if (!broker) {
          console.log(`Broker ${brokerId} not found in database`);
          return res.status(400).json({ error: `Broker ${brokerId} not found` });
        }
        console.log(`Found broker:`, broker);
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (status !== undefined) {
      updates.push("status = ?");
      const trimmedStatus = String(status).trim();
      values.push(trimmedStatus);
      console.log(`Updating status from '${lead.status}' to '${trimmedStatus}'`);
    }
    
    if (assignedBrokerId !== undefined) {
      updates.push("assignedBrokerId = ?");
      values.push(assignedBrokerId ? Number(assignedBrokerId) : null);
      console.log(`Updating assignedBrokerId from '${lead.assignedBrokerId}' to '${assignedBrokerId ? Number(assignedBrokerId) : null}'`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    
    updates.push("updatedAt = datetime('now')");
    values.push(id);

    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`;
    console.log(`Executing query:`, query, `with values:`, values);
    
    await run(query, values);

    // Verify the update
    const updatedLead = await get("SELECT id, status, assignedBrokerId FROM leads WHERE id = ?", [id]);
    console.log(`Lead after update:`, updatedLead);

    return res.json({ 
      success: true, 
      message: "Lead updated successfully",
      id,
      updatedLead: {
        status: updatedLead.status,
        assignedBrokerId: updatedLead.assignedBrokerId
      }
    });

  } catch (error) {
    console.error('Error updating lead:', error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
});

// DELETE /api/leads/:id - Delete a lead (simplified approach to avoid FK constraints)
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    // Check if lead exists
    const lead = await get("SELECT id FROM leads WHERE id = ?", [id]);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Start a transaction to ensure data consistency
    await run("BEGIN TRANSACTION");

    try {
      // Delete the lead (messages will be deleted due to foreign key constraints)
      await run("DELETE FROM leads WHERE id = ?", [id]);

      // Commit the transaction
      await run("COMMIT");

      return res.json({ 
        success: true, 
        message: "Lead deleted successfully",
        deletedId: id,
        note: "Lead has been deleted. Note: ID gaps may remain in the sequence."
      });

    } catch (transactionError) {
      // Rollback if anything goes wrong
      await run("ROLLBACK");
      throw transactionError;
    }

  } catch (error) {
    console.error('Error deleting lead:', error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
});

module.exports = router;

