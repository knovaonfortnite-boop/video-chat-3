const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
console.log('Server started on port', process.env.PORT || 8080);

const clients = new Map(); // maps client -> {id, name}

function broadcast(message, except = null) {
  const data = JSON.stringify(message);
  for (const [ws] of clients) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  clients.set(ws, { id, name: null });
  send(ws, { type: 'welcome', id });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.type) {
        case 'join':
          // save username if provided
          if (data.name) clients.get(ws).name = data.name;

          // tell this client who else is online
          const participants = Array.from(clients.values())
            .filter(c => c.id !== id && c.name)
            .map(c => ({ id: c.id, name: c.name }));
          send(ws, { type: 'existing-participants', participants });

          // tell everyone else a new participant joined
          broadcast({ type: 'new-participant', id, name: clients.get(ws).name }, ws);
          break;

        case 'leave':
          ws.close();
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          const target = Array.from(clients.keys()).find(client => clients.get(client).id === data.to);
          if (target) send(target, data);
          break;

        case 'private-message':
          const recipient = Array.from(clients.keys()).find(client => clients.get(client).id === data.to);
          if (recipient) send(recipient, data);
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    clients.delete(ws);
    broadcast({ type: 'participant-left', id: info.id });
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});
