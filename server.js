const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(cors());
app.use(express.static('public')); // serve index.html & app.js

// In-memory storage
const users = {}; // { username: { firstName, lastName, passwordHash } }
const channels = {}; // { channelId: { messages: [{user, text}] } }

// Default channel
const defaultChannelId = 'general';
channels[defaultChannelId] = { messages: [] };

// Helpers
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Routes
app.post('/register', async (req, res) => {
  const { firstName, lastName, password } = req.body;
  const username = `${firstName}${lastName}`.toLowerCase();
  if (users[username]) return res.status(400).send('Username taken');
  const hashedPw = await bcrypt.hash(password, 10);
  users[username] = { firstName, lastName, passwordHash: hashedPw };
  res.status(201).send('User registered');
});

app.post('/login', async (req, res) => {
  const { firstName, lastName, password } = req.body;
  const username = `${firstName}${lastName}`.toLowerCase();
  const user = users[username];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(400).send('Invalid credentials');
  }
  res.json({ username });
});

// Socket.io
io.on('connection', socket => {
  console.log('User connected');

  socket.on('joinChannel', channelId => socket.join(channelId));

  socket.on('sendMessage', ({ channelId, user, text }) => {
    if (!channels[channelId]) channels[channelId] = { messages: [] };
    channels[channelId].messages.push({ user, text });
    io.to(channelId).emit('message', { user, text });
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(3000, () => console.log('Server running on 3000'));