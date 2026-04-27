const express = require("express");
const { all, get, run } = require("../database");
const { generateLeadResponse } = require("../services/openai");

const router = express.Router();

function serviceUnavailable(res) {
  return res.status(503).json({ message: "Service temporarily unavailable" });
}

// POST /api/leads - Hardened lead creation
router.post("/", async (req, res) => {
  try {
    const {
      name,
      phone = null,
      email = null,
      city = null,
      propertyType = null,
      budget = null,
      preferences = null,
      status = "new"
    } = req.body;

    // ✅ Auto assign brokerId (fallback = 1)
    const brokerId = req.body.brokerId || 1;

    // ✅ Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Name is required"
      });
    }

    // ✅ Insert lead
    const result = await run(
      `INSERT INTO leads 
      (brokerId, name, phone, email, city, propertyType, budget, preferences, status, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [brokerId, name, phone, email, city, propertyType, budget, preferences, status]
    );

    return res.json({
      success: true,
      leadId: result.lastID
    });

  } catch (err) {
    console.error("LEAD INSERT ERROR:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
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

