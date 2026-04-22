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

// ── CRITICAL: Trust Railway's proxy so rate-limiter works ─────────────────────
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — safe for proxied environments
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting if header is malformed (prevents crash)
  skip: (req) => false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests, slow down!' })
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many auth attempts!' })
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

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
app.use('/api/admin', require('./routes/admin'));

// ── Serve frontend files ──────────────────────────────────────────────────────
const possibleClientPaths = [
  path.join(__dirname, '../client/public'),
  path.join(process.cwd(), 'client/public'),
  path.join(__dirname, '../../client/public'),
];

let clientPath = null;
for (const p of possibleClientPaths) {
  if (fs.existsSync(path.join(p, 'index.html'))) {
    clientPath = p;
    break;
  }
}

if (clientPath) {
  console.log(`✅ Serving client from: ${clientPath}`);
  app.use(express.static(clientPath));
  app.get('*', (req, res) => res.sendFile(path.join(clientPath, 'index.html')));
} else {
  console.warn('⚠️  Client folder not found — API only mode');
  app.get('/', (req, res) => res.json({ status: 'CodeArena API', health: '/health' }));
}

io.use(authenticateSocket);
socketHandler(io);

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CodeArena running on port ${PORT}\n`);
  });
}

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('Unhandled:', reason));

start();
