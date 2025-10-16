// server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const participants = new Map(); // id -> { ws, name }

wss.on('connection', (ws) => {
  const id = uuidv4();
  participants.set(id, { ws, name: null });

  // Send welcome with your ID
  ws.send(JSON.stringify({ type: 'welcome', id }));

  // Send list of existing participants
  const existing = [...participants.keys()].filter(pid => pid !== id);
  if (existing.length) {
    ws.send(JSON.stringify({ type: 'existing-participants', participants: existing }));
  }

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      const sender = participants.get(id);

      switch (msg.type) {
        case 'join':
          sender.name = msg.name || `Participant ${id.substring(0, 4)}`;
          broadcastExcept(id, { type: 'new-participant', id });
          break;

        case 'leave':
          participants.delete(id);
          broadcastExcept(id, { type: 'participant-left', id });
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          if (msg.to && participants.has(msg.to)) {
            participants.get(msg.to).ws.send(JSON.stringify({ ...msg, from: id }));
          }
          break;

        case 'private-message':
          if (msg.to && participants.has(msg.to)) {
            participants.get(msg.to).ws.send(JSON.stringify({ type: 'private-message', from: id, message: msg.message }));
          }
          break;
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    participants.delete(id);
    broadcastExcept(id, { type: 'participant-left', id });
  });
});

function broadcastExcept(senderId, msg) {
  participants.forEach((p, pid) => {
    if (pid !== senderId) {
      p.ws.send(JSON.stringify(msg));
    }
  });
}

console.log('WebSocket server running on port', process.env.PORT || 3000);
