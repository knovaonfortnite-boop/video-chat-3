// server.js
const WebSocket = require('ws');
const http = require('http');

// Optional: simple HTTP server to keep Render happy
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Video chat server running');
});

const wss = new WebSocket.Server({ server });

let clients = new Map();

wss.on('connection', (ws) => {
  // Generate a random client ID
  const id = Math.random().toString(36).substr(2, 9);
  clients.set(id, ws);

  // Send welcome message with their ID and list of other users
  const otherUsers = Array.from(clients.keys()).filter(uid => uid !== id);
  ws.send(JSON.stringify({ type: 'welcome', id, participants: otherUsers }));

  // Notify others that a new user joined
  for (const [uid, client] of clients.entries()) {
    if (uid !== id) {
      client.send(JSON.stringify({ type: 'new-participant', id }));
    }
  }

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.type) {
        case 'join':
        case 'leave':
        case 'offer':
        case 'answer':
        case 'ice-candidate':
        case 'private-message':
          // Forward to the intended recipient
          if (data.to && clients.has(data.to)) {
            clients.get(data.to).send(JSON.stringify(data));
          }
          break;
      }
    } catch (err) {
      console.error('Invalid message', err);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    // Notify everyone that this user left
    for (const client of clients.values()) {
      client.send(JSON.stringify({ type: 'participant-left', id }));
    }
  });
});

// Listen on the port Render provides
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
