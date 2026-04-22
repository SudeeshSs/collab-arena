/**
 * db.js — Smart Database Layer
 *
 * Automatically uses MongoDB if available, falls back to in-memory store.
 * Your app runs 24/7 regardless of database availability.
 */

const mongoose = require('mongoose');
const { Users: MemUsers, Rooms: MemRooms } = require('./memoryStore');

let usingMongo = false;

// ─── Connect to MongoDB (non-blocking) ───────────────────────────────────────
async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri || uri.trim() === '') {
    console.log('⚠️  No MONGO_URI set — running with in-memory store');
    console.log('   (Data will reset on server restart. Add MONGO_URI for persistence.)');
    return false;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    usingMongo = true;
    console.log('✅ MongoDB connected — using persistent storage');
    return true;
  } catch (err) {
    console.log(`⚠️  MongoDB unavailable (${err.message})`);
    console.log('   Falling back to in-memory store — app will run normally');
    return false;
  }
}

function isUsingMongo() { return usingMongo; }

// ─── Mongoose Models (lazy loaded only when mongo is available) ───────────────
let MongoUser = null;
let MongoRoom = null;

function getMongoModels() {
  if (!MongoUser) MongoUser = require('../models/User');
  if (!MongoRoom) MongoRoom = require('../models/Room');
  return { MongoUser, MongoRoom };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIFIED USER API
// ═══════════════════════════════════════════════════════════════════════════════

const UserDB = {
  async findByEmail(email) {
    if (!usingMongo) return MemUsers.findByEmail(email);
    const { MongoUser } = getMongoModels();
    return MongoUser.findOne({ email: email.toLowerCase() });
  },

  async findByUsername(username) {
    if (!usingMongo) return MemUsers.findByUsername(username);
    const { MongoUser } = getMongoModels();
    return MongoUser.findOne({ username });
  },

  async findById(id) {
    if (!usingMongo) return MemUsers.findById(id);
    const { MongoUser } = getMongoModels();
    return MongoUser.findById(id).select('-password');
  },

  async findByIdWithPassword(id) {
    if (!usingMongo) return MemUsers.findById(id);
    const { MongoUser } = getMongoModels();
    return MongoUser.findById(id);
  },

  async create(data) {
    if (!usingMongo) return MemUsers.create(data);
    const { MongoUser } = getMongoModels();
    const user = new MongoUser(data);
    await user.save();
    return user;
  },

  async updateLastSeen(id) {
    if (!usingMongo) return MemUsers.updateLastSeen(id);
    const { MongoUser } = getMongoModels();
    await MongoUser.findByIdAndUpdate(id, { lastSeen: new Date() });
  },

  async findByEmailOrUsername(email, username) {
    if (!usingMongo) {
      const byEmail = await MemUsers.findByEmail(email);
      if (byEmail) return byEmail;
      return MemUsers.findByUsername(username);
    }
    const { MongoUser } = getMongoModels();
    return MongoUser.findOne({ $or: [{ email }, { username }] });
  },

  toJSON(user) {
    if (!usingMongo) return MemUsers.toJSON(user);
    return typeof user.toJSON === 'function' ? user.toJSON() : user;
  },

  async comparePassword(user, candidate) {
    if (!usingMongo) return MemUsers.comparePassword(user, candidate);
    return typeof user.comparePassword === 'function'
      ? user.comparePassword(candidate)
      : require('bcryptjs').compare(candidate, user.password);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIFIED ROOM API
// ═══════════════════════════════════════════════════════════════════════════════

const RoomDB = {
  async findByRoomId(roomId) {
    if (!usingMongo) return MemRooms.findByRoomId(roomId);
    const { MongoRoom } = getMongoModels();
    return MongoRoom.findOne({ roomId: roomId.toUpperCase(), isActive: true });
  },

  async create(data) {
    if (!usingMongo) return MemRooms.create(data);
    const { MongoRoom } = getMongoModels();
    const room = new MongoRoom(data);
    await room.save();
    return room;
  },

  async addMember(roomId, memberData) {
    if (!usingMongo) return MemRooms.addMember(roomId, memberData);
    const { MongoRoom } = getMongoModels();
    return MongoRoom.findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      {
        $push: { members: { user: memberData.userId, username: memberData.username, role: memberData.role } },
        $set: { lastActivity: new Date() }
      },
      { new: true }
    );
  },

  async removeMember(roomId, userId) {
    if (!usingMongo) return MemRooms.removeMember(roomId, userId);
    const { MongoRoom } = getMongoModels();
    const room = await MongoRoom.findOne({ roomId: roomId.toUpperCase() });
    if (!room) return null;
    room.members = room.members.filter(m => m.user.toString() !== userId.toString());
    if (room.members.length === 0) room.isActive = false;
    await room.save();
    return room;
  },

  async updateCode(roomId, type, content) {
    if (!usingMongo) return MemRooms.updateCode(roomId, type, content);
    const { MongoRoom } = getMongoModels();
    return MongoRoom.findOneAndUpdate(
      { roomId: roomId.toUpperCase() },
      { [`code.${type}`]: content, lastActivity: new Date() },
      { new: true }
    );
  }
};

module.exports = { connectDB, isUsingMongo, UserDB, RoomDB };
