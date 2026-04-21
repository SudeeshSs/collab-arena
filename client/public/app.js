/* ════════════════════════════════════════════════════════════════════════════
   CodeArena — Client Application
   Full-featured: Auth, Room, Editors, Preview, Voice, Chat, Export
   ════════════════════════════════════════════════════════════════════════════ */

// ─── App State ────────────────────────────────────────────────────────────────
const App = {
  user: null,
  token: null,
  currentRoom: null,
  userRole: null,
  socket: null,
  editors: {},
  previewVisible: true,
  previewTimeout: null,
  voice: {
    active: false,
    muted: false,
    localStream: null,
    peers: {},      // socketId -> RTCPeerConnection
    audioElements: {}  // socketId -> HTMLAudioElement
  }
};

// ─── API Helper ───────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (App.token) headers['Authorization'] = `Bearer ${App.token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Screen Navigation ────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`${name}-screen`).classList.add('active');
}

// ─── Auth Persistence ─────────────────────────────────────────────────────────
function saveAuth(token, user) {
  localStorage.setItem('ca_token', token);
  localStorage.setItem('ca_user', JSON.stringify(user));
  App.token = token;
  App.user = user;
}

function loadAuth() {
  const token = localStorage.getItem('ca_token');
  const user = localStorage.getItem('ca_user');
  if (token && user) {
    App.token = token;
    App.user = JSON.parse(user);
    return true;
  }
  return false;
}

function clearAuth() {
  localStorage.removeItem('ca_token');
  localStorage.removeItem('ca_user');
  App.token = null;
  App.user = null;
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function initAuthScreen() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in...';

    try {
      const data = await api('POST', '/auth/login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      });
      saveAuth(data.token, data.user);
      enterLobby();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Enter Arena';
    }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    errEl.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Creating...';

    try {
      const data = await api('POST', '/auth/register', {
        username: document.getElementById('reg-username').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value
      });
      saveAuth(data.token, data.user);
      enterLobby();
      showToast('Welcome to CodeArena!', 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Create Account';
    }
  });
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function enterLobby() {
  document.getElementById('lobby-username').textContent = App.user.username;
  document.getElementById('header-username').textContent = App.user.username;
  const avatarEl = document.getElementById('header-avatar');
  avatarEl.textContent = App.user.username[0].toUpperCase();
  avatarEl.style.background = stringToColor(App.user.username);
  showScreen('lobby');
}

function initLobbyScreen() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api('POST', '/auth/logout'); } catch {}
    clearAuth();
    showScreen('auth');
    showToast('Signed out', 'info');
  });

  // Create room
  document.getElementById('create-room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('create-error');
    errEl.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const role = document.querySelector('input[name="create-role"]:checked').value;
    const name = document.getElementById('room-name-input').value.trim();

    try {
      const data = await api('POST', '/rooms/create', { name, role });
      App.currentRoom = data.room;
      App.userRole = role;
      enterArena();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });

  // Join room - check available roles on ID change
  const roomIdInput = document.getElementById('room-id-input');
  let checkTimeout;
  roomIdInput.addEventListener('input', () => {
    clearTimeout(checkTimeout);
    const val = roomIdInput.value.trim().toUpperCase();
    if (val.length === 8) {
      checkTimeout = setTimeout(() => checkRoomRoles(val), 400);
    } else {
      document.getElementById('available-roles-display').classList.add('hidden');
    }
  });

  // Join room
  document.getElementById('join-room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('join-error');
    errEl.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const role = document.querySelector('input[name="join-role"]:checked').value;
    const roomId = document.getElementById('room-id-input').value.trim();

    try {
      const data = await api('POST', '/rooms/join', { roomId, role });
      App.currentRoom = data.room;
      App.userRole = data.userRole || role;
      enterArena();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}

async function checkRoomRoles(roomId) {
  try {
    const data = await api('GET', `/rooms/${roomId}/available-roles`);
    const el = document.getElementById('available-roles-display');
    if (data.isFull) {
      el.textContent = '❌ Room is full';
      el.classList.remove('hidden');
    } else {
      el.textContent = `✓ ${data.roomName} — Available: ${data.availableRoles.map(r => r.toUpperCase()).join(', ')}`;
      el.classList.remove('hidden');
    }
  } catch {
    const el = document.getElementById('available-roles-display');
    el.textContent = '⚠ Room not found';
    el.classList.remove('hidden');
  }
}

// ─── Arena ────────────────────────────────────────────────────────────────────
function enterArena() {
  const room = App.currentRoom;
  const role = App.userRole;

  // Update topbar
  document.getElementById('topbar-room-name').textContent = room.name;
  document.getElementById('topbar-room-id').textContent = `ID: ${room.roomId}`;

  // Role badge
  const badge = document.getElementById('my-role-badge');
  badge.textContent = role === 'javascript' ? 'JS' : role.toUpperCase();
  badge.className = `role-badge ${role}`;

  // Status bar
  document.getElementById('status-role').textContent = `Role: ${role.toUpperCase()}`;
  document.getElementById('status-room').textContent = `Room: ${room.roomId}`;

  showScreen('arena');
  initEditors();
  initSocketConnection();
  updateCollaborators([]);
}

// ─── CodeMirror Editors ───────────────────────────────────────────────────────
function initEditors() {
  const editorConfigs = [
    { id: 'cm-html', role: 'html', mode: 'htmlmixed' },
    { id: 'cm-css', role: 'css', mode: 'css' },
    { id: 'cm-javascript', role: 'javascript', mode: 'javascript' }
  ];

  const code = App.currentRoom.code;

  editorConfigs.forEach(({ id, role, mode }) => {
    const isOwner = App.userRole === role;
    const cm = CodeMirror.fromTextArea(document.getElementById(id), {
      mode,
      theme: 'dracula',
      lineNumbers: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      styleActiveLine: isOwner,
      lineWrapping: false,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      readOnly: !isOwner,
      extraKeys: { "Tab": cm => cm.execCommand("insertSoftTab") }
    });

    cm.setValue(code[role] || '');

    if (!isOwner) {
      cm.getWrapperElement().classList.add('readonly-editor');
      cm.getWrapperElement().title = `Only the ${role.toUpperCase()} editor can modify this`;
    }

    App.editors[role] = cm;

    // Live change → broadcast
    if (isOwner) {
      let changeTimeout;
      cm.on('change', (instance, change) => {
        if (change.origin === 'setValue' || change.origin === 'remote') return;

        // Sync indicator
        document.getElementById('sync-text').textContent = 'Syncing...';
        clearTimeout(changeTimeout);
        changeTimeout = setTimeout(() => {
          document.getElementById('sync-text').textContent = 'Live';
        }, 1000);

        if (App.socket) {
          App.socket.emit('code:change', {
            roomId: App.currentRoom.roomId,
            type: role,
            content: instance.getValue()
          });
        }

        // Update preview
        schedulePreviewUpdate();
      });
    }
  });

  // Editor tab switching
  document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const role = tab.dataset.role;
      document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`editor-${role}`).classList.add('active');

      // Highlight file in tree
      document.querySelectorAll('.file-item').forEach(f => f.classList.remove('active'));
      document.querySelector(`.file-item[data-role="${role}"]`).classList.add('active');

      // Refresh CodeMirror
      setTimeout(() => App.editors[role] && App.editors[role].refresh(), 10);
    });
  });

  // File tree clicks
  document.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', () => {
      const role = item.dataset.role;
      document.querySelector(`.editor-tab[data-role="${role}"]`).click();
    });
  });

  // Update editor owner banners
  updateEditorOwners();

  // Initial preview
  schedulePreviewUpdate();
}

function updateEditorOwners() {
  const room = App.currentRoom;
  ['html', 'css', 'javascript'].forEach(role => {
    const member = room.members.find(m => m.role === role);
    const el = document.getElementById(`${role}-editor-owner`);
    const fileUserEl = document.getElementById(`file-user-${role}`);
    if (member) {
      const name = member.username || member.user?.username || '?';
      el.textContent = `@${name}`;
      fileUserEl.textContent = name;
    } else {
      el.textContent = 'Unassigned';
      fileUserEl.textContent = '';
    }
  });
}

// ─── Live Preview ─────────────────────────────────────────────────────────────
function schedulePreviewUpdate() {
  clearTimeout(App.previewTimeout);
  App.previewTimeout = setTimeout(updatePreview, 500);
}

function updatePreview() {
  if (!App.previewVisible) return;

  const html = App.editors.html?.getValue() || '';
  const css = App.editors.css?.getValue() || '';
  const js = App.editors.javascript?.getValue() || '';

  // Inject CSS and JS into HTML
  let combined = html;

  // Check if there's a <head> tag
  if (combined.includes('</head>')) {
    combined = combined.replace('</head>', `<style>${css}</style></head>`);
  } else if (combined.includes('<body')) {
    combined = `<style>${css}</style>${combined}`;
  } else {
    combined = `<style>${css}</style>${combined}`;
  }

  // Check if there's a script src
  combined = combined.replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/gi, '');

  if (combined.includes('</body>')) {
    combined = combined.replace('</body>', `<script>${js}</script></body>`);
  } else {
    combined += `<script>${js}</script>`;
  }

  const frame = document.getElementById('preview-frame');
  frame.srcdoc = combined;
}

// ─── Socket.io Connection ─────────────────────────────────────────────────────
function initSocketConnection() {
  App.socket = io({
    auth: { token: App.token },
    transports: ['websocket']
  });

  const socket = App.socket;

  socket.on('connect', () => {
    document.getElementById('status-connection').textContent = '● Connected';
    document.getElementById('status-connection').className = 'status-connected';
    socket.emit('room:join', { roomId: App.currentRoom.roomId });
  });

  socket.on('disconnect', () => {
    document.getElementById('status-connection').textContent = '○ Disconnected';
    document.getElementById('status-connection').className = 'status-disconnected';
    document.getElementById('sync-text').textContent = 'Offline';
  });

  socket.on('connect_error', (err) => {
    showToast(`Connection error: ${err.message}`, 'error');
  });

  // Room joined — get initial state
  socket.on('room:joined', ({ code, users }) => {
    // Update editors with current code (from DB)
    Object.entries(code).forEach(([type, content]) => {
      const editor = App.editors[type];
      if (editor && editor.getValue() !== content) {
        editor.setValue(content, { origin: 'remote' });
      }
    });
    updateCollaborators(users);
    updateTopbarUsers(users);
    showToast(`Joined room as ${App.userRole.toUpperCase()}`, 'success');
  });

  // Someone joined
  socket.on('room:user-joined', ({ username, role, users }) => {
    updateCollaborators(users);
    updateTopbarUsers(users);
    addSystemMessage(`${username} joined as ${role.toUpperCase()}`);
    showToast(`${username} joined`, 'info', 2000);
  });

  // Someone left
  socket.on('room:user-left', ({ username, role, users }) => {
    updateCollaborators(users);
    updateTopbarUsers(users);
    addSystemMessage(`${username} left the room`);
  });

  // Code update from another user
  socket.on('code:update', ({ type, content }) => {
    const editor = App.editors[type];
    if (editor && App.userRole !== type) {
      const cursor = editor.getCursor();
      editor.setValue(content, { origin: 'remote' });
      try { editor.setCursor(cursor); } catch {}
      schedulePreviewUpdate();
      document.getElementById('sync-text').textContent = 'Updated';
      setTimeout(() => document.getElementById('sync-text').textContent = 'Live', 1000);
    }
  });

  // Chat messages
  socket.on('chat:message', ({ username, role, message, timestamp }) => {
    addChatMessage(username, role, message, timestamp);
  });

  // Error from server
  socket.on('error', ({ message }) => {
    showToast(message, 'error');
  });

  // WebRTC Signaling
  socket.on('webrtc:offer', handleWebRTCOffer);
  socket.on('webrtc:answer', handleWebRTCAnswer);
  socket.on('webrtc:ice-candidate', handleICECandidate);
  socket.on('voice:mute-status', handlePeerMuteStatus);
}

// ─── Collaborators UI ─────────────────────────────────────────────────────────
function updateCollaborators(users) {
  const list = document.getElementById('collaborators-list');
  list.innerHTML = '';

  if (users.length === 0) {
    list.innerHTML = '<div style="padding:8px;font-size:0.75rem;color:var(--text-muted)">No one here yet...</div>';
    return;
  }

  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'collaborator-item';

    const roleColor = { html: 'var(--html-color)', css: 'var(--css-color)', javascript: 'var(--js-color)' }[u.role] || 'var(--accent)';

    item.innerHTML = `
      <div class="collab-avatar" style="background: ${stringToColor(u.username)}">${u.username[0].toUpperCase()}</div>
      <div class="collab-info">
        <div class="collab-name">${u.username}</div>
        <div class="collab-role" style="color: ${roleColor}">${u.role.toUpperCase()}</div>
      </div>
      <div class="collab-online-dot"></div>
    `;
    list.appendChild(item);
  });
}

function updateTopbarUsers(users) {
  const container = document.getElementById('topbar-users');
  container.innerHTML = '';

  users.forEach(u => {
    const chip = document.createElement('div');
    chip.className = 'topbar-user-chip online';
    const roleColor = { html: 'var(--html-color)', css: 'var(--css-color)', javascript: 'var(--js-color)' }[u.role];
    chip.innerHTML = `
      <div class="chip-avatar" style="background: ${stringToColor(u.username)}">${u.username[0].toUpperCase()}</div>
      <span>${u.username}</span>
      <div class="chip-role-dot" style="background: ${roleColor}"></div>
    `;
    container.appendChild(chip);
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function addChatMessage(username, role, message, timestamp) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'chat-msg';
  const roleColor = { html: 'var(--html-color)', css: 'var(--css-color)', javascript: 'var(--js-color)' }[role] || 'var(--accent)';
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msg.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-user" style="color: ${roleColor}">${username}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${escapeHTML(message)}</div>
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(message) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'chat-msg system';
  msg.innerHTML = `<div class="chat-msg-text">${escapeHTML(message)}</div>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function initChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  const send = () => {
    const message = input.value.trim();
    if (!message || !App.socket) return;
    App.socket.emit('chat:message', { roomId: App.currentRoom.roomId, message });
    input.value = '';
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// ─── Voice Chat (WebRTC) ──────────────────────────────────────────────────────
async function joinVoice() {
  try {
    App.voice.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    App.voice.active = true;

    document.getElementById('voice-join-btn').classList.add('hidden');
    document.getElementById('voice-mute-btn').classList.remove('hidden');
    document.getElementById('voice-leave-btn').classList.remove('hidden');

    showToast('Joined voice channel', 'success');

    // Initiate connections to existing peers
    App.socket.emit('room:get-users', { roomId: App.currentRoom.roomId });
    App.socket.once('room:users', ({ users }) => {
      users.forEach(u => {
        if (u.socketId !== App.socket.id) {
          initiateVoiceCall(u.socketId);
        }
      });
    });
  } catch (err) {
    showToast(`Microphone error: ${err.message}`, 'error');
  }
}

async function initiateVoiceCall(targetSocketId) {
  const pc = createPeerConnection(targetSocketId);

  App.voice.localStream.getTracks().forEach(track => {
    pc.addTrack(track, App.voice.localStream);
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  App.socket.emit('webrtc:offer', {
    roomId: App.currentRoom.roomId,
    targetSocketId,
    offer
  });
}

async function handleWebRTCOffer({ fromSocketId, fromUsername, offer }) {
  if (!App.voice.active) return;

  const pc = createPeerConnection(fromSocketId);

  App.voice.localStream.getTracks().forEach(track => {
    pc.addTrack(track, App.voice.localStream);
  });

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  App.socket.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
  updateVoicePeers();
}

async function handleWebRTCAnswer({ fromSocketId, answer }) {
  const pc = App.voice.peers[fromSocketId];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

async function handleICECandidate({ fromSocketId, candidate }) {
  const pc = App.voice.peers[fromSocketId];
  if (pc && candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

function createPeerConnection(socketId) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      App.socket.emit('webrtc:ice-candidate', {
        targetSocketId: socketId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    if (!App.voice.audioElements[socketId]) {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
      App.voice.audioElements[socketId] = audio;
    }
    updateVoicePeers();
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      cleanupPeerConnection(socketId);
    }
  };

  App.voice.peers[socketId] = pc;
  return pc;
}

function cleanupPeerConnection(socketId) {
  if (App.voice.peers[socketId]) {
    App.voice.peers[socketId].close();
    delete App.voice.peers[socketId];
  }
  if (App.voice.audioElements[socketId]) {
    App.voice.audioElements[socketId].pause();
    delete App.voice.audioElements[socketId];
  }
  updateVoicePeers();
}

function toggleMute() {
  App.voice.muted = !App.voice.muted;
  if (App.voice.localStream) {
    App.voice.localStream.getAudioTracks().forEach(track => {
      track.enabled = !App.voice.muted;
    });
  }
  const btn = document.getElementById('voice-mute-btn');
  btn.innerHTML = App.voice.muted
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/></svg> Unmute`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/></svg> Mute`;

  if (App.socket) {
    App.socket.emit('voice:mute-status', {
      roomId: App.currentRoom.roomId,
      isMuted: App.voice.muted
    });
  }
}

function leaveVoice() {
  if (App.voice.localStream) {
    App.voice.localStream.getTracks().forEach(t => t.stop());
    App.voice.localStream = null;
  }
  Object.keys(App.voice.peers).forEach(cleanupPeerConnection);
  App.voice.active = false;
  App.voice.muted = false;

  document.getElementById('voice-join-btn').classList.remove('hidden');
  document.getElementById('voice-mute-btn').classList.add('hidden');
  document.getElementById('voice-leave-btn').classList.add('hidden');

  updateVoicePeers();
  showToast('Left voice channel', 'info');
}

function handlePeerMuteStatus({ socketId, username, isMuted }) {
  // Update voice peer display
  const peerEl = document.getElementById(`voice-peer-${socketId}`);
  if (peerEl) {
    peerEl.className = `voice-peer${isMuted ? ' muted' : ''}`;
    peerEl.querySelector('.voice-peer-icon').textContent = isMuted ? '🔇' : '🎙️';
  }
}

function updateVoicePeers() {
  const container = document.getElementById('voice-peers');
  container.innerHTML = '';
  const peerCount = Object.keys(App.voice.peers).length;
  if (peerCount === 0 && App.voice.active) {
    container.innerHTML = '<div style="font-size:0.72rem;color:var(--text-muted);padding:2px 0">Waiting for others...</div>';
  }
}

// ─── Export ZIP ───────────────────────────────────────────────────────────────
async function exportZip() {
  const html = App.editors.html?.getValue() || '';
  const css = App.editors.css?.getValue() || '';
  const js = App.editors.javascript?.getValue() || '';
  const roomName = App.currentRoom?.name || 'project';

  // Create standalone HTML that links to css/js files
  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('style.css', css);
  zip.file('script.js', js);
  zip.file('README.md', `# ${roomName}\n\nCreated with CodeArena.\n\nOpen \`index.html\` in your browser to view the project.\n`);

  try {
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${roomName.replace(/\s+/g, '-').toLowerCase()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Project exported!', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

// ─── Arena Controls ───────────────────────────────────────────────────────────
function initArenaControls() {
  // Leave room
  document.getElementById('leave-room-btn').addEventListener('click', async () => {
    if (!confirm('Leave this room?')) return;
    leaveVoice();
    if (App.socket) App.socket.disconnect();
    try {
      await api('DELETE', `/rooms/${App.currentRoom.roomId}/leave`);
    } catch {}
    App.currentRoom = null;
    App.userRole = null;
    App.editors = {};
    enterLobby();
  });

  // Toggle preview
  document.getElementById('toggle-preview-btn').addEventListener('click', () => {
    App.previewVisible = !App.previewVisible;
    const preview = document.getElementById('arena-preview');
    preview.classList.toggle('hidden', !App.previewVisible);
    if (App.previewVisible) {
      updatePreview();
      document.getElementById('toggle-preview-btn').style.color = '';
    } else {
      document.getElementById('toggle-preview-btn').style.color = 'var(--text-muted)';
    }
  });

  // Refresh preview
  document.getElementById('refresh-preview-btn').addEventListener('click', updatePreview);

  // Close preview
  document.getElementById('close-preview-btn').addEventListener('click', () => {
    App.previewVisible = false;
    document.getElementById('arena-preview').classList.add('hidden');
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', exportZip);

  // Copy room ID
  document.getElementById('copy-room-id-btn').addEventListener('click', () => {
    const id = App.currentRoom?.roomId;
    if (id) {
      navigator.clipboard.writeText(id);
      showToast(`Room ID copied: ${id}`, 'success');
    }
  });

  // Voice
  document.getElementById('voice-join-btn').addEventListener('click', joinVoice);
  document.getElementById('voice-mute-btn').addEventListener('click', toggleMute);
  document.getElementById('voice-leave-btn').addEventListener('click', leaveVoice);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  initAuthScreen();
  initLobbyScreen();
  initArenaControls();
  initChat();

  // Check for existing session
  if (loadAuth()) {
    try {
      // Validate token still works
      const data = await api('GET', '/auth/me');
      App.user = data.user;
      enterLobby();
    } catch {
      clearAuth();
      showScreen('auth');
    }
  } else {
    showScreen('auth');
  }
}

document.addEventListener('DOMContentLoaded', boot);
