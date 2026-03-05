// =====================
// Mustang Chat Client JS
// =====================
const socket = io(); // Uses same origin
let nickname = '';
let currentChannel = null;
let peerConnections = {}; // { nickname: RTCPeerConnection } for calls
let localStream = null;
let typingTimeout = null;

// ---------------------
// Set Nickname / Join
// ---------------------
function setNickname() {
  nickname = document.getElementById('nickname').value.trim();
  if (!nickname) return alert('Enter a nickname');
  socket.emit('setNickname', nickname);
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

// ---------------------
// Group Management
// ---------------------
function createGroup() {
  const groupName = document.getElementById('groupName').value.trim();
  if (!groupName) return;
  socket.emit('createGroup', groupName);
  document.getElementById('groupName').value = '';
  joinGroup(groupName); // Auto-join creator
}

function joinGroup(groupName) {
  socket.emit('joinGroup', groupName);
  switchChannel(groupName);
}

function addToGroup(target) {
  const groupName = prompt(`Enter group name to add ${target} to:`);
  if (groupName) socket.emit('addToGroup', { target, groupName });
}

// ---------------------
// Direct Messages
// ---------------------
function startDM(target) {
  if (target === nickname) return;
  socket.emit('createDM', target);
}

// ---------------------
// Sending & Typing
// ---------------------
function sendMessage() {
  if (!currentChannel) return alert('Join a group or start a DM first');
  const text = document.getElementById('message').value.trim();
  if (!text) return;
  socket.emit('sendMessage', { channel: currentChannel, text });
  document.getElementById('message').value = '';
  socket.emit('stopTyping', { channel: currentChannel });
}

function handleTyping() {
  if (!currentChannel) return;
  socket.emit('typing', { channel: currentChannel });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stopTyping', { channel: currentChannel });
  }, 3000);
}

// ---------------------
// Channel Switching
// ---------------------
function switchChannel(channel) {
  currentChannel = channel;
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';
  
  // Update input placeholder
  if (channel.startsWith('dm-')) {
    const otherUser = channel.split('-').filter(n => n !== 'dm' && n !== nickname)[0];
    document.getElementById('message').placeholder = `Message ${otherUser}...`;
  } else {
    document.getElementById('message').placeholder = `Message #${channel}...`;
  }

  // Request messages from server
  socket.emit('allMessages', { channel });
}

// ---------------------
// Display Messages
// ---------------------
function displayMessages(msgs, isPrivate = false) {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  msgs.forEach(m => addMessage(m.user, m.text, isPrivate));
  container.scrollTop = container.scrollHeight;
}

function addMessage(user, text, isPrivate = false) {
  const container = document.getElementById('messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message';

  const pfp = document.createElement('div');
  pfp.className = 'pfp';
  pfp.textContent = user.charAt(0).toUpperCase();

  const content = document.createElement('div');
  content.className = 'message-content';

  const userSpan = document.createElement('span');
  userSpan.className = 'message-user';
  userSpan.textContent = user + (isPrivate ? ' (DM)' : '');

  const textP = document.createElement('p');
  textP.textContent = text;
  if (isPrivate) textP.style.color = '#faa61a';

  content.appendChild(userSpan);
  content.appendChild(textP);
  msgDiv.appendChild(pfp);
  msgDiv.appendChild(content);

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// ---------------------
// Socket Events
// ---------------------
socket.on('allMessages', ({ channel, msgs }) => {
  if (channel === currentChannel) {
    const isPrivate = channel.startsWith('dm-');
    displayMessages(msgs, isPrivate);
  }
});

socket.on('message', ({ channel, user, text }) => {
  if (channel === currentChannel) addMessage(user, text, channel.startsWith('dm-'));
});

socket.on('typingUpdate', ({ channel, typers }) => {
  if (channel === currentChannel) {
    const indicator = document.getElementById('typing-indicator');
    indicator.textContent = typers.length > 0
      ? `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing...`
      : '';
  }
});

// ---------------------
// Users & Groups
// ---------------------
socket.on('userList', userList => {
  const container = document.getElementById('users');
  container.innerHTML = '';
  userList.forEach(u => {
    if (u === nickname) return;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'user-item';

    const dot = document.createElement('div');
    dot.className = 'online-dot';

    const p = document.createElement('p');
    p.className = 'user-name';
    p.textContent = u;
    p.onclick = () => startDM(u);

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'user-options';
    optionsDiv.innerHTML = `
      <button onclick="startVoiceCallWith('${u}')">Call</button>
      <button onclick="addToGroup('${u}')">Add to Group</button>
    `;

    itemDiv.appendChild(dot);
    itemDiv.appendChild(p);
    itemDiv.appendChild(optionsDiv);
    container.appendChild(itemDiv);
  });
});

socket.on('groupList', groupList => {
  const container = document.getElementById('group-list');
  container.innerHTML = '';
  groupList.forEach(g => {
    const p = document.createElement('p');
    p.textContent = g;
    p.style.cursor = 'pointer';
    p.onclick = () => joinGroup(g);
    container.appendChild(p);
  });
});

socket.on('joinedGroup', groupName => {
  alert(`You've been added to group: ${groupName}`);
  joinGroup(groupName);
});

socket.on('switchToDM', dmChannel => {
  switchChannel(dmChannel);
});

// ---------------------
// Voice / Video Calls
// ---------------------
async function startVoiceCall(targetParam = null) {
  const target = targetParam || prompt('Enter target nickname for 1:1 call:');
  if (!target) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    addVideoStream(nickname, localStream);

    const pc = new RTCPeerConnection();
    peerConnections[target] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => addVideoStream(target, event.streams[0]);
    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('ice-candidate', { target, candidate: event.candidate });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target, offer });
  } catch (err) {
    alert('Error starting call: ' + err.message);
  }
}

function startVoiceCallWith(target) {
  startVoiceCall(target);
}

async function startGroupCall() {
  if (!currentChannel) return alert('Join a group first');
  const group = currentChannel;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    addVideoStream(nickname, localStream);

    Object.keys(users).forEach(async target => {
      if (target === nickname) return;

      const pc = new RTCPeerConnection();
      peerConnections[target] = pc;
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.ontrack = event => addVideoStream(target, event.streams[0]);
      pc.onicecandidate = event => {
        if (event.candidate) socket.emit('ice-candidate', { target, candidate: event.candidate, group });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { target, offer, group });
    });
  } catch (err) {
    alert('Error starting group call: ' + err.message);
  }
}

// ---------------------
// WebRTC Signals
// ---------------------
socket.on('offer', async ({ from, offer, group }) => {
  if (confirm(`${from} is calling${group ? ' in group' : ''}. Accept?`)) {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      addVideoStream(nickname, localStream);
    }

    const pc = new RTCPeerConnection();
    peerConnections[from] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => addVideoStream(from, event.streams[0]);
    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('ice-candidate', { target: from, candidate: event.candidate, group });
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: from, answer, group });
  }
});

socket.on('answer', async ({ from, answer, group }) => {
  const pc = peerConnections[from];
  if (pc) await pc.setRemoteDescription(answer);
});

socket.on('ice-candidate', async ({ from, candidate, group }) => {
  const pc = peerConnections[from];
  if (pc) await pc.addIceCandidate(candidate).catch(err => console.error(err));
});

// ---------------------
// Video Streams
// ---------------------
function addVideoStream(user, stream) {
  const container = document.getElementById('video-container');
  let video = document.getElementById(`video-${user}`);
  if (!video) {
    video = document.createElement('video');
    video.id = `video-${user}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = (user === nickname);

    const label = document.createElement('div');
    label.textContent = user;
    label.style.color = 'white';

    container.appendChild(video);
    container.appendChild(label);
  }
  video.srcObject = stream;
}