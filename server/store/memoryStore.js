const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Expose to global so admin route can read it
global._memUsers = global._memUsers || new Map();
global._memRooms = global._memRooms || new Map();

const store = {
  users: global._memUsers,
  rooms: global._memRooms,
};

const newId = () => uuidv4();
const newRoomId = () => Math.random().toString(36).substring(2, 10).toUpperCase();

const defaultCode = {
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello, World!</h1>
  <p>Start building your project here.</p>
  <script src="script.js"></script>
</body>
</html>`,
  css: `body {
  font-family: sans-serif;
  margin: 0;
  padding: 2rem;
  background: #f5f5f5;
  color: #333;
}
h1 { color: #2563eb; }`,
  javascript: `console.log('Hello from script.js!');`
};

const Users = {
  async findByEmail(email) {
    for (const u of store.users.values()) {
      if (u.email === email.toLowerCase()) return u;
    }
    return null;
  },
  async findByUsername(username) {
    for (const u of store.users.values()) {
      if (u.username === username) return u;
    }
    return null;
  },
  async findById(id) { return store.users.get(id) || null; },
  async create({ username, email, password }) {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const id = newId();
    const user = {
      _id: id, id, username,
      email: email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date(),
      lastSeen: new Date(),
    };
    store.users.set(id, user);
    return user;
  },
  async updateLastSeen(id) {
    const user = store.users.get(id);
    if (user) { user.lastSeen = new Date(); store.users.set(id, user); }
  },
  toJSON(user) { const { password, ...safe } = user; return safe; },
  async comparePassword(user, candidate) {
    return bcrypt.compare(candidate, user.password);
  }
};

const Rooms = {
  async findByRoomId(roomId) { return store.rooms.get(roomId.toUpperCase()) || null; },
  async create({ name, createdBy, username, role }) {
    const roomId = newRoomId();
    const room = {
      _id: newId(), roomId, name, createdBy,
      members: [{ user: createdBy, username, role, joinedAt: new Date() }],
      code: { ...defaultCode },
      isActive: true, maxMembers: 3,
      createdAt: new Date(), lastActivity: new Date(),
    };
    store.rooms.set(roomId, room);
    return room;
  },
  async addMember(roomId, { userId, username, role }) {
    const room = store.rooms.get(roomId.toUpperCase());
    if (!room) return null;
    room.members.push({ user: userId, username, role, joinedAt: new Date() });
    room.lastActivity = new Date();
    store.rooms.set(roomId, room);
    return room;
  },
  async removeMember(roomId, userId) {
    const room = store.rooms.get(roomId.toUpperCase());
    if (!room) return null;
    room.members = room.members.filter(m => m.user !== userId);
    if (room.members.length === 0) room.isActive = false;
    store.rooms.set(roomId, room);
    return room;
  },
  async updateCode(roomId, type, content) {
    const room = store.rooms.get(roomId.toUpperCase());
    if (!room) return null;
    room.code[type] = content;
    room.lastActivity = new Date();
    store.rooms.set(roomId, room);
    return room;
  }
};

// Count helpers for admin
const _getUserCount = () => store.users.size;
const _getRoomCount = () => store.rooms.size;

module.exports = { Users, Rooms, _getUserCount, _getRoomCount };
