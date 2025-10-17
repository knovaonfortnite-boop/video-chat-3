import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const users = {}; // { socketId: username }

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("join", (username) => {
    users[socket.id] = username;
    io.emit("update-users", users);
  });

  socket.on("call-user", ({ to, offer }) => {
    io.to(to).emit("incoming-call", { from: socket.id, offer, username: users[socket.id] });
  });

  socket.on("answer-call", ({ to, answer }) => {
    io.to(to).emit("call-answered", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("update-users", users);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
