const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

let messages = {};
let users = {};
let groups = {};
let typingUsers = {};

io.on('connection', socket => {
  console.log('User connected');

  socket.on('setNickname', nickname => {
    if (Object.keys(users).includes(nickname)) return socket.emit('error', 'Nickname taken');
    users[nickname] = socket.id;
    socket.nickname = nickname;
    io.emit('userList', Object.keys(users));
    updateGroupList();
  });

  socket.on('createGroup', groupName => {
    if (!groups[groupName]) {
      groups[groupName] = { members: [socket.nickname], calls: {}, isDM: false };
      messages[groupName] = [];
      updateGroupList();
    }
  });

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

  socket.on('joinGroup', groupName => {
    if (groups[groupName] && !groups[groupName].members.includes(socket.nickname)) {
      groups[groupName].members.push(socket.nickname);
      socket.join(groupName);
      socket.emit('allMessages', { channel: groupName, msgs: messages[groupName] });
      updateGroupList();
    }
  });

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

  socket.on('sendMessage', ({ channel, text }) => {
    const msg = { user: socket.nickname, text };
    if (!messages[channel]) return;
    messages[channel].push(msg);
    io.to(channel).emit('message', { channel, ...msg });
  });

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

  // WebRTC signaling
  socket.on('offer', data => forwardSignal('offer', data));
  socket.on('answer', data => forwardSignal('answer', data));
  socket.on('ice-candidate', data => forwardSignal('ice-candidate', data));

  socket.on('disconnect', () => {
    delete users[socket.nickname];
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

function updateGroupList() {
  const visibleGroups = Object.keys(groups).filter(g => !groups[g].isDM);
  io.emit('groupList', visibleGroups);
}

function broadcastTyping(channel) {
  const typers = typingUsers[channel] ? Array.from(typingUsers[channel]) : [];
  io.to(channel).emit('typingUpdate', { channel, typers });
}

function forwardSignal(event, { target, ...data }) {
  if (target) {
    const targetSocket = users[target];
    if (targetSocket) io.to(targetSocket).emit(event, { from: data.from || '', ...data });
  } else if (data.group) {
    io.to(data.group).emit(event, data);
  }
}

server.listen(process.env.PORT || 3000, () => console.log('Server running on port 3000'));