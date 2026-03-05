const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

let messages = { public: [] }; // { channel: [msgs] } - public and groups
let users = {};    // { nickname: socket.id }
let groups = {};   // { groupName: { members: [nicknames], calls: {} } }
let typingUsers = {}; // { channel: Set(nicknames) }

io.on('connection', socket => {
  console.log('User connected');

  // Set nickname
  socket.on('setNickname', nickname => {
    if (Object.keys(users).includes(nickname)) {
      return socket.emit('error', 'Nickname taken');
    }
    users[nickname] = socket.id;
    socket.nickname = nickname;
    // Send current public messages
    socket.emit('allMessages', { channel: 'public', msgs: messages.public });
    io.emit('userList', Object.keys(users));
    updateGroupList();
  });

  // Create group
  socket.on('createGroup', groupName => {
    if (!groups[groupName]) {
      groups[groupName] = { members: [socket.nickname], calls: {} };
      messages[groupName] = [];
      updateGroupList();
    }
  });

  // Join group
  socket.on('joinGroup', groupName => {
    if (groups[groupName] && !groups[groupName].members.includes(socket.nickname)) {
      groups[groupName].members.push(socket.nickname);
      socket.join(groupName);
      socket.emit('allMessages', { channel: groupName, msgs: messages[groupName] });
      updateGroupList();
    }
  });

  // Add user to group
  socket.on('addToGroup', ({ target, groupName }) => {
    if (groups[groupName] && !groups[groupName].members.includes(target)) {
      groups[groupName].members.push(target);
      const targetSocketId = users[target];
      if (targetSocketId) {
        io.to(targetSocketId).emit('joinedGroup', groupName);
        io.to(targetSocketId).emit('allMessages', { channel: groupName, msgs: messages[groupName] });
      }
      updateGroupList();
    }
  });

  // Send message (public or group)
  socket.on('sendMessage', ({ channel, text }) => {
    const msg = { user: socket.nickname, text };
    if (!messages[channel]) messages[channel] = [];
    messages[channel].push(msg);
    if (channel === 'public') {
      io.emit('message', { channel, ...msg });
    } else {
      io.to(channel).emit('message', { channel, ...msg });
    }
  });

  // Private message
  socket.on('sendPrivate', ({ target, text }) => {
    const targetSocketId = users[target];
    if (targetSocketId) {
      io.to(targetSocketId).emit('privateMessage', { from: socket.nickname, text });
      // Echo to sender
      socket.emit('privateMessage', { from: socket.nickname, text, to: target });
    }
  });

  // Typing
  socket.on('typing', ({ channel }) => {
    if (!typingUsers[channel]) typingUsers[channel] = new Set();
    typingUsers[channel].add(socket.nickname);
    broadcastTyping(channel);
  });

  socket.on('stopTyping', ({ channel }) => {
    if (typingUsers[channel]) {
      typingUsers[channel].delete(socket.nickname);
      if (typingUsers[channel].size === 0) delete typingUsers[channel];
      broadcastTyping(channel);
    }
  });

  // WebRTC signaling for 1:1 and groups
  socket.on('offer', ({ target, offer, group }) => {
    if (group) {
      io.to(group).emit('offer', { from: socket.nickname, offer, group });
    } else {
      const targetSocketId = users[target];
      if (targetSocketId) {
        io.to(targetSocketId).emit('offer', { from: socket.nickname, offer });
      }
    }
  });
  socket.on('answer', ({ target, answer, group }) => {
    if (group) {
      io.to(group).emit('answer', { from: socket.nickname, answer, group });
    } else {
      const targetSocketId = users[target];
      if (targetSocketId) {
        io.to(targetSocketId).emit('answer', { from: socket.nickname, answer });
      }
    }
  });
  socket.on('ice-candidate', ({ target, candidate, group }) => {
    if (group) {
      io.to(group).emit('ice-candidate', { from: socket.nickname, candidate, group });
    } else {
      const targetSocketId = users[target];
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', { from: socket.nickname, candidate });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`${socket.nickname} disconnected`);
    delete users[socket.nickname];
    // Remove from groups and typing
    for (let group in groups) {
      groups[group].members = groups[group].members.filter(m => m !== socket.nickname);
      if (groups[group].members.length === 0) delete groups[group];
    }
    for (let channel in typingUsers) {
      typingUsers[channel].delete(socket.nickname);
      if (typingUsers[channel].size === 0) delete typingUsers[channel];
      broadcastTyping(channel);
    }
    io.emit('userList', Object.keys(users));
    updateGroupList();
  });
});

// Helper to broadcast group list
function updateGroupList() {
  io.emit('groupList', Object.keys(groups));
}

// Broadcast typing
function broadcastTyping(channel) {
  const typers = typingUsers[channel] ? Array.from(typingUsers[channel]) : [];
  if (channel === 'public') {
    io.emit('typingUpdate', { channel, typers });
  } else {
    io.to(channel).emit('typingUpdate', { channel, typers });
  }
}

server.listen(process.env.PORT || 3000, () => console.log('Server running'));