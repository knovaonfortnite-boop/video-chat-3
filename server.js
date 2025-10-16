const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let clients = new Map(); // key: client id, value: { ws, username }

console.log(`Video chat server running on port ${PORT}`);

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substring(2, 10);
  clients.set(id, { ws, username: null });

  ws.send(JSON.stringify({ type: 'welcome', id }));

  // Send current online users to new client
  const online = [];
  clients.forEach((c, cid) => {
    if (c.username) online.push({ id: cid, username: c.username });
  });
  ws.send(JSON.stringify({ type: 'online-users', users: online }));

  // Notify everyone else about the new connection
  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    switch (data.type) {
      case 'set-username':
        clients.get(id).username = data.username;
        broadcast({ type: 'user-online', id, username: data.username }, id);
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'call-request':
      case 'call-end':
        // forward to target
        if (clients.has(data.to)) {
          clients.get(data.to).ws.send(JSON.stringify(data));
        }
        break;
    }
  });

  ws.on('close', () => {
    const username = clients.get(id).username;
    clients.delete(id);
    broadcast({ type: 'user-offline', id, username });
  });
});

function broadcast(msg, exceptId = null) {
  const data = JSON.stringify(msg);
  clients.forEach((c, cid) => {
    if (cid !== exceptId) c.ws.send(data);
  });
}
