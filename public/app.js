const socket = io();
let nickname = '';
let currentChannel = null;
let peerConnections = {};
let localStream = null;
let typingTimeout = null;

// ======= Nickname =======
function setNickname() {
  nickname = document.getElementById('nickname').value.trim();
  if (!nickname) return alert('Enter a nickname');
  socket.emit('setNickname', nickname);
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

// ======= Groups =======
function createGroup() {
  const groupName = document.getElementById('groupName').value.trim();
  if (!groupName) return;
  socket.emit('createGroup', groupName);
  document.getElementById('groupName').value = '';
  joinGroup(groupName);
}

function joinGroup(groupName) {
  socket.emit('joinGroup', groupName);
  switchChannel(groupName);
}

function addToGroup(target) {
  const groupName = prompt(`Enter group name to add ${target} to:`);
  if (groupName) {
    socket.emit('addToGroup', { target, groupName });
  }
}

// ======= DMs =======
function startDM(target) {
  socket.emit('createDM', target);
}

// ======= Messages =======
function sendMessage() {
  if (!currentChannel) return alert('Join a group or DM first');
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

// ======= Socket Listeners =======
socket.on('allMessages', ({ channel, msgs }) => {
  if (channel === currentChannel) displayMessages(msgs);
});

socket.on('message', ({ channel, user, text }) => {
  if (channel === currentChannel) addMessage(user, text);
});

socket.on('typingUpdate', ({ channel, typers }) => {
  if (channel === currentChannel) {
    const indicator = document.getElementById('typing-indicator');
    indicator.textContent = typers.length > 0
      ? `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing...`
      : '';
  }
});

// ======= Users List =======
socket.on('userList', userList => {
  const container = document.getElementById('users');
  container.innerHTML = '';
  userList.forEach(u => {
    if (u !== nickname) {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'user-item';
      
      const dot = document.createElement('div');
      dot.className = 'online-dot';
      
      const nameP = document.createElement('p');
      nameP.className = 'user-name';
      nameP.textContent = u;
      nameP.onclick = () => startDM(u); // click to DM
      
      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'user-options';
      optionsDiv.innerHTML = `
        <button onclick="startVoiceCallWith('${u}')">Call</button>
        <button onclick="addToGroup('${u}')">Add to Group</button>
      `;
      
      itemDiv.appendChild(dot);
      itemDiv.appendChild(nameP);
      itemDiv.appendChild(optionsDiv);
      container.appendChild(itemDiv);
    }
  });
});

// ======= Group List =======
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

// ======= Display Messages =======
function displayMessages(msgs) {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  msgs.forEach(m => addMessage(m.user, m.text));
}

function addMessage(user, text) {
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
  userSpan.textContent = user;
  const textP = document.createElement('p');
  textP.textContent = text;
  
  content.appendChild(userSpan);
  content.appendChild(textP);
  msgDiv.appendChild(pfp);
  msgDiv.appendChild(content);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// ======= Switch Channel =======
function switchChannel(channel) {
  currentChannel = channel;
  socket.emit('allMessages', { channel });
  document.getElementById('messages').innerHTML = '';
}

// ======= Voice/Video =======
async function startVoiceCallWith(target) {
  startVoiceCall(target);
}

async function startVoiceCall(targetParam = null) {
  const target = targetParam || prompt('Enter nickname for 1:1 call:');
  if (!target) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    addVideoStream(nickname, localStream, true);

    const pc = new RTCPeerConnection();
    peerConnections[target] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => addVideoStream(target, event.streams[0]);
    pc.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('ice-candidate', { target, candidate: event.candidate });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target, offer });

    // Add Hang Up button
    addHangUpButton(target);
  } catch (err) {
    alert('Error starting call: ' + err.message);
  }
}

function addHangUpButton(target) {
  if (!document.getElementById('hangup-btn')) {
    const btn = document.createElement('button');
    btn.id = 'hangup-btn';
    btn.textContent = 'Hang Up';
    btn.onclick = () => hangUpCall(target);
    document.getElementById('voice-controls').appendChild(btn);
  }
}

function hangUpCall(target) {
  const pc = peerConnections[target];
  if (pc) pc.close();
  delete peerConnections[target];
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  const video = document.getElementById(`video-${target}`);
  if (video) video.remove();
  const btn = document.getElementById('hangup-btn');
  if (btn) btn.remove();
}

// ======= WebRTC Handlers =======
socket.on('offer', async ({ from, offer }) => {
  if (confirm(`${from} is calling. Accept?`)) {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      addVideoStream(nickname, localStream, true);
    }

    const pc = new RTCPeerConnection();
    peerConnections[from] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => addVideoStream(from, event.streams[0]);
    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('ice-candidate', { target: from, candidate: event.candidate });
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: from, answer });

    addHangUpButton(from);
  }
});

socket.on('answer', async ({ from, answer }) => {
  const pc = peerConnections[from];
  if (pc) await pc.setRemoteDescription(answer);
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peerConnections[from];
  if (pc) {
    try { await pc.addIceCandidate(candidate); } 
    catch(e) { console.error(e); }
  }
});

// ======= Video =======
function addVideoStream(user, stream, flip = false) {
  const container = document.getElementById('video-container');
  let video = document.getElementById(`video-${user}`);
  if (!video) {
    video = document.createElement('video');
    video.id = `video-${user}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = (user === nickname);
    if (flip) video.style.transform = 'scaleX(-1)'; // mirror
    const label = document.createElement('div');
    label.textContent = user;
    label.style.color = 'white';
    container.appendChild(video);
    container.appendChild(label);
  }
  video.srcObject = stream;
}