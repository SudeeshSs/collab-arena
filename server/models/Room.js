const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const memberSchema = new mongoose.Schema({
  user: { type: String, required: true },  // String to support both UUID and ObjectId
  username: { type: String, required: true },
  role: { type: String, enum: ['html', 'css', 'javascript'], required: true },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    default: () => Math.random().toString(36).substring(2, 10).toUpperCase(),
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [50, 'Room name cannot exceed 50 characters']
  },
  createdBy: { type: String, required: true },  // String to support both UUID and ObjectId
  members: [memberSchema],
  code: {
    html: {
      type: String,
      default: `<!DOCTYPE html>
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
</html>`
    },
    css: {
      type: String,
      default: `body {
  font-family: sans-serif;
  margin: 0;
  padding: 2rem;
  background: #f5f5f5;
  color: #333;
}
h1 { color: #2563eb; }`
    },
    javascript: {
      type: String,
      default: `console.log('Hello from script.js!');`
    }
  },
  isActive: { type: Boolean, default: true },
  maxMembers: { type: Number, default: 3 },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
