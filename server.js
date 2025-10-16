const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const users = new Map(); // id -> { ws, username }

function broadcastUserList() {
  const list = Array.from(users.entries()).map(([id, { username }]) => ({ id, username }));
  users.forEach(({ ws }) => {
    ws.send(JSON.stringify({ type: 'user-list', users: list }));
  });
}

wss.on('connection', (ws) => {
  const id = uuidv4();
  users.set(id, { ws, username: `User-${id.substring(0,4)}` });

  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      switch(msg.type) {

        case 'set-username':
          if(users.has(id)) users.get(id).username = msg.username;
          broadcastUserList();
          break;

        case 'join':
        case 'leave':
          broadcastUserList();
          break;

        case 'call':
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // forward to target
          if(users.has(msg.to)){
            users.get(msg.to).ws.send(JSON.stringify({
              ...msg,
              from: id,
              fromUsername: users.get(id).username
            }));
          }
          break;

      }
    } catch(err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    users.delete(id);
    broadcastUserList();
    users.forEach(({ ws }) => {
      ws.send(JSON.stringify({ type: 'participant-left', id }));
    });
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
