require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { connectDB } = require('./store/db');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const userRoutes = require('./routes/users');
const { authenticateSocket } = require('./middleware/auth');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    db: require('./store/db').isUsingMongo() ? 'mongodb' : 'memory',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);

// --- Resolve client path robustly (works locally AND on Railway) ---
// server/index.js lives at:  <root>/server/index.js
// client lives at:           <root>/client/public/
const possibleClientPaths = [
  path.join(__dirname, '../client/public'),      // running from root: node server/index.js
  path.join(__dirname, '../../client/public'),   // running from server/: node index.js
  path.join(process.cwd(), 'client/public'),     // Railway working directory
];

let clientPath = null;
for (const p of possibleClientPaths) {
  if (fs.existsSync(path.join(p, 'index.html'))) {
    clientPath = p;
    break;
  }
}

if (clientPath) {
  console.log(`✅ Serving static files from: ${clientPath}`);
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
} else {
  console.warn('⚠️  Could not find client/public folder. API only mode.');
  app.get('/', (req, res) => res.json({ status: 'CodeArena API running', health: '/health' }));
}

io.use(authenticateSocket);
socketHandler(io);

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CodeArena live on port ${PORT}`);
    console.log(`   Local:  http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });
}

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));

// Catch uncaught errors so app never crashes silently
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

start();
