/**
 * FINAL db.js — zero mongoose at startup unless MONGO_URI is set
 */

let usingMongo = false;
let _mongoose = null;
let _UserModel = null;
let _RoomModel = null;

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri || uri.trim() === '' || uri === 'undefined') {
    console.log('⚠️  No MONGO_URI — using in-memory store (add MONGO_URI for persistence)');
    return false;
  }
  try {
    _mongoose = require('mongoose');
    // Disconnect any existing connection first
    if (_mongoose.connection.readyState !== 0) {
      await _mongoose.disconnect();
    }
    await _mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    // Load models ONLY after successful connection
    _UserModel = require('../models/User');
    _RoomModel = require('../models/Room');
    usingMongo = true;
    console.log('✅ MongoDB connected — data will persist');
    return true;
  } catch (err) {
    console.log(`⚠️  MongoDB failed (${err.message}) — using in-memory store`);
    _mongoose = null;
    _UserModel = null;
    _RoomModel = null;
    usingMongo = false;
    return false;
  }
}

function isUsingMongo() { return usingMongo; }

// Always-available memory store
const { Users: Mem, Rooms: MemR } = require('./memoryStore');

// ── USER API ──────────────────────────────────────────────────────────────────
const UserDB = {
  async findByEmail(email) {
    if (!usingMongo) return Mem.findByEmail(email);
    return _UserModel.findOne({ email: email.toLowerCase() });
  },
  async findByUsername(username) {
    if (!usingMongo) return Mem.findByUsername(username);
    return _UserModel.findOne({ username });
  },
  async findById(id) {
    if (!usingMongo) return Mem.findById(id);
    return _UserModel.findById(id).select('-password');
  },
  async create(data) {
    if (!usingMongo) return Mem.create(data);
    const user = new _UserModel(data);
    await user.save();
    return user;
  },
  async updateLastSeen(id) {
    if (!usingMongo) return Mem.updateLastSeen(id);
    return _UserModel.findByIdAndUpdate(id, { lastSeen: new Date() });
  },
  toJSON(user) {
    if (!usingMongo) return Mem.toJSON(user);
    if (typeof user.toJSON === 'function') return user.toJSON();
    const { password, ...safe } = user;
    return safe;
  },
  async comparePassword(user, candidate) {
    if (!usingMongo) return Mem.comparePassword(user, candidate);
    if (typeof user.comparePassword === 'function') return user.comparePassword(candidate);
    return require('bcryptjs').compare(candidate, user.password);
  }
};

// ── ROOM API ──────────────────────────────────────────────────────────────────
const RoomDB = {
  async findByRoomId(roomId) {
    if (!usingMongo) return MemR.findByRoomId(roomId);
    return _RoomModel.findOne({ roomId: roomId.toUpperCase(), isActive: true });
  },
  async create(data) {
    if (!usingMongo) return MemR.create(data);
    const room = new _RoomModel(data);
    await room.save();
    return room;
  },
  async addMember(roomId, memberData) {
    if (!usingMongo) return MemR.addMember(roomId, memberData);
    return _RoomModel.findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { $push: { members: { user: memberData.userId, username: memberData.username, role: memberData.role } }, $set: { lastActivity: new Date() } },
      { new: true }
    );
  },
  async removeMember(roomId, userId) {
    if (!usingMongo) return MemR.removeMember(roomId, userId);
    const room = await _RoomModel.findOne({ roomId: roomId.toUpperCase() });
    if (!room) return null;
    room.members = room.members.filter(m => String(m.user) !== String(userId));
    if (room.members.length === 0) room.isActive = false;
    await room.save();
    return room;
  },
  async updateCode(roomId, type, content) {
    if (!usingMongo) return MemR.updateCode(roomId, type, content);
    return _RoomModel.findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { [`code.${type}`]: content, lastActivity: new Date() },
      { new: true }
    );
  }
};

module.exports = { connectDB, isUsingMongo, UserDB, RoomDB };
