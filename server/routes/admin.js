const express = require('express');
const { UserDB, RoomDB, isUsingMongo } = require('../store/db');
const router = express.Router();

// Simple admin key check — set ADMIN_KEY in your Railway variables
const adminAuth = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  const adminKey = process.env.ADMIN_KEY || 'admin123';
  if (key !== adminKey) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  next();
};

// ─── Stats Overview ───────────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    let totalUsers = 0;
    let totalRooms = 0;
    let activeRooms = 0;

    if (isUsingMongo()) {
      const User = require('../models/User');
      const Room = require('../models/Room');
      totalUsers = await User.countDocuments();
      totalRooms = await Room.countDocuments();
      activeRooms = await Room.countDocuments({ isActive: true });
    } else {
      // memory store
      const { Users, Rooms } = require('../store/memoryStore');
      const store = require('../store/memoryStore');
      totalUsers = store._getUserCount ? store._getUserCount() : '(memory)';
      totalRooms = '(memory)';
      activeRooms = '(memory)';
    }

    res.json({
      status: 'ok',
      db: isUsingMongo() ? 'mongodb' : 'in-memory',
      uptime: `${Math.floor(process.uptime() / 60)} minutes`,
      totalUsers,
      totalRooms,
      activeRooms,
      nodeVersion: process.version,
      memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── All Users ────────────────────────────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    if (!isUsingMongo()) {
      return res.json({
        note: 'Using in-memory store — data shown below',
        users: global._memUsers ? Array.from(global._memUsers.values()).map(u => ({
          id: u._id,
          username: u.username,
          email: u.email,
          createdAt: u.createdAt,
          lastSeen: u.lastSeen
        })) : []
      });
    }

    const User = require('../models/User');
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json({
      total: users.length,
      users: users.map(u => ({
        id: u._id,
        username: u.username,
        email: u.email,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── All Rooms ────────────────────────────────────────────────────────────────
router.get('/rooms', adminAuth, async (req, res) => {
  try {
    if (!isUsingMongo()) {
      return res.json({ note: 'Using in-memory store', rooms: [] });
    }

    const Room = require('../models/Room');
    const rooms = await Room.find({}).sort({ createdAt: -1 });
    res.json({
      total: rooms.length,
      rooms: rooms.map(r => ({
        roomId: r.roomId,
        name: r.name,
        isActive: r.isActive,
        memberCount: r.members.length,
        members: r.members.map(m => ({ username: m.username, role: m.role })),
        createdAt: r.createdAt,
        lastActivity: r.lastActivity
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
