const { RoomDB } = require('../store/db');

// Track active users per room: roomId -> Map(socketId -> userInfo)
const activeRooms = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.username}`);

    // ── Join Room ─────────────────────────────────────────────────────────────
    socket.on('room:join', async ({ roomId }) => {
      try {
        const room = await RoomDB.findByRoomId(roomId.toUpperCase());
        if (!room) return socket.emit('error', { message: 'Room not found' });

        const userId = String(user._id || user.id);
        const member = room.members.find(m => String(m.user) === userId);
        if (!member) return socket.emit('error', { message: 'You are not a member of this room' });

        // Leave any previous rooms
        for (const [rid, users] of activeRooms.entries()) {
          if (users.has(socket.id)) {
            users.delete(socket.id);
            socket.leave(rid);
            io.to(rid).emit('room:user-left', {
              username: user.username,
              users: Array.from(users.values())
            });
          }
        }

        socket.join(roomId);
        socket.currentRoom = roomId;
        socket.userRole = member.role;

        if (!activeRooms.has(roomId)) activeRooms.set(roomId, new Map());
        activeRooms.get(roomId).set(socket.id, {
          socketId: socket.id,
          userId,
          username: user.username,
          role: member.role
        });

        socket.emit('room:joined', {
          roomId,
          role: member.role,
          code: room.code,
          users: Array.from(activeRooms.get(roomId).values())
        });

        socket.to(roomId).emit('room:user-joined', {
          username: user.username,
          role: member.role,
          users: Array.from(activeRooms.get(roomId).values())
        });

        console.log(`📋 ${user.username} joined room ${roomId} as ${member.role}`);
      } catch (err) {
        console.error('room:join error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ── Code Change ───────────────────────────────────────────────────────────
    socket.on('code:change', async ({ roomId, type, content }) => {
      if (!['html', 'css', 'javascript'].includes(type)) return;
      if (socket.userRole !== type) {
        return socket.emit('error', { message: 'You cannot edit this section' });
      }
      socket.to(roomId).emit('code:update', { type, content });

      clearTimeout(socket[`save_${type}`]);
      socket[`save_${type}`] = setTimeout(async () => {
        try {
          await RoomDB.updateCode(roomId, type, content);
        } catch (err) {
          console.error('Save code error:', err.message);
        }
      }, 3000);
    });

    // ── Chat ──────────────────────────────────────────────────────────────────
    socket.on('chat:message', ({ roomId, message }) => {
      if (!message || message.length > 500) return;
      io.to(roomId).emit('chat:message', {
        username: user.username,
        role: socket.userRole,
        message: message.trim(),
        timestamp: new Date().toISOString()
      });
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────
    socket.on('webrtc:offer', ({ roomId, targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc:offer', { fromSocketId: socket.id, fromUsername: user.username, offer });
    });
    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', { fromSocketId: socket.id, answer });
    });
    socket.on('webrtc:ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice-candidate', { fromSocketId: socket.id, candidate });
    });
    socket.on('voice:mute-status', ({ roomId, isMuted }) => {
      socket.to(roomId).emit('voice:mute-status', { socketId: socket.id, username: user.username, isMuted });
    });

    // ── Get Users ─────────────────────────────────────────────────────────────
    socket.on('room:get-users', ({ roomId }) => {
      const roomUsers = activeRooms.get(roomId);
      socket.emit('room:users', { users: roomUsers ? Array.from(roomUsers.values()) : [] });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Disconnected: ${user.username}`);
      if (socket.currentRoom) {
        const roomUsers = activeRooms.get(socket.currentRoom);
        if (roomUsers) {
          roomUsers.delete(socket.id);
          if (roomUsers.size === 0) {
            activeRooms.delete(socket.currentRoom);
          } else {
            io.to(socket.currentRoom).emit('room:user-left', {
              username: user.username,
              role: socket.userRole,
              users: Array.from(roomUsers.values())
            });
          }
        }
      }
      ['html', 'css', 'javascript'].forEach(t => clearTimeout(socket[`save_${t}`]));
    });
  });
};
