const socket = io(); // Uses same origin (Render URL if deployed)
let nickname = '';
let currentChannel = 'public';
let peerConnections = {}; // { nickname: RTCPeerConnection } for group calls
let localStream = null;
let typingTimeout = null;

function setNickname() {
  nickname = document.getElementById('nickname').value.trim();
  if (!nickname) return alert('Enter a nickname');
  socket.emit('setNickname', nickname);
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

// Create group
function createGroup() {
  const groupName = document.getElementById('groupName').value.trim();
  if (!groupName) return;
  socket.emit('createGroup', groupName);
  document.getElementById('groupName').value = '';
  joinGroup(groupName); // Auto-join creator
}

// Join group
function joinGroup(groupName) {
  socket.emit('joinGroup', groupName);
  switchChannel(groupName);
}

// Add to group
function addToGroup(target) {
  const groupName = prompt(`Enter group name to add ${target} to:`);
  if (groupName) {
    socket.emit('addToGroup', { target, groupName });
  }
}

// Public/group message
function sendMessage() {
  const text = document.getElementById('message').value.trim();
  if (!text) return;
  socket.emit('sendMessage', { channel: currentChannel, text });
  document.getElementById('message').value = '';
  socket.emit('stopTyping', { channel: currentChannel });
}

// Private message
function sendPrivate() {
  const target = document.getElementById('target').value.trim();
  const text = document.getElementById('privateMessage').value.trim();
  if (!target || !text) return;
  socket.emit('sendPrivate', { target, text });
  document.getElementById('privateMessage').value = '';
}

// Handle typing
function handleTyping() {
  socket.emit('typing', { channel: currentChannel });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stopTyping', { channel: currentChannel });
  }, 3000); // Stop after 3s inactivity
}

// Display all previous messages for channel
socket.on('allMessages', ({ channel, msgs }) => {
  if (channel === currentChannel) displayMessages(msgs);
});

// Display public/group messages
socket.on('message', ({ channel, user, text }) => {
  if (channel === currentChannel) addMessage(user, text);
});

// Display private messages
socket.on('privateMessage', ({ from, text, to }) => {
  addMessage(from, `${text} (private${to ? ' to ' + to : ''})`, true);
});

// Typing update
socket.on('typingUpdate', ({ channel, typers }) => {
  if (channel === currentChannel) {
    const indicator = document.getElementById('typing-indicator');
    if (typers.length > 0) {
      indicator.textContent = `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing...`;
    } else {
      indicator.textContent = '';
    }
  }
});

// User list with options
socket.on('userList', userList => {
  const container = document.getElementById('users');
  container.innerHTML = '';
  userList.forEach(u => {
    if (u !== nickname) { // Exclude self
      const itemDiv = document.createElement('div');
      itemDiv.className = 'user-item';
      
      const p = document.createElement('p');
      p.textContent = u;
      p.style.cursor = 'pointer';
      
      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'user-options';
      optionsDiv.innerHTML = `
        <button onclick="startDM('${u}')">Text (DM)</button>
        <button onclick="startVoiceCallWith('${u}')">Call</button>
        <button onclick="addToGroup('${u}')">Add to Group</button>
      `;
      
      itemDiv.appendChild(p);
      itemDiv.appendChild(optionsDiv);
      container.appendChild(itemDiv);
    }
  });
});

// Start DM (set target)
function startDM(target) {
  document.getElementById('target').value = target;
  alert(`DM ready for ${target}. Type in private message input.`);
  // Optionally switch to a DM channel view in future
}

// Start 1:1 call with specific target
function startVoiceCallWith(target) {
  startVoiceCall(target); // Pass target directly
}

// Group list
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

// Joined group notification
socket.on('joinedGroup', groupName => {
  alert(`You've been added to group: ${groupName}`);
  joinGroup(groupName);
});

// Helper to display messages with PFP
function displayMessages(msgs) {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  msgs.forEach(m => addMessage(m.user, m.text));
}

function addMessage(user, text, isPrivate = false) {
  const container = document.getElementById('messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message';
  
  const pfp = document.createElement('div');
  pfp.className = 'pfp';
  pfp.textContent = user.charAt(0).toUpperCase(); // Initial of name
  
  const content = document.createElement('div');
  content.className = 'message-content';
  const userSpan = document.createElement('span');
  userSpan.className = 'message-user';
  userSpan.textContent = user;
  const textP = document.createElement('p');
  textP.textContent = text;
  if (isPrivate) textP.style.color = '#faa61a'; // Orange for private
  
  content.appendChild(userSpan);
  content.appendChild(textP);
  
  msgDiv.appendChild(pfp);
  msgDiv.appendChild(content);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Switch channel
function switchChannel(channel) {
  currentChannel = channel;
  socket.emit('allMessages', { channel }); // Request messages for new channel
  document.getElementById('messages').innerHTML = ''; // Clear current
}

// 1:1 Voice/Video Call (updated to accept target param)
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
      if (event.candidate) {
        socket.emit('ice-candidate', { target, candidate: event.candidate });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target, offer });
  } catch (err) {
    alert('Error starting call: ' + err.message);
  }
}

// Group Call (mesh: connect to each member)
async function startGroupCall() {
  if (currentChannel === 'public') return alert('Group calls not for public');
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
        if (event.candidate) {
          socket.emit('ice-candidate', { target, candidate: event.candidate, group });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { target, offer, group });
    });
  } catch (err) {
    alert('Error starting group call: ' + err.message);
  }
}

// Handle incoming offer (for both 1:1 and group)
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
      if (event.candidate) {
        socket.emit('ice-candidate', { target: from, candidate: event.candidate, group });
      }
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
  if (pc) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }
});

// Add video stream to container
function addVideoStream(user, stream) {
  const container = document.getElementById('video-container');
  let video = document.getElementById(`video-${user}`);
  if (!video) {
    video = document.createElement('video');
    video.id = `video-${user}`;
    video.autoplay = true;
    video.playsinline = true;
    video.muted = (user === nickname); // Mute local
    const label = document.createElement('div');
    label.textContent = user;
    label.style.color = 'white';
    container.appendChild(video);
    container.appendChild(label);
  }
  video.srcObject = stream;
}