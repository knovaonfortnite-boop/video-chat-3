const socket = io(); // connects to same host
let username = '';
let currentChannel = 'general';

async function register() {
  const first = document.getElementById('first').value;
  const last = document.getElementById('last').value;
  const pw = document.getElementById('pw').value;
  const res = await fetch('/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ firstName:first, lastName:last, password:pw })
  });
  if (res.status === 201) {
    alert('Registered! Now login.');
  } else {
    const txt = await res.text();
    alert('Register failed: '+txt);
  }
}

async function login() {
  const first = document.getElementById('first').value;
  const last = document.getElementById('last').value;
  const pw = document.getElementById('pw').value;
  const res = await fetch('/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ firstName:first, lastName:last, password:pw })
  });
  if (res.status === 200) {
    const data = await res.json();
    username = data.username;
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    joinChannel('general');
  } else {
    const txt = await res.text();
    alert('Login failed: '+txt);
  }
}

function joinChannel(channelId) {
  currentChannel = channelId;
  socket.emit('joinChannel', channelId);
  document.getElementById('messages').innerHTML = '';
}

function sendMessage() {
  const text = document.getElementById('message').value;
  if (!text) return;
  socket.emit('sendMessage', { channelId:currentChannel, user:username, text });
  document.getElementById('message').value = '';
}

socket.on('message', data => {
  const m = document.createElement('p');
  m.textContent = `${data.user}: ${data.text}`;
  document.getElementById('messages').appendChild(m);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
});