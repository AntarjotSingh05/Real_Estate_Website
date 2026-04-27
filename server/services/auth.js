const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { get, run } = require("../database");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const SALT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 10 * 60 * 1000; // 10 minutes

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash password
async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

// Compare password
async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

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
    { expiresIn: "7d" }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Check if account is locked
function isAccountLocked(user) {
  return user.lockUntil && new Date(user.lockUntil) > new Date();
}

// Increment login attempts
async function incrementLoginAttempts(email) {
  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) return null;

  const updates = {
    loginAttempts: user.loginAttempts + 1
  };

  // Lock account if max attempts reached
  if (user.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
    updates.lockUntil = new Date(Date.now() + LOCK_TIME).toISOString();
  }

  await run(
    "UPDATE users SET loginAttempts = ?, lockUntil = ? WHERE email = ?",
    [updates.loginAttempts, updates.lockUntil, email]
  );

  return await get("SELECT * FROM users WHERE email = ?", [email]);
}

// Reset login attempts on successful login
async function resetLoginAttempts(email) {
  await run(
    "UPDATE users SET loginAttempts = 0, lockUntil = NULL WHERE email = ?",
    [email]
  );
}

// Send OTP
async function sendOTP(email) {
  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Check if account is locked
  if (isAccountLocked(user)) {
    return { success: false, error: "Account is temporarily locked. Try again later." };
  }

  const otp = generateOTP();
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

  // Save OTP
  await run(
    "UPDATE users SET otp = ?, otpExpiresAt = ? WHERE email = ?",
    [otp, otpExpiresAt, email]
  );

  console.log(`OTP for ${email}: ${otp}`); // In production, send via SMS/email

  return { 
    success: true, 
    message: "OTP sent successfully",
    otp // For development only
  };
}

// Verify OTP
async function verifyOTP(email, otp) {
  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Check if account is locked
  if (isAccountLocked(user)) {
    return { success: false, error: "Account is temporarily locked. Try again later." };
  }

  // Check OTP
  if (!user.otp || user.otp !== otp) {
    await incrementLoginAttempts(email);
    return { success: false, error: "Invalid OTP" };
  }

  // Check OTP expiry
  if (new Date() > new Date(user.otpExpiresAt)) {
    return { success: false, error: "OTP has expired" };
  }

  // Clear OTP and reset login attempts
  await run(
    "UPDATE users SET otp = NULL, otpExpiresAt = NULL, loginAttempts = 0, lockUntil = NULL WHERE email = ?",
    [email]
  );

  // Generate token
  const token = generateToken(user);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  };
}

// Login with password
async function loginWithPassword(email, password) {
  console.log("Login attempt:", email);
  
  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  console.log("User found:", user);
  
  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Check if user has password
  if (!user.password) {
    return { success: false, error: "Password login not enabled for this account" };
  }

  // Compare password using bcrypt
  const bcrypt = require("bcrypt");
  const isMatch = await bcrypt.compare(password, user.password);
  console.log("Password match:", isMatch);
  
  if (!isMatch) {
    return { success: false, error: "Invalid password" };
  }

  // Generate JWT token
  const jwt = require("jsonwebtoken");
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "7d" }
  );

  return {
    success: true,
    token,
    clientId: user.id
  };
}

// Register user
async function registerUser(email, password, name, role = 'buyer') {
  // Check if user exists
  const existingUser = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (existingUser) {
    return { success: false, error: "User already exists" };
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: "Invalid email format" };
  }

  // Validate password
  if (password && password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  // Hash password
  const hashedPassword = password ? await hashPassword(password) : null;

  // Create user
  const result = await run(
    "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)",
    [email, hashedPassword, name, role]
  );

  const user = await get("SELECT * FROM users WHERE id = ?", [result.lastID]);

  // Generate token
  const token = generateToken(user);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  };
}

// Get user by ID
async function getUserById(id) {
  const user = await get("SELECT id, email, name, role, isActive FROM users WHERE id = ?", [id]);
  return user;
}

// Get user by email
async function getUserByEmail(email) {
  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  return user;
}

// Authentication middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      error: "No token provided" 
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: "Invalid token format" 
    });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid token" 
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: "Invalid token" 
    });
  }
}

// Role-based middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: "Authentication required" 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied" 
      });
    }

    next();
  };
}

// Broker-specific middleware
function requireBroker(req, res, next) {
  return requireRole(['broker', 'master', 'owner'])(req, res, next);
}

// Master broker only middleware
function requireMasterBroker(req, res, next) {
  return requireRole(['master'])(req, res, next);
}

// Dashboard access middleware (for backward compatibility)
function requireDashboardAccess(req, res, next) {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: "Authentication required" 
    });
  }

  // Check if user has owner/broker role
  if (!['broker', 'master', 'owner'].includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      error: "Access denied" 
    });
  }

  next();
}

module.exports = {
  generateOTP,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  sendOTP,
  verifyOTP,
  loginWithPassword,
  registerUser,
  getUserById,
  getUserByEmail,
  authenticate,
  requireRole,
  requireBroker,
  requireMasterBroker,
  requireDashboardAccess,
  isAccountLocked,
  MAX_LOGIN_ATTEMPTS,
  LOCK_TIME
};
