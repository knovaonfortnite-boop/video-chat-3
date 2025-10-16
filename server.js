// --- GLOBALS ---
const videoContainer = document.getElementById('videoContainer');
const localVideo = document.getElementById('localVideo');
const localLabel = document.getElementById('localLabel');
const localWrapper = document.getElementById('localWrapper');

const startBtn = document.getElementById('startBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const status = document.getElementById('status');

let localStream;
let ws;
let myId;
let username;
let inCall = false;
let camOn = true;

const peerConnections = new Map();
const remoteVideos = new Map();
const onlineUsers = new Map(); // {id: name}

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- NOTIFICATIONS ---
if ("Notification" in window) {
  Notification.requestPermission();
}

function notify(title, body, onClick) {
  if (Notification.permission === "granted") {
    const notif = new Notification(title, { body, requireInteraction: true });
    notif.onclick = onClick;
  } else {
    if (confirm(body)) onClick();
  }
}

// --- START CAMERA ---
async function startCamera() {
  username = prompt("Enter your name:");
  if (!username) return alert("You must enter a name!");
  localLabel.textContent = username;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startBtn.disabled = true;
    toggleCamBtn.disabled = false;
    updateStatus("Camera started - Connecting to server...");
    connectWebSocket();
  } catch (err) {
    console.error(err);
    updateStatus("Error accessing camera/microphone");
  }
}

// --- TOGGLE CAMERA ---
toggleCamBtn.addEventListener('click', () => {
  camOn = !camOn;
  localStream.getVideoTracks()[0].enabled = camOn;
  toggleCamBtn.textContent = camOn ? "Turn Camera Off" : "Turn Camera On";

  if (!camOn) {
    localVideo.style.display = 'none';
    localWrapper.style.background = '#' + Math.floor(Math.random()*16777215).toString(16);
  } else {
    localVideo.style.display = 'block';
    localWrapper.style.background = '#000';
  }
});

// --- UPDATE STATUS ---
function updateStatus(msg) { status.textContent = msg; }

// --- WEBSOCKET ---
function connectWebSocket() {
  ws = new WebSocket('wss://video-chat-3-4.onrender.com');

  ws.onopen = () => updateStatus('Connected to server');

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    switch(msg.type) {
      case 'welcome':
        myId = msg.id;
        joinBtn.disabled = false;
        break;
      case 'user-list':
        renderUserList(msg.users);
        break;
      case 'call-request':
        notify("Incoming Call", `${msg.fromName} is calling you!`, () => acceptCall(msg.from));
        break;
      case 'offer': await handleOffer(msg.offer, msg.from); break;
      case 'answer': await handleAnswer(msg.answer, msg.from); break;
      case 'ice-candidate': await handleIceCandidate(msg.candidate, msg.from); break;
      case 'participant-left': handleParticipantLeft(msg.id); break;
    }
  };

  ws.onerror = () => updateStatus("WebSocket error");
  ws.onclose = () => updateStatus("Disconnected from server");
}

// --- USER LIST ---
function renderUserList(users) {
  onlineUsers.clear();
  const listContainer = document.getElementById('userList');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  
  users.forEach(u => {
    if(u.id === myId) return;
    onlineUsers.set(u.id, u.name);
    
    const btn = document.createElement('button');
    btn.textContent = `Call ${u.name}`;
    btn.onclick = () => startPrivateCall([u.id]);
    listContainer.appendChild(btn);
  });
}

// --- START PRIVATE / GROUP CALL ---
function startPrivateCall(ids) {
  ids.forEach(id => ws.send(JSON.stringify({ type: 'call-request', to: id, fromName: username })));
}

// --- ACCEPT CALL ---
async function acceptCall(peerId) {
  if(peerConnections.has(peerId)) return;
  const pc = await createPeerConnection(peerId);
  ws.send(JSON.stringify({ type: 'join', to: [peerId] }));
  inCall = true;
  joinBtn.disabled = true;
  leaveBtn.disabled = false;
  updateStatus("In call with " + peerId);
}

// --- PEER CONNECTION ---
async function createPeerConnection(peerId, isInitiator=false) {
  const pc = new RTCPeerConnection(config);
  peerConnections.set(peerId, pc);

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => addRemoteVideo(peerId, event.streams[0]);

  pc.onicecandidate = e => {
    if(e.candidate) ws.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate, to: peerId }));
  };

  if(isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type:'offer', offer, to:peerId }));
  }

  return pc;
}

async function handleOffer(offer, fromId) {
  let pc = peerConnections.get(fromId);
  if(!pc) pc = await createPeerConnection(fromId, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type:'answer', answer, to:fromId }));
}

async function handleAnswer(answer, fromId) {
  const pc = peerConnections.get(fromId);
  if(pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate(candidate, fromId) {
  const pc = peerConnections.get(fromId);
  if(pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

// --- REMOTE VIDEOS ---
function addRemoteVideo(peerId, stream) {
  if(remoteVideos.has(peerId)) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';
  wrapper.id = `video-${peerId}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = onlineUsers.get(peerId) || peerId.substring(0,4);

  wrapper.appendChild(video);
  wrapper.appendChild(label);
  videoContainer.appendChild(wrapper);
  remoteVideos.set(peerId, wrapper);
}

function handleParticipantLeft(peerId) {
  const pc = peerConnections.get(peerId);
  if(pc) pc.close();
  peerConnections.delete(peerId);

  const elem = remoteVideos.get(peerId);
  if(elem) elem.remove();
  remoteVideos.delete(peerId);
}

// --- CALL BUTTONS ---
function joinCall() { inCall = true; joinBtn.disabled = true; leaveBtn.disabled = false; ws.send(JSON.stringify({ type: 'join' })); updateStatus('Joining call...'); }
function leaveCall() {
  inCall = false;
  ws.send(JSON.stringify({ type: 'leave' }));
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
  remoteVideos.forEach(e => e.remove());
  remoteVideos.clear();
  joinBtn.disabled = false; leaveBtn.disabled = true;
  updateStatus('Left call');
}

// --- EVENTS ---
startBtn.addEventListener('click', startCamera);
joinBtn.addEventListener('click', joinCall);
leaveBtn.addEventListener('click', leaveCall);
