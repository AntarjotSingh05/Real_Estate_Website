const { get } = require("../database");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const DASHBOARD_PIN = process.env.DASHBOARD_PIN || "1234"; // Default PIN, should be changed in production
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "Anshu@7172"; // Required password for dashboard access

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      name: user.name 
    },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

// Generate session ID for tracking
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Middleware to authenticate and set user in request
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    req.sessionId = null;
    return next();
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  
  if (!decoded) {
    req.user = null;
    req.sessionId = null;
    return next();
  }

  req.user = decoded;
  req.sessionId = req.headers['x-session-id'] || generateSessionId();
  next();
}

// Middleware to check user role
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Authentication required" 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: "This section is not available for your role." 
      });
    }

    next();
  };
}

// Middleware for dashboard access with extra PIN and password protection
function requireDashboardAccess(req, res, next) {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({ 
      error: "Authentication required" 
    });
  }

  // Check if user has owner/broker role
  if (!['broker', 'master', 'owner'].includes(req.user.role)) {
    return res.status(403).json({ 
      error: "This section is not available for your role." 
    });
  }

  // Check for additional PIN protection
  const providedPin = req.headers['x-dashboard-pin'];
  if (!providedPin || providedPin !== DASHBOARD_PIN) {
    return res.status(403).json({ 
      error: "Access restricted. Broker authorization required." 
    });
  }

  // Check for password requirement
  const providedPassword = req.headers['x-dashboard-password'];
  if (!providedPassword || providedPassword !== DASHBOARD_PASSWORD) {
    return res.status(403).json({ 
      error: "Access restricted. Valid password required." 
    });
  }

  next();
}

// Middleware for broker-specific routes
function requireBroker(req, res, next) {
  return requireRole(['broker', 'master'])(req, res, next);
}

// Middleware for master broker only
function requireMasterBroker(req, res, next) {
  if (!req.user || req.user.role !== 'master') {
    return res.status(403).json({ 
      error: "This section is not available for your role." 
    });
  }
  next();
}

// Get user from database
async function getUserById(userId) {
  return await get("SELECT id, email, name, role, isActive FROM users WHERE id = ?", [userId]);
}

// Get user from database by email
async function getUserByEmail(email) {
  return await get("SELECT id, email, name, role, isActive FROM users WHERE email = ?", [email]);
}

// Authenticate broker credentials
async function authenticateBroker(brokerId, pin, password) {
  try {
    const broker = await get("SELECT id, name, email, role, isActive FROM brokers WHERE id = ?", [Number(brokerId)]);
    
    if (!broker || !broker.isActive) {
      return { success: false, error: "Invalid broker credentials" };
    }

    // Check PIN (in production, this should be hashed)
    if (pin !== DASHBOARD_PIN) {
      return { success: false, error: "Invalid PIN" };
    }

    // Check password requirement
    if (password !== DASHBOARD_PASSWORD) {
      return { success: false, error: "Invalid password" };
    }

    // Generate session
    const sessionId = generateSessionId();
    const token = generateToken(broker);

    return { 
      success: true, 
      token, 
      sessionId,
      user: {
        id: broker.id,
        name: broker.name,
        email: broker.email,
        role: broker.role
      }
    };
  } catch (error) {
    return { success: false, error: "Authentication failed" };
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  requireRole,
  requireBroker,
  requireMasterBroker,
  requireDashboardAccess,
  getUserById,
  getUserByEmail,
  authenticateBroker,
  DASHBOARD_PIN // Export for testing purposes
};
