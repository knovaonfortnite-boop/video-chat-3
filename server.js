const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Map of clientId -> { ws, name }
const clients = new Map();

function broadcastUserList() {
  const list = [];
  for (const [id, info] of clients.entries()) {
    list.push({ id, name: info.name || 'Anonymous' });
  }
  const msg = JSON.stringify({ type: 'user-list', users: list });
  for (const [, info] of clients.entries()) {
    if (info.ws.readyState === info.ws.OPEN) info.ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  clients.set(id, { ws, name: null });

  // welcome with id
  ws.send(JSON.stringify({ type: 'welcome', id }));

  // whenever someone connects, send current list
  broadcastUserList();

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error('Invalid JSON', e);
      return;
    }

    // handle message types
    switch (data.type) {
      case 'register': {
        const name = (data.name || '').trim().slice(0, 60) || 'Anonymous';
        const client = clients.get(id);
        if (client) {
          client.name = name;
        }
        broadcastUserList();
        break;
      }

      // direct call signaling: caller -> server -> target
      case 'call-user': {
        // { type:'call-user', to: targetId, offer }
        const target = clients.get(data.to);
        const caller = clients.get(id);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'incoming-call',
            from: id,
            fromName: caller ? caller.name : 'Anonymous',
            offer: data.offer
          }));
        } else {
          // target not available
          ws.send(JSON.stringify({ type: 'call-failed', reason: 'user-unavailable', to: data.to }));
        }
        break;
      }

      case 'accept-call': {
        // { type: 'accept-call', to: callerId, answer }
        const target = clients.get(data.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'call-accepted',
            from: id,
            answer: data.answer
          }));
        }
        break;
      }

      case 'decline-call': {
        // { type:'decline-call', to: callerId }
        const target = clients.get(data.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'call-declined',
            from: id
          }));
        }
        break;
      }

      case 'ice-candidate': {
        // { type:'ice-candidate', to: id, candidate }
        const target = clients.get(data.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'ice-candidate',
            from: id,
            candidate: data.candidate
          }));
        }
        break;
      }

      case 'hangup': {
        // notify the other peer
        const target = clients.get(data.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({ type: 'hangup', from: id }));
        }
        break;
      }

      default:
        console.log('Unknown message type', data.type);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    broadcastUserList();
    // notify remaining clients user left
    const msg = JSON.stringify({ type: 'user-left', id });
    for (const [, info] of clients.entries()) {
      if (info.ws.readyState === info.ws.OPEN) info.ws.send(msg);
    }
  });

  ws.on('error', (err) => {
    console.error('WS error', err);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
