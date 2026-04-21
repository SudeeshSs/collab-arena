const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// ─── Get Profile ──────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  res.json({ user: req.user });
});

// ─── Update Profile ───────────────────────────────────────────────────────────
router.put('/profile', [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be 3-20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, underscores')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { username } = req.body;

  try {
    if (username && username !== req.user.username) {
      const existing = await User.findOne({ username });
      if (existing) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      req.user.username = username;
    }

    await req.user.save();
    res.json({ user: req.user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
