// ✅ Basic Express + WebSocket Server (Render compatible)
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

let users = {}; // id: { name, ws }

// Generate random ID
function genId() {
  return Math.random().toString(36).substr(2, 9);
}

wss.on("connection", (ws) => {
  const id = genId();
  users[id] = { name: "User" + id.substring(0, 4), ws };

  // Send welcome + full user list
  ws.send(JSON.stringify({
    type: "welcome",
    id,
    users: Object.entries(users).map(([uid, u]) => ({ id: uid, name: u.name }))
  }));

  // Broadcast update when someone joins
  broadcastUsers();

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);

      // Set username
      if (msg.type === "join") {
        users[id].name = msg.name;
        broadcastUsers();
      }

      // Handle call initiation
      if (msg.type === "call") {
        const target = users[msg.to];
        if (target) {
          target.ws.send(JSON.stringify({
            type: "call-offer",
            from: id,
            fromName: users[id].name
          }));
        }
      }

    } catch (err) {
      console.error("Error handling message:", err);
    }
  });

  ws.on("close", () => {
    delete users[id];
    broadcastUsers();
  });
});

// Broadcast all online users
function broadcastUsers() {
  const data = JSON.stringify({
    type: "update-users",
    users: Object.entries(users).map(([uid, u]) => ({ id: uid, name: u.name }))
  });
  for (let u of Object.values(users)) {
    if (u.ws.readyState === WebSocket.OPEN) {
      u.ws.send(data);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
