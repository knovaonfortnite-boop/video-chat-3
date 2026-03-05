const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

let messages = []; // temporary public messages
let users = {};    // { nickname: socket.id }

io.on('connection', socket => {
  console.log('User connected');

  // Set nickname
  socket.on('setNickname', nickname => {
    users[nickname] = socket.id;
    socket.nickname = nickname;
    // Send current public messages
    socket.emit('allMessages', messages);
  });

  // Public message
  socket.on('sendMessage', text => {
    const msg = { user: socket.nickname, text };
    messages.push(msg);
    io.emit('message', msg);
  });

  // Private message
  socket.on('sendPrivate', ({ target, text }) => {
    const targetSocketId = users[target];
    if (targetSocketId) {
      io.to(targetSocketId).emit('privateMessage', { from: socket.nickname, text });
    }
  });

  socket.on('disconnect', () => {
    console.log(`${socket.nickname} disconnected`);
    delete users[socket.nickname];
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Server running'));