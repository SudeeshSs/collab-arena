/**
 * db.js — Smart Database Layer
 * Auto-uses MongoDB if available, falls back to in-memory store.
 */

let mongoose = null;
let usingMongo = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri || uri.trim() === '') {
    console.log('⚠️  No MONGO_URI — using in-memory store (data resets on restart)');
    return false;
  }
  try {
    mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    usingMongo = true;
    console.log('✅ MongoDB connected');
    return true;
  } catch (err) {
    console.log(`⚠️  MongoDB failed: ${err.message} — using in-memory store`);
    usingMongo = false;
    return false;
  }
}

function isUsingMongo() { return usingMongo; }

// ── Lazy-load Mongoose models ─────────────────────────────────────────────────
function getMongoUser() { return require('../models/User'); }
function getMongoRoom() { return require('../models/Room'); }

// ── In-memory store ───────────────────────────────────────────────────────────
const { Users: MemUsers, Rooms: MemRooms } = require('./memoryStore');

// ═════════════════════════════════════════════════════════════════════════════
//  USER API
// ═════════════════════════════════════════════════════════════════════════════
const UserDB = {
  async findByEmail(email) {
    if (!usingMongo) return MemUsers.findByEmail(email);
    return getMongoUser().findOne({ email: email.toLowerCase() });
  },
  async findByUsername(username) {
    if (!usingMongo) return MemUsers.findByUsername(username);
    return getMongoUser().findOne({ username });
  },
  async findById(id) {
    if (!usingMongo) return MemUsers.findById(id);
    return getMongoUser().findById(id).select('-password').lean();
  },
  async create(data) {
    if (!usingMongo) return MemUsers.create(data);
    const User = getMongoUser();
    const user = new User(data);
    await user.save();
    return user;
  },
  async updateLastSeen(id) {
    if (!usingMongo) return MemUsers.updateLastSeen(id);
    return getMongoUser().findByIdAndUpdate(id, { lastSeen: new Date() });
  },
  async findByEmailOrUsername(email, username) {
    if (!usingMongo) {
      const byEmail = await MemUsers.findByEmail(email);
      if (byEmail) return byEmail;
      return MemUsers.findByUsername(username);
    }
    return getMongoUser().findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
  },
  toJSON(user) {
    if (!usingMongo) return MemUsers.toJSON(user);
    if (typeof user.toJSON === 'function') return user.toJSON();
    const { password, ...safe } = user;
    return safe;
  },
  async comparePassword(user, candidate) {
    const bcrypt = require('bcryptjs');
    if (!usingMongo) return MemUsers.comparePassword(user, candidate);
    if (typeof user.comparePassword === 'function') return user.comparePassword(candidate);
    return bcrypt.compare(candidate, user.password);
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  ROOM API
// ═════════════════════════════════════════════════════════════════════════════
const RoomDB = {
  async findByRoomId(roomId) {
    if (!usingMongo) return MemRooms.findByRoomId(roomId);
    return getMongoRoom().findOne({ roomId: roomId.toUpperCase(), isActive: true });
  },
  async create(data) {
    if (!usingMongo) return MemRooms.create(data);
    const Room = getMongoRoom();
    const room = new Room(data);
    await room.save();
    return room;
  },
  async addMember(roomId, memberData) {
    if (!usingMongo) return MemRooms.addMember(roomId, memberData);
    return getMongoRoom().findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { $push: { members: { user: memberData.userId, username: memberData.username, role: memberData.role } }, $set: { lastActivity: new Date() } },
      { new: true }
    );
  },
  async removeMember(roomId, userId) {
    if (!usingMongo) return MemRooms.removeMember(roomId, userId);
    const room = await getMongoRoom().findOne({ roomId: roomId.toUpperCase() });
    if (!room) return null;
    room.members = room.members.filter(m => m.user.toString() !== userId.toString());
    if (room.members.length === 0) room.isActive = false;
    await room.save();
    return room;
  },
  async updateCode(roomId, type, content) {
    if (!usingMongo) return MemRooms.updateCode(roomId, type, content);
    return getMongoRoom().findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { [`code.${type}`]: content, lastActivity: new Date() },
      { new: true }
    );
  }
};

module.exports = { connectDB, isUsingMongo, UserDB, RoomDB };
