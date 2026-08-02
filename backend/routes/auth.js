const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'paisa_ledger_super_secret_key_2026';

// Check if any accounts exist in database
router.get('/status', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    return res.json({ hasAccounts: userCount > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error check database status' });
  }
});

// Register User
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }

  try {
    // Check if user already exists
    const userExists = await User.findOne({ username: username.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create User
    const newUser = new User({
      username,
      password: hashedPassword
    });

    const savedUser = await newUser.save();

    // Sign Token
    const token = jwt.sign(
      { id: savedUser._id, username: savedUser.username },
      JWT_SECRET,
      { expiresIn: '30d' } // 30 day persistent session
    );

    res.json({
      token,
      user: {
        id: savedUser._id,
        username: savedUser.username
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registering account' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Sign Token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error logging in' });
  }
});

module.exports = router;
