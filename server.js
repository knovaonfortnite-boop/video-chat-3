const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let users = {}; // username: socket.id

io.on("connection", (socket) => {
  let username = `User-${Math.floor(Math.random() * 1000)}`;
  users[socket.id] = username;

  io.emit("update-user-list", Object.values(users));

  socket.on("offer", (data) => {
    io.to(data.target).emit("offer", {
      offer: data.offer,
      sender: socket.id,
      username: users[socket.id],
    });
  });

  socket.on("answer", (data) => {
    io.to(data.target).emit("answer", {
      answer: data.answer,
      sender: socket.id,
    });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.target).emit("ice-candidate", {
      candidate: data.candidate,
      sender: socket.id,
    });
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("update-user-list", Object.values(users));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
