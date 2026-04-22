/**
 * db.js — Smart Database Layer
 * ONLY loads mongoose if MONGO_URI is set. Otherwise pure in-memory.
 * This prevents the "buffering timed out" mongoose error completely.
 */

let usingMongo = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;

  // If no URI set, skip mongoose entirely — never even require() it
  if (!uri || uri.trim() === '') {
    console.log('⚠️  No MONGO_URI set — using in-memory store');
    console.log('   Data resets on restart. Add MONGO_URI to Railway Variables for persistence.');
    return false;
  }

  try {
    // Only require mongoose if we actually have a URI
    const mongoose = require('mongoose');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    usingMongo = true;
    console.log('✅ MongoDB connected — persistent storage active');
    return true;
  } catch (err) {
    console.log(`⚠️  MongoDB connection failed: ${err.message}`);
    console.log('   Falling back to in-memory store — app will still work');
    usingMongo = false;
    return false;
  }
}

function isUsingMongo() { return usingMongo; }

// ── In-memory store (always available) ───────────────────────────────────────
const { Users: MemUsers, Rooms: MemRooms } = require('./memoryStore');

// ── Mongoose models (only used when usingMongo = true) ────────────────────────
function MongoUser() { return require('../models/User'); }
function MongoRoom() { return require('../models/Room'); }

// ═══════════════════════════════════════════════════════════════════════════
//  USER API
// ═══════════════════════════════════════════════════════════════════════════
const UserDB = {
  async findByEmail(email) {
    if (!usingMongo) return MemUsers.findByEmail(email);
    return MongoUser().findOne({ email: email.toLowerCase() });
  },
  async findByUsername(username) {
    if (!usingMongo) return MemUsers.findByUsername(username);
    return MongoUser().findOne({ username });
  },
  async findById(id) {
    if (!usingMongo) return MemUsers.findById(id);
    return MongoUser().findById(id).select('-password').lean();
  },
  async create(data) {
    if (!usingMongo) return MemUsers.create(data);
    const user = new (MongoUser())(data);
    await user.save();
    return user;
  },
  async updateLastSeen(id) {
    if (!usingMongo) return MemUsers.updateLastSeen(id);
    return MongoUser().findByIdAndUpdate(id, { lastSeen: new Date() });
  },
  toJSON(user) {
    if (!usingMongo) return MemUsers.toJSON(user);
    if (typeof user.toJSON === 'function') return user.toJSON();
    const { password, ...safe } = user;
    return safe;
  },
  async comparePassword(user, candidate) {
    if (!usingMongo) return MemUsers.comparePassword(user, candidate);
    const bcrypt = require('bcryptjs');
    if (typeof user.comparePassword === 'function') return user.comparePassword(candidate);
    return bcrypt.compare(candidate, user.password);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  ROOM API
// ═══════════════════════════════════════════════════════════════════════════
const RoomDB = {
  async findByRoomId(roomId) {
    if (!usingMongo) return MemRooms.findByRoomId(roomId);
    return MongoRoom().findOne({ roomId: roomId.toUpperCase(), isActive: true });
  },
  async create(data) {
    if (!usingMongo) return MemRooms.create(data);
    const room = new (MongoRoom())(data);
    await room.save();
    return room;
  },
  async addMember(roomId, memberData) {
    if (!usingMongo) return MemRooms.addMember(roomId, memberData);
    return MongoRoom().findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { $push: { members: { user: memberData.userId, username: memberData.username, role: memberData.role } }, $set: { lastActivity: new Date() } },
      { new: true }
    );
  },
  async removeMember(roomId, userId) {
    if (!usingMongo) return MemRooms.removeMember(roomId, userId);
    const room = await MongoRoom().findOne({ roomId: roomId.toUpperCase() });
    if (!room) return null;
    room.members = room.members.filter(m => m.user.toString() !== userId.toString());
    if (room.members.length === 0) room.isActive = false;
    await room.save();
    return room;
  },
  async updateCode(roomId, type, content) {
    if (!usingMongo) return MemRooms.updateCode(roomId, type, content);
    return MongoRoom().findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { [`code.${type}`]: content, lastActivity: new Date() },
      { new: true }
    );
  }
};

module.exports = { connectDB, isUsingMongo, UserDB, RoomDB };
