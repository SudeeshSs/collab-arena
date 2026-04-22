/**
 * db.js — Database layer
 * ONLY uses MongoDB if MONGO_URI is explicitly set AND non-empty.
 * Otherwise uses pure in-memory store — no mongoose imported at all.
 */

let usingMongo = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri || uri.trim() === '' || uri === 'undefined') {
    console.log('⚠️  No MONGO_URI — using in-memory store');
    usingMongo = false;
    return false;
  }
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
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

const { Users: MemUsers, Rooms: MemRooms } = require('./memoryStore');

// Only load mongo models when actually needed
function MongoUser() {
  if (!usingMongo) throw new Error('MongoDB not connected');
  return require('../models/User');
}
function MongoRoom() {
  if (!usingMongo) throw new Error('MongoDB not connected');
  return require('../models/Room');
}

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
    return MongoUser().findById(id).select('-password');
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
    room.members = room.members.filter(m => String(m.user) !== String(userId));
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
