// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

let clients = new Map();

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  clients.set(id, ws);
  console.log(`Client ${id} connected`);

  ws.send(JSON.stringify({ type: "welcome", id, participants: [...clients.keys()].filter(x => x !== id) }));

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    switch (data.type) {
      case "join":
        broadcastExcept(id, { type: "existing-participants", participants: [...clients.keys()] });
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        if (clients.has(data.to)) {
          clients.get(data.to).send(JSON.stringify({ ...data, from: id }));
        }
        break;
      case "leave":
        broadcastExcept(id, { type: "participant-left", id });
        break;
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcastExcept(id, { type: "participant-left", id });
    console.log(`Client ${id} disconnected`);
  });
});

function broadcastExcept(senderId, message) {
  const msg = JSON.stringify(message);
  for (const [id, ws] of clients.entries()) {
    if (id !== senderId && ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Video chat server running on port ${PORT}`));
