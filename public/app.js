const socket = io(); // Uses same origin (Render URL if deployed)
let nickname = '';

function setNickname() {
  nickname = document.getElementById('nickname').value.trim();
  if (!nickname) return alert('Enter a nickname');
  socket.emit('setNickname', nickname);
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

// Public message
function sendMessage() {
  const text = document.getElementById('message').value.trim();
  if (!text) return;
  socket.emit('sendMessage', text);
  document.getElementById('message').value = '';
}

// Private message
function sendPrivate() {
  const target = document.getElementById('target').value.trim();
  const text = document.getElementById('privateMessage').value.trim();
  if (!target || !text) return;
  socket.emit('sendPrivate', { target, text });
  document.getElementById('privateMessage').value = '';
}

// Display all previous messages
socket.on('allMessages', msgs => {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  msgs.forEach(m => {
    const p = document.createElement('p');
    p.textContent = `${m.user}: ${m.text}`;
    container.appendChild(p);
  });
});

// Display public messages
socket.on('message', m => {
  const container = document.getElementById('messages');
  const p = document.createElement('p');
  p.textContent = `${m.user}: ${m.text}`;
  container.appendChild(p);
});

// Display private messages
socket.on('privateMessage', m => {
  const container = document.getElementById('messages');
  const p = document.createElement('p');
  p.textContent = `💌 ${m.from} (private): ${m.text}`;
  container.appendChild(p);
});