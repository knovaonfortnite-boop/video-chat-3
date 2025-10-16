const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substring(2, 9);
  clients.set(ws, id);

  ws.send(JSON.stringify({ type: 'welcome', id }));

  const others = [...clients.values()].filter(v => v !== id);
  ws.send(JSON.stringify({ type: 'existing-participants', participants: others }));

  for (const [client, clientId] of clients.entries()) {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'new-participant', id }));
    }
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const target = [...clients.entries()].find(([client, clientId]) => clientId === data.to);

      if (target && target[0].readyState === WebSocket.OPEN) {
        target[0].send(JSON.stringify({ ...data, from: id }));
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    for (const [client, clientId] of clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'participant-left', id }));
      }
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
