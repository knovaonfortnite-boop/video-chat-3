const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const os = require("os");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

const users = new Map(); // id -> { ws, name }

// Generate unique ID
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Broadcast online users
function broadcastUserList() {
  const list = Array.from(users.entries()).map(([id, u]) => ({ id, name: u.name }));
  const msg = JSON.stringify({ type: "user-list", users: list });
  for (const [, u] of users) {
    if (u.ws.readyState === WebSocket.OPEN) u.ws.send(msg);
  }
}

// Get LAN IP
function getLANIP() {
  const interfaces = os.networkInterfaces();
  for (let iface of Object.values(interfaces)) {
    for (let i of iface) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "localhost";
}

wss.on("connection", (ws) => {
  const id = genId();
  users.set(id, { ws, name: `User-${id.slice(0,4)}` });

  const current = Array.from(users.entries()).map(([uid, u]) => ({ id: uid, name: u.name }));
  ws.send(JSON.stringify({ type: "welcome", id, users: current }));
  broadcastUserList();

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch (e) { return; }

    // Join: update name
    if (data.type === "join") {
      const rec = users.get(id);
      if (rec) {
        rec.name = data.name || rec.name;
        broadcastUserList();
      }
    }

    // Offer/Answer/ICE relay
    if (data.type === "offer" && data.to && users.has(data.to)) {
      const target = users.get(data.to);
      target.ws.send(JSON.stringify({ type: "offer", from: id, fromName: users.get(id).name, sdp: data.sdp }));
    }

    if (data.type === "answer" && data.to && users.has(data.to)) {
      const target = users.get(data.to);
      target.ws.send(JSON.stringify({ type: "answer", from: id, sdp: data.sdp }));
    }

    if (data.type === "ice-candidate" && data.to && users.has(data.to)) {
      const target = users.get(data.to);
      target.ws.send(JSON.stringify({ type: "ice-candidate", from: id, candidate: data.candidate }));
    }
  });

  ws.on("close", () => {
    users.delete(id);
    broadcastUserList();
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLANIP();
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Connect from other devices via ws://${ip}:${PORT}`);
});
