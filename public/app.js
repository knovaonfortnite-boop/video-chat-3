// Keep track of current channel (group or DM)
let currentChannel = null;

// Click user to start DM
function startDM(target) {
  if (!target) return;
  socket.emit('createDM', target); // server will make the DM channel if it doesn't exist
}

// Server sends back the DM channel to switch to
socket.on('switchToDM', dmChannel => {
  switchChannel(dmChannel);
});

// Switch to a channel (group or DM)
function switchChannel(channel) {
  currentChannel = channel;
  document.getElementById('messages').innerHTML = '';
  socket.emit('allMessages', { channel }); // request all previous messages
}

// Display all messages for a channel
socket.on('allMessages', ({ channel, msgs }) => {
  if (channel !== currentChannel) return;
  displayMessages(msgs);
});

// Add a message
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

// Display multiple messages
function displayMessages(msgs) {
  msgs.forEach(m => addMessage(m.user, m.text));
}

// User list from server
socket.on('userList', userList => {
  const container = document.getElementById('users');
  container.innerHTML = '';
  userList.forEach(u => {
    if (u === nickname) return; // skip self
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';

    const dot = document.createElement('div');
    dot.className = 'online-dot';

    const name = document.createElement('p');
    name.className = 'user-name';
    name.textContent = u;
    name.onclick = () => startDM(u); // CLICK to start DM

    userDiv.appendChild(dot);
    userDiv.appendChild(name);
    container.appendChild(userDiv);
  });
});