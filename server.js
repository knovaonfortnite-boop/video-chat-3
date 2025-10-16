// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve your static files (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

const participants = new Map(); // id -> ws

function broadcast(message, exceptId = null) {
  for (const [id, ws] of participants.entries()) {
    if (id !== exceptId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substring(2, 10);
  participants.set(id, ws);

  // Send welcome & existing participants
  ws.send(JSON.stringify({ type: 'welcome', id, participants: Array.from(participants.keys()).filter(pid => pid !== id) }));

  broadcast({ type: 'new-participant', id }, id);

  ws.on('message', (msg) => {
    let message;
    try {
      message = JSON.parse(msg);
    } catch {
      return;
    }

    const { type, to, offer, answer, candidate } = message;

    if (type === 'offer' && participants.has(to)) {
      participants.get(to).send(JSON.stringify({ type: 'offer', from: id, offer }));
    } else if (type === 'answer' && participants.has(to)) {
      participants.get(to).send(JSON.stringify({ type: 'answer', from: id, answer }));
    } else if (type === 'ice-candidate' && participants.has(to)) {
      participants.get(to).send(JSON.stringify({ type: 'ice-candidate', from: id, candidate }));
    } else if (type === 'leave') {
      broadcast({ type: 'participant-left', id }, id);
    }
  });

  ws.on('close', () => {
    participants.delete(id);
    broadcast({ type: 'participant-left', id }, id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
