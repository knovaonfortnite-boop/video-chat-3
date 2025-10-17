const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000; // Render needs this

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("✅ User connected");

  socket.on("join", (username) => {
    socket.username = username;
    const users = Array.from(io.sockets.sockets.values())
      .map((s) => s.username)
      .filter(Boolean);
    io.emit("userList", users);
  });

  socket.on("offer", (data) => {
    socket.to(data.to).emit("offer", data);
  });

  socket.on("answer", (data) => {
    socket.to(data.to).emit("answer", data);
  });

  socket.on("candidate", (data) => {
    socket.to(data.to).emit("candidate", data);
  });

  socket.on("disconnect", () => {
    const users = Array.from(io.sockets.sockets.values())
      .map((s) => s.username)
      .filter(Boolean);
    io.emit("userList", users);
    console.log("❌ User disconnected");
  });
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
