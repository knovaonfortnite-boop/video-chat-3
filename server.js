const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Create a WebSocket server
const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

wss.on('connection', (ws) => {
  const id = crypto.randomUUID();
  clients.set(id, ws);
  
  // Send welcome message
  ws.send(JSON.stringify({ type: 'welcome', id, participants: Array.from(clients.keys()) }));

  // Notify others about new participant
  clients.forEach((client, clientId) => {
    if (client !== ws) {
      client.send(JSON.stringify({ type: 'new-participant', id }));
    }
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const target = clients.get(data.to);
      if (target) {
        target.send(JSON.stringify({ ...data, from: id }));
      }
    } catch (e) {
      console.error('Error parsing message', e);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    clients.forEach((client) => {
      client.send(JSON.stringify({ type: 'participant-left', id }));
    });
  });
});

// Upgrade HTTP server to handle WebSocket
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
