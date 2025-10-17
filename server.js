const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve your front-end (this makes your HTML/CSS/JS show up again)
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => console.log("user disconnected"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
