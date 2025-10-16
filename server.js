// server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on port ${PORT}`);

const clients = new Map(); // clientId -> ws

function broadcast(message, excludeId = null) {
  for (const [id, ws] of clients) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);

  // Send welcome + existing participants
  ws.send(JSON.stringify({ type: 'welcome', id: clientId }));
  ws.send(JSON.stringify({ type: 'existing-participants', participants: [...clients.keys()].filter(id => id !== clientId) }));

  // Notify others of new participant
  broadcast({ type: 'new-participant', id: clientId }, clientId);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          const targetWs = clients.get(data.to);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({ ...data, from: clientId }));
          }
          break;

        case 'leave':
          ws.close();
          break;
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    broadcast({ type: 'participant-left', id: clientId });
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});
