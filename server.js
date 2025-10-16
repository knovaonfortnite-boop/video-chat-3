const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const wss = new WebSocket.Server({ server });

const clients = new Map(); // clientId -> { ws, username }

function broadcast(message, excludeId = null) {
  for (const [id, client] of clients) {
    if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  let username = "";

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.type) {
        case 'set-username':
          username = data.username;
          clients.set(clientId, { ws, username });
          ws.send(JSON.stringify({ type: 'welcome', id: clientId }));
          ws.send(JSON.stringify({
            type: 'existing-participants',
            participants: [...clients.entries()]
              .filter(([id]) => id !== clientId)
              .map(([id, c]) => ({ id, username: c.username }))
          }));
          broadcast({ type: 'new-participant', id: clientId, username }, clientId);
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
        case 'text':
          if (data.to) {
            const target = clients.get(data.to);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({ ...data, from: clientId, username }));
            }
          } else if (data.type === 'text') {
            broadcast({ ...data, from: clientId, username }, clientId);
          }
          break;

        case 'leave':
          ws.close();
          break;
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    broadcast({ type: 'participant-left', id: clientId });
  });

  ws.on('error', (err) => console.error(err));
});
