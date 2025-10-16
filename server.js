const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DATA_FILE = 'users.json';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'video-chat-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(express.static('public'));

async function loadData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: {}, friendships: {} };
  }
}

async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const data = await loadData();
  
  if (data.users[username]) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  data.users[username] = {
    password: hashedPassword,
    friends: []
  };
  
  await saveData(data);
  req.session.username = username;
  res.json({ success: true, username });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  const data = await loadData();
  const user = data.users[username];
  
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.username = username;
  res.json({ success: true, username });
});

app.get('/me', (req, res) => {
  if (req.session.username) {
    res.json({ username: req.session.username });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/friends', async (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const data = await loadData();
  const user = data.users[req.session.username];
  res.json({ friends: user.friends || [] });
});

app.post('/add-friend', async (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { friendUsername } = req.body;
  const data = await loadData();
  
  if (!data.users[friendUsername]) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (friendUsername === req.session.username) {
    return res.status(400).json({ error: 'Cannot add yourself' });
  }

  const user = data.users[req.session.username];
  if (!user.friends.includes(friendUsername)) {
    user.friends.push(friendUsername);
    await saveData(data);
  }

  res.json({ success: true, friends: user.friends });
});

app.post('/remove-friend', async (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { friendUsername } = req.body;
  const data = await loadData();
  
  const user = data.users[req.session.username];
  user.friends = user.friends.filter(f => f !== friendUsername);
  await saveData(data);

  res.json({ success: true, friends: user.friends });
});

const clients = new Map();
const rooms = new Map();

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(clientId, { ws, username: null, room: null });
  ws.clientId = clientId;
  
  console.log(`Client ${clientId} connected. Total clients:`, clients.size);

  ws.send(JSON.stringify({
    type: 'welcome',
    id: clientId
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (!data.type) {
        console.warn('Received message without type field');
        return;
      }
      
      console.log(`Received from ${clientId}:`, data.type);

      const client = clients.get(clientId);

      if (data.type === 'set-username') {
        client.username = data.username;
        return;
      }

      if (data.type === 'join-room') {
        const roomId = data.roomId;
        client.room = roomId;
        
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }
        
        rooms.get(roomId).add(clientId);
        
        const existingParticipants = Array.from(rooms.get(roomId))
          .filter(id => id !== clientId)
          .map(id => ({
            id,
            username: clients.get(id)?.username
          }));
        
        ws.send(JSON.stringify({
          type: 'existing-participants',
          participants: existingParticipants
        }));

        rooms.get(roomId).forEach(id => {
          if (id !== clientId) {
            const otherClient = clients.get(id);
            if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
              otherClient.ws.send(JSON.stringify({
                type: 'new-participant',
                id: clientId,
                username: client.username
              }));
            }
          }
        });
        return;
      }

      if (data.type === 'leave-room') {
        if (client.room && rooms.has(client.room)) {
          rooms.get(client.room).delete(clientId);
          
          rooms.get(client.room).forEach(id => {
            const otherClient = clients.get(id);
            if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
              otherClient.ws.send(JSON.stringify({
                type: 'participant-left',
                id: clientId
              }));
            }
          });
          
          if (rooms.get(client.room).size === 0) {
            rooms.delete(client.room);
          }
        }
        client.room = null;
        return;
      }

      if (data.to) {
        const recipient = clients.get(data.to);
        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            ...data,
            from: clientId
          }));
        }
      }
    } catch (error) {
      console.error('Invalid message format:', error.message);
    }
  });

  ws.on('close', () => {
    const client = clients.get(clientId);
    if (client && client.room && rooms.has(client.room)) {
      rooms.get(client.room).delete(clientId);
      
      rooms.get(client.room).forEach(id => {
        const otherClient = clients.get(id);
        if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
          otherClient.ws.send(JSON.stringify({
            type: 'participant-left',
            id: clientId
          }));
        }
      });
      
      if (rooms.get(client.room).size === 0) {
        rooms.delete(client.room);
      }
    }
    
    clients.delete(clientId);
    console.log(`Client ${clientId} disconnected. Total clients:`, clients.size);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
