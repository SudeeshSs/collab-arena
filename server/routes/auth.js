const express = require('express');
const { body, validationResult } = require('express-validator');
const { UserDB } = require('../store/db');
const { generateToken, authenticate } = require('../middleware/auth');
const router = express.Router();

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', [
  body('username').trim()
    .isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: letters, numbers, underscores only'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { username, email, password } = req.body;

    // Check email
    const existingEmail = await UserDB.findByEmail(email);
    if (existingEmail) return res.status(409).json({ error: 'Email already registered' });

    // Check username
    const existingUsername = await UserDB.findByUsername(username);
    if (existingUsername) return res.status(409).json({ error: 'Username already taken' });

    // Create user
    const user = await UserDB.create({ username, email, password });
    const id = user._id || user.id;
    const token = generateToken(id);

    res.status(201).json({ message: 'Registered!', token, user: UserDB.toJSON(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { email, password } = req.body;
    const user = await UserDB.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await UserDB.comparePassword(user, password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const id = user._id || user.id;
    await UserDB.updateLastSeen(id);
    const token = generateToken(id);

    res.json({ message: 'Logged in!', token, user: UserDB.toJSON(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// ── Get current user ──────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  const id = req.user._id || req.user.id;
  await UserDB.updateLastSeen(id).catch(() => {});
  res.json({ message: 'Logged out' });
});

module.exports = router;
