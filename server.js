const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Keep track of all connected clients
// { id: { ws, name, room } }
const clients = new Map();

wss.on('connection', (ws) => {
  const id = randomUUID();
  clients.set(id, { ws, name: null, room: null });

  // Send welcome message with ID
  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'set-name':
          clients.get(id).name = data.name;
          break;

        case 'join':
          // Assign user to a room (default room if none specified)
          clients.get(id).room = data.room || 'main';
          sendExistingParticipants(id);
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Forward to the target peer
          const target = clients.get(data.to);
          if (target) {
            target.ws.send(JSON.stringify({
              type: data.type,
              from: id,
              ...data
            }));
          }
          break;

        case 'leave':
          handleLeave(id);
          break;

        case 'direct-call':
          // For private calls
          const targetUser = clients.get(data.to);
          if (targetUser) {
            targetUser.ws.send(JSON.stringify({
              type: 'direct-call',
              from: id,
              name: clients.get(id).name
            }));
          }
          break;
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    handleLeave(id);
    clients.delete(id);
  });
});

function sendExistingParticipants(id) {
  const client = clients.get(id);
  if (!client) return;
  const room = client.room;

  const participants = [];
  for (const [otherId, other] of clients.entries()) {
    if (otherId !== id && other.room === room) {
      participants.push({ id: otherId, name: other.name });
      // Notify existing participant about the new participant
      other.ws.send(JSON.stringify({
        type: 'new-participant',
        id,
        name: client.name
      }));
    }
  }

  // Send existing participants list to the joining client
  client.ws.send(JSON.stringify({
    type: 'existing-participants',
    participants
  }));
}

function handleLeave(id) {
  const client = clients.get(id);
  if (!client) return;
  const room = client.room;

  // Notify others in the same room
  for (const [otherId, other] of clients.entries()) {
    if (otherId !== id && other.room === room) {
      other.ws.send(JSON.stringify({
        type: 'participant-left',
        id
      }));
    }
  }

  client.room = null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
