const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let clients = new Map(); // { id: { ws, username } }

function broadcastUsers() {
  const userList = Array.from(clients).map(([id, c]) => ({ id, username: c.username }));
  const payload = JSON.stringify({ type: 'online-users', users: userList });
  clients.forEach(c => c.ws.send(payload));
}

wss.on('connection', (ws) => {
  const id = Date.now().toString(); // simple unique id
  clients.set(id, { ws, username: null });

  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'set-username':
        clients.get(id).username = data.username;
        broadcastUsers();
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
        if (clients.has(data.to)) {
          clients.get(data.to).ws.send(JSON.stringify({ ...data, from: id }));
        }
        break;

      case 'private-call':
        if (clients.has(data.to)) {
          clients.get(data.to).ws.send(JSON.stringify({ type: 'private-call', from: id }));
        }
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    broadcastUsers();
  });
});

console.log(`Video chat server running on port ${PORT}`);
