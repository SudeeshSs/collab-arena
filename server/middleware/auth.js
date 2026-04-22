const jwt = require('jsonwebtoken');
const { UserDB } = require('../store/db');

const JWT_SECRET = process.env.JWT_SECRET || 'collab-arena-dev-secret-change-in-prod';

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication error' });
    }
    const token = header.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      // Token was signed with different secret (e.g. JWT_SECRET changed after deploy)
      // Force user to log in again
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }

    const user = await UserDB.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication error' });
  }
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error('No token'));
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await UserDB.findById(decoded.userId);
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Auth failed'));
  }
};

const generateToken = (userId) => jwt.sign({ userId: String(userId) }, JWT_SECRET, { expiresIn: '7d' });

module.exports = { authenticate, authenticateSocket, generateToken };
