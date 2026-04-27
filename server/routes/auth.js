const express = require("express");
const { 
  sendOTP, 
  verifyOTP, 
  loginWithPassword, 
  registerUser,
  getUserByEmail 
} = require("../services/auth");

const router = express.Router();

// POST /api/auth/register - Register new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    
    if (!email || !name) {
      return res.status(400).json({ 
        success: false, 
        error: "Email and name are required" 
      });
    }

    const result = await registerUser(email, password, name, role);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// POST /api/auth/send-otp - Send OTP for login
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body || {};
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: "Email is required" 
      });
    }

    const result = await sendOTP(email);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// POST /api/auth/verify-otp - Verify OTP and login
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    
    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: "Email and OTP are required" 
      });
    }

    const result = await verifyOTP(email, otp);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// POST /api/auth/login - Login with password
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Email and password are required" 
      });
    }

    const result = await loginWithPassword(email, password);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// POST /api/auth/init-admin - Create default admin user
router.post("/init-admin", async (req, res) => {
  try {
    // Check if admin user already exists
    const existingUser = await getUserByEmail('admin@propertyhub.com');
    
    if (existingUser) {
      return res.json({ 
        success: false, 
        message: 'Admin user already exists' 
      });
    }
    
    // Hash the default password
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash('Anshu@7172', 10);
    
    // Insert admin user
    await run(
      'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
      ['admin@propertyhub.com', hashedPassword, 'Admin', 'master']
    );
    
    console.log('Default admin user created successfully');
    
    res.json({ 
      success: true, 
      message: 'Default admin user created',
      credentials: {
        email: 'admin@propertyhub.com',
        password: 'Anshu@7172'
      }
    });
    
  } catch (error) {
    console.error('Init admin error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/auth/logout - Logout
router.post("/logout", (req, res) => {
  return res.json({ 
    success: true, 
    message: "Logged out successfully" 
  });
});

// GET /api/auth/verify - Verify current session
router.get("/verify", (req, res) => {
  return res.json({ 
    success: false, 
    message: "No session found" 
  });
});

// GET /api/auth/me - Get current user info (protected)
router.get("/me", (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
