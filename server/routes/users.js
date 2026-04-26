const express = require('express');
const { UserDB } = require('../store/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

router.get('/profile', (req, res) => {
  res.json({ user: req.user });
});

router.put('/profile', async (req, res) => {
  try {
    const { username } = req.body;
    if (username && username !== req.user.username) {
      const existing = await UserDB.findByUsername(username);
      if (existing) return res.status(409).json({ error: 'Username already taken' });
    }
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
