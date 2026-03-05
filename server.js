// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public')); // serves index.html & app.js from /public

// -------------------- Data --------------------
let users = {};       // { nickname: socket.id }
let groups = {};      // { groupName: { members: [nicknames], calls: {}, isDM: bool } }
let messages = {};    // { channel: [ {user,text} ] }
let typingUsers = {}; // { channel: Set(nicknames) }

// -------------------- Socket --------------------
io.on('connection', socket => {
  console.log('User connected');

  // ---- Set nickname ----
  socket.on('setNickname', nickname => {
    if (users[nickname]) {
      return socket.emit('error', 'Nickname taken');
    }
    users[nickname] = socket.id;
    socket.nickname = nickname;

    io.emit('userList', Object.keys(users));
    updateGroupList();
  });

  // ---- Create group ----
  socket.on('createGroup', groupName => {
    if (!groups[groupName]) {
      groups[groupName] = { members: [socket.nickname], calls: {}, isDM: false };
      messages[groupName] = [];
      updateGroupList();
    }
  });

  // ---- Join group ----
  socket.on('joinGroup', groupName => {
    if (groups[groupName] && !groups[groupName].members.includes(socket.nickname)) {
      groups[groupName].members.push(socket.nickname);
      socket.join(groupName);
      socket.emit('allMessages', { channel: groupName, msgs: messages[groupName] });
      updateGroupList();
    }
  });

  // ---- Add user to group ----
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

  // ---- Create DM ----
  socket.on('createDM', target => {
    const participants = [socket.nickname, target].sort();
    const dmChannel = `dm-${participants[0]}-${participants[1]}`;
    if (!groups[dmChannel]) {
      groups[dmChannel] = { members: participants, calls: {}, isDM: true };
      messages[dmChannel] = [];
    }
    socket.join(dmChannel);
    const targetSocketId = users[target];
    if (targetSocketId) io.to(targetSocketId).join(dmChannel);
    socket.emit('switchToDM', dmChannel);
  });

  // ---- Send message ----
  socket.on('sendMessage', ({ channel, text }) => {
    if (!messages[channel]) return;
    const msg = { user: socket.nickname, text };
    messages[channel].push(msg);
    io.to(channel).emit('message', { channel, ...msg });
  });

  // ---- Typing ----
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

  // ---- WebRTC signaling ----
  socket.on('offer', ({ target, offer, group }) => {
    if (group) {
      io.to(group).emit('offer', { from: socket.nickname, offer, group });
    } else {
      const targetSocketId = users[target];
      if (targetSocketId) io.to(targetSocketId).emit('offer', { from: socket.nickname, offer });
    }
  });

  socket.on('answer', ({ target, answer, group }) => {
    if (group) {
      io.to(group).emit('answer', { from: socket.nickname, answer, group });
    } else {
      const targetSocketId = users[target];
      if (targetSocketId) io.to(targetSocketId).emit('answer', { from: socket.nickname, answer });
    }
  });

  socket.on('ice-candidate', ({ target, candidate, group }) => {
    if (group) {
      io.to(group).emit('ice-candidate', { from: socket.nickname, candidate, group });
    } else {
      const targetSocketId = users[target];
      if (targetSocketId) io.to(targetSocketId).emit('ice-candidate', { from: socket.nickname, candidate });
    }
  });

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    console.log(`${socket.nickname} disconnected`);
    delete users[socket.nickname];

    // Remove from groups
    for (let group in groups) {
      groups[group].members = groups[group].members.filter(m => m !== socket.nickname);
      if (groups[group].members.length === 0) delete groups[group];
    }

    // Remove from typing
    for (let channel in typingUsers) {
      typingUsers[channel].delete(socket.nickname);
      if (typingUsers[channel].size === 0) delete typingUsers[channel];
      broadcastTyping(channel);
    }

    io.emit('userList', Object.keys(users));
    updateGroupList();
  });
});

// -------------------- Helpers --------------------
function updateGroupList() {
  const visibleGroups = Object.keys(groups).filter(g => !groups[g].isDM);
  io.emit('groupList', visibleGroups);
}

function broadcastTyping(channel) {
  const typers = typingUsers[channel] ? Array.from(typingUsers[channel]) : [];
  io.to(channel).emit('typingUpdate', { channel, typers });
}

// -------------------- Start server --------------------
server.listen(process.env.PORT || 3000, () => console.log('Server running on port 3000'));