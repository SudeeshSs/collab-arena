const express = require('express');
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All room routes require authentication
router.use(authenticate);

// ─── Create Room ──────────────────────────────────────────────────────────────
router.post('/create', [
  body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Room name required (max 50 chars)'),
  body('role').isIn(['html', 'css', 'javascript']).withMessage('Invalid role')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { name, role } = req.body;

  try {
    const room = new Room({
      name,
      createdBy: req.user._id,
      members: [{
        user: req.user._id,
        username: req.user.username,
        role
      }]
    });

    await room.save();
    await room.populate('members.user', 'username email');

    res.status(201).json({
      message: 'Room created successfully',
      room
    });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// ─── Join Room ────────────────────────────────────────────────────────────────
router.post('/join', [
  body('roomId').trim().notEmpty().withMessage('Room ID is required'),
  body('role').isIn(['html', 'css', 'javascript']).withMessage('Invalid role')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { roomId, role } = req.body;

  try {
    const room = await Room.findOne({ 
      roomId: roomId.toUpperCase(),
      isActive: true 
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found or inactive' });
    }

    // Check if user already in room
    const alreadyMember = room.members.find(
      m => m.user.toString() === req.user._id.toString()
    );
    if (alreadyMember) {
      return res.json({ 
        message: 'Rejoined room',
        room,
        userRole: alreadyMember.role
      });
    }

    // Check max members
    if (room.members.length >= room.maxMembers) {
      return res.status(409).json({ error: 'Room is full (max 3 users)' });
    }

    // Check if role is taken
    const roleTaken = room.members.find(m => m.role === role);
    if (roleTaken) {
      return res.status(409).json({ 
        error: `The ${role.toUpperCase()} role is already taken`,
        takenRoles: room.members.map(m => m.role)
      });
    }

    room.members.push({
      user: req.user._id,
      username: req.user.username,
      role
    });
    room.lastActivity = new Date();
    await room.save();
    await room.populate('members.user', 'username email');

    res.json({
      message: 'Joined room successfully',
      room,
      userRole: role
    });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// ─── Get Room ─────────────────────────────────────────────────────────────────
router.get('/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ 
      roomId: req.params.roomId.toUpperCase(),
      isActive: true
    }).populate('members.user', 'username email');

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get room' });
  }
});

// ─── Get Room Available Roles ─────────────────────────────────────────────────
router.get('/:roomId/available-roles', async (req, res) => {
  try {
    const room = await Room.findOne({ 
      roomId: req.params.roomId.toUpperCase(),
      isActive: true
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const allRoles = ['html', 'css', 'javascript'];
    const takenRoles = room.members.map(m => m.role);
    const availableRoles = allRoles.filter(r => !takenRoles.includes(r));

    res.json({
      roomId: room.roomId,
      roomName: room.name,
      memberCount: room.members.length,
      maxMembers: room.maxMembers,
      takenRoles,
      availableRoles,
      isFull: room.members.length >= room.maxMembers
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get room info' });
  }
});

// ─── Save Code ────────────────────────────────────────────────────────────────
router.put('/:roomId/code', async (req, res) => {
  try {
    const { type, content } = req.body;
    if (!['html', 'css', 'javascript'].includes(type)) {
      return res.status(400).json({ error: 'Invalid code type' });
    }

    const room = await Room.findOne({ 
      roomId: req.params.roomId.toUpperCase(),
      isActive: true
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Verify user is member with the right role
    const member = room.members.find(
      m => m.user.toString() === req.user._id.toString()
    );
    if (!member || member.role !== type) {
      return res.status(403).json({ error: 'You cannot edit this section' });
    }

    room.code[type] = content;
    room.lastActivity = new Date();
    await room.save();

    res.json({ message: 'Code saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save code' });
  }
});

// ─── Leave Room ───────────────────────────────────────────────────────────────
router.delete('/:roomId/leave', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    room.members = room.members.filter(
      m => m.user.toString() !== req.user._id.toString()
    );

    if (room.members.length === 0) {
      room.isActive = false;
    }

    await room.save();
    res.json({ message: 'Left room successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

module.exports = router;
